"use strict";
(function () {
  var enabled = false;
  function refresh() {
    chrome.storage.local.get({ nrClipboardOffer: false }, function (data) { enabled = data.nrClipboardOffer === true; });
  }
  document.addEventListener("copy", function () {
    if (!enabled) return;
    var selection = window.getSelection ? window.getSelection().toString().trim() : "";
    if (!selection) return;
    chrome.runtime.sendMessage({ type: "nr-clipboard-offer", text: selection }, function () { void chrome.runtime.lastError; });
  }, true);
  refresh();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes.nrClipboardOffer) enabled = changes.nrClipboardOffer.newValue === true;
  });
})();
