"use strict";

(function () {
  var Utils = {
    MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024,
    PRESETS: {
      share: { resolution: "720", quality: "balanced" },
      balanced: { resolution: "1080", quality: "high" },
      small: { resolution: "480", quality: "small" },
    },
    BITRATES: { small: 900000, balanced: 1800000, high: 3200000 },
    formatBytes: function (bytes) {
      var value = Number(bytes) || 0;
      if (value < 1024) return value + " B";
      var units = ["KB", "MB", "GB"];
      var index = -1;
      do { value /= 1024; index++; } while (value >= 1024 && index < units.length - 1);
      return value.toFixed(value >= 10 ? 0 : 1) + " " + units[index];
    },
    formatDuration: function (seconds) {
      var total = Math.max(0, Math.round(Number(seconds) || 0));
      var minutes = Math.floor(total / 60);
      var secs = String(total % 60).padStart(2, "0");
      return minutes + ":" + secs;
    },
    validVideoFile: function (file) {
      if (!file) return false;
      var type = String(file.type || "").toLowerCase();
      var name = String(file.name || "").toLowerCase();
      return type.indexOf("video/") === 0 || /\.(mp4|m4v|mov|webm|mkv|avi|ogv|mpeg|mpg)$/i.test(name);
    },
    outputDimensions: function (width, height, maxHeight) {
      var w = Math.max(1, Number(width) || 1);
      var h = Math.max(1, Number(height) || 1);
      var limit = maxHeight === "original" ? h : Math.max(1, Number(maxHeight) || h);
      if (h <= limit) return { width: w, height: h };
      var scale = limit / h;
      var scaledWidth = Math.max(2, Math.round(w * scale));
      if (scaledWidth % 2) scaledWidth -= 1;
      return { width: Math.max(2, scaledWidth), height: Math.max(2, Math.round(limit / 2) * 2) };
    },
    chooseMimeType: function () {
      var candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      for (var i = 0; i < candidates.length; i++) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      }
      return "";
    },
    fileStem: function (name) {
      return String(name || "video").replace(/\.[^.]*$/, "").replace(/[^a-z0-9 _-]/gi, "").trim().slice(0, 90) || "compressed-video";
    },
  };
  globalThis.ClipForgeUtils = Utils;
  if (typeof document === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var dropZone = $("drop-zone");
  var fileInput = $("file-input");
  var chooseFile = $("choose-file");
  var filePanel = $("file-panel");
  var fileName = $("file-name");
  var fileMeta = $("file-meta");
  var removeFile = $("remove-file");
  var preview = $("preview");
  var settingsPanel = $("settings-panel");
  var progressPanel = $("progress-panel");
  var progressPercent = $("progress-percent");
  var progressFill = $("progress-fill");
  var progressStatus = $("progress-status");
  var resultPanel = $("result-panel");
  var resultMeta = $("result-meta");
  var downloadButton = $("download-button");
  var resolution = $("resolution");
  var quality = $("quality");
  var compressButton = $("compress-button");
  var cancelButton = $("cancel-button");
  var compressAnother = $("compress-another");
  var canvas = $("render-canvas");
  var presets = document.querySelectorAll(".preset");

  var selectedFile = null;
  var inputUrl = "";
  var resultUrl = "";
  var recorder = null;
  var sourceStream = null;
  var outputStream = null;
  var animationFrame = 0;
  var compressionTimer = 0;
  var cancelled = false;
  var terminalState = "idle";
  var savedOutput = null;

  function setHidden(element, hidden) { element.hidden = hidden; }
  function updateProgress(value, message) {
    var percent = Math.max(0, Math.min(100, Math.round(value)));
    progressPercent.textContent = percent + "%";
    progressFill.style.width = percent + "%";
    progressStatus.textContent = message;
  }
  function cleanupStreams() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (compressionTimer) clearTimeout(compressionTimer);
    animationFrame = 0;
    compressionTimer = 0;
    var activeRecorder = recorder;
    if (activeRecorder && activeRecorder.state !== "inactive") {
      try { activeRecorder.stop(); } catch (error) { /* already stopping */ }
    }
    [sourceStream, outputStream].forEach(function (stream) {
      if (stream && typeof stream.getTracks === "function") stream.getTracks().forEach(function (track) { track.stop(); });
    });
    recorder = null;
    sourceStream = null;
    outputStream = null;
  }
  function revokeUrl(name) {
    if (name === "input" && inputUrl) { URL.revokeObjectURL(inputUrl); inputUrl = ""; }
    if (name === "result" && resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = ""; }
  }
  function resetResult() {
    revokeUrl("result");
    savedOutput = null;
    downloadButton.removeAttribute("href");
    setHidden(resultPanel, true);
  }
  function resetFile() {
    cancelled = true;
    terminalState = "cancelled";
    cleanupStreams();
    resetResult();
    revokeUrl("input");
    selectedFile = null;
    preview.removeAttribute("src");
    preview.load();
    fileInput.value = "";
    compressButton.disabled = false;
    setHidden(filePanel, true);
    setHidden(settingsPanel, true);
    setHidden(progressPanel, true);
    setHidden(dropZone, false);
  }
  function setPreset(name) {
    var preset = Utils.PRESETS[name];
    if (!preset) return;
    resolution.value = preset.resolution;
    quality.value = preset.quality;
    for (var i = 0; i < presets.length; i++) presets[i].classList.toggle("active", presets[i].getAttribute("data-preset") === name);
    try { chrome.storage.local.set({ clipForgePreset: name }); } catch (error) { /* preferences are optional */ }
  }
  function showFile(file) {
    if (!Utils.validVideoFile(file) || file.size > Utils.MAX_FILE_SIZE) {
      if (selectedFile) resetFile();
      fileMeta.textContent = Utils.validVideoFile(file) ? "That file is larger than the 2 GB local processing limit." : "Choose a video file such as MP4, MOV, or WebM.";
      setHidden(filePanel, false);
      setHidden(settingsPanel, true);
      return;
    }
    resetResult();
    revokeUrl("input");
    selectedFile = file;
    inputUrl = URL.createObjectURL(file);
    fileName.textContent = file.name || "Selected video";
    fileMeta.textContent = Utils.formatBytes(file.size) + " · reading video details…";
    preview.src = inputUrl;
    setHidden(dropZone, true);
    setHidden(filePanel, false);
    setHidden(settingsPanel, true);
    preview.load();
  }
  preview.addEventListener("loadedmetadata", function () {
    if (!selectedFile) return;
    fileMeta.textContent = selectedFile.name + " · " + preview.videoWidth + "×" + preview.videoHeight + " · " + Utils.formatDuration(preview.duration) + " · " + Utils.formatBytes(selectedFile.size);
    setHidden(settingsPanel, false);
  });
  preview.addEventListener("error", function () {
    if (!selectedFile) return;
    fileMeta.textContent = "This browser could not decode that video. Try MP4 or WebM.";
    setHidden(settingsPanel, true);
  });
  function handleFiles(files) { if (files && files[0]) showFile(files[0]); }
  chooseFile.addEventListener("click", function (event) { event.stopPropagation(); fileInput.click(); });
  dropZone.addEventListener("click", function () { fileInput.click(); });
  dropZone.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener("change", function () { handleFiles(fileInput.files); });
  ["dragenter", "dragover"].forEach(function (eventName) { dropZone.addEventListener(eventName, function (event) { event.preventDefault(); dropZone.classList.add("dragging"); }); });
  ["dragleave", "drop"].forEach(function (eventName) { dropZone.addEventListener(eventName, function (event) { event.preventDefault(); dropZone.classList.remove("dragging"); }); });
  dropZone.addEventListener("drop", function (event) { handleFiles(event.dataTransfer.files); });
  removeFile.addEventListener("click", resetFile);
  compressAnother.addEventListener("click", resetFile);
  for (var i = 0; i < presets.length; i++) presets[i].addEventListener("click", function () { setPreset(this.getAttribute("data-preset")); });
  try {
    chrome.storage.local.get({ clipForgePreset: "share" }, function (data) { setPreset(data.clipForgePreset || "share"); });
  } catch (error) { setPreset("share"); }

  function finishCompression(blob, duration, dimensions, startedBytes) {
    if (cancelled || terminalState !== "running") return;
    terminalState = "finished";
    cleanupStreams();
    savedOutput = blob;
    resultUrl = URL.createObjectURL(blob);
    var reduction = startedBytes > 0 ? Math.max(0, Math.round((1 - blob.size / startedBytes) * 100)) : 0;
    resultMeta.textContent = Utils.formatBytes(startedBytes) + " → " + Utils.formatBytes(blob.size) + " · " + dimensions.width + "×" + dimensions.height + " · " + (reduction > 0 ? reduction + "% smaller" : "new WebM copy");
    downloadButton.href = resultUrl;
    downloadButton.download = Utils.fileStem(selectedFile.name) + "-compressed.webm";
    compressButton.disabled = false;
    setHidden(progressPanel, true);
    setHidden(resultPanel, false);
    downloadButton.focus();
  }
  function failCompression(message) {
    if (terminalState === "finished") return;
    terminalState = "failed";
    cancelled = true;
    cleanupStreams();
    setHidden(progressPanel, true);
    setHidden(settingsPanel, false);
    progressStatus.textContent = message;
    compressButton.disabled = false;
  }
  function compress() {
    if (!selectedFile || !preview.videoWidth || recorder) return;
    var mime = Utils.chooseMimeType();
    if (!mime) { failCompression("This Chrome build does not support local WebM recording."); return; }
    cancelled = false;
    terminalState = "running";
    compressButton.disabled = true;
    setHidden(settingsPanel, true);
    setHidden(resultPanel, true);
    setHidden(progressPanel, false);
    updateProgress(1, "Preparing the local encoder…");
    var dimensions = Utils.outputDimensions(preview.videoWidth, preview.videoHeight, resolution.value);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    var context = canvas.getContext("2d", { alpha: false });
    sourceStream = typeof preview.captureStream === "function" ? preview.captureStream() : null;
    if (!sourceStream || typeof canvas.captureStream !== "function") { failCompression("This browser cannot capture local video for compression."); return; }
    outputStream = canvas.captureStream(30);
    sourceStream.getAudioTracks().forEach(function (track) { outputStream.addTrack(track); });
    var bitrate = Utils.BITRATES[quality.value] || Utils.BITRATES.balanced;
    var chunks = [];
    try { recorder = new MediaRecorder(outputStream, { mimeType: mime, videoBitsPerSecond: bitrate }); } catch (error) { failCompression("The selected compression settings are unavailable in this browser."); return; }
    recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
    recorder.onerror = function () { failCompression("Compression stopped because the browser encoder reported an error."); };
    recorder.onstop = function () {
      var blob = new Blob(chunks, { type: mime });
      if (cancelled || terminalState !== "running" || !blob.size) { if (!cancelled && terminalState === "running") failCompression("No output was produced. Try another video format."); return; }
      finishCompression(blob, preview.duration, dimensions, selectedFile.size);
    };
    var duration = Number.isFinite(preview.duration) ? preview.duration : 0;
    var startedAt = performance.now();
    var stopped = false;
    function stopRecorder() {
      if (stopped || !recorder || recorder.state === "inactive") return;
      stopped = true;
      updateProgress(100, "Finishing the compressed file…");
      recorder.stop();
    }
    recorder.start(500);
    compressionTimer = setTimeout(stopRecorder, Math.max(2000, (duration + 1.5) * 1000));
    preview.currentTime = 0;
    preview.muted = true;
    preview.play().catch(function () { failCompression("Chrome could not start playback for this file."); });
    function draw() {
      if (!recorder || cancelled) return;
      if (preview.readyState >= 2) context.drawImage(preview, 0, 0, dimensions.width, dimensions.height);
      var elapsed = (performance.now() - startedAt) / 1000;
      updateProgress(duration ? Math.min(99, (preview.currentTime / duration) * 100) : Math.min(90, elapsed * 10), duration ? "Encoding frame " + Utils.formatDuration(preview.currentTime) + " of " + Utils.formatDuration(duration) : "Encoding video locally…");
      if (preview.ended || (duration && preview.currentTime >= duration - .03)) {
        stopRecorder();
        return;
      }
      animationFrame = requestAnimationFrame(draw);
    }
    animationFrame = requestAnimationFrame(draw);
  }
  compressButton.addEventListener("click", compress);
  cancelButton.addEventListener("click", function () {
    cancelled = true;
    terminalState = "cancelled";
    if (recorder && recorder.state !== "inactive") recorder.stop();
    cleanupStreams();
    setHidden(progressPanel, true);
    setHidden(settingsPanel, false);
    compressButton.disabled = false;
  });
  window.addEventListener("beforeunload", function () { cleanupStreams(); revokeUrl("input"); revokeUrl("result"); });
})();
