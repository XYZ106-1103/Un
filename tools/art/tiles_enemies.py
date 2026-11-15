import json, sys, math, random
sys.path.insert(0, sys.argv[2])
from grid import Grid
OUT = sys.argv[1]
rnd = random.Random(7)

# ---------------- Basement tileset 16x16 ----------------
TP = {
 "k": "#0f0d14", "f": "#2b2433", "F": "#332b3d", "e": "#241e2b", "l": "#4a4152", "L": "#5c4a3c", "M": "#6e5a44",
 "w": "#3a3247", "W": "#2a2434", "t": "#514664", "T": "#695c80", "v": "#1c1824",
 "o": "#8c6239", "O": "#6e4a1f", "q": "#4a3015",
 "b": "#b08850", "B": "#8c6a3a", "n": "#6b4f2a", "p": "#e8e2d0", "P": "#b9ad90", "i": "#1a1420",
 "r": "#c8414b", "R": "#8a2a33", "s": "#5d8fd6", "S": "#3c629e", "a": "#f2b24c", "A": "#b97a2a",
 "m": "#3fa7a0", "x": "#0b0a10", "g": "#6b6680", "G": "#a39fb3", "u": "#5e2f33", "U": "#7a3d3a",
}
T = {}
def floor(variant):
    g = Grid(16, 16, 'f')
    # planks: horizontal boards 4px tall with staggered seams
    for y in range(0, 16, 4):
        g.rect(0, y, 16, 1, 'e')
        seam = (y * 5 + variant * 7) % 16
        g.set(seam, y + 1, 'e'); g.set(seam, y + 2, 'e'); g.set(seam, y + 3, 'e')
        for x in range(16):
            if rnd.random() < 0.10: g.set(x, y + 1 + rnd.randrange(3), 'F')
    return g
T["floor-a"] = floor(0)
T["floor-b"] = floor(1)
g = floor(2)
for _ in range(9): g.set(rnd.randrange(16), rnd.randrange(16), 'l')
g.rect(5, 9, 3, 1, 'l'); g.set(6, 8, 'l')
T["floor-lint"] = g
g = floor(3); g.line(2, 3, 7, 8, 'e'); g.line(7, 8, 13, 10, 'e'); g.line(7, 8, 8, 13, 'e')
T["floor-crack"] = g
g = floor(0)
for y in range(16):
    for x in range(16):
        if g.get(x, y) == 'f': g.set(x, y, 'L')
        elif g.get(x, y) == 'F': g.set(x, y, 'M')
        elif g.get(x, y) == 'e': g.set(x, y, 'f')
T["floor-lit"] = g
g = Grid(16, 16, 'v'); g.rect(0, 15, 16, 1, 'T')
for _ in range(5): g.set(rnd.randrange(16), rnd.randrange(14), 'W')
T["wall-top"] = g
def wall_face():
    g = Grid(16, 16, 'w'); g.rect(0, 0, 16, 2, 't'); g.rect(0, 0, 16, 1, 'T'); g.rect(0, 14, 16, 2, 'W')
    for y in (5, 10): g.rect(0, y, 16, 1, 'W')
    for x in (4, 12): g.rect(x, 2, 1, 3, 'W')
    g.rect(8, 6, 1, 4, 'W'); g.rect(0, 11, 1, 3, 'W')
    return g
