import json, sys, math, random
sys.path.insert(0, sys.argv[2])
from grid import Grid
OUT = sys.argv[1]
rnd = random.Random(42)
# ---------------- Logo 224x56: stamped wordmark in a rubber-stamp frame ----------------
GLYPHS = {
 "U": ["1...1","1...1","1...1","1...1","1...1","1...1",".111."],
 "N": ["1...1","11..1","1.1.1","1.1.1","1..11","1...1","1...1"],
 "C": [".1111","1....","1....","1....","1....","1....",".1111"],
 "L": ["1....","1....","1....","1....","1....","1....","11111"],
 "A": [".111.","1...1","1...1","11111","1...1","1...1","1...1"],
 "I": ["111",".1.",".1.",".1.",".1.",".1.","111"],
 "M": ["1...1","11.11","1.1.1","1.1.1","1...1","1...1","1...1"],
 "E": ["11111","1....","1....","1111.","1....","1....","11111"],
 "D": ["1111.","1...1","1...1","1...1","1...1","1...1","1111."],
}
CELL = 4
logo = Grid(224, 56)
word = "UNCLAIMED"
widths = [len(GLYPHS[c][0]) * CELL for c in word]
total = sum(widths) + 4 * (len(word) - 1)
x = (224 - total) // 2
jit = [0, -2, 1, -1, 2, 0, -2, 1, 0]
letters = []
for i, ch in enumerate(word):
    g = GLYPHS[ch]; y0 = 13 + jit[i]
    for r, row in enumerate(g):
        for c, v in enumerate(row):
            if v == '1': letters.append((x + c * CELL, y0 + r * CELL))
    x += widths[i] + 4
for (px, py) in letters:            # rust shadow first
    logo.rect(px + 2, py + 2, CELL, CELL, 'r')
for (px, py) in letters:
    logo.rect(px, py, CELL, CELL, 'p')
    logo.rect(px, py, CELL, 1, 'w')  # top highlight on each stamp cell
# stamp frame with rounded corners
logo.frame(4, 4, 216, 48, 'p'); logo.frame(5, 5, 214, 46, 'p')
logo.frame(8, 8, 208, 40, 'r')
for (cx, cy) in ((4, 4), (219, 4), (4, 51), (219, 51)): logo.set(cx, cy, '.')
# worn ink: knock out a few pixels so it reads as a rubber stamp
for _ in range(260):
    xx, yy = rnd.randrange(224), rnd.randrange(56)
    if logo.get(xx, yy) in ('p', 'w') and rnd.random() < 0.6: logo.set(xx, yy, '.')
logo_doc = {"size": [224, 56], "palette": {"p": "#e8e2d0", "w": "#f7f4ea", "r": "#9c3d2e"}, "frames": {"logo": logo.rows()}}
json.dump(logo_doc, open(f"{OUT}/logo.json", "w"))

# ---------------- Title background 480x270 ----------------
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
P = {"a": "#0b0a10", "b": "#16131f", "c": "#2a2338", "d": "#3f3a52", "e": "#4a3b2c", "f": "#6e4a1f",
     "g": "#f2b24c", "h": "#b97a2a", "i": "#1f1a2b", "j": "#2f2740", "k": "#5c4a36", "l": "#c8414b", "m": "#2a716c", "n": "#3c629e"}
W, H = 480, 270
bg = Grid(W, H)
stops = ['a', 'a', 'b', 'c']
for y in range(H):
    t = y / (H - 1) * (len(stops) - 1)
    lo = min(int(t), len(stops) - 2); fr = t - lo
    for x in range(W):
        bg.c[y][x] = stops[lo + 1] if fr > (BAYER[y % 4][x % 4] + 0.5) / 16 else stops[lo]
# light shaft (dithered warm light, brighter near the slot)
cx = W // 2
for y in range(H):
    half = 18 + y * 0.35
    for x in range(int(cx - half), int(cx + half) + 1):
        if 0 <= x < W:
            edge = 1 - abs(x - cx) / half
            strength = (0.34 - y / H * 0.14) * (0.45 + edge * 0.75)
            if strength > (BAYER[y % 4][x % 4] + 0.5) / 16 * 0.9:
                bg.c[y][x] = {'a': 'i', 'b': 'j', 'c': 'd'}.get(bg.c[y][x], bg.c[y][x])
bg.rect(cx - 20, 0, 40, 3, 'h'); bg.rect(cx - 18, 0, 36, 1, 'g')
# heap of lost things silhouettes along the bottom
heap = set()
def put(x, y, tone):
    if 0 <= x < W and 0 <= y < H:
        bg.c[y][x] = tone; heap.add((x, y))
def blob(x0, y0, w, h, tone):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            dx = (x - (x0 + w / 2)) / (w / 2); dy = (y - (y0 + h)) / h
            if dx * dx + dy * dy <= 1: put(x, y, tone)
for _ in range(70):
    w = rnd.randint(16, 60); h = rnd.randint(10, 34)
    x0 = rnd.randint(-20, W - 10)
    y0 = H - h + rnd.randint(-6, 8) - int(28 * math.exp(-((x0 + w / 2 - cx) / 160) ** 2))
    blob(x0, y0, w, h, rnd.choice(['b', 'i', 'j']))
# recognisable things on top of the heap: umbrellas, a sock, a key, boxes
def umbrella(x0, y0, r, tone):
    for y in range(y0 - r, y0 + 1):
        for x in range(x0 - r, x0 + r + 1):
            if (x - x0) ** 2 + ((y - y0) * 1.6) ** 2 <= r * r: put(x, y, tone)
    for y in range(y0, y0 + r): put(x0, y, 'e')
for (ux, uy, r, t) in ((70, 222, 22, 'j'), (390, 226, 26, 'j'), (300, 238, 16, 'c'), (150, 240, 14, 'c')):
    umbrella(ux, uy, r, t)
def prect(x0, y0, w, h, tone):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w): put(x, y, tone)
prect(196, 232, 26, 20, 'c'); prect(196, 232, 26, 2, 'd')          # box
prect(262, 228, 10, 22, 'j'); prect(262, 244, 18, 8, 'j')         # sock silhouette
prect(112, 250, 14, 3, 'd'); prect(124, 246, 4, 8, 'd')           # key
# rim light: only the top edge of the heap, only inside the shaft
for (x, y) in sorted(heap):
    if (x, y - 1) in heap or y < 1: continue
    half = 18 + y * 0.35
    if abs(x - cx) < half and rnd.random() < 0.85:
        bg.c[y][x] = 'h' if abs(x - cx) < half * 0.5 else 'f'
# a few coloured glints (lost things catching the light)
for (gx, gy, col) in ((228, 236, 'l'), (250, 247, 'm'), (214, 252, 'n'), (240, 230, 'g')):
    bg.c[gy][gx] = col; bg.c[gy][gx + 1] = col
bg_doc = {"size": [W, H], "palette": P, "frames": {"bg": bg.rows()}}
json.dump(bg_doc, open(f"{OUT}/title-bg.json", "w"))
print("ok")
