# NeuroReader

> Read like your brain works.

[![Tests](https://github.com/mrfentmen/neuroreader/actions/workflows/test.yml/badge.svg)](https://github.com/mrfentmen/neuroreader/actions/workflows/test.yml)

NeuroReader is a free, private reading tool built for neurodivergent brains: people with ADHD, dyslexia, autism, and other neurological differences. It transforms plain text with a **Variable Fixation Formula**. The first part of each word is bolded in a pattern that changes every time a word appears, and every punctuation mark is bolded as an anchor. The result is text that is easier to start, easier to hold, and easier to finish.

No account. No tracking. No text ever leaves your browser.

**Website:** [neuroreader.app](https://neuroreader.app) _(coming soon)_
**Try it now:** **[live demo](https://mrfentmen.github.io/neuroreader/)** free, no install, works on any phone or desktop.

---

## Why NeuroReader exists

Standard text was designed for neurotypical brains. For neurodivergent readers it creates real problems.

ADHD brains lose focus because fixed visual patterns cause habituation. The brain stops registering repetitive stimuli, lines get skipped, paragraphs get reread. Dyslexic brains struggle with letter recognition and visual crowding; dense text blocks become overwhelming. Autistic brains get overloaded by visual noise, unpredictable layouts, and inconsistent formatting.

Existing tools don't fix this. OpenDyslexic is a static font swap that many find unappealing. Bionic Reading uses a fixed formula, costs money, and never changes how reading works, only what letters look like. NeuroReader takes a different approach: variable stimulation that keeps the visual cortex engaged, fixation points that tell the eye exactly where to land, and punctuation anchoring that creates a reading rhythm.

Built by a neurodivergent person, for neurodivergent people, never for neurotypical comfort.

---

## Quick start

The app needs **no build step** — `formula.min.js` ships pre-built, so opening `index.html` just works.

```bash
git clone https://github.com/mrfentmen/neuroreader.git
cd neuroreader
```

Then just open `index.html` in your browser. That is it. No server, no setup.

1. Paste any text into the box.
2. Hit **Transform** (or press `Ctrl/Cmd + Enter`).
3. Read. Copy the result or download it as an HTML file with the bolding preserved.

Everything runs locally in your browser. **No text, no data ever leaves your browser** — the only requests are the page's own static files, and nothing is sent anywhere.

---

## Deploying for free

NeuroReader is a static site, two files, no build step, so it deploys free on any static host.

### Netlify (recommended)

1. Push this repo to GitHub.
2. Go to [app.netlify.com](https://app.netlify.com), click **Add new site**, **Import an existing project**, pick the repo.
3. Netlify reads `netlify.toml` automatically. Publish directory is `.`, no build command. Done. You get a live URL in under a minute.
4. Add a custom domain later under **Site settings > Domain** (a domain costs ~$12/year), or keep the free `*.netlify.app` URL.

No GitHub yet? Use **Netlify Drop**: drag the folder (just `index.html` and `privacy.html`) onto [app.netlify.com/drop](https://app.netlify.com/drop) and it is live immediately.

### Vercel

Import the repo and Vercel auto-detects a static site. Zero config, no `vercel.json` needed.

### GitHub Pages

Push to GitHub, then **Settings > Pages**, deploy from branch `main` at `/` (root). The site lives at `https://<your-username>.github.io/neuroreader/`.

> **Note:** `#ad-banner` is a placeholder, nothing is rendered there yet. When it is filled in later, it stays a bottom banner only, never over text (a vow). The deploy configs add no ads and collect nothing.

---

## Formula protection

Any JavaScript that runs in a browser can be read by anyone — perfect secrecy in the browser is impossible. NeuroReader therefore ships its Variable Fixation Formula **minified** (`formula.min.js`, ~25% of the readable size, variable names mangled) to stop casual copy-paste from the live site and the packaged extensions. The readable source stays in the repo (`extensions/chrome/formula.js`, the canonical engine) because the project is open source and build-in-public by vow — this is a deterrent, not a lock.

- Regenerate: `npm run build:min` (runs `tools/minify.js`, then `npm test` verifies the result).
- Extension packaging: `npm run minify:ext -- <copy-of-extension-dir>` minifies a *copy* of an extension's JS for store submission; the repo keeps the readable source.
- Font files contain no code (just letter shapes) — never minified.
- The formula is **never** moved to a server: that would cost money and break the privacy vow (text must never leave the browser).

The formula is already in public git history, so minification stops casual copy-paste, not determined reverse-engineering. Real protection is speed, brand, community, and continuous improvement.

---

## Font & extensions

Beyond the web app, NeuroReader ships two companions:

- **NeuroReader Font** — a static version of the formula as a real font (first two letters of every word and all punctuation render heavier). Install it and it works in *any* app — email, documents, PDFs. Files in `fonts/` (`.ttf`, `.otf`, `.woff2`, plus a Bold weight). Built from Roboto (Apache 2.0) with `tools/build_font.py`.
- **Browser extensions** — transform any webpage. **Auto-transform is ON by default**: the moment you install, every page you visit is transformed automatically (undo any page with the floating button, or turn it off in the popup). Undo via the floating button is per-page — the next page you load is transformed again, because auto-transform is the global setting; the popup's **Auto-transform every page** switch is the way to turn it off everywhere. **Adaptive bolding**: text that is *already* bold (headings, navigation, video titles, `<strong>` copy) gets the color formula instead of bold-on-bold — the weight is kept and the first part of each word plus punctuation shifts to a visibly different shade that works on light and dark backgrounds. `extensions/chrome` (MV3, works in Chrome/Edge/Brave), `extensions/firefox` (MV2), and `extensions/safari` (source, needs Xcode). The store listings aren't live yet — load the extensions unpacked from the repo.

The web app has a **Get the Font** section and a **Browser Extension** section right below the footer, with per-OS install instructions.

## Testing

The formula is unit-tested against **the exact file the web app ships**: `formula.min.js` (the minified engine that `index.html` loads). Testing the shipped file means the assertions can never drift out of sync with what users actually get — and it proves the minified formula is still correct after every regeneration.

```bash
npm test             # 22 formula assertions against formula.min.js (no install needed)
npm run test:e2e     # Chrome extension e2e: transforms a real page (19 checks)
node test/hardpage.e2e.js # SPA failure-mode e2e: sticky/shadow/adaptive (20 checks)
npm run test:webapp   # web app journey + edge cases + mobile viewport (18 checks)
npm run test:firefox # Firefox MV2: code parity + web-ext lint + real addon install
npm run test:firefox-native # native e2e: real Firefox + geckodriver + real addon install (22 checks)
npm run test:firefox-dom # DOM-level e2e in real Firefox (25 checks)
npm run check:font   # shape-tests the font's OpenType rules (needs .venv)
npm run build:min    # regenerate formula.min.js from the canonical engine
```

GitHub Actions runs four jobs on every push and PR: formula, Firefox MV2 install/lint, Firefox DOM, and Chromium. The Chromium job runs the extension, hardpage, and web-app regression suites under xvfb, so paste/transform/copy, edge cases, mobile layout, and browser behavior stay guarded.

The unit tests cover every bolding rule, punctuation handling, spacing and line-break preservation, HTML-injection safety, Unicode, and the under-100ms performance target. The web-app e2e covers the full paste/transform/copy journey, empty and long input, special characters, injection escaping, Unicode/emoji, paragraph breaks, both companion sections, the always-enabled download control, and a mobile viewport. The extension e2e also drives a `hardpage` fixture that reproduces SPA failure modes (late-rendered content, recycled nodes, in-place rewrites, shadow roots) to prove the sticky-transform fix. Playwright suites need `npm i -D playwright` and `npx playwright install chromium` once; `check:font` needs `python3 -m venv .venv && .venv/bin/pip install fonttools brotli uharfbuzz`.

**Firefox note:** Playwright's bundled Firefox cannot load extensions (verified: profile installs are ignored, `about:debugging` crashes the Juggler context). Two suites cover it:

- `test:firefox` proves the extension layer: the shared runtime files are byte-identical to the Chromium build that passes the DOM e2e checks, the MV2 manifest passes Mozilla's own `web-ext lint` (0 errors), and the addon genuinely installs and launches in this exact Firefox binary via `web-ext run`.
- `test:firefox-native` closes the last gap: WebDriver + geckodriver against a **real Firefox** (Homebrew: `brew install --cask firefox geckodriver`), installing the actual MV2 addon as a temporary add-on via the WebDriver Install Extension command, then driving the full hardpage check set — auto-transform on load, sticky late/recycled content, characterData rewrites, shadow roots (per-shadow-root observers, late-attached, pre-existing hosts), adaptive bolding, launcher undo/redo — 22 checks, all green. Needs `npm i -D selenium-webdriver`.
- `test:firefox-dom` runs the **same shipped `formula.js` + `content.js` inside real Firefox** (Playwright's bundled Firefox 153 — real SpiderMonkey, DOM, MutationObserver, and Shadow DOM) with a small `chrome.storage`/`runtime` stub for the only extension APIs the script touches. It drives the full hardpage fixture plus the popup messaging and auto-toggle round-trips — 25 checks, all green. It remains the suite that covers the popup/messaging protocol (WebDriver cannot drive the browser-action popup UI); `test:firefox-native` covers the true addon bootstrap + DOM behavior.

---

## How it works

### The Variable Fixation Formula

For each word, a variable number of letters (from the start) is bolded:

| Word length | Letters bolded | Behavior                 |
| ----------- | -------------- | ------------------------ |
| 1 letter    | 0 or 1         | Alternates by occurrence |
| 2 letters   | 1              | Always 1                 |
| 3 letters   | 2              | Always 2                 |
| 4 letters   | 2 or 3         | Varies (50-50)           |
| 5 letters   | 2, 3, or 4     | Varies (chance-based)    |
| 6+ letters  | 3, 4, or 5     | Varies (chance-based)    |

All punctuation is bolded: periods, commas, quotes, brackets, everything, as anchor points. The bolding is non-deterministic, meaning the same word is bolded differently each time it appears. This prevents the brain from habituating to a fixed pattern. Original spacing and line breaks are preserved exactly. No extra spacing, no clutter.

### The science

Three research-backed principles: variable stimulation (habituation resistance), fixation points (eye-tracking research on saccades and fixations), and punctuation anchoring (a secondary rhythm layer that mirrors spoken language). The full write-up lives in [`knowledge.md`](knowledge.md).

---

## Features

- **Free. Always.** No premium, no paywall, no account. Reading is not a luxury.
- **Private by design.** All processing happens in the browser. Nothing is sent anywhere — the only network activity is loading the page's own static files. This is a founding vow, and there are no analytics, no beacons, no third-party requests to prove it.
- **Fast.** A 1,000-word text transforms in under 1ms (spec is under 100ms). A 10,000-word text in under 10ms.
- **Mobile-first.** Calm black-and-white design, large touch targets, works from a phone screen.
- **Respectful.** No animations, no pop-ups, no dark patterns. The text is the interface.
- **No ads over text.** Banner ads only, at the very bottom of the page, never over the text being read.
- **Open source.** The formula is public, for transparency, and to prove independent creation.

---

## The Vows

NeuroReader runs on seven non-negotiable promises

1. There will always be a free version.
2. We will never sell user data, we never collect it.
3. We will never gate reading help behind a paywall.
4. Neurodivergent brains come first, not "everyone."
5. We will never shame. Never "just try harder."
6. Ads may support us, but never interfere with reading.
7. We build in public.

If these are broken, we have failed.

---

## Repo structure

```
index.html                        The entire web app (HTML, CSS, and UI wiring in one file)
formula.min.js                    The Variable Fixation Formula, minified (what ships)
privacy.html                      Privacy policy (we collect nothing)
fonts/                            The NeuroReader Font (.ttf / .otf / .woff2 / Bold) + Apache license
extensions/chrome                 Chrome/Edge/Brave extension (Manifest V3)
extensions/firefox                Firefox extension (Manifest V2)
extensions/safari                 Safari extension source (needs Xcode wrapper)
tools/build_font.py               Font builder (Roboto + OpenType calt/ss01 rules)
tools/validate_font.py            Font validator (shape-tests the rules with uharfbuzz)
tools/minify.js                   Regenerates formula.min.js + extension-packaging minifier
test/formula.test.js              Formula unit tests (npm test)
test/extension.e2e.js             Chrome extension end-to-end test (Playwright)
test/hardpage.e2e.js              SPA failure-mode e2e (sticky/shadow/characterData fixes)
test/firefox.e2e.js               Firefox MV2: code parity + web-ext lint + install check
test/firefox-dom.e2e.js           DOM-level e2e of the shipped content.js in real Firefox
test/fixtures/hardpage.html       Fixture reproducing YouTube-style failure modes
netlify.toml                      Free static deployment config
```

Internal planning docs (VOWS, constitution, knowledge, roadmap, changelog, TODO, research) live in the repo but are gitignored so they never publish.

## Roadmap

| Phase | Focus                                         | Status  |
| ----- | --------------------------------------------- | ------- |
| 1     | Web app MVP                                   | Done    |
| 2     | Launch, testers, feedback                     | Next    |
| 3     | Android, store-published extensions, Safari wrapper | In progress (font + Chrome/Firefox extensions built) |
| 4     | Monetization and growth                       | Planned |
| 5     | Maturity                                      | Planned |

See [`roadmap.md`](roadmap.md) for the full plan.

---

## Contributing

NeuroReader is a solo project, and **feedback from neurodivergent people is the most valuable contribution there is**. If you are neurodivergent and want to test the app, report what works and what does not, or share the science, please open an issue or reach out. This project is being built in public, in the open, for you.

## License

[MIT](LICENSE), the code and the Variable Fixation Formula are open source. Independent creation, documented publicly, distinct from Bionic Reading's fixed-formula approach (see [`knowledge.md`](knowledge.md) for the legal write-up).

---

## Contact

Solo project, built in public. Progress is shared here on GitHub and in neurodivergent communities.

_NeuroReader, read like your brain works._
