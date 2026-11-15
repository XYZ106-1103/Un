#!/usr/bin/env python3
"""
Subset the Galmuri pixel fonts for the web build and record glyph coverage.

The upstream Galmuri fonts also carry ~6,400 CJK ideographs, kana and many symbol
blocks the game never draws, which made the three files ~1.1 MB. This keeps:

  * Basic Latin, Latin-1, Latin Extended-A/B
  * General punctuation, currency, letterlike symbols, arrows, enclosed alphanumerics
  * Box drawing, block elements, geometric shapes, misc symbols, dingbats
  * CJK symbols & punctuation, kana, Hangul compatibility jamo
  * ALL 11,172 precomposed Hangul syllables (player names come from the OS IME,
    so any syllable can appear; KS X 1001's 2,350 would not be enough)
  * Half-width / full-width forms

It also writes src/assets/fonts/coverage.json (code point ranges per font), which the
unit test tests/unit/Fonts.test.ts uses to fail the build when content or UI code uses
a character the shipped fonts cannot draw.

Usage (needs `pip install fonttools brotli`):
  python3 scripts/subset-fonts.py <dir with upstream Galmuri*.woff2|ttf>   # subset + coverage
  python3 scripts/subset-fonts.py --coverage-only                         # coverage from shipped fonts

Upstream: https://github.com/quiple/galmuri (SIL Open Font License 1.1).
"""

import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'src' / 'assets' / 'fonts'
FONTS = ['Galmuri11', 'Galmuri11-Bold', 'Galmuri9']
RANGES = [
    (0x0000, 0x024F), (0x2000, 0x206F), (0x20A9, 0x20A9), (0x20AC, 0x20AC),
    (0x2100, 0x214F), (0x2190, 0x21FF), (0x2460, 0x24FF), (0x2500, 0x26FF),
    (0x2700, 0x27BF), (0x3000, 0x303F), (0x3040, 0x30FF), (0x3130, 0x318F),
    (0xAC00, 0xD7A3), (0xFF00, 0xFFEF),
]


def to_ranges(codes):
    out = []
    for c in sorted(codes):
        if out and c == out[-1][1] + 1:
            out[-1][1] = c
        else:
            out.append([c, c])
    return out


def find_source(src_dir: Path, name: str) -> Path:
    for ext in ('.woff2', '.ttf', '.otf'):
        p = src_dir / f'{name}{ext}'
        if p.exists():
            return p
    raise SystemExit(f'missing {name}.(woff2|ttf|otf) in {src_dir}')


def subset_font(src: Path, dst: Path) -> None:
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[c for a, b in RANGES for c in range(a, b + 1)])
    sub.subset(font)
    subset.save_font(font, str(dst), opts)


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        raise SystemExit(1)
    if args[0] != '--coverage-only':
        src_dir = Path(args[0])
        for name in FONTS:
            src = find_source(src_dir, name)
            dst = OUT_DIR / f'{name}.woff2'
            subset_font(src, dst)
            print(f'{name}: {src.stat().st_size:>8} -> {dst.stat().st_size:>8} bytes')
    coverage = {}
    for name in FONTS:
        cmap = TTFont(str(OUT_DIR / f'{name}.woff2')).getBestCmap()
        coverage[name] = to_ranges(cmap.keys())
    (OUT_DIR / 'coverage.json').write_text(json.dumps(coverage, separators=(',', ':')) + '\n')
    print('wrote', (OUT_DIR / 'coverage.json').relative_to(ROOT))


if __name__ == '__main__':
    main()
