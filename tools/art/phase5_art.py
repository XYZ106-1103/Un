import json, sys, math, random
sys.path.insert(0, sys.argv[2])
from grid import Grid
OUT = sys.argv[1]
rnd = random.Random(11)
def save(name, doc):
    json.dump(doc, open(f"{OUT}/{name}.json", "w"), indent=1)

# ======================= Forest tileset 16x16 =======================
TP = {"k": "#0f0d14", "f": "#1d2a29", "F": "#263734", "e": "#162120", "l": "#34473f", "w": "#2a4a5c", "W": "#3c6a80",
      "p": "#4a3b2c", "P": "#5c4a36", "q": "#3a2e22",
      "c": "#c8414b", "C": "#8a2a33", "h": "#e36b70", "s": "#3a3247", "S": "#2a2434", "t": "#514664",
      "o": "#8c6239", "O": "#6e4a1f", "d": "#4a3015", "g": "#6b6680", "G": "#a39fb3", "b": "#5d8fd6", "B": "#3c629e",
      "a": "#f2b24c", "A": "#b97a2a", "m": "#3fa7a0", "M": "#2a716c", "x": "#0b0a10", "y": "#e8e2d0", "r": "#c8414b",
      "v": "#1a2626", "u": "#a77fcf", "U": "#6f4f94", "z": "#f7f4ea"}
T = {}
def moss(variant):
    g = Grid(16, 16, 'f')
    for _ in range(26):
        g.set(rnd.randrange(16), rnd.randrange(16), 'F')
    for _ in range(6):
        x, y = rnd.randrange(16), rnd.randrange(16); g.set(x, y, 'l'); g.set(x + 1, y, 'F')
    if variant: 
        for _ in range(5): g.set(rnd.randrange(16), rnd.randrange(16), 'e')
    return g
T["moss-a"] = moss(0); T["moss-b"] = moss(1)
g = moss(0)
for y in range(16):
    for x in range(16):
        if (x + y * 3) % 11 == 0: g.set(x, y, 'W' if (x + y) % 2 else 'w')
T["moss-wet"] = g
g = Grid(16, 16, 'f'); g.disc(7.5, 8, 6.5, 'w'); g.disc(7.5, 8, 5, 'B'); g.rect(4, 6, 4, 1, 'W'); g.set(10, 10, 'W')
T["puddle"] = g
g = Grid(16, 16, 'p')
for y in range(0, 16, 4): g.rect(0, y, 16, 1, 'q')
for _ in range(10): g.set(rnd.randrange(16), rnd.randrange(16), 'P')
T["path"] = g
g = Grid(16, 16, 'g'); 
for y in range(0, 16, 5):
    for x in range(0, 16, 6): g.rect(x + (y % 2) * 3, y, 5, 4, 'G'); g.rect(x + (y % 2) * 3, y + 3, 5, 1, 's')
