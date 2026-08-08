# NeuroReader Research Mode

Research Mode is an optional, local-only measurement tool for improving the reading experience. It is **off by default** and the core reader works fully without it.

## Consent

The settings panel explains the metrics before the user enables the toggle. Enabling it records a local event log. There is no account, no tracking pixel, no analytics request, and no automatic upload.

## Collected locally

- scroll position changes and approximate scroll speed signals
- elapsed time since the page was opened
- approximate word count from text the user transformed
- backwards scroll events as a regression proxy
- which visual fixation features were enabled

## Never collected

- the actual text
- names, email addresses, or other personal information
- URLs, page titles, or browsing history
- IP addresses or device fingerprints

## User controls

The settings panel provides a preview, an export button for JSON, and a delete button. Export creates a local download. Delete removes the local event log. Turning the toggle off stops new events.

## Ethics

Metrics are proxies, not diagnoses or proof of reading ability. The feature must never shame a reader, gate a feature, or imply that one visual style works for everyone. Any future research study or upload must add a new, explicit consent flow explaining the destination, retention, security, and withdrawal process. Until that exists, the product remains local-only to honor NeuroReader's privacy vow.
