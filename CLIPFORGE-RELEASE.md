# ClipForge Production Release Guide

This guide covers packaging and submitting both ClipForge Chrome extensions. It does not publish or upload anything automatically. The final extension sources and public privacy pages are committed in this repository.

## Extensions

### 1. ClipForge — Local Video Compressor

- Source: `extensions/video-compressor/`
- Public repository source: `https://github.com/mrfentmen/neuroreader/tree/main/extensions/video-compressor`
- Package: `npm run package:clipforge -- --version 0.1.0 --out dist/clipforge-release`
- Output: `dist/clipforge-release/clipforge-chrome-v0.1.0.zip`
- Privacy page in package: `privacy.html`
- Public privacy policy: `https://mrfentmen.github.io/neuroreader/clipforge-privacy.html`
- Store copy: `CLIPFORGE-STORE-LISTING.md`

### 2. ClipForge Lockbox — Private Image Vault

- Source: `extensions/image-vault/`
- Public repository source: `https://github.com/mrfentmen/neuroreader/tree/main/extensions/image-vault`
- Package: `npm run package:image-vault -- --version 0.1.0 --out dist/lockbox-release`
- Output: `dist/lockbox-release/clipforge-lockbox-chrome-v0.1.0.zip`
- Privacy page in package: `privacy.html`
- Public privacy policy: `https://mrfentmen.github.io/neuroreader/clipforge-lockbox-privacy.html`
- Security boundary: local encrypted image storage; no “unhackable” guarantee and no password recovery.

These are separate Chrome Web Store items. Keep them separate to preserve single-purpose listings and accurate privacy disclosures.

## Generate logos and screenshots

Run:

```bash
npm run capture:clipforge-store-assets
```

This packages both extensions first, loads the packaged artifacts in Chromium, and captures truthful screenshots into `store-assets/`. The generated asset map is in `store-assets/CLIPFORGE-UPLOADS.md`.

Each package generates 16×16, 48×48, and 128×128 PNG icons. The store upload icon is the generated 128×128 PNG. The source icon designs are kept with each extension and are not used as screenshot uploads.

## Pre-release commands

From the repository root:

```bash
npm ci
npm audit --audit-level=high
npm run test:clipforge
npm run test:clipforge-e2e
npm run test:image-vault
npm run test:image-vault-e2e
npm run test:package-chrome
node --check extensions/video-compressor/app.js
node --check extensions/image-vault/app.js
node --check tools/package-clipforge.js
node --check tools/package-image-vault.js
node --check tools/capture-clipforge-store-assets.js
npm run package:clipforge -- --version 0.1.0 --out dist/clipforge-release
npm run package:image-vault -- --version 0.1.0 --out dist/lockbox-release
npm run capture:clipforge-store-assets
```

Verify each release artifact:

```bash
unzip -l dist/clipforge-release/clipforge-chrome-v0.1.0.zip
unzip -l dist/lockbox-release/clipforge-lockbox-chrome-v0.1.0.zip
shasum -a 256 dist/clipforge-release/clipforge-chrome-v0.1.0.zip
shasum -a 256 dist/lockbox-release/clipforge-lockbox-chrome-v0.1.0.zip
```

## Chrome Web Store account setup

1. Open the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
2. Register or sign into a developer account.
3. Complete Google's developer registration and identity/payment verification requirements.
4. Use these public HTTPS privacy-policy URLs in the dashboard:
   - Compressor: `https://mrfentmen.github.io/neuroreader/clipforge-privacy.html`
   - Lockbox: `https://mrfentmen.github.io/neuroreader/clipforge-lockbox-privacy.html`
   GitHub Pages must be enabled for the `main` branch. A bundled `privacy.html` file is not automatically a public URL for the dashboard.
5. Use separate store items because these extensions have separate single purposes.

## Upload ClipForge compressor

