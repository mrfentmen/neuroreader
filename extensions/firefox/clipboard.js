"use strict";
(function () {
  var api = typeof browser !== "undefined" ? browser : chrome;
  var enabled = false;
  function refresh() {
    var result = api.storage.local.get({ nrClipboardOffer: false });
    if (result && typeof result.then === "function") result.then(function (data) { enabled = data.nrClipboardOffer === true; });
    else api.storage.local.get({ nrClipboardOffer: false }, function (data) { enabled = data.nrClipboardOffer === true; });
  }
  document.addEventListener("copy", function () {
    if (!enabled) return;
    var selection = window.getSelection ? window.getSelection().toString().trim() : "";
    if (!selection) return;
    var result = api.runtime.sendMessage({ type: "nr-clipboard-offer", text: selection });
    if (result && typeof result.catch === "function") result.catch(function () {});
  }, true);
  refresh();
  if (api.storage.onChanged && api.storage.onChanged.addListener) api.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes.nrClipboardOffer) enabled = changes.nrClipboardOffer.newValue === true;
  });
})();
