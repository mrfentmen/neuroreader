# ClipForge Local Video Compressor Implementation Plan

> **For agentic workers:** This plan was executed in the current checkout without changing the existing NeuroReader extension.

**Goal:** Add a polished Chrome MV3 extension that compresses user-selected local video files entirely in-browser and saves a smaller WebM copy.

**Architecture:** A separate extension under `extensions/video-compressor` exposes `app.html` as a compact toolbar popup. The app uses a local file input, `HTMLVideoElement.captureStream()`, `HTMLCanvasElement.captureStream()`, and `MediaRecorder`; no remote service, background worker, or host access is needed. Chrome closes the popup when the user clicks elsewhere, so the workflow is designed to remain within the open popup.

**Tech Stack:** Manifest V3, vanilla HTML/CSS/JavaScript, browser media APIs, Playwright E2E tests.

## Global Constraints

- Never fetch, inspect, or download media from third-party streaming platforms.
- Never upload local files or add a backend/storage bucket.
- Keep all executable code bundled in the extension package.
- Use WebM output for the browser-native first release.
- Keep the ad area static and the Buy Me a Coffee link user-initiated.
- Do not modify the existing NeuroReader extension.

## Delivered tasks

- [x] Create the standalone MV3 manifest and service worker.
- [x] Build responsive orange ClipForge UI with local privacy messaging, presets, status, progress, cancellation, result download, ad placeholder, and support link.
- [x] Implement local video capture, resize, bitrate selection, WebM encoding, and download handling.
- [x] Add package validation, unit coverage, and Chromium E2E coverage.
- [x] Run focused validation and review the release boundary.
