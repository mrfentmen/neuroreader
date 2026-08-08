# NeuroReader — Knowledge Base

> Everything you need to know about NeuroReader: the science, the formula, the technology, and the decisions behind it.

---

## 1. THE PROBLEM

Neurodivergent people — those with ADHD, dyslexia, autism, and other neurological differences — often struggle with reading in ways that neurotypical people do not. Standard text presentation assumes a neurotypical brain: uniform letterforms, consistent spacing, no visual guides. For neurodivergent readers, this creates several problems:

- **ADHD brains** lose focus because fixed visual patterns cause habituation. The brain stops paying attention to repetitive stimuli. Lines get skipped. Paragraphs get rereaded. The eye wanders.
- **Dyslexic brains** struggle with letter recognition and visual crowding. Letters appear to swap or flip. Dense text blocks become overwhelming.
- **Autistic brains** can be overwhelmed by visual noise, unpredictable layouts, and inconsistent formatting. They benefit from clean, predictable structure.

Existing solutions are inadequate. Standard fonts (Arial, Times New Roman) were designed for printing efficiency, not reading accessibility. OpenDyslexic attempts to help but is widely considered visually unappealing and offers only a static font swap — it does not change how reading works, only what letters look like. Bionic Reading uses a fixed formula to bold the first part of each word, which helps guide the eye but is a one-size-fits-all approach that charges money and does not account for neurodivergent-specific needs.

---

## 2. THE SCIENCE

NeuroReader is built on three research-backed principles:

**Variable Stimulation:** The human brain, especially the ADHD brain, habituates to fixed patterns. When every word looks the same, the brain stops registering them. Variable stimulation — changing the visual pattern — keeps the brain engaged. This is why some people read better with music, in different locations, or after movement. NeuroReader applies this to text itself: the bolding pattern changes with each occurrence of a word, keeping the visual cortex active.

**Fixation Points:** Eye tracking research shows that readers do not move smoothly across text. They make rapid movements (saccades) punctuated by brief stops (fixations). Each fixation captures a chunk of text. By bolding the first part of each word, NeuroReader creates a clear fixation point — the eye knows exactly where to land. This reduces regressions (going back to reread) and skipped lines.

**Punctuation Anchoring:** Punctuation marks are natural pause points in language. By bolding all punctuation, NeuroReader creates a secondary rhythm layer. The eye uses punctuation as anchor points between which the variable word-bolding operates. This creates a visual cadence that mirrors the natural rhythm of spoken language.

---

## 3. THE FORMULA

NeuroReader uses a Variable Fixation Formula that is fundamentally different from Bionic Reading's fixed formula. While Bionic Reading always bolds the same percentage of each word (deterministic), NeuroReader varies the bolding within defined ranges (non-deterministic). This means the same word will be bolded differently each time it appears, preventing habituation.

The formula by word length:

- 1 letter: alternates bold/normal by occurrence count
- 2 letters: always 1 bold
- 3 letters: always 2 bold
- 4 letters: randomly 2 or 3 bold (50-50)
- 5 letters: randomly 2, 3, or 4 bold
- 6+ letters: randomly 3, 4, or 5 bold

All punctuation is always bolded. No extra spacing is added. The transformation happens entirely in the browser — no text is sent to any server.

---

## 4. TECHNOLOGY

NeuroReader is built to be fast, private, and dependency-free. The web app is a single HTML file with embedded CSS and JavaScript. No frameworks, no build tools, no npm packages. This ensures:

- Instant loading (no JavaScript bundles to download)
- Works offline (no server calls needed)
- Privacy by design (no data leaves the browser)
- Easy to audit (open source, human-readable)
- Works on any device with a browser

The formula is implemented as a pure function: text in, transformed text out. No side effects. No state beyond the occurrence counters needed for the alternating rules.

Future platforms (Android, browser extension, downloadable font) will share the same core formula implemented in their respective languages.

---

## 5. LEGAL POSITION

NeuroReader is designed to be legally distinct from Bionic Reading (bionic-reading.com):

- Bionic Reading uses a **fixed** formula; NeuroReader uses a **variable** formula
- Bionic Reading targets "speed reading for everyone"; NeuroReader targets **neurodivergent users specifically**
- Bionic Reading does not bold punctuation; NeuroReader **bolds all punctuation**
- NeuroReader is built with original code; no copying of their implementation

These differences are documented here and in the constitution to demonstrate independent creation.

---

## 6. DESIGN PRINCIPLES

Every design decision follows these principles:

1. The text is the interface — everything else fades away
2. Black and white first — no visual noise
3. One screen, one job — paste, transform, read
4. Mobile-first — people read on phones
5. Fast — transformation in under 100ms
6. Private — nothing leaves the browser
7. Respectful — designed for people who struggle, never shaming

---

_Knowledge base last updated: 2026-08-07_
_Version: 1.0_
