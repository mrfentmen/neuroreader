"use strict";

(function () {
  var api = chrome;
  var MENU_ID = "nr-share-snippet";

  function openPending(kind, text) {
    var value = String(text || "").trim();
    if (!value) return;
    api.storage.local.set({
      nrPendingText: { kind: kind, text: value.slice(0, 20000), at: Date.now() },
    }, function () {
      api.tabs.create({ url: api.runtime.getURL("popup.html?pending=1") });
    });
  }

  api.runtime.onInstalled.addListener(function () {
    api.contextMenus.create({
      id: MENU_ID,
      title: "Transform selection with NeuroReader",
      contexts: ["selection"],
    });
  });

  api.contextMenus.onClicked.addListener(function (info) {
    if (info.menuItemId === MENU_ID) openPending("selection", info.selectionText);
  });

  api.runtime.onMessage.addListener(function (message, sender, respond) {
    if (message && message.type === "nr-clipboard-offer") {
      openPending("clipboard", message.text);
      respond({ ok: true });
    }
  });
})();
