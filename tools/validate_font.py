#!/usr/bin/env python3
"""
NeuroReader Font validator
==========================
Loads every built font, checks GSUB features, and — the important part —
*shapes* real text with uharfbuzz to prove the OpenType rules fire:
word-initial letters and all punctuation must come back as `.bold` glyphs.

Run with:  .venv/bin/python tools/validate_font.py
"""
import os
import sys
from fontTools.ttLib import TTFont
import uharfbuzz as hb

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "fonts")

failures = []
checks = 0


def check(name, cond, detail=""):
    global checks
    checks += 1
    mark = "ok  " if cond else "FAIL"
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def shape(font_path, text, features):
    with open(font_path, "rb") as f:
        face = hb.Face(f.read())
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, features)
    return [font.glyph_to_string(i.codepoint) for i in buf.glyph_infos]


def gsub_features(font_path):
    font = TTFont(font_path, lazy=True)
    if "GSUB" not in font:
        return set()
    gsub = font["GSUB"].table
    feats = set()
    for rec in gsub.FeatureList.FeatureRecord:
        feats.add(rec.FeatureTag)
    return feats


def main():
    regular = os.path.join(FONTS, "NeuroReaderFont-Regular.ttf")
    bold = os.path.join(FONTS, "NeuroReaderFont-Bold.ttf")
    otf = os.path.join(FONTS, "NeuroReaderFont-Regular.otf")
    woff2 = os.path.join(FONTS, "NeuroReaderFont-Regular.woff2")

    print("Structure:")
    check("Regular.ttf loads", TTFont(regular) is not None)
    check("Bold.ttf loads", TTFont(bold) is not None)
    check(".otf loads (same OpenType data)", TTFont(otf) is not None)
    check(".woff2 loads", TTFont(woff2) is not None)
    check("family name", TTFont(regular)["name"].getDebugName(1) == "NeuroReader Font")
    check("weight 400", TTFont(regular)["OS/2"].usWeightClass == 400)
    check("weight 700", TTFont(bold)["OS/2"].usWeightClass == 700)
    feats = gsub_features(regular)
    check("GSUB has calt", "calt" in feats, str(feats))
    check("GSUB has ss01", "ss01" in feats, str(feats))

    print("\nShaping (calt on):")
    names = shape(regular, " the quick brown fox jumps over the lazy dog.", {"calt": True})
    expected = [
        "space", "t.bold", "h.bold", "e", "space",
        "q.bold", "u.bold", "i", "c", "k", "space",
        "b.bold", "r.bold", "o", "w", "n", "space",
        "f.bold", "o.bold", "x", "space",
        "j.bold", "u.bold", "m", "p", "s", "space",
        "o.bold", "v.bold", "e", "r", "space",
        "t.bold", "h.bold", "e", "space",
        "l.bold", "a.bold", "z", "y", "space",
        "d.bold", "o.bold", "g", "period.bold",
    ]
    check("first 2 letters bolded per word, punctuation bold", names == expected,
          "got " + " ".join(names))
    check("no stray .bold glyphs", sum(1 for n in names if n.endswith(".bold")) == 19,
          "bold count was %d" % sum(1 for n in names if n.endswith(".bold")))

    names = shape(regular, " to be or not to be a b c", {"calt": True})
    expected = ["space", "t.bold", "o", "space", "b.bold", "e", "space", "o.bold", "r",
                "space", "n.bold", "o.bold", "t", "space", "t.bold", "o", "space",
                "b.bold", "e", "space", "a.bold", "space", "b.bold", "space", "c.bold"]
    check("2-letter words bold 1 letter; 1-letter words bold", names == expected,
          "got " + " ".join(names))

    names = shape(regular, " hello, world!", {"calt": True})
    expected = ["space", "h.bold", "e.bold", "l", "l", "o", "comma.bold", "space",
                "w.bold", "o.bold", "r", "l", "d", "exclam.bold"]
    check("quoted/em-dash boundaries and punctuation", names == expected,
          "got " + " ".join(names))

    names = shape(regular, " well-known 5 e-mail", {"calt": True})
    expected = ["space", "w.bold", "e.bold", "l", "l", "hyphen.bold", "k.bold", "n.bold",
                "o", "w", "n", "space", "five", "space",
                "e.bold", "hyphen.bold", "m.bold", "a.bold", "i", "l"]
    check("hyphenated words bold each part; digits untouched", names == expected,
          "got " + " ".join(names))

    print("\nFeature toggles:")
    names = shape(regular, " the quick.", {"calt": False, "ss01": True})
    check("ss01 alone bolds word starts but not punctuation",
          names == ["space", "t.bold", "h.bold", "e", "space", "q.bold", "u.bold", "i", "c", "k", "period"],
          "got " + " ".join(names))
    names = shape(regular, " the quick.", {"calt": False})
    check("both off -> plain text", names == ["space", "t", "h", "e", "space", "q", "u", "i", "c", "k", "period"],
          "got " + " ".join(names))

    print("\nBold weight:")
    names = shape(bold, " fox", {"calt": True})
    check("Bold font bolds word starts (Black outlines)", names == ["space", "f.bold", "o.bold", "x"],
          "got " + " ".join(names))

    print(f"\n{checks - len(failures)}/{checks} checks passed.")
    if failures:
        print("FAILURES:", ", ".join(failures))
        return 1
    print("All font checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
