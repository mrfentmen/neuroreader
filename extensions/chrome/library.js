/* NeuroReader local saved-reading library.
 * Stores transformed text on this device only. It never stores URLs, page
 * titles from tabs, account identifiers, or any network data.
 */
(function (root) {
  "use strict";
  var api = typeof browser !== "undefined" && browser.storage ? browser : chrome;
  var isPromiseApi = typeof browser !== "undefined" && !!browser.storage;
  var KEY = "nrSavedReadings";
  var QUEUE_KEY = "nrReadingQueue";
  var MAX_ITEMS = 25;
  var MAX_TEXT = 100000;
  var MAX_TOTAL_BYTES = 900000;
  var DEFAULTS = [];

  function storageGet(callback) {
    if (isPromiseApi) {
      api.storage.local.get({ [KEY]: DEFAULTS }).then(function (data) {
        callback(Array.isArray(data[KEY]) ? data[KEY] : DEFAULTS);
      }, function () { callback(DEFAULTS); });
    } else {
      api.storage.local.get({ [KEY]: DEFAULTS }, function (data) {
        callback(Array.isArray(data[KEY]) ? data[KEY] : DEFAULTS);
      });
    }
  }

  function storageSet(items, callback) {
    var done = typeof callback === "function" ? callback : function () {};
    if (isPromiseApi) {
      api.storage.local.set({ [KEY]: items }).then(function () { done(items, null); }, function (error) { done(items, error || new Error("Storage write failed")); });
    } else {
      api.storage.local.set({ [KEY]: items }, function () {
        var error = api.runtime && api.runtime.lastError;
        done(items, error ? new Error(error.message || "Storage write failed") : null);
      });
    }
  }

  function cleanText(value) {
    return String(value || "").slice(0, MAX_TEXT);
  }

  function cleanTitle(value) {
    var title = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return title.slice(0, 120) || "Untitled reading";
  }

  function wordCount(text) {
    return (String(text || "").match(/[\p{L}\p{N}]+/gu) || []).length;
  }

  function normalize(item, fallbackId) {
    var input = item || {};
    var createdAt = Number(input.createdAt) || Date.now();
    var updatedAt = Number(input.updatedAt) || createdAt;
    return {
      id: String(input.id || fallbackId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8))),
      title: cleanTitle(input.title),
      text: cleanText(input.text),
      html: cleanText(input.html),
      wordCount: wordCount(input.text),
      createdAt: createdAt,
      updatedAt: updatedAt,
    };
  }

  function serializedBytes(items) {
    return encodeURIComponent(JSON.stringify(items)).length;
  }

  function normalizeList(items) {
    var sorted = (Array.isArray(items) ? items : [])
      .map(function (item, index) { return normalize(item, "saved-" + index); })
      .filter(function (item) { return !!item.text; })
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; })
      .slice(0, MAX_ITEMS);
    while (sorted.length && serializedBytes(sorted) > MAX_TOTAL_BYTES) sorted.pop();
    return sorted;
  }

  function queueGet(callback) {
    if (isPromiseApi) {
      api.storage.local.get({ [QUEUE_KEY]: [] }).then(function (data) {
        callback(Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY].map(String) : []);
      }, function () { callback([]); });
    } else {
      api.storage.local.get({ [QUEUE_KEY]: [] }, function (data) {
        callback(Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY].map(String) : []);
      });
    }
  }

  function queueSet(ids, callback) {
    var done = typeof callback === "function" ? callback : function () {};
    if (isPromiseApi) {
      api.storage.local.set({ [QUEUE_KEY]: ids }).then(function () { done(ids, null); }, function (error) { done(ids, error || new Error("Queue write failed")); });
    } else {
      api.storage.local.set({ [QUEUE_KEY]: ids }, function () {
        var error = api.runtime && api.runtime.lastError;
        done(ids, error ? new Error(error.message || "Queue write failed") : null);
      });
    }
  }

  function cleanQueue(ids, items) {
    var valid = Object.create(null);
    var seen = Object.create(null);
    items.forEach(function (item) { valid[item.id] = item; });
    return (Array.isArray(ids) ? ids : []).map(String).filter(function (id) {
      if (!valid[id] || seen[id]) return false;
      seen[id] = true;
      return true;
    }).slice(0, MAX_ITEMS);
  }

  function queueList(callback) {
    list(function (items) {
      queueGet(function (ids) {
        var clean = cleanQueue(ids, items);
        var changed = clean.length !== ids.length || clean.some(function (id, index) { return id !== ids[index]; });
        function finish(error) {
          var byId = Object.create(null);
          items.forEach(function (item) { byId[item.id] = item; });
          callback(clean.map(function (id) { return byId[id]; }), error || null);
        }
        if (changed) queueSet(clean, function (_, error) { finish(error); }); else finish(null);
      });
    });
  }

  function queueToggle(id, callback) {
    var value = String(id || "");
    enqueue(function (finish) {
      list(function (items) {
        var exists = items.some(function (item) { return item.id === value; });
        if (!exists) { if (callback) callback([], false, new Error("Saved reading not found")); finish(); return; }
        queueGet(function (ids) {
          var clean = cleanQueue(ids, items);
          var index = clean.indexOf(value);
          var active = index < 0;
          if (active) clean.push(value); else clean.splice(index, 1);
          queueSet(clean, function (stored, error) {
            if (callback) callback(error ? [] : clean.map(function (queueId) { return items.find(function (item) { return item.id === queueId; }); }), active, error || null);
            finish();
          });
        });
      });
    });
  }

  function queueMove(id, direction, callback) {
    var value = String(id || "");
    var delta = Number(direction) < 0 ? -1 : 1;
    enqueue(function (finish) {
      list(function (items) {
        queueGet(function (ids) {
          var clean = cleanQueue(ids, items);
          var index = clean.indexOf(value);
          var target = index + delta;
          if (index < 0 || target < 0 || target >= clean.length) { if (callback) callback(clean.map(function (queueId) { return items.find(function (item) { return item.id === queueId; }); }), null); finish(); return; }
          var swapped = clean[index]; clean[index] = clean[target]; clean[target] = swapped;
          queueSet(clean, function (stored, error) {
            if (callback) callback(error ? [] : clean.map(function (queueId) { return items.find(function (item) { return item.id === queueId; }); }), error || null);
            finish();
          });
        });
      });
    });
  }

  function queueRemove(id, callback) {
    var value = String(id || "");
    enqueue(function (finish) {
      queueGet(function (ids) {
        var clean = ids.filter(function (queueId) { return queueId !== value; });
        queueSet(clean, function (stored, error) { if (callback) callback(error ? null : clean, error || null); finish(); });
      });
    });
  }

  function queueClear(callback) {
    enqueue(function (finish) {
      queueSet([], function (stored, error) { if (callback) callback(error ? null : [], error || null); finish(); });
    });
  }

  var operationQueue = [];
  var operationRunning = false;
  function enqueue(operation) {
    operationQueue.push(operation);
    if (operationRunning) return;
    operationRunning = true;
    function next() {
      var current = operationQueue.shift();
      if (!current) { operationRunning = false; return; }
      current(function () { next(); });
    }
    next();
  }

  function list(callback) {
    storageGet(function (items) { callback(normalizeList(items)); });
  }

  function save(item, callback) {
    var next = normalize(item);
    enqueue(function (finish) {
      if (!next.text) {
        if (callback) callback(null, normalizeList([]), null);
        finish();
        return;
      }
      list(function (items) {
        var found = false;
        for (var i = 0; i < items.length; i++) {
          if (items[i].id === next.id) {
            next.createdAt = items[i].createdAt;
            items[i] = next;
            found = true;
            break;
          }
        }
        if (!found) items.unshift(next);
        var trimmed = normalizeList(items);
        storageSet(trimmed, function (stored, error) {
          if (callback) callback(error ? null : next, error ? items : stored, error || null);
          finish();
        });
      });
    });
  }

  function remove(id, callback) {
    var value = String(id || "");
    enqueue(function (finish) {
      list(function (items) {
        var remaining = items.filter(function (item) { return item.id !== value; });
        storageSet(remaining, function (stored, error) {
          if (callback) callback(error ? items : normalizeList(stored), error || null);
          finish();
        });
      });
    });
  }

  function clear(callback) {
    enqueue(function (finish) {
      storageSet([], function (stored, error) {
        if (callback) callback(error ? null : [], error || null);
        finish();
      });
    });
  }

  root.NeuroReaderLibrary = {
    KEY: KEY,
    QUEUE_KEY: QUEUE_KEY,
    MAX_ITEMS: MAX_ITEMS,
    MAX_TEXT: MAX_TEXT,
    MAX_TOTAL_BYTES: MAX_TOTAL_BYTES,
    DEFAULTS: DEFAULTS,
    normalize: normalize,
    normalizeList: normalizeList,
    list: list,
    save: save,
    remove: remove,
    clear: clear,
    queueList: queueList,
    queueToggle: queueToggle,
    queueMove: queueMove,
    queueRemove: queueRemove,
    queueClear: queueClear,
    wordCount: wordCount,
  };
})(window);
