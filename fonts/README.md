# NeuroReader Font

The **static** companion to the [NeuroReader](https://mrfentmen.github.io/neuroreader/)
web app. The web app applies the *variable* fixation formula at runtime; a
font can't vary per occurrence, so the font applies a **fixed** version of the
same formula to whatever you read, in any app, without opening the site:

- the **first two letters** of every word render heavier (first letter only
  for 1–2 letter words)
- **every punctuation mark** renders heavier

## Files

| File | Use |
|---|---|
| `NeuroReaderFont-Regular.ttf` | System install — Windows, Linux, macOS, Android |
| `NeuroReaderFont-Regular.otf` | System install — macOS/Windows (same OpenType data as the .ttf) |
| `NeuroReaderFont-Regular.woff2` | Web developers — load with `@font-face` |
| `NeuroReaderFont-Bold.ttf` | The Bold weight (word-starts render even heavier) |
| `LICENSE-Apache-2.0.txt` | Apache License 2.0 (the font is built from Roboto, © Google) |

## How it works

The font uses OpenType **contextual alternates** (`calt`, on by default in
every modern renderer) to swap word-initial letters and punctuation for
heavier variants of the same glyphs. The word-start rules are duplicated in
the `ss01` stylistic set, so power users can toggle them with
`font-feature-settings: "ss01" 1` (or `"calt" 0` to disable everything).

No text is ever analyzed, stored, or sent anywhere — the transformation is
pure font rendering, so it also works in apps that don't run scripts.

## Install

- **macOS** — double-click the `.ttf` (or `.otf`), then click **Install Font**
  in Font Book.
- **Windows** — right-click the `.ttf` → **Install** (or double-click → Install).
- **Linux** — copy the `.ttf` to `~/.local/share/fonts/` (or
  `/usr/share/fonts/` for system-wide) and run `fc-cache -f`.

Then select "NeuroReader Font" as your font in any app.

## Known renderer limitations

- **The first word of a block may not be bolded** in apps that put no glyph
  before it (OpenType has no "start of text" token). Browsers, Word, Pages,
  and TextEdit all handle the rest of the text fine.
- The rules need `calt` support. All browsers, Word, Pages, TextEdit, and
  LibreOffice support it; a few niche apps render it as plain Roboto.
- Digits are never bolded (the formula only bolds letters and punctuation).

## Rebuild

```bash
python3 -m venv .venv
.venv/bin/pip install fonttools brotli
.venv/bin/python tools/build_font.py      # rebuild the fonts
.venv/bin/pip install uharfbuzz
.venv/bin/python tools/validate_font.py   # shape-test the OpenType rules
```

Font sources (`fonts/_src/Roboto-*.ttf`) are re-downloaded by the build
script and are not committed.

## License

The NeuroReader Font is licensed under the **Apache License 2.0** — the same
license as Roboto, which it is built from. See `LICENSE-Apache-2.0.txt`.
