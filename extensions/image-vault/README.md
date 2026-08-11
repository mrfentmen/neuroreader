# ClipForge Lockbox — Private Image Vault

ClipForge Lockbox is a clearly labeled local encrypted image vault. It is not a disguised calculator, and it does not attempt to hide the fact that it stores encrypted images.

## Security model

- Images are encrypted with AES-GCM using a key derived from the user's password with PBKDF2-HMAC-SHA-256.
- A fresh random salt is stored with the vault configuration.
- Each image receives a fresh random 96-bit AES-GCM IV.
- Ciphertext and metadata are stored in IndexedDB on the extension profile.
- The password is never stored.
- The extension has no host permissions, content scripts, network calls, analytics, or remote code.

## Limitations

This is defense-in-depth for local browser storage, not an unhackable guarantee. It does not protect against malware, browser-profile compromise, screenshots, shoulder surfing, keyloggers, memory inspection while unlocked, or someone who controls the device. There is no password reset or recovery service. Clearing extension data or losing the password can permanently make images inaccessible.

Users should export or retain originals before uninstalling or clearing browser data. The current first release intentionally supports image storage only and does not sync between devices.

## Privacy

The public privacy policy is [`clipforge-lockbox-privacy.html`](https://mrfentmen.github.io/neuroreader/clipforge-lockbox-privacy.html). The two advertisement areas are static placeholders and load no ad code or tracking.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this directory.
5. Click the toolbar action named **ClipForge Lockbox — Private Image Vault**. It opens as a compact Chrome popup; keep it open while unlocking and managing images because Chrome closes extension popups when you click elsewhere.
