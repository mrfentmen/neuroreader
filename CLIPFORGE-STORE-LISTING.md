# ClipForge Chrome Web Store Listing

## Product name

ClipForge — Local Video Compressor

> Release scope: this package compresses local videos. Image compression is not included in this release.

## Short description

Compress local videos privately in Chrome. Resize and export a smaller WebM copy without uploading your files.

## Detailed description

ClipForge makes local video files easier to share without sending them to a server.

Choose a video from your device, select a compression preset, and download a smaller WebM copy. Processing happens inside Chrome using browser-native media APIs, so there is no account, upload, storage bucket, or server-side processing.

### Features

- Local file selection with drag-and-drop support
- Quick share, balanced, and small-file presets
- Original, 1080p, 720p, and 480p maximum resolution options
- Smaller, balanced, and higher-quality bitrate choices
- Video preview before processing
- Progress feedback and cancellation
- Downloadable WebM output named from the original file
- Best-effort audio preservation when Chrome exposes an audio track
- Responsive interface for desktop and smaller screens
- No host permissions and no content scripts

### Important format note

ClipForge exports browser-native WebM video in this release. Input support depends on Chrome's installed codecs; MP4/H.264 and WebM are the best-tested inputs. The app does not promise that every AVI, MKV, MOV, or camera codec will decode in every Chrome installation.

### Privacy

Your video is processed locally. ClipForge does not upload or collect video files, filenames, video metadata, account information, or usage analytics. The only stored preference is the last selected compression preset, saved by Chrome's local extension storage.

ClipForge does not access webpages, read browsing history, inspect network traffic, or download media from websites.

The extension contains two static advertising placeholders—one near the top and one near the bottom—and an optional Buy Me a Coffee support link. The placeholders load no ad code or tracking. The support link opens only when clicked and is provided by an independent third-party service.

## Suggested category

Productivity

## Suggested language

English

## Required store assets

- Store icon: 128×128 PNG
- Screenshots: 1280×800 or 640×400 PNG/JPEG, no alpha
- Recommended screenshots:
  1. Empty drop zone showing the privacy-first workflow
  2. Local video preview and compression presets
  3. Progress state while encoding locally
  4. Completed result with output metadata and download button
  5. Mobile/narrow responsive layout

Do not show personal files, private filenames, account details, or unrelated platform branding in screenshots.
