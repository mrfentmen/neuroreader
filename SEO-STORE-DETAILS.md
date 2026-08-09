# NeuroReader — Store, SEO, and Public-Listing Details

Copy-ready language for the Chrome Web Store, Firefox Add-ons, website metadata, launch pages, and directory submissions.

## Positioning in one sentence

NeuroReader is a free, private browser extension and web app that adds local visual fixation points to webpages for ADHD, dyslexia, autism, and other neurodivergent readers.

## Chrome Web Store

### Short description (80 characters maximum)

Free private reading support with adaptive bolding for webpages.

### Detailed description

NeuroReader is a free reading-support extension for ADHD, dyslexia, autism, and other neurodivergent readers.

It adds visual entry points to readable webpage text by bolding word beginnings and punctuation locally in your browser. The Variable Fixation Formula varies repeated word patterns instead of applying one rigid pattern everywhere. Adaptive bolding keeps fixation letters visible in headings, links, navigation, video titles, posts, comments, and other text that already has emphasis.

### What it does

- Transforms readable webpage text automatically when enabled.
- Keeps transforming late-rendered feeds, chats, single-page-app content, and open shadow-root content while the page is active.
- Shows a visible fixation color for already-bold title and heading text; red is the default and the user can choose another local color.
- Offers a floating undo/reapply control.
- Breaks very long compound words into meaningful roots where possible, with a deterministic fallback for unknown words.
- Includes a popup transformer for pasted text, rich/plain copy, saved readings, local reading goals, focus tools, a reading ruler, and accessibility controls.
- Processes text on the device. No account or server is required.

### Privacy promise

NeuroReader does not collect, sell, upload, or analyze webpage text, pasted text, browsing history, URLs, identity, or account data on a NeuroReader server. The extension has no analytics, tracking pixels, advertising trackers, or cookies. Optional saved readings, settings, goals, and metrics stay in the browser's local extension storage and can be deleted or exported by the user.

The extension requests webpage access because transforming webpage text is its core function. Browser-owned pages, protected surfaces, closed shadow roots, canvas editors, cross-origin iframe content, code blocks, form controls, consent controls, and some site-specific widgets may remain untouched by design. Coverage is best-effort and the popup provides a private, copyable issue-report handoff.

NeuroReader has no account, no subscription, and no paywall for the free reading core. It is not affiliated with or endorsed by YouTube, Reddit, X, Instagram, GitHub, npm, Mozilla, Google, Bionic Reading, OpenDyslexic, or any other named service.

## Firefox Add-ons

### Summary

Free private adaptive reading support for neurodivergent readers.

### Description

NeuroReader helps readers find a visual starting point on busy webpages. It applies the NeuroReader Variable Fixation Formula locally, bolding word beginnings and punctuation while varying repeated patterns. Existing bold text receives a visible fixation color so headings, links, feeds, video titles, posts, and comments remain easy to distinguish.

The free core works without an account or paywall. All transformation happens in the browser. The extension does not send webpage text, pasted text, browsing history, or saved readings to a NeuroReader server.

NeuroReader is designed for dynamic sites. It observes new readable content, in-place updates, and open shadow-root content while transformation is active. Use the floating control to undo or reapply the page, or use the popup for pasted text, local saved readings, color choices, reading goals, focus tools, and private feedback drafting.

Some content is intentionally left alone: browser-owned pages, protected surfaces, closed shadow roots, cross-origin frames, code/preformatted blocks, form controls, consent controls, and interactive widgets whose text replacement could break selection or keyboard behavior. A site can also change its markup at any time. Report a reproducible gap without including private page content.

## SEO metadata

### Page title

NeuroReader — Free Private Reading Support for ADHD, Dyslexia, and Autism

### Meta description

Free private reading support for ADHD, dyslexia, autism, and other neurodivergent readers. Transform webpage text locally with adaptive bolding and visual fixation points.

### Open Graph title

NeuroReader — Read like your brain works

### Open Graph description

A free, private browser extension and web app that adds adaptive visual fixation points to readable text. No account. No paywall. Nothing leaves your browser.

### Suggested keywords

NeuroReader, reading support, ADHD reading tool, dyslexia reading tool, autism reading support, neurodivergent reading, focus while reading, visual fixation points, adaptive bolding, bold first letters, punctuation anchoring, accessible reading extension, browser reading aid, free Bionic Reading alternative, private reading tool, local-first accessibility, webpage text transformer, reading focus tool, reading ruler, compound word breakdown.