1. Select **Add new item**.
2. Upload `dist/clipforge-release/clipforge-chrome-v0.1.0.zip`.
3. Product name: `ClipForge — Local Video Compressor`.
4. Short description and detailed copy: use `CLIPFORGE-STORE-LISTING.md`.
5. Category: Productivity.
6. Upload the 128×128 compressor PNG named in `store-assets/CLIPFORGE-UPLOADS.md`.
7. Upload the compressor screenshots from `store-assets/`.
8. Explain the only permission: `storage` remembers the last compression preset and never stores video contents.
9. Privacy policy URL: `https://mrfentmen.github.io/neuroreader/clipforge-privacy.html`.
10. Privacy disclosure: no video files, filenames, metadata, browsing activity, or analytics are collected or transmitted.
11. Disclose that the extension contains two static ad placeholders and an optional, user-initiated Buy Me a Coffee link. Core compression is not gated.
12. Review the preview and submit.

## Upload ClipForge Lockbox

1. Select **Add new item** as a separate listing.
2. Upload `dist/lockbox-release/clipforge-lockbox-chrome-v0.1.0.zip`.
3. Product name: `ClipForge Lockbox — Private Image Vault`.
4. Use the Lockbox screenshots from `store-assets/`.
5. State clearly that selected images are encrypted locally with Web Crypto AES-GCM and stored in IndexedDB.
6. State clearly that the password is not stored and there is no recovery service.
7. State clearly that the extension has no host permissions, content scripts, network access, analytics, or remote code.
8. Do not call it a calculator, hidden vault, unhackable, military-grade, or guaranteed secure.
9. Disclose the exact limitation: a compromised device/browser profile or someone with access while unlocked can defeat the local security boundary.
10. Complete the User Data and Privacy sections accurately, including local handling of user-selected image files.
11. Privacy policy URL: `https://mrfentmen.github.io/neuroreader/clipforge-lockbox-privacy.html`.
12. Review the preview and submit.

## Screenshot and logo mapping

See `store-assets/CLIPFORGE-UPLOADS.md` for the exact filenames. The required store icon is 128×128 PNG. Screenshots are captured at 1280×800 or 640×400. Use no private media or personal filenames.

## Policy guardrails

- Keep every extension single-purpose and accurately named.
- Both toolbar actions open compact `app.html` popups; Chrome closes a popup when the user clicks elsewhere, so long compression/vault actions should remain in the open popup.
- Keep all executable code inside the uploaded ZIP.
- Do not add website downloading, stream extraction, or network inspection.
- Do not load an ad script or remote JavaScript at runtime.
- Keep support links voluntary and never gate core features.
- Do not claim universal codec support, guaranteed audio preservation, MP4 output, unhackable storage, or password recovery.
- The current ClipForge compressor release is video-only; image compression is not included in this package.

## Post-submit

- Save the exact ZIP, checksum, screenshots, store copy, and privacy-policy revision submitted for each item.
- Install the approved Web Store versions in a clean Chrome profile and repeat the E2E user journeys.
- Test compressor inputs on the platforms you claim to support; codec support varies.
- Test Lockbox with a test image, lock/unlock, wrong password, delete, extension-data clearing, and uninstall warning.
- For any update, increment the correct extension version independently and regenerate its package and checksum.

## Public privacy pages

These pages are committed at the repository root and are intended to be served by GitHub Pages:

- [ClipForge compressor privacy policy](https://mrfentmen.github.io/neuroreader/clipforge-privacy.html)
- [ClipForge Lockbox privacy policy](https://mrfentmen.github.io/neuroreader/clipforge-lockbox-privacy.html)

## Official references

- [Chrome Web Store publishing](https://developer.chrome.com/docs/webstore/publish)
- [Prepare a Chrome Web Store listing](https://developer.chrome.com/docs/webstore/prepare)
- [Chrome Web Store image requirements](https://developer.chrome.com/docs/webstore/images)
- [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies)
- [Chrome Web Store user data policy](https://developer.chrome.com/docs/webstore/program-policies/user-data)
- [Manifest icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons)
- [Manifest V3 content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
