"use strict";

(function () {
  var api = chrome;
  var MENU_ID = "nr-share-snippet";
  var menuCreateRunning = false;
  var menuCreateQueued = false;

  function openPending(kind, text) {
    var value = String(text || "").trim();
    if (!value) return;
    api.storage.local.set({
      nrPendingText: { kind: kind, text: value.slice(0, 20000), at: Date.now() },
    }, function () {
      api.tabs.create({ url: api.runtime.getURL("popup.html?pending=1") });
    });
  }

  function createContextMenu() {
    if (menuCreateRunning) {
      menuCreateQueued = true;
      return;
    }
    menuCreateRunning = true;
    api.contextMenus.removeAll(function () {
      api.contextMenus.create({
        id: MENU_ID,
        title: "Transform selection with NeuroReader",
        contexts: ["selection"],
      }, function () {
        menuCreateRunning = false;
        if (menuCreateQueued) {
          menuCreateQueued = false;
          createContextMenu();
        }
      });
    });
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
    if (info.menuItemId === MENU_ID) openPending("selection", info.selectionText);
  });

  function sendToTab(tabId, message) {
    if (tabId === undefined || tabId < 0) return;
    api.tabs.sendMessage(tabId, message, function () {
      if (api.runtime.lastError) {
        // Protected browser pages intentionally cannot receive content scripts.
      }
    });
  }

  api.commands.onCommand.addListener(function (command, tab) {
    if (!tab || tab.id === undefined) return;
    if (command === "nr-toggle-page") sendToTab(tab.id, { type: "nr-toggle" });
    if (command === "nr-reading-mode") sendToTab(tab.id, { type: "nr-reading-mode-toggle" });
  });

  api.runtime.onMessage.addListener(function (message, sender, respond) {
    if (message && message.type === "nr-clipboard-offer") {
      openPending("clipboard", message.text);
      respond({ ok: true });
      return;
    }
    if (message && message.type === "nr-context-menu-create") {
      createContextMenu();
      respond({ ok: true });
    }
  });
})();
