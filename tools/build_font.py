#!/usr/bin/env python3
"""
NeuroReader Font builder
========================

Builds the NeuroReader Font (the *static* companion to the web app) from
Roboto (Apache License 2.0, (c) 2011 Google Inc.).

The web app applies the *variable* fixation formula at runtime. A font can't
be variable per-occurrence, so the font applies a *fixed* version of the same
formula through OpenType contextual substitutions:

  * every punctuation glyph is always replaced by its heavier (Bold) variant
  * the first two letters of every word are replaced by heavier variants
    (first letter only for 1- and 2-letter words)

Both rules live in the `calt` feature (on by default in every modern
renderer), so the font works out of the box after installation. The
word-start rules are duplicated in the `ss01` stylistic set so users can
force-enable/disable them with font-feature-settings.

Known renderer limitations (inherent to OpenType, not bugs):
  * the first word of a paragraph is not preceded by a glyph, so in some apps
    it may not get bolded word-start letters
  * the substitution depends on `calt` support (all browsers, Word, Pages,
    TextEdit, and LibreOffice support it)

Usage:
    python3 tools/build_font.py

Requires: fonttools + brotli (woff2) — `pip install fonttools brotli`.
Outputs land in fonts/.
"""

import copy
import os
import sys
import unicodedata

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, "..", "fonts", "_src")
OUT_DIR = os.path.join(HERE, "..", "fonts")

VERSION = "1.0"

# base weight -> (source for heavy variants, weight class, subfamily suffix)
WEIGHTS = [
    ("Roboto-Regular.ttf", "Roboto-Bold.ttf", 400, "Regular"),
    ("Roboto-Bold.ttf", "Roboto-Black.ttf", 700, "Bold"),
]


def classify(cmap):
    """Split cmap glyph names into (letters, punctuation, spaces)."""
    letters, punct, spaces = [], [], []
    for cp, name in sorted(cmap.items()):
        cat = unicodedata.category(chr(cp))
        if cat.startswith("L"):
            letters.append(name)
        elif cat.startswith("P") or cat in ("Sm", "Sc", "So", "Sk"):
            punct.append(name)
        elif cat.startswith("Z"):
            spaces.append(name)
    return letters, punct, spaces


def add_bold_variants(base, source, glyph_names):
    """Copy `glyph_names` from `source` into `base` as `name + ".bold"`."""
    base_glyf, src_glyf = base["glyf"], source["glyf"]
    base_hmtx, src_hmtx = base["hmtx"], source["hmtx"]
    order = list(base.getGlyphOrder())
    for g in glyph_names:
        vname = g + ".bold"
        base_glyf[vname] = copy.deepcopy(src_glyf[g])
        base_hmtx[vname] = src_hmtx[g]
        order.append(vname)
    base.setGlyphOrder(order)  # also updates maxp.numGlyphs


def build_fea(letters, punct, spaces):
    """
    OpenType rules (see module docstring for the formula).

    The classes are built so the rules are order-independent:
    @Letters and @WordBreak also contain the `.bold` variants, so a chain
    rule can still see an already-substituted glyph in its prefix/lookahead.
    The `@LBold` class maps each letter (and each .bold letter) onto itself,
    making any double-application a harmless identity.
    """
    letters_bold = [l + ".bold" for l in letters]
    punct_bold = [p + ".bold" for p in punct]
    fea = []
    fea.append("@Letters = [" + " ".join(letters + letters_bold) + "];")
    fea.append("@LBold = [" + " ".join(letters_bold + letters_bold) + "];")
    fea.append("@WordBreak = [" + " ".join(spaces + punct + punct_bold) + "];")
    fea.append("@Punct = [" + " ".join(punct) + "];")
    fea.append("@PunctBold = [" + " ".join(punct_bold) + "];")
    fea.append("languagesystem DFLT dflt;")
    fea.append("languagesystem latn dflt;")
    fea.append("languagesystem cyrl dflt;")
    fea.append("languagesystem grek dflt;")
    for feat in ("calt", "ss01"):
        fea.append("feature " + feat + " {")
        fea.append("  # 3+ letter words: bold the first letter")
        fea.append("  sub @WordBreak @Letters' @Letters @Letters by @LBold;")
        fea.append("  # 3+ letter words: bold the second letter")
        fea.append("  sub @WordBreak @Letters @Letters' @Letters by @LBold;")
        fea.append("  # 2-letter words: bold the first letter")
        fea.append("  sub @WordBreak @Letters' @Letters by @LBold;")
        fea.append("  # 1-letter words followed by a boundary")
        fea.append("  sub @WordBreak @Letters' @WordBreak by @LBold;")
        # OpenType has no "end of text" token, so the rules above can't match
        # a 1-letter word with nothing after it. This fallback (single letter
        # after a boundary) only fires where none of the more specific rules
        # matched, i.e. a 1-letter word at the end of a block.
        fea.append("  # 1-letter words at the end of a block")
        fea.append("  sub @WordBreak @Letters' by @LBold;")
        if feat == "calt":
            fea.append("  # every punctuation glyph is always bold")
            fea.append("  sub @Punct' by @PunctBold;")
        fea.append("} " + feat + ";")
    return "\n".join(fea)


