"use strict";

(function () {
  var api = typeof browser !== "undefined" ? browser : chrome;
  var MENU_ID = "nr-share-snippet";
  var menuCreateRunning = false;
  var menuCreateQueued = false;

  function openPending(kind, text, done) {
    var value = String(text || "").trim();
    var finish = typeof done === "function" ? done : function () {};
    if (!value) { finish(false); return; }
    var pending = { nrPendingText: { kind: kind, text: value.slice(0, 20000), at: Date.now() } };
    try {
      var saved = api.storage.local.set(pending);
      function openPopup() {
        try {
          var opened = api.tabs.create({ url: api.runtime.getURL("popup.html?pending=1") });
          if (opened && typeof opened.then === "function") opened.then(function () { finish(true); }, function () { finish(false); });
          else finish(true);
        } catch (error) {
          finish(false);
        }
      }
      if (saved && typeof saved.then === "function") saved.then(openPopup, function () { finish(false); });
      else openPopup();
    } catch (error) {
      finish(false);
    }
  }

  function reportPendingFailure(source) {
    if (typeof console !== "undefined" && console.warn) console.warn("NeuroReader could not open the " + source + " transform popup.");
  }

  function createContextMenu() {
    if (menuCreateRunning) {
      menuCreateQueued = true;
      return;
    }
    menuCreateRunning = true;
    var removed = api.contextMenus.removeAll();
    function finishRemoval() {
      var created = api.contextMenus.create({ id: MENU_ID, title: "Transform selection with NeuroReader", contexts: ["selection"] });
      function finishCreation() {
        menuCreateRunning = false;
        if (menuCreateQueued) {
          menuCreateQueued = false;
          createContextMenu();
        }
      }
      if (created && typeof created.then === "function") created.then(finishCreation, finishCreation);
      else finishCreation();
    }
    if (removed && typeof removed.then === "function") removed.then(finishRemoval, finishRemoval);
    else finishRemoval();
  }

  function registerLifecycle() {
    var hasLifecycle = false;
    if (api.runtime.onInstalled && api.runtime.onInstalled.addListener) {
      api.runtime.onInstalled.addListener(createContextMenu);
      hasLifecycle = true;
    }
    if (api.runtime.onStartup && api.runtime.onStartup.addListener) {
      api.runtime.onStartup.addListener(createContextMenu);
      hasLifecycle = true;
    }
    if (!hasLifecycle) createContextMenu();
  }

  registerLifecycle();
  api.contextMenus.onClicked.addListener(function (info) {
    if (info.menuItemId === MENU_ID) openPending("selection", info.selectionText, function (ok) {
      if (!ok) reportPendingFailure("selection");
    });
  });

  function sendToTab(tabId, message) {
    if (tabId === undefined || tabId < 0) return;
    var pending = api.tabs.sendMessage(tabId, message);
    if (pending && typeof pending.catch === "function") pending.catch(function () {});
  }

  api.commands.onCommand.addListener(function (command, tab) {
    if (!tab || tab.id === undefined) return;
    if (command === "nr-toggle-page") sendToTab(tab.id, { type: "nr-toggle" });
    if (command === "nr-reading-mode") sendToTab(tab.id, { type: "nr-reading-mode-toggle" });
  });
  api.runtime.onMessage.addListener(function (message, sender, respond) {
    if (message && message.type === "nr-clipboard-offer") {
      openPending("clipboard", message.text, function (ok) { if (respond) respond({ ok: ok }); });
      return true;
    }
    if (message && message.type === "nr-context-menu-create") {
      createContextMenu();
      if (respond) respond({ ok: true });
    }
  });
})();
