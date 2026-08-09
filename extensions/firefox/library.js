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
  var MAX_IMPORT_ITEMS = 100;
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

  function queueItems(ids, items) {
    var byId = Object.create(null);
    items.forEach(function (item) { byId[item.id] = item; });
    return cleanQueue(ids, items).map(function (id) { return byId[id]; });
  }

  function exportData(callback) {
    list(function (items) {
      queueGet(function (ids) {
        var clean = cleanQueue(ids, items);
        callback({
          version: 1,
          exportedAt: new Date().toISOString(),
          readings: items.map(function (item) {
            return { id: item.id, title: item.title, text: item.text, updatedAt: item.updatedAt };
          }),
          queue: clean,
        }, null);
      });
    });
  }

  function importData(payload, callback) {
    var done = typeof callback === "function" ? callback : function () {};
    enqueue(function (finish) {
      try {
        var readings = Array.isArray(payload)
          ? payload
          : payload && payload.version === 1 && Array.isArray(payload.readings)
            ? payload.readings
            : null;
        var isEnvelope = !Array.isArray(payload);
        var requestedQueue = isEnvelope && payload && Array.isArray(payload.queue) ? payload.queue : [];
        if (!readings || readings.length > MAX_IMPORT_ITEMS || requestedQueue.length > MAX_IMPORT_ITEMS) throw new Error("Invalid saved-reading file");
        if (isEnvelope && (!payload || payload.version !== 1 || !Array.isArray(payload.queue))) throw new Error("Invalid saved-reading file");
        if (requestedQueue.some(function (id) { return typeof id !== "string"; })) throw new Error("Invalid saved-reading queue");
        var sourceIds = Object.create(null);
        readings.forEach(function (raw) {
          if (!raw || typeof raw !== "object" || typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > MAX_TEXT) throw new Error("Malformed saved reading");
          if (raw.id !== undefined && typeof raw.id !== "string") throw new Error("Malformed saved reading");
          if (raw.title !== undefined && typeof raw.title !== "string") throw new Error("Malformed saved reading");
          if (raw.updatedAt !== undefined && (typeof raw.updatedAt !== "number" || !Number.isFinite(raw.updatedAt))) throw new Error("Malformed saved reading");
          if (raw.id && sourceIds[raw.id]) throw new Error("Duplicate saved-reading id");
          if (raw.id) sourceIds[raw.id] = true;
        });
        list(function (existing) {
          queueGet(function (existingQueue) {
            var byText = Object.create(null);
            var reserved = Object.create(null);
            existing.forEach(function (item) { byText[item.text] = item.id; reserved[item.id] = true; });
            var idMap = Object.create(null);
            var additions = [];
            var validCount = 0;
            var invalidError = null;
            readings.forEach(function (raw, index) {
              if (invalidError) return;
              if (!raw || typeof raw !== "object" || typeof raw.text !== "string") {
                invalidError = new Error("Malformed saved reading");
                return;
              }
              var text = cleanText(raw.text);
              if (!text.trim()) {
                invalidError = new Error("Malformed saved reading");
                return;
              }
              validCount += 1;
              var existingId = byText[text];
              if (existingId) {
                if (raw.id) idMap[String(raw.id)] = existingId;
                return;
              }
              var candidate = raw.id ? String(raw.id) : "reading-import-" + Date.now().toString(36) + "-" + index;
              while (reserved[candidate]) candidate += "-1";
              reserved[candidate] = true;
              var imported = normalize({
                id: candidate,
                title: raw.title,
                text: text,
                updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
              });
              additions.push(imported);
              byText[text] = imported.id;
              if (raw.id) idMap[String(raw.id)] = imported.id;
            });
            if (invalidError) {
              done(null, invalidError);
              finish();
              return;
            }
            var combined = normalizeList(existing.concat(additions));
            var present = Object.create(null);
            combined.forEach(function (item) { present[item.id] = true; });
            var dropped = additions.filter(function (item) { return !present[item.id]; }).length;
            var importedQueue = requestedQueue.map(String).map(function (id) { return idMap[id] || (present[id] ? id : ""); }).filter(Boolean);
            var finalIds = cleanQueue(existingQueue.concat(importedQueue), combined);
            storageSet(combined, function (stored, storageError) {
              if (storageError) {
                done(null, storageError);
                finish();
                return;
              }
              queueSet(finalIds, function (queueStored, queueError) {
                if (queueError) {
                  done(null, queueError);
                  finish();
                  return;
                }
                done({
                  items: combined,
                  queue: queueItems(finalIds, combined),
                  imported: validCount,
                  added: additions.length - dropped,
                  dropped: dropped,
                }, null);
                finish();
              });
            });
          });
        });
      } catch (error) {
        done(null, error);
        finish();
      }
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
    MAX_IMPORT_ITEMS: MAX_IMPORT_ITEMS,
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
    exportData: exportData,
    importData: importData,
    wordCount: wordCount,
  };
})(window);
