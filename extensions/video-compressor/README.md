# ClipForge — Local Video Compressor

ClipForge is a Chrome MV3 extension for compressing video files already on the user's device. It does not fetch media from websites, upload files, or require an account, backend, database, or storage bucket.

## What it does

- Accepts local video files; Chrome support depends on the source codec. MP4/H.264 and WebM are the best-tested inputs.
- Resizes video to an original, 1080p, 720p, or 480p maximum height.
- Encodes a browser-native WebM copy with selectable bitrate quality.
- Preserves an audio track when Chrome exposes one from the source video; audio preservation is best-effort and depends on the input codec.
- Offers a local download named after the source file.

Output is WebM because it is the reliable, browser-native recording format available without shipping a large native codec bundle. MP4 export can be added later with a separately reviewed, locally bundled codec pipeline.

## Branding and release

The source icon design is `branding/clipforge-icon.svg`. The release packager generates the required 16×16, 48×48, and 128×128 PNG icons and adds their manifest references to the production staging directory. See `CLIPFORGE-STORE-LISTING.md` and `CLIPFORGE-RELEASE.md` at the repository root for store copy and the full submission checklist.

## Privacy and permissions

The extension only requests `storage` for the last selected preset. There are no host permissions, network requests, content scripts, remote scripts, or server-side processing. The public privacy policy is [`clipforge-privacy.html`](https://mrfentmen.github.io/neuroreader/clipforge-privacy.html).

The top and bottom advertisement areas are static, user-visible placeholders. They load no ad code or tracking. The support link opens only after the user clicks it.

## Local install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this directory.
5. Click the ClipForge toolbar icon. The compressor opens in a compact Chrome popup. Keep the popup open while choosing, compressing, and downloading a video; Chrome closes extension popups when you click elsewhere.
