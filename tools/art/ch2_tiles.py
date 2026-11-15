"""Chapter 2 tileset: Sock Town (cobbles, knitted houses, laundry lines, lamps), Clack's lounge, the drying yard."""
import json, sys, math, random
sys.path.insert(0, sys.argv[2])
from grid import Grid
OUT = sys.argv[1]
rnd = random.Random(22)

TP = {
    "k": "#1a1420", "x": "#0f0d14",
    # cobbles / ground
    "c": "#6e6175", "C": "#857790", "q": "#4f4558", "d": "#5a4636", "D": "#6e5642",
    "g": "#3e5a3a", "G": "#557a4b",
    "p": "#8c6239", "P": "#a8794a", "Q": "#5e3f22",
    # knitted walls
    "t": "#3fa7a0", "T": "#2a716c", "a": "#e0a63a", "A": "#a8761f", "r": "#c8414b", "R": "#8a2a33",
    "y": "#e8e2d0", "Y": "#b9ad90", "v": "#241d2c", "V": "#30273a",
    "w": "#ffd27a", "W": "#f2b24c", "b": "#5d8fd6", "B": "#3c629e", "z": "#f7f4ea",
    "m": "#4b4566", "M": "#2f2a3d", "l": "#fff1c4",
    "n": "#b8b2c8", "N": "#8f88a3", "o": "#d8d2c4", "O": "#b0a898",
    "e": "#2e2433", "E": "#3d3145", "s": "#c08a4a", "S": "#8c5a2e",
    "i": "#cfd6e0", "I": "#8f88a3", "j": "#3c3550", "J": "#6b6680",
    "u": "#6fbf73", "U": "#3f8a4a", "f": "#a77fcf", "F": "#6f4f94", "h": "#e36b70",
}
T = {}

# ── ground ────────────────────────────────────────────────────────────────
def cobble(seed):
    r = random.Random(seed)
    g = Grid(16, 16, 'q')
    rows = [(0, 5), (5, 5), (10, 6)]
    for i, (y, h) in enumerate(rows):
        x = -r.randrange(0, 4) if i % 2 else 0
        while x < 16:
            w = r.choice((4, 5, 6))
            g.rect(x + 1, y + 1, w - 1, h - 1, 'c')
            g.rect(x + 1, y + 1, w - 1, 1, 'C')
            if r.random() < 0.3: g.set(x + 2, y + h - 2, 'q')
            x += w
    return g
T["cobble-a"] = cobble(1); T["cobble-b"] = cobble(2)
g = cobble(3); g.disc(9, 9, 3.2, 'B'); g.disc(9, 9, 2.2, 'b'); g.set(8, 8, 'z'); T["cobble-puddle"] = g
g = Grid(16, 16, 'd')
for _ in range(20): g.set(rnd.randrange(16), rnd.randrange(16), 'D')
for _ in range(5): g.set(rnd.randrange(16), rnd.randrange(16), 'q')
T["dirt"] = g
def grass(variant):
    g = Grid(16, 16, 'g')
    for _ in range(24): g.set(rnd.randrange(16), rnd.randrange(16), 'G')
    for _ in range(4 + variant * 3):
        x, y = rnd.randrange(1, 15), rnd.randrange(2, 16); g.set(x, y, 'G'); g.set(x, y - 1, 'G'); g.set(x + 1, y - 2, 'U')
    return g
T["grass-a"] = grass(0); T["grass-b"] = grass(1)
g = Grid(16, 16, 'p')
for y in (0, 5, 10, 15): g.rect(0, y, 16, 1, 'Q')
for y in (1, 6, 11): g.rect(0, y, 16, 1, 'P')
for (x, y) in ((4, 2), (12, 7), (7, 12)): g.set(x, y, 'Q')
T["plank"] = g
def lino(cracked):
    g = Grid(16, 16, 'o')
    g.rect(0, 0, 8, 8, 'O'); g.rect(8, 8, 8, 8, 'O')
    if cracked:
        g.line(2, 14, 7, 9, 'N'); g.line(7, 9, 9, 10, 'N'); g.line(9, 10, 13, 4, 'N')
    return g
