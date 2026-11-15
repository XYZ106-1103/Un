import json, sys, math
sys.path.insert(0, sys.argv[2])
from grid import Grid
OUT = sys.argv[1]

# ---------------- Ledger portrait 48x48 ----------------
PAL = {"k": "#1a1420", "g": "#56704c", "G": "#3c5236", "H": "#6f8c63", "p": "#e8e2d0", "P": "#b9ad90",
       "y": "#f2b24c", "Y": "#b97a2a", "r": "#c8414b", "R": "#8a2a33", "e": "#f7f4ea", "E": "#cfd6e0",
       "o": "#1a1420", "m": "#1a1420", "c": "#e08a7a", "s": "#5d8fd6", "S": "#cfe3ff", "t": "#d9663a"}
base = Grid(48, 48)
# pages block (right side, behind cover)
base.rect(38, 5, 6, 40, 'p')
for y in range(6, 44, 3): base.rect(39, y, 4, 1, 'P')
base.frame(37, 4, 8, 42, 'k')
# cover
base.rect(4, 3, 36, 43, 'g')
base.rect(5, 4, 3, 41, 'G')      # spine shade
base.rect(8, 4, 1, 41, 'H')      # spine highlight
base.rect(9, 4, 30, 1, 'H')      # top highlight
base.rect(9, 44, 30, 1, 'G')     # bottom shade
base.frame(4, 3, 36, 43, 'k')
# gold corners
for (cx, cy, dx, dy) in ((5, 4, 1, 1), (38, 4, -1, 1), (5, 44, 1, -1), (38, 44, -1, -1)):
    for i in range(5):
        for j in range(5 - i):
            base.set(cx + dx * i, cy + dy * j, 'y' if i + j < 4 else 'Y')
# ribbon bookmark poking out at the top and hanging below
base.rect(31, 0, 3, 4, 'r'); base.rect(33, 0, 1, 4, 'R')
base.set(30, 0, 'k'); base.set(34, 0, 'k')
for y in range(0, 3): base.set(30, y, 'k'); base.set(34, y, 'k')
base.rect(29, 45, 3, 3, 'r'); base.set(31, 45, 'R'); base.set(30, 47, '.')
# label plate
base.rect(14, 36, 18, 5, 'y'); base.rect(14, 40, 18, 1, 'Y'); base.frame(13, 35, 20, 7, 'k')
base.rect(17, 38, 5, 1, 'Y'); base.rect(24, 38, 5, 1, 'Y')
# glasses: two round lenses + bridge
L, R, EY = (15, 19), (31, 19), 19
for (cx, cy) in (L, R):
    base.disc(cx, cy, 6.2, 'e')
    base.disc(cx + 1, cy + 2, 4.0, 'e')
    base.ring(cx, cy, 6.6, 'k')
    for x in range(int(cx) - 5, int(cx) + 6):  # faint lens shading at the bottom
        if base.get(x, cy + 5) == 'e': base.set(x, cy + 5, 'E')
base.line(21, 18, 25, 18, 'k')
base.line(4, 18, 8, 18, 'k'); base.line(38, 18, 39, 18, 'k')

def face(eyes, mouth, extra=None):
    g = base.copy()
    eyes(g)
    mouth(g)
    if extra: extra(g)
    return g.rows()