Use keywords naturally. Do not stuff them into visible copy, and do not claim a medical diagnosis, cure, guaranteed speed increase, or universal benefit.

## Truthful competitor positioning

### Short comparison copy

Bionic Reading helped popularize fixation-based text presentation. NeuroReader is an independent, free, open-source alternative built around a variable pattern, punctuation anchoring, local processing, and neurodivergent-first design. It is not affiliated with Bionic Reading and does not copy its code or branding.

### Longer comparison copy

NeuroReader belongs to the same broad category as Bionic Reading, OpenDyslexic, BeeLine Reader, Immersive Reader, and other reading-support tools, but it makes different product choices. Bionic Reading uses a fixed bolding approach; NeuroReader varies the fixation pattern between repeated words and also bolds punctuation as an anchor. OpenDyslexic is primarily a font; NeuroReader transforms text in the browser and also offers a downloadable static font. Unlike paid or account-based tools, NeuroReader's core reading transformation is free, private, and processed locally.

These are category comparisons, not endorsements or claims that one tool works for every reader. NeuroReader is an independent project with original implementation and its own name, formula documentation, and privacy boundary.

### Claims we can safely make

- Free core reading transformation.
- Local processing in the browser.
- No NeuroReader account required.
- No NeuroReader server receives webpage or pasted text.
- Variable fixation patterns and punctuation anchoring.
- Adaptive color treatment for already-bold text.
- Dynamic-page and open-shadow-root support, subject to site markup.
- User-controlled undo, local preferences, and local deletion/export controls.

### Claims we must not make

- "Works on every website."
- "Cures dyslexia," "treats ADHD," or any medical claim.
- "Makes everyone read faster."
- "Scientifically proven" without a completed study supporting the exact claim.
- "Bionic Reading but free," which implies copying or affiliation.
- "Zero permissions" when webpage access and local storage are required.
- "Nothing is ever stored" when a user explicitly chooses local saved readings or metrics.

## Verified public-site audit snapshot

The headed probe was run against public, unsigned-in pages with the default fixation color `#dc2626` (RGB `220,38,38`). Results are compatibility evidence, not guarantees:

- **X / Twitter:** public Explore shell transformed; visible blocks reported transformed with the default red fixation color.
- **Instagram:** public Explore shell and loaded cards transformed with the default red fixation color; public-page React console noise did not prevent transformation.
- **GitHub:** Explore page transformed with the default red fixation color on initial and scrolled views; the known sidebar selector did not render, so sidebar coverage was not independently measured.
- **npm:** readable package text transformed with the default red fixation color; code samples and package-name code elements remained skipped intentionally.
- **BBC News:** readable homepage text transformed with the default red fixation color in both viewport and scrolled checks; the public page was not gated.
- **The Guardian:** readable blocks transformed with the default red fixation color; a support promotion, edition control, and homepage-switching controls remained untouched.
- **AP News:** readable blocks transformed with the default red fixation color; an accessibility control and footer donation/mission copy remained untouched.
- **Hacker News, Dev.to, and Python Docs:** visible readable content transformed with the default red fixation color in the public probe.
- **Stack Overflow:** initial bot shell required a reload; after reload, readable content transformed with the default red fixation color and ad-frame/browser-boundary noise was not treated as a readable-content failure.
- **Reddit:** the public probe received Reddit's "Prove your humanity" wall, so no claim is made about real feed coverage from that run.

The extension's own deterministic hardpage, Chrome, Firefox DOM, and native Firefox suites remain the reliable regression evidence for late content, recycled nodes, shadow roots, title color, ads, comments, and undo behavior.

## Screenshot brief

Capture these with a clean public or local fixture page and no private account information:

1. A transformed article showing normal body text and punctuation anchors.
2. A dark-theme page showing red fixation letters in an already-bold heading or title.
3. The popup showing auto-transform, color choice, paste/transform/copy, and local controls.
4. A dynamic feed or local fixture after late content appears and is transformed.
5. The floating undo control after transformation.

Do not use screenshots to imply that a gated or untested site is fully supported.

## Support/contact line

NeuroReader is built in public. For a reproducible issue, include the browser, extension version, site type, theme, and a description of what stayed unchanged. Do not include private page text, private URLs, names, account details, or copied personal data.