T["lino-a"] = lino(False); T["lino-b"] = lino(True)
g = lino(False)
for _ in range(9):
    x, y = rnd.randrange(1, 14), rnd.randrange(1, 14); g.disc(x, y, 1.6, 'n'); g.set(x, y - 1, 'z')
T["lino-lint"] = g
g = Grid(16, 16, 'e')
g.rect(0, 0, 8, 8, 'E'); g.rect(8, 8, 8, 8, 'E')
T["lounge-floor"] = g
g = Grid(16, 16, 'r')
g.frame(0, 0, 16, 16, 'R')
for y in range(3, 14, 5):
    for x in range(3, 14, 5): g.set(x, y, 'a')
T["rug"] = g
g = Grid(16, 16, 's')
for y in (0, 4, 8, 12): g.rect(0, y, 16, 1, 'S')
for (x, y) in ((5, 1), (11, 5), (3, 9), (13, 13)): g.rect(x, y, 1, 3, 'S')
T["stage"] = g
g = Grid(16, 16, 's')
for y in (0, 4, 8): g.rect(0, y, 16, 1, 'S')
g.rect(0, 12, 16, 4, 'S'); g.rect(0, 12, 16, 1, 'a');
for x in range(1, 16, 4): g.set(x, 14, 'w')
T["stage-edge"] = g

# ── walls ─────────────────────────────────────────────────────────────────
T["wall-top"] = Grid(16, 16, 'v')
g = Grid(16, 16, 'v')
g.rect(0, 13, 16, 3, 'V')
T["roof-edge"] = g
def knit(c1, c2):
    g = Grid(16, 16, c1)
    for y in range(1, 13, 3):
        for x in range(0, 16, 4):
            g.set(x, y, c2); g.set(x + 1, y + 1, c2); g.set(x + 3, y, c2); g.set(x + 2, y + 1, c2)
    g.rect(0, 13, 16, 3, 'y');
    for x in range(0, 16, 2): g.set(x, 14, 'Y')
    g.rect(0, 0, 16, 1, 'v')
    return g
T["knit-teal"] = knit('t', 'T'); T["knit-mustard"] = knit('a', 'A'); T["knit-red"] = knit('r', 'R')
g = knit('t', 'T'); g.rect(4, 3, 8, 7, 'k'); g.rect(5, 4, 6, 5, 'w'); g.rect(5, 4, 6, 1, 'W'); g.rect(7, 4, 2, 5, 'W'); g.rect(5, 6, 6, 1, 'W')
T["knit-window"] = g
g = knit('a', 'A'); g.rect(4, 3, 8, 7, 'k'); g.rect(5, 4, 6, 5, 'w'); g.rect(7, 4, 2, 5, 'W'); g.rect(5, 6, 6, 1, 'W')
T["knit-window-b"] = g
def door(c1, c2):
    g = knit(c1, c2)
    g.rect(4, 3, 8, 13, 'k'); g.rect(5, 4, 6, 12, 'p'); g.rect(5, 4, 6, 1, 'P'); g.rect(7, 4, 1, 12, 'Q')
    g.set(9, 10, 'W')
    return g
T["door-teal"] = door('t', 'T'); T["door-red"] = door('r', 'R')
g = Grid(16, 16, 'F')
for x in range(0, 16, 4): g.rect(x, 0, 2, 16, 'f')
g.rect(0, 12, 16, 4, 'M'); g.rect(0, 12, 16, 1, 'a')
T["lounge-wall"] = g
g = Grid(16, 16, 'R')
for x in range(1, 16, 4): g.rect(x, 0, 2, 16, 'r'); g.set(x, 15, 'h')
T["curtain"] = g
def dryer_front(open_):
    g = Grid(16, 16, 'i')
    g.rect(0, 0, 16, 3, 'I'); g.rect(11, 1, 2, 1, 'W'); g.rect(2, 1, 4, 1, 'J')
    g.disc(7.5, 9.5, 5, 'J'); g.disc(7.5, 9.5, 4, 'j' if not open_ else 'w')
    if not open_: g.set(5, 7, 'n'); g.set(6, 7, 'n')
    g.rect(0, 15, 16, 1, 'I'); g.rect(15, 0, 1, 16, 'I')
    return g