T["wall-face"] = wall_face()
g = wall_face(); g.rect(10, 0, 3, 16, 'g'); g.rect(10, 0, 1, 16, 'G'); g.rect(9, 7, 5, 2, 'W'); g.rect(9, 7, 5, 1, 'g')
T["wall-pipe"] = g
g = wall_face(); g.rect(3, 2, 10, 9, 'x'); g.frame(2, 1, 12, 11, 'q'); g.rect(3, 2, 10, 1, 'O')
g.rect(6, 4, 4, 1, 'v'); g.set(7, 6, 'v')
T["wall-chute"] = g
# shelf with boxes (deco over wall face / floor)
g = Grid(16, 16)
g.rect(0, 3, 16, 2, 'o'); g.rect(0, 4, 16, 1, 'O'); g.rect(0, 11, 16, 2, 'o'); g.rect(0, 12, 16, 1, 'O')
g.rect(0, 3, 1, 13, 'q'); g.rect(15, 3, 1, 13, 'q')
g.rect(2, 7, 5, 4, 'b'); g.rect(2, 7, 5, 1, 'B'); g.rect(3, 8, 3, 1, 'p')
g.rect(8, 6, 6, 5, 'B'); g.rect(8, 6, 6, 1, 'n'); g.rect(10, 8, 2, 1, 'p')
g.rect(3, 0, 4, 3, 'r'); g.rect(3, 0, 4, 1, 'R'); g.rect(9, 1, 3, 2, 's')
g.rect(2, 13, 4, 2, 'm'); g.rect(9, 13, 5, 2, 'a'); g.rect(9, 13, 5, 1, 'A')
T["shelf"] = g
g = Grid(16, 16)
g.rect(1, 6, 14, 10, 'b'); g.rect(1, 6, 14, 1, 'B'); g.rect(1, 15, 14, 1, 'n'); g.rect(7, 6, 2, 10, 'B')
g.rect(3, 0, 10, 6, 'B'); g.rect(3, 0, 10, 1, 'n'); g.rect(7, 0, 2, 6, 'n')
g.rect(3, 10, 3, 2, 'p'); g.rect(10, 2, 2, 2, 'p')
g.outline('i')
T["boxes"] = g
g = Grid(16, 16)
g.rect(2, 4, 12, 11, 'b'); g.rect(2, 4, 12, 1, 'B'); g.rect(2, 14, 12, 1, 'n')
g.rect(4, 7, 8, 5, 'p'); g.rect(4, 11, 8, 1, 'P'); g.rect(5, 8, 5, 1, 'i'); g.rect(5, 10, 3, 1, 'i')
g.outline('i')
T["box-label"] = g
g = Grid(16, 16)   # pile of lost things
g.rect(1, 11, 14, 4, 'g'); g.rect(2, 10, 12, 2, 'G')
g.rect(2, 8, 4, 3, 'r'); g.rect(2, 8, 4, 1, 'R')          # sock
g.rect(7, 7, 2, 5, 'a'); g.rect(6, 7, 4, 1, 'A')          # key
g.rect(10, 9, 4, 2, 's'); g.rect(10, 9, 4, 1, 'S')        # comb
g.set(11, 11, 'S'); g.set(13, 11, 'S')
g.rect(4, 12, 3, 2, 'm')                                    # mitten-coloured scrap
g.outline('i')
T["pile"] = g
g = Grid(16, 16)   # sign post
g.rect(7, 9, 2, 7, 'O'); g.rect(1, 2, 14, 8, 'o'); g.rect(1, 2, 14, 1, 'b'); g.rect(1, 9, 14, 1, 'O')
g.rect(3, 4, 10, 1, 'q'); g.rect(3, 6, 7, 1, 'q')
g.outline('i')
T["sign"] = g
g = Grid(16, 16, 'x'); g.rect(0, 0, 16, 1, 'q'); g.rect(0, 0, 1, 16, 'q'); g.rect(15, 0, 1, 16, 'q')
for y in range(2, 16, 3): g.set(rnd.randrange(2, 14), y, 'v')
T["door"] = g
g = Grid(16, 16, 'u')   # seamless muted rug: a woven diamond lattice that tiles
for y in range(16):
    for x in range(16):
        d = (x + y) % 8
        e = (x - y) % 8
        if d == 0 or e == 0: g.set(x, y, 'U')
        elif (x + y) % 2 == 0 and (d == 4 or e == 4): g.set(x, y, 'R')
T["rug"] = g
def umbrella(c, C):
    g = Grid(16, 16)
    for y in range(0, 7):
        half = round(7 * math.sin((y + 1) / 8 * math.pi / 1.2))
        g.rect(8 - half, y + 1, half * 2, 1, c)
    for x in range(1, 15, 3): g.set(x, 7, C); g.set(x + 1, 7, C)
    g.rect(1, 6, 14, 1, C)
    g.rect(8, 7, 1, 7, 'q'); g.rect(6, 13, 2, 1, 'q'); g.set(6, 12, 'q')
    g.outline('i')
    return g
T["umbrella-red"] = umbrella('r', 'R')
T["umbrella-blue"] = umbrella('s', 'S')
T["umbrella-gold"] = umbrella('a', 'A')
g = Grid(16, 16)   # umbrella stand with closed umbrellas
g.rect(4, 9, 8, 7, 'g'); g.rect(4, 9, 8, 1, 'G'); g.rect(5, 15, 6, 1, 'd' if False else 'W')
g.rect(5, 1, 2, 8, 'r'); g.rect(8, 0, 2, 9, 's'); g.rect(10, 2, 2, 7, 'm')
g.outline('i')
T["umbrella-stand"] = g
T["void"] = Grid(16, 16, 'x')

order = ["floor-a", "floor-b", "floor-lint", "floor-crack", "floor-lit", "wall-top", "wall-face", "wall-pipe", "wall-chute",
         "shelf", "boxes", "box-label", "pile", "sign", "door", "rug", "umbrella-red", "umbrella-blue", "umbrella-gold",
         "umbrella-stand", "void"]
tiles = {"size": [16, 16], "palette": TP, "frames": {name: T[name].rows() for name in order}}

