# ClipForge Security Hardening

## Important guarantee boundary

No browser extension is “unhackable.” ClipForge is hardened to reduce its attack surface, but security depends on Chrome, the operating system, the browser profile, the user's device, and the code shipped in each release.

## ClipForge compressor controls

- Manifest V3.
- No host permissions.
- No content scripts or background worker.
- No network requests or remote executable code.
- Strict extension-page CSP: `script-src 'self'; object-src 'self'`.
- Local-only file input and browser-native processing.
- Object URLs are revoked when files, results, or the page are discarded.
- A 2 GB input limit prevents unbounded local processing attempts.
- Filenames are only used for text labels and a sanitized download filename.
- Package validation rejects unexpected remote URLs and unexpected permissions.
- Release packaging generates and validates 16px, 48px, and 128px icons.
- E2E tests load the packaged artifact, not just source files.

## Threat model

### Protected against

- A website trying to use ClipForge because there are no content scripts or host permissions.
- Remote script substitution because code is bundled and CSP is strict.
- Accidental server disclosure because the app never sends video data to a server.
- Stale object-URL memory retention through normal completion, cancellation, replacement, and unload paths.
- Very large input files exhausting the intended local workflow beyond the explicit size limit.

### Not protected against

- Malware or a compromised operating system.
- A compromised Chrome profile or browser process.
- A user who installs a modified/untrusted build.
- Screen capture, screenshots, keyloggers, memory inspection, or a person controlling the unlocked device.
- Bugs in Chrome's media codecs or browser-native APIs.
- Data already exposed by the user's own file system, backups, or download folder.

## Release checks

```bash
npm ci
npm audit --audit-level=high
npm run test:clipforge
npm run test:clipforge-e2e
npm run test:package-chrome
npm run test:image-vault
npm run test:image-vault-e2e
npm run package:clipforge -- --version 0.1.0 --out dist/clipforge-release
```

Review the exact ZIP, checksum, manifest permissions, generated icons, privacy statement, store listing, and screenshot set before submitting.

## Image vault boundary

The optional ClipForge Lockbox is separate from the compressor and is deliberately labeled as a local encrypted image vault. It uses password-derived AES-GCM encryption and IndexedDB. It has no host permissions or network access. It is not a covert application and does not claim to be a substitute for a password manager or a secure operating-system vault.