T["dryer-wall"] = dryer_front(False); T["dryer-wall-warm"] = dryer_front(True)
g = Grid(16, 16, 'i')
g.rect(0, 0, 16, 4, 'I'); g.rect(3, 1, 10, 2, 'j'); g.rect(0, 15, 16, 1, 'I'); g.rect(15, 0, 1, 16, 'I')
g.rect(3, 7, 10, 6, 'J'); g.rect(4, 8, 8, 4, 'b'); g.rect(4, 8, 8, 1, 'z')
T["washer-wall"] = g
g = Grid(16, 16)
for x in (1, 6, 11):
    g.rect(x, 4, 4, 11, 'p'); g.rect(x, 4, 4, 1, 'P'); g.rect(x + 1, 2, 2, 2, 'p'); g.rect(x + 1, 8, 2, 1, 'm')
g.rect(0, 7, 16, 1, 'Q'); g.rect(0, 11, 16, 1, 'Q')
g.outline('k')
T["fence"] = g

# ── deco (transparent, outlined) ──────────────────────────────────────────
g = Grid(16, 16)
g.rect(7, 1, 2, 15, 'p'); g.rect(7, 1, 1, 15, 'P'); g.rect(5, 1, 6, 2, 'Q'); g.rect(6, 14, 4, 2, 'Q')
g.outline('k'); T["line-post"] = g
SOCKS = [('r', 'z'), ('b', 'z'), ('a', 'A'), ('u', 'U'), ('f', 'F'), ('t', 'T')]
def tiny_sock(g, x, y, c1, c2, flip=False):
    rows = ["111.", "121.", "111.", "1111", "1111", ".111"] if not flip else [".111", ".121", ".111", "1111", "1111", "111."]
    for yy, row in enumerate(rows):
        for xx, ch in enumerate(row):
            if ch == '1': g.set(x + xx, y + yy, c1)
            elif ch == '2': g.set(x + xx, y + yy, c2)
    g.rect(x + (0 if not flip else 1), y, 3, 1, 'y')
def line(seed, count):
    r = random.Random(seed)
    g = Grid(16, 16)
    g.rect(0, 2, 16, 1, 'y')
    xs = [1, 6, 11][:count]
    for x in xs:
        c1, c2 = r.choice(SOCKS)
        tiny_sock(g, x, 3, c1, c2, r.random() < 0.5)
        g.set(x + 1, 2, 'p')
    g.outline('k')
    for x in range(16):
        if g.get(x, 1) == 'k' and g.get(x, 3) == '.': g.set(x, 1, '.')
    return g