# ---------------- Enemy: Tangled Earbuds 40x40 ----------------
EP = {"k": "#1a1420", "w": "#f7f4ea", "W": "#c9c3d6", "g": "#8f88a3", "e": "#1a1420", "r": "#c8414b", "a": "#f2b24c", "s": "#5d8fd6"}
def earbuds(phase, calm=False):
    g = Grid(40, 40)
    # tangled cord: a few overlapping loops
    loops = [(20, 24, 10, 5, 0.3)] if calm else [(20, 22, 9, 6, 0.0), (17, 24, 7, 8, 0.8), (23, 21, 8, 5, 1.7), (20, 26, 10, 4, 2.4)]
    for cx, cy, rx, ry, rot in loops:
        for i in range(140):
            t = i / 140 * math.pi * 2
            x = cx + rx * math.cos(t + phase * 0.35) * math.cos(rot) - ry * math.sin(t) * math.sin(rot)
            y = cy + rx * math.cos(t + phase * 0.35) * math.sin(rot) * 0.6 + ry * math.sin(t)
            g.set(round(x), round(y), 'W' if (i // 9) % 3 == 0 else 'w')
    # cords up to the buds
    g.line(13, 18, 10, 9, 'w'); g.line(27, 18, 30, 9 - phase, 'w')
    # buds
    for bx, by in ((10, 6), (30, 6 - phase)):
        g.rect(bx - 2, by - 2, 5, 5, 'w'); g.rect(bx - 2, by + 2, 5, 1, 'W'); g.rect(bx - 1, by - 3, 3, 1, 'w')
        g.set(bx, by, 'g')
    # plug dangling at the bottom
    g.line(20, 31, 20, 34, 'w'); g.rect(18, 34, 5, 3, 'g'); g.rect(19, 37, 1, 2, 'a'); g.rect(21, 37, 1, 2, 'a')
    # face on the knot: angry-ish eyes and a static spark
    if calm:
        for cx in (16, 23): g.line(cx - 1, 23, cx, 22, 'e'); g.line(cx, 22, cx + 1, 23, 'e')
        g.set(19, 26, 'e'); g.set(20, 27, 'e'); g.set(21, 26, 'e')
        if phase: g.stamp(30, 12, ["a.", ".a", "a."])  # a little music note
    else:
        g.rect(16, 21, 2, 3, 'e'); g.rect(23, 21, 2, 3, 'e'); g.set(16, 21, 'w'); g.set(23, 21, 'w')
        g.line(15, 19, 18, 20, 'e'); g.line(25, 19, 22, 20, 'e')
        g.rect(19, 25, 3, 1, 'e')
    if phase and not calm:
        for (x, y) in ((33, 14), (34, 13), (35, 15), (6, 15), (5, 14)): g.set(x, y, 'a')
    g.outline('k')
    return g.rows()
earbuds_doc = {"size": [40, 40], "palette": EP, "frames": {"idle-0": earbuds(0), "idle-1": earbuds(1), "calm-0": earbuds(0, True), "calm-1": earbuds(1, True)},
               "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 3}, "calm": {"frames": ["calm-0", "calm-1"], "rate": 2}}}

# ---------------- Enemy: Receipt Ghost 32x40 ----------------
RP = {"k": "#1a1420", "p": "#efe9d6", "P": "#c9bfa3", "q": "#a39a82", "e": "#1a1420", "m": "#6b6680", "c": "#e08a7a"}
def receipt(phase, calm=False):
    g = Grid(32, 40)
    for y in range(4, 36):
        sway = round(1.6 * math.sin(y / 6 + phase * math.pi))
        x0 = 9 + sway
        g.rect(x0, y, 14, 1, 'p')
        g.set(x0 + 13, y, 'P')
        if y % 4 == 2 and 10 < y < 32 and y not in (14, 18):
            ln = 4 + (y * 7 % 6)
            g.rect(x0 + 2, y, ln, 1, 'q')
            g.rect(x0 + 10, y, 2, 1, 'q')
    # curled top
    g.rect(9, 2, 14, 2, 'P'); g.rect(10, 1, 12, 1, 'p'); g.rect(9, 3, 14, 1, 'q')
    # torn zigzag bottom
    for x in range(9, 24):
        depth = 36 + ((x // 2) % 2) * 2
        sway = round(1.6 * math.sin(35 / 6 + phase * math.pi))
        g.rect(x + sway, 36, 1, depth - 36, 'p')
    # face
    sw = round(1.6 * math.sin(15 / 6 + phase * math.pi))
    if calm:
        for cx in (12, 18): g.line(cx + sw, 16, cx + 1 + sw, 15, 'e'); g.set(cx + 2 + sw, 16, 'e')
        g.set(14 + sw, 19, 'e'); g.rect(15 + sw, 20, 2, 1, 'e'); g.set(17 + sw, 19, 'e')
    else:
        g.rect(12 + sw, 14, 2, 3, 'e'); g.rect(18 + sw, 14, 2, 3, 'e')
        g.set(12 + sw, 14, 'p'); g.set(18 + sw, 14, 'p')
        g.rect(15 + sw, 19, 2, 2, 'm')
    g.set(11 + sw, 18, 'c'); g.set(20 + sw, 18, 'c')
    g.outline('k')
    return g.rows()
receipt_doc = {"size": [32, 40], "palette": RP, "frames": {"idle-0": receipt(0), "idle-1": receipt(1), "calm-0": receipt(0, True), "calm-1": receipt(1, True)},
               "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 2}, "calm": {"frames": ["calm-0", "calm-1"], "rate": 2}}}

for name, doc in [("tiles-basement", tiles), ("enemy-earbuds", earbuds_doc), ("enemy-receipt", receipt_doc)]:
    json.dump(doc, open(f"{OUT}/{name}.json", "w"), indent=1)
print("ok")
