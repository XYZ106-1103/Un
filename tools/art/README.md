# Pixel-art generators

Every sprite, portrait, tileset and title image in `src/data/art/*.json` is produced by
these scripts. The JSON files are what the game loads and what reviews look at; the
scripts are how they were drawn, kept so art can be iterated on instead of hand-editing
palette rows. Running a script **overwrites** its JSON files, so review the diff.

Requires Python 3 (no packages; `preview.py` needs Pillow).

```bash
cd tools/art
OUT=../../src/data/art
python3 player_ledger.py $OUT .          # player, Ledger, stamp desk, icons
python3 tiles_enemies.py $OUT .          # basement tiles, bullets (base set), earbuds, receipt
python3 portrait_misc.py $OUT .          # Ledger portrait and misc
python3 phase5_art.py    $OUT .          # chapter 1: forest tiles, Mitt, Hoop & Stud, Brolly, forest enemies
python3 title_art.py     $OUT .          # title logo and background
python3 ch2_tiles.py     $OUT .          # chapter 2: town tileset
python3 ch2_chars.py     $OUT . $OUT/bullets.json   # chapter 2 characters, enemies; appends bullets

python3 preview.py /tmp/sheet.png $OUT/tiles-town.json $OUT/clack.json   # look at the result
```

`grid.py` holds the drawing helpers (rect, disc, ring, line, outline). Palettes are per
document; `.` is transparent. Derived frames (`from` + `shift`, `mirror`, `palette`) are
resolved by `src/systems/assets/PixelArt.ts` at load time.

Status in `src/data/assets/manifest.json` (`wip` / `final`) is separate: change it only
after reviewing the art in game (see `docs/ASSET_PLAN.md` §4.1).