T["stone"] = g
# Umbrella tree: 2x2 canopy (drawn above characters) + 2 shaft tiles (solid)
def canopy():
    big = Grid(32, 32)
    for y in range(2, 26):
        t = (y - 2) / 23
        half = round(15 * math.sin(min(1, t * 1.25) * math.pi / 2))
        big.rect(16 - half, y, half * 2, 1, 'c')
    # ribs + shading
    for i, x in enumerate((4, 10, 16, 22, 28)):
        big.line(16, 3, x, 25, 'C')
    for y in range(4, 14):
        big.set(9 + (y // 3), y, 'h')
    # scalloped hem
    for x in range(1, 31):
        big.set(x, 25 + (1 if (x // 3) % 2 == 0 else 0), 'C')
    big.rect(15, 0, 2, 3, 'k')
    big.rect(15, 26, 2, 6, 'q')
    big.outline('k')
    return big
cb = canopy()
for name, (ox, oy) in {"um-tl": (0, 0), "um-tr": (16, 0), "um-bl": (0, 16), "um-br": (16, 16)}.items():
    g = Grid(16, 16)
    for y in range(16):
        for x in range(16): g.set(x, y, cb.get(ox + x, oy + y))
    T[name] = g
def shaft(side):
    g = Grid(16, 16)
    x0 = 15 if side == 'l' else 0
    g.rect(x0 - (0 if side == 'l' else 0), 0, 1, 11, 'q')
    if side == 'l':
        g.rect(15, 0, 1, 12, 'q'); g.set(14, 12, 'q'); g.set(13, 12, 'q'); g.set(12, 11, 'q')
    else:
        g.rect(0, 0, 1, 12, 'q')
    g.rect(10 if side == 'l' else 0, 13, 6, 3, 'v')  # shadow
    g.outline('k')
    return g
T["shaft-l"] = shaft('l'); T["shaft-r"] = shaft('r')
g = Grid(16, 16, 'S')   # wall of closed umbrellas
for x in range(1, 16, 4):
    col = ['c', 'b', 'm', 'a'][(x // 4) % 4]
    g.rect(x, 2, 3, 13, col); g.rect(x + 2, 2, 1, 13, 'k'); g.rect(x, 0, 3, 2, 'q')
g.rect(0, 15, 16, 1, 'k')
T["wall-umbrellas"] = g
T["wall-top"] = Grid(16, 16, 'v')
g = Grid(16, 16)   # mailbox
g.rect(4, 2, 8, 9, 'r'); g.rect(4, 2, 8, 2, 'C'); g.rect(6, 5, 4, 1, 'k'); g.rect(7, 11, 2, 5, 'q'); g.rect(5, 7, 6, 1, 'C')
g.outline('k'); T["mailbox"] = g
def tank(full):
    big = Grid(32, 32)
    big.rect(3, 4, 26, 24, 'g'); big.rect(3, 4, 26, 3, 'G'); big.rect(26, 7, 3, 21, 's')
    for y in (12, 20): big.rect(3, y, 26, 1, 's')
    big.rect(6, 9, 6, 15, 'x' if not full else 'B'); big.rect(7, 10, 4, 13, 'v' if not full else 'b')
    if full: big.rect(7, 10, 1, 13, 'W')
    big.rect(5, 28, 3, 4, 'q'); big.rect(24, 28, 3, 4, 'q')
    big.outline('k')
    return big
for state in ('dry', 'full'):
    tb = tank(state == 'full')
    for name, (ox, oy) in {"tl": (0, 0), "tr": (16, 0), "bl": (0, 16), "br": (16, 16)}.items():
        g = Grid(16, 16)
        for y in range(16):
            for x in range(16): g.set(x, y, tb.get(ox + x, oy + y))
        T[f"tank-{state}-{name}"] = g
def valve(color, shade, open_):
    g = Grid(16, 16)
    g.rect(7, 8, 2, 8, 'g'); g.rect(3, 12, 10, 2, 'g')
    g.ring(8, 6, 4.6, color); g.ring(8, 6, 3.6, shade)
    if open_: g.rect(4, 6, 9, 1, color)
    else: g.rect(8, 2, 1, 9, color)
    g.disc(8, 6, 1.2, 'z')
    g.outline('k')
    return g
for cname, (c1, c2) in {"red": ('r', 'C'), "blue": ('b', 'B'), "gold": ('a', 'A')}.items():
    T[f"valve-{cname}-open"] = valve(c1, c2, True)
    T[f"valve-{cname}-shut"] = valve(c1, c2, False)
g = Grid(16, 16); g.rect(0, 6, 16, 4, 'g'); g.rect(0, 6, 16, 1, 'G'); g.rect(0, 9, 16, 1, 's'); T["pipe-h"] = g
g = Grid(16, 16); g.rect(6, 0, 4, 16, 'g'); g.rect(6, 0, 1, 16, 'G'); g.rect(9, 0, 1, 16, 's'); T["pipe-v"] = g
def stall():
    big = Grid(32, 32)
    for x in range(0, 32, 4): big.rect(x, 2, 2, 9, 'u'); big.rect(x + 2, 2, 2, 9, 'z')
    for x in range(0, 32, 4): big.set(x + 1, 11, 'U')
    big.rect(0, 11, 32, 1, 'U')
    big.rect(2, 12, 2, 18, 'O'); big.rect(28, 12, 2, 18, 'O')
    big.rect(1, 22, 30, 8, 'o'); big.rect(1, 22, 30, 2, 'O')
    big.rect(6, 19, 4, 3, 'a'); big.rect(14, 18, 4, 4, 'm'); big.rect(22, 19, 4, 3, 'r')
    big.outline('k')
    return big
sb = stall()
for name, (ox, oy) in {"stall-tl": (0, 0), "stall-tr": (16, 0), "stall-bl": (0, 16), "stall-br": (16, 16)}.items():
    g = Grid(16, 16)
    for y in range(16):
        for x in range(16): g.set(x, y, sb.get(ox + x, oy + y))
    T[name] = g
g = Grid(16, 16)
g.rect(7, 9, 2, 7, 'O'); g.rect(1, 2, 14, 8, 'o'); g.rect(1, 2, 14, 1, 'P'); g.rect(1, 9, 14, 1, 'O')
g.rect(3, 4, 10, 1, 'q'); g.rect(3, 6, 7, 1, 'q'); g.outline('k'); T["sign"] = g
g = Grid(16, 16, 'x')
for y in range(16):
    for x in range(16):
        if (x * 2 + y * 5) % 13 == 0: g.set(x, y, 'w')
T["water"] = g
g = Grid(16, 16, 'o')
for x in range(0, 16, 4): g.rect(x, 0, 1, 16, 'O')
g.rect(0, 0, 16, 1, 'P'); g.rect(0, 15, 16, 1, 'q'); T["bridge"] = g
g = moss(0)
for (x, y, c) in ((4, 5, 'u'), (11, 9, 'a'), (7, 12, 'z')):
    g.disc(x, y, 1.3, c); g.set(x, y, 'a' if c != 'a' else 'z'); g.set(x, y + 2, 'M'); g.set(x, y + 3, 'M')
T["flowers"] = g
g = Grid(16, 16)  # lantern (stands in the arena)
g.rect(7, 6, 2, 10, 'q'); g.rect(5, 1, 6, 6, 'a'); g.rect(6, 2, 4, 4, 'z'); g.rect(5, 0, 6, 1, 'q'); g.outline('k'); T["lantern"] = g
order = list(T.keys())
tiles = {"size": [16, 16], "palette": TP, "frames": {n: T[n].rows() for n in order}}
save("tiles-forest", tiles)

# ======================= Mitt (field 16x16) =======================
MP = {"k": "#1a1420", "m": "#3fa7a0", "M": "#2a716c", "n": "#62c4bb", "y": "#e8e2d0", "Y": "#b9ad90", "a": "#f2b24c",
      "r": "#e08a7a", "e": "#1a1420", "z": "#f7f4ea"}
def mitt(view):
    g = Grid(16, 16)
    # body
    g.rect(4, 2, 9, 10, 'm'); g.rect(5, 1, 7, 1, 'm'); g.rect(12, 3, 1, 8, 'M')
    g.rect(5, 2, 2, 1, 'n')
    if view in ('down', 'up'):
        g.rect(2, 5, 2, 4, 'm'); g.set(2, 4, 'm'); g.set(3, 9, 'M')  # thumb
    else:
        g.rect(12, 5, 3, 4, 'm'); g.set(14, 4, 'm'); g.set(14, 9, 'M')  # thumb forward
    # knit V texture
    for y in range(4, 11, 3):
        for x in range(5, 12, 3): g.set(x, y, 'M'); g.set(x + 1, y + 1, 'M')
    # cuff
    g.rect(4, 12, 9, 3, 'y'); 
    for x in range(4, 13, 2): g.set(x, 13, 'Y')
    if view == 'down':
        g.rect(6, 5, 1, 2, 'e'); g.rect(10, 5, 1, 2, 'e'); g.set(8, 8, 'e'); g.set(5, 7, 'r'); g.set(11, 7, 'r')
    elif view == 'up':
        g.rect(7, 6, 3, 3, 'a'); g.set(8, 7, 'z')  # the flower stitch on the back
    else:
        g.rect(10, 5, 1, 2, 'e'); g.set(11, 8, 'e'); g.set(9, 7, 'r')
    g.outline('k')
    return g.rows()
mitt_doc = {"size": [16, 16], "palette": MP,
    "frames": {"down-0": mitt('down'), "down-1": {"from": "down-0", "shift": [0, -1]},
               "up-0": mitt('up'), "up-1": {"from": "up-0", "shift": [0, -1]},
               "right-0": mitt('right'), "right-1": {"from": "right-0", "shift": [0, -1]},
               "left-0": {"mirror": "right-0"}, "left-1": {"mirror": "right-1"}},
    "animations": {**{f"idle-{d}": {"frames": [f"{d}-0", f"{d}-0", f"{d}-0", f"{d}-1"], "rate": 2} for d in ("down", "up", "left", "right")},
                   **{f"walk-{d}": {"frames": [f"{d}-1", f"{d}-0"], "rate": 6} for d in ("down", "up", "left", "right")},
                   "idle": {"frames": ["down-0", "down-0", "down-0", "down-1"], "rate": 2}}}
save("mitt", mitt_doc)

# ======================= Portraits 48x48 =======================
def faces(base_fn, eyes, mouths, extras):
    out = {}
    for name in eyes:
        g = base_fn()
        eyes[name](g); mouths[name](g)
        if name in extras: extras[name](g)
        out[name] = g.rows()
    return out
# Mitt portrait
def mitt_base():
    g = Grid(48, 48)
    g.disc(24, 22, 17, 'm'); g.rect(7, 22, 34, 14, 'm')
    g.disc(8, 25, 5, 'm')  # thumb
    for y in range(10, 36, 4):
        for x in range(10, 40, 4):
            if g.get(x, y) == 'm': g.set(x, y, 'M'); g.set(x + 1, y + 1, 'M')
    for y in range(8, 20): 
        if g.get(14, y) == 'm': g.set(14, y, 'n')
    g.rect(7, 36, 34, 9, 'y')
    for x in range(8, 41, 3): g.rect(x, 37, 1, 7, 'Y')
    g.rect(31, 27, 5, 5, 'a'); g.set(33, 29, 'z'); g.set(31, 27, 'm'); g.set(35, 27, 'm'); g.set(31, 31, 'm'); g.set(35, 31, 'm')
    g.outline('k')
    return g
def eye_open(dy=0, size=3):
    def f(g):
        for cx in (17, 29):
            g.rect(cx - 1, 19 + dy, size - 1, size + 1, 'e'); g.set(cx - 1, 19 + dy, 'z')
    return f
def eye_closed(g):
    for cx in (17, 29):
        for x in range(cx - 2, cx + 3): g.set(x, 21 - (1 if abs(x - cx) < 2 else 0), 'e')
def eye_sad(g):
    eye_open(1)(g)
    for cx in (17, 29): g.line(cx - 3, 17 + (0 if cx == 29 else 1), cx + 2, 17 + (1 if cx == 29 else 0), 'M')
def m_small(g): g.rect(22, 27, 4, 1, 'e')
def m_smile(g):
    for x in range(20, 28): g.set(x, 27 + (0 if x in (20, 27) else 1), 'e')
def m_frown(g):
    for x in range(21, 27): g.set(x, 28 - (0 if x in (21, 26) else 1), 'e')
def m_o(g): g.ring(23.5, 28, 1.8, 'e')
def blush(g): g.rect(11, 25, 3, 1, 'r'); g.rect(34, 25, 3, 1, 'r')
def tears(g):
    for cx in (16, 30): g.rect(cx, 23, 1, 3, 'z'); g.set(cx, 26, 'n')
MPP = {**MP, "Y": "#b9ad90"}
portrait_mitt = {"size": [48, 48], "palette": MPP, "frames": faces(mitt_base,
    {"neutral": eye_open(), "happy": eye_closed, "sad": eye_sad, "surprised": eye_open(0, 2), "teary": eye_sad},
    {"neutral": m_small, "happy": m_smile, "sad": m_frown, "surprised": m_o, "teary": m_smile},
    {"happy": blush, "teary": tears, "surprised": blush})}
save("portrait-mitt", portrait_mitt)

# Hoop & Stud (field 24x24, portrait 48x48)
HP = {"k": "#1a1420", "a": "#f2b24c", "A": "#b97a2a", "z": "#fff1c4", "u": "#a77fcf", "U": "#6f4f94", "g": "#cfd6e0",
      "G": "#8f88a3", "e": "#1a1420", "r": "#e08a7a"}
def hoopstud_field(bob):
    g = Grid(24, 24)
    g.ring(7, 13 - bob, 6.4, 'a'); g.ring(7, 13 - bob, 5.4, 'A'); g.set(4, 9 - bob, 'z')
    g.rect(5, 12 - bob, 1, 2, 'e'); g.rect(9, 12 - bob, 1, 2, 'e')
    g.rect(6, 3 - bob, 2, 3, 'a')
    g.disc(17, 12 + bob, 4.2, 'u'); g.disc(16, 11 + bob, 1.5, 'z'); g.rect(16, 16 + bob, 2, 5, 'g')
    g.set(15, 12 + bob, 'e'); g.set(19, 12 + bob, 'e')
    g.outline('k')
    return g.rows()
hoopstud = {"size": [24, 24], "palette": HP, "frames": {"idle-0": hoopstud_field(0), "idle-1": hoopstud_field(1)},
            "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 2}}}
save("hoopstud", hoopstud)
def hs_base():
    g = Grid(48, 48)
    g.ring(15, 25, 12.5, 'a'); g.ring(15, 25, 11.5, 'a'); g.ring(15, 25, 10.5, 'A'); g.set(9, 16, 'z'); g.set(8, 17, 'z')
    g.rect(13, 6, 4, 8, 'a'); g.rect(14, 6, 1, 8, 'z')
    g.disc(35, 24, 9, 'u'); g.disc(33, 21, 3, 'z'); g.disc(37, 28, 3, 'U'); g.rect(33, 33, 4, 12, 'g'); g.rect(36, 33, 1, 12, 'G')
    g.outline('k')
    return g
def hs_eyes(kind):
    def f(g):
        if kind == 'happy':
            for cx in (11, 19): g.line(cx - 1, 25, cx, 24, 'e'); g.line(cx, 24, cx + 1, 25, 'e')
            for cx in (32, 38): g.line(cx - 1, 24, cx, 23, 'e'); g.line(cx, 23, cx + 1, 24, 'e')
        elif kind == 'annoyed':
            for cx in (11, 19): g.rect(cx - 1, 25, 3, 1, 'e')
            g.line(30, 21, 34, 22, 'e'); g.line(40, 21, 36, 22, 'e'); g.rect(32, 24, 2, 2, 'e'); g.rect(37, 24, 2, 2, 'e')
        else:
            for cx in (11, 19): g.rect(cx, 23, 2, 3, 'e')
            g.rect(32, 23, 2, 2, 'e'); g.rect(37, 23, 2, 2, 'e')
    return f
def hs_mouth(kind):
    def f(g):
        if kind == 'annoyed': g.rect(13, 30, 4, 1, 'e'); g.rect(34, 28, 3, 1, 'e')
        else:
            for x in range(12, 18): g.set(x, 30 + (0 if x in (12, 17) else 1), 'e')
            g.set(34, 28, 'e'); g.set(35, 29, 'e'); g.set(36, 28, 'e')
    return f
portrait_hs = {"size": [48, 48], "palette": HP, "frames": faces(hs_base,
    {"neutral": hs_eyes('n'), "happy": hs_eyes('happy'), "annoyed": hs_eyes('annoyed')},
    {"neutral": hs_mouth('n'), "happy": hs_mouth('n'), "annoyed": hs_mouth('annoyed')}, {})}
save("portrait-hoopstud", portrait_hs)

# Sir Brolly: field 24x32, portrait 48x48, battle 80x80
BP = {"k": "#0f0d14", "c": "#2a2638", "C": "#1a1724", "h": "#4b4566", "s": "#8f88a3", "q": "#6e4a1f", "Q": "#4a3015",
      "a": "#f2b24c", "A": "#b97a2a", "e": "#f7f4ea", "o": "#0f0d14", "r": "#c8414b", "R": "#8a2a33", "z": "#fff1c4", "m": "#4a3015"}
def brolly_field(bob):
    g = Grid(24, 32)
    # hooked handle (head)
    g.ring(12, 6 - bob, 4.6, 'q'); g.ring(12, 6 - bob, 3.6, 'Q')
    for y in range(1 - bob, 7 - bob): g.set(16, y, '.'); g.set(15, y, '.') if y > 4 - bob else None
    g.rect(11, 9 - bob, 3, 3, 'q')
    # folded canopy body
    for y in range(12, 29):
        t = (y - 12) / 16
        half = round(6 - 4 * t)
        g.rect(12 - half, y, half * 2 + 1, 1, 'c')
    g.line(12, 12, 9, 27, 'h'); g.line(12, 12, 15, 27, 'C')
    g.rect(8, 17, 9, 2, 'r'); g.rect(11, 17, 3, 2, 'a')  # strap = knight's sash with a gold button
    g.rect(9, 14, 2, 2, 'e'); g.rect(14, 14, 2, 2, 'e'); g.set(10, 15, 'o'); g.set(14, 15, 'o')
    g.rect(10, 16, 1, 1, 'm'); g.rect(14, 16, 1, 1, 'm'); g.rect(11, 16, 3, 1, 'm')  # mustache
    g.rect(12, 29, 1, 3, 's')  # ferrule tip
    g.outline('k')
    return g.rows()
brolly_field_doc = {"size": [24, 32], "palette": BP, "frames": {"idle-0": brolly_field(0), "idle-1": brolly_field(1)},
                    "animations": {"idle": {"frames": ["idle-0", "idle-0", "idle-1"], "rate": 3}}}
save("brolly", brolly_field_doc)
def brolly_portrait_base():
    g = Grid(48, 48)
    g.ring(24, 9, 7.5, 'q'); g.ring(24, 9, 6.5, 'q'); g.ring(24, 9, 5.5, 'Q')
    g.rect(29, 2, 4, 9, '.')
    g.rect(22, 15, 5, 5, 'q')
    for y in range(20, 48):
        half = round(15 - (y - 20) * 0.25)
        g.rect(24 - half, y, half * 2 + 1, 1, 'c')
    g.line(24, 20, 14, 47, 'h'); g.line(24, 20, 34, 47, 'C'); g.line(24, 20, 24, 47, 'C')
    g.rect(10, 38, 29, 4, 'r'); g.rect(10, 41, 29, 1, 'R'); g.rect(22, 37, 5, 6, 'a'); g.rect(23, 38, 2, 2, 'z')
    g.outline('k')
    return g
def b_eyes(kind):
    def f(g):
        for cx in (18, 30):
            g.rect(cx - 2, 26, 5, 4, 'e')
            if kind == 'proud': g.rect(cx - 2, 26, 5, 1, 'C'); g.rect(cx, 28, 2, 2, 'o')
            elif kind == 'flustered': g.rect(cx - 1 + (1 if cx == 18 else -1), 27, 2, 2, 'o'); g.set(cx + 3, 24, 'e')
            elif kind == 'sad': g.rect(cx - 2, 26, 5, 2, 'C'); g.rect(cx, 28, 2, 2, 'o')
            else: g.rect(cx - 1, 27, 3, 2, 'o')
        brow = {'proud': (0, -1), 'flustered': (1, 1), 'sad': (1, -1), 'happy': (0, 0)}[kind]
        g.line(15, 24 + brow[0], 21, 24 + brow[1], 'k'); g.line(27, 24 + brow[1], 33, 24 + brow[0], 'k')
    return f
def b_mouth(kind):
    def f(g):
        g.rect(16, 32, 7, 2, 'm'); g.rect(26, 32, 7, 2, 'm'); g.set(15, 33 + (1 if kind == 'sad' else -1), 'm'); g.set(33, 33 + (1 if kind == 'sad' else -1), 'm')
        if kind == 'happy': g.rect(22, 34, 4, 1, 'o')
        if kind == 'flustered': g.rect(23, 34, 2, 2, 'o')
    return f
def sweat(g): g.stamp(36, 22, [".e.", "eee", ".e."])
portrait_brolly = {"size": [48, 48], "palette": BP, "frames": faces(brolly_portrait_base,
    {k: b_eyes(k) for k in ('proud', 'flustered', 'sad', 'happy')}, {k: b_mouth(k) for k in ('proud', 'flustered', 'sad', 'happy')},
    {"flustered": sweat})}
save("portrait-brolly", portrait_brolly)
def brolly_battle(mode, bob):
    g = Grid(80, 80)
    if mode == 'closed':
        g.ring(40, 12 - bob, 8.5, 'q'); g.ring(40, 12 - bob, 7.5, 'q'); g.ring(40, 12 - bob, 6.5, 'Q'); g.rect(46, 4 - bob, 6, 10, '.')
        g.rect(38, 19 - bob, 5, 6, 'q')
        for y in range(25, 74):
            half = round(16 - (y - 25) * 0.3)
            g.rect(40 - half, y, half * 2 + 1, 1, 'c')
        g.line(40, 25, 27, 73, 'h'); g.line(40, 25, 53, 73, 'C'); g.line(40, 25, 40, 73, 'C')
        g.rect(24, 46, 33, 5, 'r'); g.rect(24, 50, 33, 1, 'R'); g.rect(37, 45, 7, 7, 'a'); g.rect(38, 46, 3, 3, 'z')
        fy = 32
        g.rect(64, 40 - bob, 3, 26, 's'); g.rect(61, 40 - bob, 9, 3, 'a')  # a little sword-like rib
    else:
        # open canopy: wide dome, shaft below, face under the dome
        for y in range(8 - bob, 34 - bob):
            t = (y - 8 + bob) / 25
            half = round(36 * math.sin(min(1, t * 1.15) * math.pi / 2))
            g.rect(40 - half, y, half * 2, 1, 'c')
        for x in (6, 18, 30, 40, 50, 62, 74): g.line(40, 9 - bob, x, 33 - bob, 'C')
        for x in range(4, 77): g.set(x, 33 - bob + (1 if (x // 4) % 2 == 0 else 0), 'C')
        for y in range(11 - bob, 22 - bob): g.set(25 + (y // 2), y, 'h')
        g.rect(39, 34 - bob, 3, 34, 'q'); g.ring(36, 70, 4.5, 'q'); g.rect(40, 66, 4, 6, '.')
        g.rect(30, 44, 20, 14, 'c'); g.rect(30, 44, 20, 3, 'h')   # body panel under canopy
        g.rect(30, 52, 20, 3, 'r'); g.rect(38, 51, 4, 5, 'a')
        fy = 45
    # face
    for cx in (35, 46):
        g.rect(cx - 2, fy, 5, 4, 'e')
        if mode == 'calm': g.line(cx - 2, fy + 2, cx, fy + 1, 'o'); g.line(cx, fy + 1, cx + 2, fy + 2, 'o')
        else: g.rect(cx - 1 + (1 if bob else 0), fy + 1, 2, 2, 'o')
    g.line(32, fy - 2, 37, fy - 1 if mode != 'open' else fy, 'k'); g.line(44, fy - 1 if mode != 'open' else fy, 49, fy - 2, 'k')
    g.rect(33, fy + 6, 6, 2, 'm'); g.rect(42, fy + 6, 6, 2, 'm')
    if mode == 'calm':
        # holding the canopy over someone: soft rain drops landing on top
        for (x, y) in ((14, 2), (30, 0), (52, 1), (66, 3)): g.rect(x, y, 1, 3, 'z')
    g.outline('k')
    return g.rows()
enemy_brolly = {"size": [80, 80], "palette": BP,
    "frames": {"idle-0": brolly_battle('closed', 0), "idle-1": brolly_battle('closed', 1),
               "open-0": brolly_battle('open', 0), "open-1": brolly_battle('open', 1), "calm-0": brolly_battle('calm', 0)},
    "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 2}, "phase1": {"frames": ["open-0", "open-1"], "rate": 3},
                   "calm": {"frames": ["calm-0"], "rate": 1}}}
save("enemy-brolly", enemy_brolly)

# ======================= Normal enemies 48x48 =======================
def finish(g): g.outline('k'); return g.rows()
EP = {"k": "#1a1420", "w": "#f7f4ea", "W": "#c9c3d6", "r": "#c8414b", "R": "#8a2a33", "e": "#1a1420", "c": "#e08a7a",
      "a": "#f2b24c", "A": "#b97a2a", "y": "#ffd84a", "Y": "#d9a020", "o": "#f08a3a", "b": "#5d8fd6", "B": "#3c629e",
      "g": "#a39fb3", "G": "#6b6680", "q": "#6e4a1f", "Q": "#4a3015", "z": "#cfe3ff", "m": "#3fa7a0", "p": "#e8e2d0"}
def face(g, x, y, kind='n', gap=8):
    for cx in (x, x + gap):
        if kind == 'calm': g.line(cx - 1, y + 1, cx, y, 'e'); g.line(cx, y, cx + 1, y + 1, 'e')
        elif kind == 'angry': g.rect(cx - 1, y, 2, 2, 'e'); g.line(cx - 2, y - 2, cx + 1, y - 1 if cx == x else y - 3, 'e')
        else: g.rect(cx - 1, y - 1, 2, 3, 'e'); g.set(cx - 1, y - 1, 'w')
def sock(frame, calm=False):
    g = Grid(48, 48); b = frame
    for y in range(6 - b, 30 - b):
        g.rect(14, y, 16, 1, 'w' if ((y + b) // 4) % 2 else 'r')
    for y in range(28 - b, 40 - b):
        g.rect(14, y, 26 - (0 if y < 34 - b else (y - 34 + b) * 2), 1, 'w' if ((y + b) // 4) % 2 else 'r')
    g.disc(37, 37 - b, 5, 'r'); g.rect(14, 4 - b, 16, 3, 'W')  # toe + cuff
    face(g, 19, 14 - b, 'calm' if calm else 'n', 7)
    g.rect(21, 19 - b, 4, 1, 'e') if not calm else g.rect(21, 19 - b, 4, 1, 'c')
    if calm: g.set(17, 17 - b, 'c'); g.set(28, 17 - b, 'c')
    return finish(g)
def button(frame, calm=False):
    g = Grid(48, 48); b = frame
    g.disc(24, 24 - b, 15, 'a'); g.ring(24, 24 - b, 15.5, 'A'); g.ring(24, 24 - b, 11, 'A')
    for (x, y) in ((19, 19), (29, 19), (19, 29), (29, 29)): g.disc(x, y - b, 2.2, 'Q')
    g.rect(18, 18 - b, 2, 2, 'w'); g.rect(28, 18 - b, 2, 2, 'w')  # eyes in the top holes
    if calm:
        g.line(19, 29 - b, 29, 19 - b, 'r'); g.line(19, 19 - b, 29, 29 - b, 'r')  # sewn with thread
    else:
        for i in range(10): g.set(39 + (i % 3), 30 + i - b, 'r')  # loose thread
    g.rect(22, 24 - b, 4, 1, 'Q')
    return finish(g)
def duck(frame, calm=False):
    g = Grid(48, 48); b = frame
    g.disc(22, 30 - b, 12, 'y'); g.disc(29, 16 - b, 8, 'y'); g.rect(10, 28 - b, 6, 4, 'y')
    g.rect(36, 16 - b, 7, 3, 'o'); g.rect(36, 19 - b, 6, 1, 'Y')
    g.disc(16, 31 - b, 5, 'Y')
    face(g, 31, 13 - b, 'calm' if calm else 'n', 0)
    if calm:
        g.rect(6, 40, 36, 3, 'b'); g.rect(8, 40, 30, 1, 'z')  # floating on a puddle
    return finish(g)
def globe(frame, calm=False):
    g = Grid(48, 48); b = frame
    g.disc(24, 20, 14, 'z'); g.ring(24, 20, 14.4, 'W')
    g.rect(18, 22, 12, 9, 'r'); g.rect(17, 19, 14, 3, 'R'); g.rect(22, 26, 3, 5, 'q')  # tiny house
    g.rect(8, 33, 32, 9, 'q'); g.rect(8, 33, 32, 2, 'Q'); g.rect(10, 41, 28, 3, 'Q')
    random.seed(frame + (5 if calm else 0))
    for i in range(14 if calm else 22):
        x, y = random.randrange(12, 37), random.randrange(8, 30)
        if (x - 24) ** 2 + (y - 20) ** 2 < 150: g.set(x, y, 'w')
    face(g, 19, 37, 'calm' if calm else ('angry' if frame else 'n'), 10)
    return finish(g)
def enemy_doc(fn):
    return {"size": [48, 48], "palette": EP,
            "frames": {"idle-0": fn(0), "idle-1": fn(1), "calm-0": fn(0, True), "calm-1": fn(1, True)},
            "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 3}, "calm": {"frames": ["calm-0", "calm-1"], "rate": 2}}}
for name, fn in (("sock", sock), ("button", button), ("duck", duck), ("globe", globe)):
    save(f"enemy-{name}", enemy_doc(fn))

# ======================= Extra bullets (merged into bullets.json) =======================
bl = json.load(open(f"{OUT}/bullets.json"))
bl["palette"].update({"b": "#5d8fd6", "B": "#3c629e", "z": "#cfe3ff", "y": "#ffd84a", "q": "#8c6239", "r": "#c8414b"})
bl["frames"].update({
  "raindrop": ["........", "...z....", "...b....", "..zbb...", "..bbb...", "..bbB...", "...B....", "........"],
  "rib": ["......wg", ".....wg.", "....wg..", "...wg...", "..wg....", ".wg.....", "wg......", "g......."],
  "fluff": ["........", "..ww.w..", ".wwwwww.", "wwwgwww.", ".wwwwwg.", "..wwww..", "...w....", "........"],
  "bubble": ["........", "..zzz...", ".z...z..", ".z.w.z..", ".z...z..", "..zzz...", "........", "........"],
  "snowflake": ["...w....", ".w.w.w..", "..www...", "wwwzwww.", "..www...", ".w.w.w..", "...w....", "........"],
  "button": ["........", "..aaa...", ".aaaaa..", ".akaka..", ".aaaaa..", ".akaka..", "..aaa...", "........"],
})
bl["palette"]["k"] = "#1a1420"
save("bullets", bl)
print("ok", len(order), "forest tiles")
