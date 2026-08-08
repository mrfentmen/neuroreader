# NeuroReader — Changelog

> Every change to NeuroReader is documented here. This is how we stay transparent.

---

## [Unreleased] — 2026-08-07

### Added

- Built web app MVP: `index.html` (single file, vanilla JS, no dependencies)
- Implemented the Variable Fixation Formula in pure JavaScript (per-word occurrence counters, punctuation anchoring, Unicode-aware)
- Built `privacy.html` privacy policy page (we collect nothing, text never leaves the browser)
- Added banner ad placeholder (`#ad-banner`) at the bottom of the page — never over text (a vow)
- Copy button (plain text + rich HTML with bolding) and Download button (.txt)
- Ctrl/Cmd + Enter keyboard shortcut, word counter, calm black/white mobile-first UI
- Unit-tested the formula: 21 assertions covering every rule, edge cases, HTML injection safety, and performance (10,000 words < 100ms)
- Created NeuroReader project and founding documents
- Defined Variable Fixation Formula (the core transformation engine)
- Established founding vows (free core, no data selling, neurodivergent-first)
- Defined monetization strategy (ads + grants + optional donations, no premium)
- Chose platform strategy: web app first, then Android, browser extension, downloadable font
- Conducted competitive analysis (Bionic Reading, OpenDyslexic)
- Documented legal differentiation from Bionic Reading
- Created loop prompt for AI builder (freebuff)

### Decided

- **Name:** NeuroReader (chosen over ReadForm, ReadMarks, Fixate, Marked, Reword, ReadShift)
- **No premium tier:** All features free forever. Monetization via ethical ads + government grants + optional donations
- **Variable vs fixed formula:** NeuroReader uses variable/non-deterministic bolding within ranges, not a fixed percentage like Bionic Reading
- **Punctuation bolding:** All punctuation is bolded as anchor points — Bionic Reading does not do this
- **Web app MVP first:** Single HTML file, vanilla JavaScript, no dependencies
- **No iOS at first:** Android + browser extension covers desktop and mobile
- **Open source formula:** Publish the formula for transparency and to demonstrate independent creation
- **Neurodivergent-first design:** Built by a neurodivergent person for neurodivergent people, not a generic reading trick

### Key Insights

- Bionic Reading has patents on their fixed formula in US, EU, Switzerland, France — NeuroReader's variable formula is a genuinely different mechanism
- OpenDyslexic is considered ugly and ineffective by many users — NeuroReader needs to actually work, not just look different
- The 90s/early 2000s had appointment viewing and ritual media (MTV, mixtapes, burned CDs) — NeuroReader creates a reading ritual, not just a tool
- Neurodivergent communities (r/ADHD, r/dyslexia, r/autism) are hungry for tools that actually understand them — word of mouth in these communities is powerful
- Government grants for accessibility and neurodivergence exist and can fund development without needing venture capital or premium tiers

### Documents Created

- `VOWS.md` — Founding vows (7 promises)
- `constitution.md` — Full product constitution and roadmap
- `TODO.md` — Giant task list (7 phases, ~40 tasks)
- `LOOP-PROMPT.md` — Detailed build prompt for AI builder (freebuff)
- `knowledge.md` — Science, technology, legal position
- `context.md` — Project context and state
- `roadmap.md` — Detailed phased roadmap
- `README.md` — Project README
- `CHANGELOG.md` — This file
- `bionic-reader-research.md` — Competitive research

---

## Format

This changelog follows semantic versioning. Versions are formatted as `[MAJOR.MINOR.PATCH]`:

- **MAJOR:** Breaking changes to the formula or core product
- **MINOR:** New features, new platforms, significant changes
- **PATCH:** Bug fixes, small improvements, documentation updates

The unreleased section contains changes that are planned or in-progress but not yet shipped to users.

---

_Changelog started: 2026-08-07_
_Framework: Semantic Versioning_
