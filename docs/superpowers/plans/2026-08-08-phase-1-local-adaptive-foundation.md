# NeuroReader Phase 1 Local Adaptive Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-first local adaptive reading foundation and companion pages without modifying the canonical Variable Fixation Formula or existing extension transformation behavior.

**Architecture:** `adaptive.js` is a dependency-free browser/Node module that owns local profile storage, content classification, scroll-speed sampling, reading sessions, goals, streaks, presets, and analytics summaries. It never receives or stores source text; callers provide numeric metrics only. `dashboard.html` and `formula-builder.html` use the module and the shipped formula engine as separate layers. The web app gets a small opt-in Adaptive Formula control that changes presentation settings around the existing formula output, not the formula implementation.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, localStorage, Service Worker Cache API, existing Playwright regression tooling, Node's built-in `assert`.

## Global Constraints

- Do not modify `extensions/chrome/formula.js`, `extensions/firefox/formula.js`, `extensions/safari/formula.js`, or `formula.min.js`.
- Do not change existing extension `content.js` transformation semantics.
- All adaptive and analytics data remains local; no network upload, account, cookie, or tracking pixel.
- Adaptive Formula is opt-in and resettable.
- The free reading core remains available without payment or account.
- Every interactive control has a label, keyboard focus, and status feedback.
- No fake APIs, placeholder functions, or TODO comments.

---

### Task 1: Local adaptive engine

**Files:**
- Create: `adaptive.js`
- Test: `test/adaptive.test.js`

**Interfaces:**
- `NeuroReaderAdaptive.createStore(options)` returns a store with `getState()`, `setEnabled(enabled)`, `recordSession(metrics)`, `recordScroll(sample)`, `recordSettingChange(name, value)`, `classifyContent(text, hints)`, `getRecommendedSettings()`, `getDashboard()`, `exportJSON()`, `exportCSV()`, `reset()`, `encodePreset(settings)`, and `decodePreset(code)`.
- `NeuroReaderAdaptive.DEFAULT_STATE` is immutable-by-copy and contains `enabled`, `autoSpeed`, `profile`, `sessions`, `events`, and `goals`.
- `classifyContent` returns `{type, confidence, metrics}` for `technical`, `narrative`, `instructions`, or `general` and recognizes code blocks as `code`.

- [ ] **Step 1: Write tests for storage, classification, adaptive recommendations, goals, export, and reset.**
- [ ] **Step 2: Run `node test/adaptive.test.js`; expected initial failure because `adaptive.js` is absent.**
- [ ] **Step 3: Implement numeric-only local storage and deterministic classification.**
- [ ] **Step 4: Run the adaptive test and verify all assertions pass.**

### Task 2: Dashboard and formula builder

**Files:**
- Create: `dashboard.html`
- Create: `formula-builder.html`
- Create: `test/adaptive-pages.e2e.js`

**Interfaces:**
- Dashboard loads `adaptive.js` and renders `#total-words`, `#total-time`, `#average-wpm`, `#streak`, `#session-summary`, `#time-chart`, `#day-chart`, `#content-chart`, `#export-json`, `#export-csv`, and `#delete-data`.
- Formula builder renders `#builder-preview`, controls `[data-length]`, `#preset-export`, `#preset-import`, `#preset-apply`, and `#builder-reset`.
- Builder settings affect only preview presentation and are exported as a local preset code.

- [ ] **Step 1: Add page tests for dashboard empty state, seeded local data, export controls, reset, builder controls, and 375px viewport.**
- [ ] **Step 2: Run `node test/adaptive-pages.e2e.js`; expected failure because pages are absent.**
- [ ] **Step 3: Implement accessible, mobile-first pages with pure CSS charts and local-only status messages.**
- [ ] **Step 4: Run the page test and verify all assertions pass.

### Task 3: PWA and platform guides

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `mobile/README.md`
- Create: `desktop/README.md`
- Create: `ereader/README.md`
- Modify: `index.html` to register the manifest/service worker and link companion pages.

- [ ] **Step 1: Add manifest/service-worker asset tests.**
- [ ] **Step 2: Implement an offline cache limited to same-origin static assets.**
- [ ] **Step 3: Add concrete WKWebView, Android WebView, Electron/Tauri, Kindle/Kobo/Calibre instructions.**
- [ ] **Step 4: Run syntax and PWA tests.

### Task 4: Web app adaptive integration

**Files:**
- Modify: `index.html` settings markup and wiring only.
- Test: `test/webapp.e2e.js`

- [ ] **Step 1: Add an opt-in Adaptive Formula checkbox and local-learning status indicator.**
- [ ] **Step 2: Use `adaptive.js` recommendations only to select presentation settings after the canonical `transform()` call.**
- [ ] **Step 3: Record scroll samples and numeric session metrics locally, never source text.**
- [ ] **Step 4: Add dashboard/formula-builder links and test the toggle/reset behavior.

### Task 5: Validation and review

- [ ] Run `npm test`.
- [ ] Run `npm run test:webapp`, `npm run test:kids`, `npm run test:api`.
- [ ] Run `npm run test:e2e`, `node test/hardpage.e2e.js`, and `npm run test:firefox-dom`.
- [ ] Run `node --check adaptive.js sw.js test/adaptive.test.js test/adaptive-pages.e2e.js`.
- [ ] Confirm formula byte identity across all shipped copies.
- [ ] Review `git diff --check`, privacy boundaries, accessibility labels, and accidental files.
