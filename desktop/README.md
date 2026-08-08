# NeuroReader desktop wrappers

The desktop app should package the existing static web app and reuse the same local formula and adaptive store. Do not add remote analytics or a server dependency.

## Electron

1. Create an Electron app with `main.cjs` and load `index.html` from the packaged resources.
2. Use a restrictive session permission handler: deny unsolicited camera, microphone, notification, and external protocol requests.
3. Enable context isolation and disable Node integration in the renderer.
4. Register a safe application menu command for Reading Mode and expose only the web app's keyboard shortcuts.
5. Package with Electron Forge or Builder: macOS DMG, Windows MSI/NSIS installer, and Linux AppImage/deb.
6. Test offline startup, localStorage persistence, keyboard navigation, VoiceOver/NVDA, and clean uninstall behavior.

## Tauri

1. Create a Tauri project whose frontend points at this repository's static files.
2. Keep the allowlist/capabilities minimal: window management and local asset loading only.
3. Build with the platform toolchains: `.dmg` for macOS, `.msi` for Windows, and `.AppImage`/`.deb` for Linux.
4. Sign release artifacts using the platform's normal signing process before distribution.

## Release checklist

Verify formula-file byte identity, the privacy page, offline operation, the dashboard reset button, and that no feature requires payment to transform text. Screenshots should show the paste screen, transformed output, settings, and dashboard at desktop and mobile widths.
