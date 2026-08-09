# NeuroReader Store Listings

Prepared for the first public extension submissions.

## Chrome Web Store

### Short description

Free private reading support with adaptive bolding for every webpage.

_Character count: 67._

### Long description

NeuroReader is a free public-beta reading tool for ADHD, dyslexia, autism, and other neurodivergent readers.

Transform any webpage into a calmer, more guided reading experience. NeuroReader creates fixation points by bolding the beginnings of words and punctuation. Its Variable Fixation Formula varies the pattern between repeated words so the page does not settle into one repetitive visual rhythm.

The extension is currently distributed as a public beta. Install it from the Chrome Web Store when the listing is approved; Chrome then updates future releases automatically. The GitHub repository remains the public source and issue tracker.

The extension works locally in your browser:

- Auto-transform pages as they load, enabled by default.
- Use the floating button to undo or reapply a transformation.
- Keep up with dynamic sites such as YouTube, feeds, chats, and single-page apps.
- Transform text that appears later, including content inside open shadow roots.
- Use adaptive bolding for headings, navigation, video titles, and other text that is already bold.
- Already-bold title text uses a visible red fixation color instead of invisible bold-on-bold.
- Break words longer than 15 letters into meaningful roots, with a syllable fallback for unknown words.
- Paste text into the popup, transform it, and copy the result.
- Turn automatic transformation on or off from the popup.
- Undo everything on a page without sending the page text anywhere.

NeuroReader is free, private, and built for neurodivergent brains. There is no account, no paywall, no analytics, and no text collection. The extension does not send webpage text or pasted text to a server. All transformation happens on your device.

The core reading tool will always have a free version. Reading help should not be a luxury.

### Features

- Free to use
- Private, local-only processing
- Automatic page transformation
- One-click undo and reapply
- Adaptive bolding for existing bold text
- Red fixation color for title-like text
- Dynamic-page and SPA support
- Open shadow-root support
- Long compound-word breakdown
- Popup text transformer
- Copy transformed text as rich HTML and plain text
- Chrome, Edge, Brave, and Opera compatible

## Firefox Add-ons

### Summary

Free, private adaptive reading support for webpages.

### Description

NeuroReader helps neurodivergent readers read webpages with clearer visual entry points. It is designed for people with ADHD, dyslexia, autism, and other reading needs.

The extension applies the NeuroReader Variable Fixation Formula locally in Firefox. It bolds the beginnings of words and punctuation, varies repeated patterns, and preserves the page's original text. It never sends webpage content or pasted text to a server.

NeuroReader automatically transforms new pages by default. Use the floating control to undo or reapply the transformation, or use the popup to transform pasted text, copy a result, transform the current page, and change the global auto-transform setting.

It also supports modern dynamic websites. Newly-rendered feed items, rewritten text, chat messages, open shadow-root content, and recycled page sections continue to be handled while the transformation is active. Existing bold text receives an adaptive color treatment so headings and video titles do not become invisible bold-on-bold. Title-like text uses a visible red fixation color. Words longer than 15 letters are broken into meaningful roots when possible, with a deterministic syllable fallback when no known root matches.

NeuroReader is free, private, and neurodivergent-first. There are no accounts, no tracking, no ads over reading text, and no paywall. All processing happens on the user's device.

### Features

- Free and always available
- Local-only text processing
- No accounts, analytics, cookies, or text collection
- Automatic transformation on page load
- Undo and reapply from the floating page control
- Popup transformer for pasted text
- Adaptive bolding for headings and emphasized text
- Visible red fixation color for title-like text
- Support for dynamic pages and single-page apps
- Open shadow-root support
- Compound-word breakdown for long words
- Preserved spacing, punctuation, and original text
- Copy rich HTML and plain text from the popup

## Privacy policy text for both stores

NeuroReader does not collect, sell, or transmit webpage text, pasted text, browsing history, page contents, or reading preferences to a NeuroReader server. Transformation happens locally in memory. If the user explicitly chooses Save, the extension stores that reading locally in the browser so it can be reopened; that local saved text is never sent to NeuroReader.

The extension does not use analytics, advertising trackers, tracking pixels, fingerprinting, or cookies. It does not require an account or login.

The `storage` permission is used only for local browser settings and readings: auto-transform, fixation colors, accessibility preferences, saved readings and queues, daily goals, timers, progress totals, clipboard-offer preference, and short-lived selected-text handoff. These values stay in the browser's extension storage and are never sent to a NeuroReader server. The `activeTab` permission is used to communicate with the current tab when the user asks NeuroReader to transform or undo that page. Page content is processed in memory and is not uploaded.

The extension requests access to webpages because transforming webpage text is its core function. It does not modify or transmit content outside the user's browser except when the user explicitly copies transformed text through the browser's normal clipboard controls.

NeuroReader may be supported by a bottom-of-page advertisement in the web app in the future, but the browser extensions do not inject advertising and never place ads over reading text.

Full public privacy page: `https://mrfentmen.github.io/neuroreader/privacy.html`

Contact: use the public GitHub repository's issue tracker.

## Screenshot requirements

Prepare at least three screenshots for each store, using clean test pages with no private information:

1. **Article reading view** — a normal webpage after transformation, showing regular body text with fixation letters bolded and punctuation anchored. Keep the NeuroReader floating control visible but unobtrusive.
2. **YouTube title view** — a YouTube video page showing a title with red fixation letters on already-bold title text, plus a few transformed sidebar titles if visible. Do not capture account names, recommendations that reveal personal information, or private notifications.
3. **Popup view** — the NeuroReader popup showing the auto-transform toggle, paste box, Transform button, transformed preview, Copy button, and page control.
4. **Dynamic/shadow content view (optional)** — a safe test fixture or public page showing late-arriving content transformed after it appears.
5. **Undo view (optional)** — the same page after the floating control changes to `Undo NeuroReader`, demonstrating reversibility.

Capture recommendations:

- Use a consistent 1280×800 or 1280×900 desktop viewport.
- Use readable sample text with strong contrast and no personal data.
- Avoid browser tabs, bookmarks, email addresses, account avatars, private URLs, or unrelated extensions.
- Do not claim that a screenshot demonstrates a feature that is not visible in that image.
- Store screenshots in the dimensions and file-size limits shown by the current Chrome Web Store and Firefox Add-ons submission forms.
