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

  api.runtime.onInstalled.addListener(createContextMenu);
  api.runtime.onStartup.addListener(createContextMenu);

  api.contextMenus.onClicked.addListener(function (info) {
    if (info.menuItemId === MENU_ID) openPending("selection", info.selectionText);
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
