# NeuroReader Font

The NeuroReader Font is a private, offline-friendly fixed presentation companion. It uses OpenType contextual alternates to make word starts and punctuation heavier without reading or sending text.

## Available files

- `NeuroReaderFont-Regular.ttf`, `.otf`, `.woff2`: fixed word-start and punctuation treatment.
- `NeuroReaderFont-Bold.ttf`, `.otf`, `.woff2`: heavier companion weight.
- `NeuroReaderFont-Variable.ttf`, `.woff2`: variable `wght` axis from 100 to 900.
- `NeuroReaderFont-Italic.ttf`, `.otf`, `.woff2`: italic fixed treatment.
- `NeuroReaderFont-BoldItalic.ttf`, `.otf`, `.woff2`: bold italic fixed treatment.
- `NeuroReaderFont-Mono.ttf`, `.otf`, `.woff2`: monospaced fixed treatment for code.

The variable and style variants are built from the locally included Roboto sources under `fonts/_src/` and preserve the Apache 2.0 license. Font files contain shapes and OpenType tables, not formula JavaScript.

## Install

- macOS: double-click a `.ttf` or `.otf`, then choose **Install Font**.
- Windows: right-click a font and choose **Install for all users**.
- Linux: copy fonts to `~/.local/share/fonts/`, then run `fc-cache -f`.
- Web: load the `.woff2` file with `@font-face`.

## Rebuild and validate

```bash
.venv/bin/python tools/build_font.py
.venv/bin/python tools/validate_font.py
```

The dynamic Variable Fixation Formula remains in JavaScript for the web app and extensions. The installed font intentionally provides a static approximation because fonts cannot randomize each occurrence. `Mono` uses a uniform advance width for code alignment, and the Variable build exposes a real `wght` axis from 100 to 900. `npm run check:font` validates all 31 structure/axis/advance checks in addition to the detailed Regular shaping checks.