def set_names(font, family, subfamily, ps_name):
    name = font["name"]
    for nid in range(0, 26):
        name.removeNames(nameID=nid)
    win = (3, 1, 0x409)
    name.setName(f"Copyright 2026 NeuroReader. Based on Roboto, Copyright "
                 f"2011 Google Inc., used under the Apache License, "
                 f"Version 2.0.", 0, *win)
    name.setName(family, 1, *win)
    name.setName(subfamily, 2, *win)
    name.setName(f"{family} {subfamily} v{VERSION}", 3, *win)
    name.setName(f"{family} {subfamily}", 4, *win)
    name.setName(f"Version {VERSION}", 5, *win)
    name.setName(ps_name, 6, *win)
    name.setName("Licensed under the Apache License, Version 2.0 "
                 "(the \"License\") — you may not use this file except in "
                 "compliance with the License. You may obtain a copy at "
                 "http://www.apache.org/licenses/LICENSE-2.0", 13, *win)
    name.setName("http://www.apache.org/licenses/LICENSE-2.0", 14, *win)
    name.setName(family, 16, *win)
    name.setName(subfamily, 17, *win)
    font["head"].fontRevision = float(VERSION)


def build_weight(base_file, heavy_file, weight_class, subfamily):
    print(f"--- {base_file} + {heavy_file} (weight {weight_class}) ---")
    base = TTFont(os.path.join(SRC_DIR, base_file))
    heavy = TTFont(os.path.join(SRC_DIR, heavy_file))

    letters, punct, spaces = classify(base.getBestCmap())
    boldable = set(heavy.getGlyphOrder())
    letters = [g for g in letters if g in boldable]
    punct = [g for g in punct if g in boldable]
    spaces = [g for g in spaces if g in base.getGlyphOrder()]
    # Some codepoints share a glyph name (e.g. Å and Å both map to "Aring",
    # Δ appears as both a Greek letter and a math symbol) — dedupe and make
    # the lists disjoint so every name is added exactly once.
    letters = list(dict.fromkeys(letters))
    punct = list(dict.fromkeys(punct))
    spaces = list(dict.fromkeys(spaces))
    punct = [g for g in punct if g not in set(letters)]
    print(f"  letters={len(letters)} punctuation={len(punct)} spaces={len(spaces)}")

    add_bold_variants(base, heavy, letters + punct)

    # Rebuild GSUB with our features (drop Roboto's existing GSUB to keep
    # this deterministic — Roboto's own contextual features are irrelevant
    # to a transformed derivative font).
    if "GSUB" in base:
        del base["GSUB"]
    fea = build_fea(letters, punct, spaces)
    addOpenTypeFeaturesFromString(base, fea)

    family = "NeuroReader Font"
    ps_name = f"NeuroReaderFont-{subfamily}"
    set_names(base, family, subfamily, ps_name)
    base["OS/2"].usWeightClass = weight_class
    if subfamily == "Bold":
        base["OS/2"].fsSelection = 0x20
        base["head"].macStyle |= 0x01
    else:
        base["OS/2"].fsSelection = 0x40

    out_base = os.path.join(OUT_DIR, ps_name)
    base.save(out_base + ".ttf")
    # The .otf ships the same TrueType-outlined OpenType data (valid on
    # macOS, Windows, and Linux — .otf/.ttf are both OpenType containers).
    base.save(out_base + ".otf")
    base.flavor = "woff2"
    base.save(out_base + ".woff2")
    base.flavor = None
    print(f"  wrote {ps_name}.ttf / .otf / .woff2")
    return base


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for base_file, heavy_file, weight_class, subfamily in WEIGHTS:
        build_weight(base_file, heavy_file, weight_class, subfamily)
    print("Done. Fonts written to fonts/.")


if __name__ == "__main__":
    sys.exit(main())
