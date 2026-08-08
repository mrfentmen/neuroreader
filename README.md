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

No build tools. No dependencies. No install.

```bash
git clone https://github.com/mrfentmen/neuroreader.git
cd neuroreader
```

Then just open `index.html` in your browser. That is it. No server, no setup.

1. Paste any text into the box.
2. Hit **Transform** (or press `Ctrl/Cmd + Enter`).
3. Read. Copy the result or download it as an HTML file with the bolding preserved.

Everything runs locally in your browser. The page makes **zero network requests**.

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

## Testing

The formula is unit-tested against the actual shipped code in `index.html`. The test harness extracts the inline script and runs it in Node, so the tests can never drift out of sync with the app.

```bash
npm test
```

22 assertions cover every bolding rule, punctuation handling, spacing and line-break preservation, HTML-injection safety, Unicode, and the under-100ms performance target. No install needed, it is just Node.

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
- **Private by design.** All processing happens in the browser. Nothing is sent anywhere. This is a founding vow, and the page makes zero network requests to prove it.
- **Fast.** A 1,000-word text transforms in under 1ms (spec is under 100ms). A 10,000-word text in under 10ms.
- **Mobile-first.** Calm black-and-white design, large touch targets, works from a phone screen.
- **Respectful.** No animations, no pop-ups, no dark patterns. The text is the interface.
- **No ads over text.** Banner ads only, at the very bottom of the page, never over the text being read.
- **Open source.** The formula is public, for transparency, and to prove independent creation.

---

## The Vows

NeuroReader runs on seven non-negotiable promises, documented in [`VOWS.md`](VOWS.md):

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
index.html                        The entire web app (HTML, CSS, and JS in one file)
privacy.html                      Privacy policy (we collect nothing)
VOWS.md                           The seven founding vows
constitution.md                   Full product constitution and feature-by-version plan
knowledge.md                      The science, the formula, and the technology decisions
roadmap.md                        The five-phase build plan
changelog.md                      Every change, documented
context.md                        Current project state
TODO.md                           The giant task list
bionic-reader-research.md         Competitive research
```

## Roadmap

| Phase | Focus                                         | Status  |
| ----- | --------------------------------------------- | ------- |
| 1     | Web app MVP                                   | Done    |
| 2     | Launch, testers, feedback                     | Next    |
| 3     | Android, browser extension, downloadable font | Planned |
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
