"use strict";

(function () {
  var api = typeof browser !== "undefined" ? browser : chrome;
  var MENU_ID = "nr-share-snippet";

  function openPending(kind, text) {
    var value = String(text || "").trim();
    if (!value) return;
    var pending = { nrPendingText: { kind: kind, text: value.slice(0, 20000), at: Date.now() } };
    var saved = api.storage.local.set(pending);
    if (saved && typeof saved.then === "function") saved.then(function () { api.tabs.create({ url: api.runtime.getURL("popup.html?pending=1") }); });
    else api.tabs.create({ url: api.runtime.getURL("popup.html?pending=1") });
  }

  var created = api.contextMenus.create({ id: MENU_ID, title: "Transform selection with NeuroReader", contexts: ["selection"] });
  if (created && typeof created.catch === "function") created.catch(function () {});
  api.contextMenus.onClicked.addListener(function (info) {
    if (info.menuItemId === MENU_ID) openPending("selection", info.selectionText);
  });
  api.runtime.onMessage.addListener(function (message, sender, respond) {
    if (message && message.type === "nr-clipboard-offer") {
      openPending("clipboard", message.text);
      if (respond) respond({ ok: true });
    }
  });
})();
