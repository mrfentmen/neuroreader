"use strict";

(function () {
  var DB_NAME = "clipforge-lockbox";
  var DB_VERSION = 1;
  var STORE = "vault";
  var MAX_IMAGE_SIZE = 25 * 1024 * 1024;
  var ITERATIONS = 250000;
  var state = { db: null, key: null, salt: null, records: [] };
  var $ = function (id) { return document.getElementById(id); };
  var lockedView = $("locked-view");
  var vaultView = $("vault-view");
  var form = $("unlock-form");
  var passwordInput = $("vault-password");
  var unlockLabel = $("unlock-label");
  var lockStatus = $("lock-status");
  var imageInput = $("image-input");
  var dropZone = $("drop-zone");
  var uploadStatus = $("upload-status");
  var gallery = $("gallery");
  var imageCount = $("image-count");
  var dbPromise;

  function setStatus(element, text) { element.textContent = text; }
  function randomBytes(length) { return crypto.getRandomValues(new Uint8Array(length)); }
  function bytesToBase64(bytes) { var binary = ""; bytes.forEach(function (byte) { binary += String.fromCharCode(byte); }); return btoa(binary); }
  function base64ToBytes(value) { var binary = atob(value); var bytes = new Uint8Array(binary.length); for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () { request.result.createObjectStore(STORE, { keyPath: "id" }); };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Could not open local vault storage")); };
    });
    return dbPromise;
  }
  function allRecords() { return openDb().then(function (db) { return new Promise(function (resolve, reject) { var request = db.transaction(STORE, "readonly").objectStore(STORE).getAll(); request.onsuccess = function () { resolve(request.result || []); }; request.onerror = function () { reject(request.error); }; }); }); }
  function saveRecord(record) { return openDb().then(function (db) { return new Promise(function (resolve, reject) { var request = db.transaction(STORE, "readwrite").objectStore(STORE).put(record); request.onsuccess = resolve; request.onerror = function () { reject(request.error); }; }); }); }
  function deleteRecord(id) { return openDb().then(function (db) { return new Promise(function (resolve, reject) { var request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id); request.onsuccess = resolve; request.onerror = function () { reject(request.error); }; }); }); }
  function deriveKey(password, salt) { return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]).then(function (baseKey) { return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" }, baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }); }
  function encrypt(file) { var iv = randomBytes(12); return file.arrayBuffer().then(function (data) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, state.key, data).then(function (ciphertext) { return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ciphertext)) }; }); }); }
  function decrypt(record) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(record.iv) }, state.key, base64ToBytes(record.data)).then(function (data) { return new Blob([data], { type: record.type }); }); }
  function metadataRecord(record) { return { id: record.id, name: record.name, type: record.type, size: record.size, createdAt: record.createdAt }; }
  function renderGallery() {
    gallery.textContent = "";
    imageCount.textContent = state.records.length + " image" + (state.records.length === 1 ? "" : "s");
    if (!state.records.length) { var empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "Your vault is empty. Add an image to get started."; gallery.appendChild(empty); return; }
    state.records.forEach(function (record) {
      var card = document.createElement("article"); card.className = "image-card";
      var image = document.createElement("img"); image.alt = record.name; image.loading = "lazy"; image.src = "";
      var footer = document.createElement("footer"); var name = document.createElement("strong"); name.textContent = record.name;
      var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete"; remove.setAttribute("aria-label", "Delete " + record.name);
      remove.addEventListener("click", function () { deleteRecord(record.id).then(loadRecords).then(function () { setStatus(uploadStatus, "Image deleted from this device."); }); });
      footer.appendChild(name); footer.appendChild(remove); card.appendChild(image); card.appendChild(footer); gallery.appendChild(card);
      decrypt(record).then(function (blob) { var url = URL.createObjectURL(blob); image.src = url; image.addEventListener("load", function () { URL.revokeObjectURL(url); }, { once: true }); }).catch(function () { image.alt = "Could not decrypt image"; });
    });
  }
  function loadRecords() { return allRecords().then(function (records) { state.records = records.filter(function (record) { return record.id !== "__config__"; }); renderGallery(); }); }
  function enterVault(password, salt, isNew) {
    return deriveKey(password, salt).then(function (key) { state.key = key; state.salt = salt; if (isNew) return saveRecord({ id: "__config__", salt: bytesToBase64(salt), iterations: ITERATIONS }); }).then(function () { lockedView.hidden = true; vaultView.hidden = false; passwordInput.value = ""; return loadRecords(); });
  }
  function unlock(password) {
    return allRecords().then(function (records) { var config = records.find(function (record) { return record.id === "__config__"; }); if (!config) return enterVault(password, randomBytes(16), true); return deriveKey(password, base64ToBytes(config.salt)).then(function (key) { state.key = key; state.salt = base64ToBytes(config.salt); return Promise.all(records.filter(function (record) { return record.id !== "__config__"; }).map(function (record) { return decrypt(record); })).then(function () {        state.key = key; state.records = records.filter(function (record) { return record.id !== "__config__"; }); lockedView.hidden = true; vaultView.hidden = false; passwordInput.value = ""; renderGallery(); }); }); });
  }
  function addFiles(files) {
    var list = Array.from(files || []).filter(function (file) { return /^image\/(jpeg|png|webp|gif)$/i.test(file.type) && file.size > 0 && file.size <= MAX_IMAGE_SIZE; });
    if (!list.length) { setStatus(uploadStatus, "Choose JPG, PNG, WebP, or GIF images under 25 MB."); return; }
    setStatus(uploadStatus, "Encrypting " + list.length + " image" + (list.length === 1 ? "" : "s") + " locally…");
    list.reduce(function (chain, file) { return chain.then(function () { return encrypt(file).then(function (encrypted) { return saveRecord({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, createdAt: Date.now(), iv: encrypted.iv, data: encrypted.data }); }); }); }, Promise.resolve()).then(loadRecords).then(function () { setStatus(uploadStatus, "Image" + (list.length === 1 ? "" : "s") + " encrypted and saved locally."); }).catch(function () { setStatus(uploadStatus, "Could not encrypt the image. Nothing was uploaded."); });
  }
  form.addEventListener("submit", function (event) { event.preventDefault(); var password = passwordInput.value; if (password.length < 12) { setStatus(lockStatus, "Use at least 12 characters for the vault password."); return; } setStatus(lockStatus, "Deriving your local encryption key…"); unlock(password).catch(function () { setStatus(lockStatus, "Could not unlock the vault. Check the password and try again."); }); });
  $("toggle-password").addEventListener("click", function () { var visible = passwordInput.type === "text"; passwordInput.type = visible ? "password" : "text"; this.textContent = visible ? "Show" : "Hide"; this.setAttribute("aria-label", visible ? "Show password" : "Hide password"); });
  $("lock-button").addEventListener("click", function () { state.key = null; state.records = []; gallery.textContent = ""; vaultView.hidden = true; lockedView.hidden = false; unlockLabel.textContent = "Unlock local vault"; setStatus(lockStatus, "Vault locked. Images remain encrypted on this device."); });
  imageInput.addEventListener("change", function () { addFiles(imageInput.files); imageInput.value = ""; });
  dropZone.addEventListener("click", function () { imageInput.click(); });
  dropZone.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); imageInput.click(); } });
  ["dragenter", "dragover"].forEach(function (name) { dropZone.addEventListener(name, function (event) { event.preventDefault(); dropZone.classList.add("dragging"); }); });
  ["dragleave", "drop"].forEach(function (name) { dropZone.addEventListener(name, function (event) { event.preventDefault(); dropZone.classList.remove("dragging"); }); });
  dropZone.addEventListener("drop", function (event) { addFiles(event.dataTransfer.files); });
  allRecords().then(function (records) { unlockLabel.textContent = records.some(function (record) { return record.id === "__config__"; }) ? "Unlock local vault" : "Create local vault"; }).catch(function () { setStatus(lockStatus, "Local storage is unavailable in this browser profile."); });
})();
