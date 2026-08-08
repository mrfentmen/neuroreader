#!/usr/bin/env python3
"""Validate all NeuroReader font deliverables."""
import os
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts"))
styles = ("Regular", "Italic", "BoldItalic", "Mono")
checks = 0
failures = []

def check(name, condition):
    global checks
    checks += 1
    print("  [ok  ] " + name if condition else "  [FAIL] " + name)
    if not condition:
        failures.append(name)

for style in styles:
    for ext in ("ttf", "otf", "woff2"):
        path = os.path.join(ROOT, "NeuroReaderFont-" + style + "." + ext)
        try:
            font = TTFont(path)
            check(style + "." + ext + " loads", True)
            check(style + "." + ext + " has GSUB", "GSUB" in font)
        except Exception as error:
            check(style + "." + ext + " loads", False)
            print("    " + str(error))

variable_paths = [os.path.join(ROOT, "NeuroReaderFont-Variable.ttf"), os.path.join(ROOT, "NeuroReaderFont-Variable.woff2")]
for path in variable_paths:
    try:
        font = TTFont(path)
        axes = {axis.axisTag: axis for axis in font["fvar"].axes}
        check(os.path.basename(path) + " loads", True)
        check(os.path.basename(path) + " exposes wght 100-900", "wght" in axes and axes["wght"].minValue == 100 and axes["wght"].defaultValue == 400 and axes["wght"].maxValue == 900)
        check(os.path.basename(path) + " has fixation GSUB", "GSUB" in font)
    except Exception as error:
        check(os.path.basename(path) + " loads", False)
        print("    " + str(error))

mono = TTFont(os.path.join(ROOT, "NeuroReaderFont-Mono.ttf"))
advances = {mono["hmtx"][glyph][0] for glyph in mono.getGlyphOrder() if glyph in mono["hmtx"].metrics}
check("Mono.ttf has one advance width", len(advances) == 1)

print(f"\n{checks - len(failures)}/{checks} checks passed.")
raise SystemExit(1 if failures else 0)