def pupils(dx=0, dy=0, size=3):
    def f(g):
        for (cx, cy) in (L, R):
            g.rect(cx - size // 2 + dx, cy - size // 2 + dy, size, size, 'o')
            g.set(cx - size // 2 + dx, cy - size // 2 + dy, 'e')  # glint
    return f

def mouth_line(g):
    g.rect(19, 30, 10, 1, 'm'); g.set(18, 29, 'm'); g.set(29, 29, 'm')
def mouth_wobble(g):
    for i, x in enumerate(range(18, 30)): g.set(x, 30 + (1 if (i // 2) % 2 else 0), 'm')
def mouth_smile(g):
    for x in range(18, 30):
        y = 29 + round(2.2 * math.sin((x - 18) / 11 * math.pi)); g.set(x, y, 'm')
    g.rect(21, 31, 6, 1, 't')
def mouth_frown(g):
    for x in range(18, 30):
        y = 32 - round(2.2 * math.sin((x - 18) / 11 * math.pi)); g.set(x, y, 'm')
def mouth_o(g):
    g.ring(23.5, 30.5, 2.6, 'm'); g.rect(23, 30, 2, 2, 't')

def eyes_closed_happy(g):
    for (cx, cy) in (L, R):
        for x in range(cx - 3, cx + 4):
            y = cy + 1 - round(2 * math.sin((x - cx + 3) / 6 * math.pi)); g.set(x, y, 'o')
def eyes_sad(g):
    pupils(0, 2)(g)
    for (cx, cy) in (L, R):  # drooping lids
        for x in range(cx - 5, cx + 6):
            lid = cy - 4 + (1 if (x - cx) * (1 if cx == L[0] else -1) > 0 else 0)
            for y in range(cy - 6, lid):
                if g.get(x, y) in ('e', 'E'): g.set(x, y, 'G')
def blush(g):
    g.rect(9, 27, 4, 1, 'c'); g.rect(34, 27, 3, 1, 'c')
def sweat(g):
    g.stamp(35, 7, ["..s..", ".sSs.", "ssSss", "sssss", ".sss."])

portrait = {
  "size": [48, 48],
  "palette": PAL,
  "frames": {
    "neutral": face(pupils(), mouth_line),
    "nervous": face(pupils(-2, 1, 2), mouth_wobble, lambda g: (sweat(g), blush(g))),
    "happy": face(eyes_closed_happy, mouth_smile, blush),
    "sad": face(eyes_sad, mouth_frown),
    "surprised": face(pupils(0, 0, 2), mouth_o, sweat),
  },
}

# ---------------- Stamp desk (save point) 16x20 ----------------
SD = {"k": "#1a1420", "w": "#8c6239", "W": "#6e4a1f", "d": "#4a3015", "i": "#3f3a52", "I": "#c8414b",
      "h": "#a77fcf", "H": "#d9c2f0", "y": "#f2b24c", "Y": "#fff1c4"}
desk = Grid(16, 20)
desk.rect(1, 9, 14, 3, 'w'); desk.rect(1, 11, 14, 1, 'W')       # top
desk.rect(2, 12, 2, 7, 'W'); desk.rect(12, 12, 2, 7, 'W')        # legs
desk.rect(2, 12, 12, 1, 'd')
desk.rect(4, 7, 5, 2, 'i'); desk.rect(5, 7, 3, 1, 'I')           # ink pad
desk.rect(10, 3, 2, 4, 'h'); desk.rect(9, 7, 4, 2, 'h')          # rubber stamp handle + base
desk.rect(10, 2, 2, 1, 'H'); desk.set(10, 3, 'H')
desk.outline('k')
desk_glint = desk.copy(); desk_glint.set(11, 2, 'Y'); desk_glint.set(12, 1, 'y'); desk_glint.set(13, 0, 'Y')
stamp_desk = {"size": [16, 20], "palette": SD,
              "frames": {"idle-0": desk.rows(), "idle-1": desk_glint.rows()},
              "animations": {"idle": {"frames": ["idle-0"] * 6 + ["idle-1", "idle-1"], "rate": 4}}}

# ---------------- UI icons 10x10 (white so they can be tinted) ----------------
IC = {"w": "white", "k": "#1a1420", "g": "#a39fb3"}
def icon(rows): return rows
icons = {"size": [10, 10], "palette": IC, "frames": {
  "talk": [
    "..........",
    ".kkkkkkkk.",
    "kwwwwwwwwk",
    "kwkwwkwwkk",
    "kwwwwwwwwk",
    ".kkwkkkkk.",
    "..kwk.....",
    "..kk......",
    "..........",
    "..........",
  ],
  "clear": [
    "........w.",
    ".......w..",
    "......w...",
    ".....w....",
    "....w.....",
    "..www.....",
    ".wwwww....",
    "wwwwww....",
    "w.w.w.....",
    "..........",
  ],
  "act": [
    "..........",
    ".wwwwwww..",
    "w.......w.",
    "w.w.w.w.w.",
    "w.......w.",
    ".www.www..",
    "....w.....",
    "...w......",
    "..........",
    "..........",
  ],
  "pocket": [
    "..........",
    "wwwwwwwwww",
    "w........w",
    "w.wwwwww.w",
    "w........w",
    "w........w",
    ".w......w.",
    "..w....w..",
    "...wwww...",
    "..........",
  ],
  "letgo": [
    "....ww....",
    "...w..w...",
    "...w..w...",
    "..wwwwww..",
    ".w......w.",
    ".w.ww...w.",
    ".w.ww...w.",
    ".w......w.",
    "..wwwwww..",
    "..........",
  ],
}}

# ---------------- Bullets 8x8 ----------------
BP = {"w": "#f7f4ea", "p": "#e8e2d0", "g": "#a39fb3", "k": "#1a1420", "d": "#6b6680", "a": "#f2b24c", "s": "#5d8fd6"}
def digit(rows):
    g = Grid(8, 8); g.rect(1, 0, 6, 8, 'p'); g.frame(1, 0, 6, 8, 'd'); g.stamp(2, 1, rows); return g.rows()
bullets = {"size": [8, 8], "palette": BP, "frames": {
  "dot": ["........", "........", "...ww...", "..wwww..", "..wwww..", "...ww...", "........", "........"],
  "wire": ["........", "......ww", ".....wg.", "....wg..", "...wg...", "..wg....", "ww......", "........"],
  "wire-h": ["........", "........", "........", "wwwwwwww", "gggggggg", "........", "........", "........"],
  "plug": ["..w..w..", "..w..w..", ".wwwwww.", ".wggggw.", ".wwwwww.", "...ww...", "...gg...", "...gg..."],
  "note": ["....www.", "....w.ww", "....w...", "....w...", "..www...", ".wwww...", ".www....", "........"],
  "spark": ["...a....", "...a....", ".a.a.a..", "..aaa...", "aaawaaa.", "..aaa...", ".a.a.a..", "...a...."],
  "digit-0": digit(["kkkk", "k..k", "k..k", "k..k", "k..k", "kkkk"]),
  "digit-1": digit([".kk.", "kkk.", ".kk.", ".kk.", ".kk.", "kkkk"]),
  "digit-3": digit(["kkkk", "...k", ".kkk", "...k", "...k", "kkkk"]),
  "digit-7": digit(["kkkk", "...k", "..k.", "..k.", ".k..", ".k.."]),
  "scrap": ["........", ".pppp...", ".ppppp..", "..pdppp.", "..ppppp.", "...ppp..", "........", "........"],
}}

for name, doc in [("portrait-ledger", portrait), ("stamp-desk", stamp_desk), ("icons", icons), ("bullets", bullets)]:
    json.dump(doc, open(f"{OUT}/{name}.json", "w"), indent=1)
print("ok")