T["line-a"] = line(1, 3); T["line-b"] = line(2, 2); T["line-c"] = line(3, 3)
g = Grid(16, 16); g.rect(0, 2, 16, 1, 'y'); T["line-plain"] = g
def bunting():
    g = Grid(16, 16)
    g.line(0, 2, 15, 4, 'y')
    for i, x in enumerate((1, 6, 11)):
        c = ['r', 'a', 't'][i]
        y = 3 + x // 6
        for k in range(4): g.rect(x + k // 2, y + k, 4 - k, 1, c)
    return g
T["bunting"] = bunting()
def lamp_top(on):
    g = Grid(16, 16)
    g.rect(7, 10, 2, 6, 'm'); g.rect(4, 2, 8, 8, 'M'); g.rect(5, 3, 6, 6, 'w' if on else 'j')
    if on: g.rect(6, 4, 2, 4, 'l')
    else: g.set(6, 4, 'J')
    g.rect(3, 1, 10, 1, 'M'); g.rect(6, 0, 4, 1, 'M')
    g.outline('k')
    if on:
        for (x, y) in ((2, 5), (13, 5), (8, 11), (1, 9), (14, 9)):
            if g.get(x, y) == '.': g.set(x, y, 'w')
    return g
T["lamp-top-off"] = lamp_top(False); T["lamp-top-on"] = lamp_top(True)
g = Grid(16, 16); g.rect(7, 0, 2, 12, 'm'); g.rect(7, 0, 1, 12, 'J'); g.rect(5, 12, 6, 3, 'M'); g.rect(4, 14, 8, 2, 'm')
g.outline('k'); T["lamp-base"] = g
g = Grid(16, 16)
g.rect(1, 2, 14, 10, 'p'); g.rect(2, 3, 12, 8, 'Y'); g.rect(3, 4, 5, 3, 'z'); g.rect(9, 5, 4, 4, 'y'); g.rect(3, 8, 4, 1, 'N')
g.set(5, 4, 'r'); g.set(11, 5, 'b'); g.rect(3, 12, 2, 4, 'Q'); g.rect(11, 12, 2, 4, 'Q')
g.outline('k'); T["board"] = g
g = Grid(16, 16)
g.rect(1, 6, 14, 9, 'I'); g.rect(1, 6, 14, 2, 'i'); g.rect(2, 8, 12, 6, 'J'); g.rect(3, 8, 10, 2, 'b'); g.rect(4, 8, 3, 1, 'z')
g.set(5, 4, 'n'); g.set(10, 3, 'n'); g.set(8, 5, 'z')
g.outline('k'); T["tub"] = g
g = Grid(16, 16)   # sock-shaped post box (letters)
g.rect(5, 1, 6, 8, 'r'); g.rect(5, 9, 8, 4, 'r'); g.rect(5, 1, 6, 2, 'z'); g.rect(6, 5, 4, 1, 'k'); g.rect(7, 13, 2, 3, 'Q'); g.rect(11, 9, 2, 4, 'R')
g.outline('k'); T["postbox"] = g
def stall():
    big = Grid(32, 32)
    for x in range(0, 32, 4): big.rect(x, 2, 2, 9, 'a'); big.rect(x + 2, 2, 2, 9, 'y')
    big.rect(0, 11, 32, 1, 'A')
    big.rect(2, 12, 2, 18, 'Q'); big.rect(28, 12, 2, 18, 'Q')
    big.rect(1, 22, 30, 8, 'p'); big.rect(1, 22, 30, 2, 'P')
    for i, x in enumerate((5, 11, 17, 23)):   # thread spools on the counter
        c = ['r', 'b', 'u', 'f'][i]
        big.rect(x, 18, 4, 1, 'S'); big.rect(x, 19, 4, 2, c); big.rect(x, 21, 4, 1, 'S')
    big.outline('k')
    return big
sb = stall()
for name, (ox, oy) in {"stall-tl": (0, 0), "stall-tr": (16, 0), "stall-bl": (0, 16), "stall-br": (16, 16)}.items():
    g = Grid(16, 16)
    for y in range(16):
        for x in range(16): g.set(x, y, sb.get(ox + x, oy + y))
    T[name] = g
g = Grid(16, 16)
g.disc(8, 8, 6.5, 'R'); g.disc(8, 7, 6.5, 'r'); g.rect(7, 13, 2, 3, 'Q')
g.rect(7, 3, 2, 3, 'z'); g.set(7, 2, 'w'); g.set(8, 1, 'W')
g.outline('k'); T["table"] = g
g = Grid(16, 16)
g.rect(7, 4, 2, 10, 'J'); g.rect(5, 14, 6, 2, 'M'); g.disc(8, 3, 2.2, 'm'); g.rect(7, 2, 1, 1, 'n')
g.outline('k'); T["mic"] = g
g = Grid(16, 16)
g.rect(4, 3, 8, 7, 'S'); g.rect(4, 3, 8, 1, 's'); g.rect(4, 10, 8, 2, 's'); g.rect(4, 12, 1, 4, 'S'); g.rect(11, 12, 1, 4, 'S')
g.outline('k'); T["chair"] = g
g = Grid(16, 16)
for (x, y, r_) in ((5, 10, 4.5), (11, 11, 4), (8, 7, 4.2)):
    g.disc(x, y, r_, 'n')
for (x, y) in ((4, 8), (9, 5), (12, 9)): g.set(x, y, 'z'); g.set(x + 1, y, 'z')
for (x, y) in ((3, 12), (8, 12), (12, 13)): g.set(x, y, 'N')
g.outline('k'); T["lint-pile"] = g
g = Grid(16, 16)
g.rect(2, 6, 12, 9, 'A'); g.rect(2, 6, 12, 1, 'a')
for x in range(3, 14, 2): g.rect(x, 8, 1, 6, 'S')
tiny_sock(g, 4, 1, 'b', 'z'); tiny_sock(g, 9, 2, 'r', 'z', True)
g.outline('k'); T["basket"] = g
g = Grid(16, 16)
g.rect(7, 9, 2, 7, 'Q'); g.rect(1, 2, 14, 8, 'p'); g.rect(1, 2, 14, 1, 'P'); g.rect(1, 9, 14, 1, 'Q')
g.rect(3, 4, 10, 1, 'S'); g.rect(3, 6, 7, 1, 'S'); g.outline('k'); T["sign"] = g
g = Grid(16, 16)
g.rect(4, 8, 8, 7, 'r'); g.rect(4, 8, 8, 1, 'h'); g.rect(5, 15, 6, 1, 'R')
for (x, y, c) in ((5, 5, 'a'), (8, 3, 'f'), (11, 5, 'z')): g.disc(x, y, 1.6, c); g.set(x, y, 'w')
g.rect(6, 6, 1, 2, 'U'); g.rect(8, 5, 1, 3, 'U'); g.rect(10, 6, 1, 2, 'U')
g.outline('k'); T["flowerpot"] = g

# The Great Line: four pin slots that can hold a sock (puzzle). Line drawn across.
GL = {"empty": None, "red": ('r', 'z'), "blue": ('b', 'z'), "gold": ('a', 'A'), "green": ('u', 'U')}
for name, cols in GL.items():
    g = Grid(16, 16)
    g.rect(0, 2, 16, 1, 'y')
    # a big clothespin on the line
    g.rect(7, 0, 2, 7, 'p'); g.set(7, 0, 'P'); g.rect(7, 3, 2, 1, 'm')
    if cols:
        c1, c2 = cols
        # a full-size sock hanging from the pin
        g.rect(5, 6, 6, 6, c1); g.rect(5, 6, 6, 1, 'y')
        g.rect(5, 12, 9, 3, c1); g.rect(12, 13, 2, 2, c1); g.set(13, 12, '.')
        if name == 'red':
            for y in (8, 10, 13): g.rect(5, y, 6 if y < 12 else 9, 1, c2)
        elif name == 'blue':
            for (x, y) in ((6, 8), (9, 9), (7, 11), (11, 13), (6, 13)): g.set(x, y, c2)
        elif name == 'gold':
            g.set(8, 8, 'z'); g.rect(7, 9, 3, 1, 'z'); g.set(7, 10, 'z'); g.set(9, 10, 'z'); g.rect(5, 12, 9, 1, c2)
        else:
            g.rect(5, 14, 9, 1, c2)
    g.outline('k')
    for x in range(16):
        if g.get(x, 1) == 'k' and g.get(x, 3) == '.' and not (6 <= x <= 9): g.set(x, 1, '.')
    T[f"gl-{name}"] = g

order = list(T.keys())
doc = {"size": [16, 16], "palette": TP, "frames": {n: T[n].rows() for n in order}}
json.dump(doc, open(f"{OUT}/tiles-town.json", "w"), indent=1)
print(len(order), "tiles")
