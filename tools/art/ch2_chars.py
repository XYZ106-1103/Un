"""Chapter 2 characters: Clack, Granny Spool, Pip and the town socks, Tumble; battle sprites; new bullets."""
import json, sys, math, random
sys.path.insert(0, sys.argv[2])
from grid import Grid
OUT = sys.argv[1]
BULLETS = sys.argv[3]
rnd = random.Random(7)

def save(name, doc):
    json.dump(doc, open(f"{OUT}/{name}.json", "w"), indent=1)

def faces(base_fn, eyes, mouths, extras):
    out = {}
    for name in eyes:
        g = base_fn()
        eyes[name](g); mouths[name](g)
        if name in extras: extras[name](g)
        out[name] = g.rows()
    return out

def idle_doc(size, pal, f0, f1, rate=2, pattern=None):
    frames = {"idle-0": f0, "idle-1": f1}
    return {"size": size, "palette": pal, "frames": frames,
            "animations": {"idle": {"frames": pattern or ["idle-0", "idle-1"], "rate": rate}}}

# ════════════════════════ Clack: a set of false teeth, stand-up comedian ════════════════════════
CP = {"k": "#1a1420", "g": "#e8838f", "G": "#b85566", "h": "#f6b0b8", "z": "#f7f4ea", "Z": "#cfc8b8",
      "e": "#1a1420", "w": "#ffffff", "x": "#3a1a24", "a": "#f2b24c", "A": "#b97a2a", "m": "#4b4566", "M": "#2f2a3d",
      "q": "#8c6239", "Q": "#5e3f22", "r": "#c8414b", "b": "#5d8fd6", "t": "#7fd1ff"}

def denture(g, cx, top, w, gum_h, tooth_h, gap, scale=1, eyes='open', grin=0):
    """Upper gum + teeth, a mouth gap, lower teeth + gum. Centered at cx."""
    x0 = cx - w // 2
    # upper gum (rounded)
    for y in range(gum_h):
        inset = max(0, (gum_h - y - 1) // 2) if y < 2 * scale else 0
        inset = (2 * scale - y) if y < 2 * scale else 0
        g.rect(x0 + inset, top + y, w - inset * 2, 1, 'g')
    g.rect(x0 + 2 * scale, top + scale, w // 3, scale, 'h')
    ut = top + gum_h
    tw = max(2, (w - 2 * scale) // 6)
    for i in range(6):
        tx = x0 + scale + i * tw
        g.rect(tx, ut, tw - (1 if scale == 1 else scale), tooth_h, 'z')
        g.rect(tx + tw - (1 if scale == 1 else scale), ut, 1 if scale == 1 else scale, tooth_h - scale, 'Z')
    mouth_y = ut + tooth_h
    if gap > 0:
        g.rect(x0 + 2 * scale, mouth_y, w - 4 * scale, gap, 'x')
    lt = mouth_y + gap
    for i in range(6):
        tx = x0 + scale + i * tw + grin
        g.rect(tx, lt, tw - (1 if scale == 1 else scale), tooth_h, 'z')
        g.rect(tx, lt + tooth_h - scale, tw - (1 if scale == 1 else scale), scale, 'Z')
    lg = lt + tooth_h
    for y in range(gum_h):
        inset = (y - gum_h + 2 * scale + 1) if y > gum_h - 2 * scale - 1 else 0
        g.rect(x0 + inset + grin, lg + y, w - inset * 2, 1, 'G' if y > gum_h // 2 else 'g')
    return top + scale * 2 + (gum_h // 2 - scale)  # eye row

def clack_field(open_):
    g = Grid(16, 16)
    ey = denture(g, 8, 3, 12, 3, 2, 2 if open_ else 0)
    for ex in (5, 10):
        g.set(ex, 1, 'w'); g.set(ex + 1, 1, 'w'); g.set(ex, 2, 'w'); g.set(ex + 1, 2, 'e')
    g.outline('k')
    return g.rows()
save("clack", idle_doc([16, 16], CP, clack_field(False), clack_field(True), 3, ["idle-0", "idle-0", "idle-1", "idle-0", "idle-1"]))

def clack_portrait_base(gap=4, grin=0):
    def f():
        g = Grid(48, 48)
        denture(g, 24, 14, 38, 8, 6, gap, 2, grin=grin)
        return g
    return f
def c_eyes(kind):
    def f(g):
        for cx in (15, 32):
            if kind == 'laugh':
                g.line(cx - 3, 9, cx, 6, 'e'); g.line(cx, 6, cx + 3, 9, 'e')
                g.line(cx - 3, 10, cx, 7, 'e'); g.line(cx, 7, cx + 3, 10, 'e')
            elif kind == 'sad':
                g.disc(cx, 8, 3.6, 'w'); g.rect(cx - 1, 8, 2, 3, 'e'); g.line(cx - 4, 4 + (1 if cx > 24 else 0), cx + 3, 4 + (0 if cx > 24 else 1), 'G')
            elif kind == 'smug' and cx > 24:
                g.disc(cx, 8, 3.6, 'w'); g.rect(cx - 4, 5, 8, 3, 'g'); g.rect(cx - 4, 7, 8, 1, 'G'); g.rect(cx, 8, 2, 2, 'e')
            else:
                g.disc(cx, 8, 3.6, 'w'); g.rect(cx, 7, 2, 3, 'e'); g.set(cx, 7, 'w')
            g.outline('k') if False else None
    return f
def c_none(g): pass
def c_tear(g): g.rect(33, 12, 1, 3, 't'); g.set(33, 15, 'b')
def c_sweat(g): g.set(41, 6, 't'); g.rect(41, 7, 2, 2, 't')
def clack_faces():
    out = {}
    specs = {"neutral": (4, 0, 'n', None), "laugh": (10, 0, 'laugh', None), "smug": (3, 2, 'smug', None), "sad": (0, 0, 'sad', c_tear)}
    for name, (gap, grin, eye, extra) in specs.items():
        g = clack_portrait_base(gap, grin)()
        c_eyes(eye)(g)
        if extra: extra(g)
        g.outline('k')
        out[name] = g.rows()
    return out
save("portrait-clack", {"size": [48, 48], "palette": CP, "frames": clack_faces()})

def clack_battle(gap, eye):
    g = Grid(64, 64)
    # stool
    g.rect(20, 44, 24, 4, 'q'); g.rect(20, 44, 24, 1, 'a')
    g.rect(22, 48, 3, 15, 'Q'); g.rect(39, 48, 3, 15, 'Q'); g.rect(22, 55, 20, 2, 'Q')
    # mic stand to the side
    g.rect(52, 18, 2, 44, 'm'); g.rect(48, 61, 10, 2, 'M'); g.disc(53, 15, 3.4, 'M'); g.rect(51, 13, 2, 2, 'm')
    denture(g, 30, 12 + (0 if gap else 3), 34, 7, 6, gap, 2)
    for cx in (21, 37):
        if eye == 'laugh':
            g.line(cx - 3, 8, cx, 5, 'e'); g.line(cx, 5, cx + 3, 8, 'e'); g.line(cx - 3, 9, cx, 6, 'e'); g.line(cx, 6, cx + 3, 9, 'e')
        else:
            g.disc(cx, 7, 3.4, 'w'); g.rect(cx, 6, 2, 3, 'e'); g.set(cx, 6, 'w')
    g.outline('k')
    return g.rows()
save("enemy-clack", {"size": [64, 64], "palette": CP,
    "frames": {"idle-0": clack_battle(0, 'n'), "idle-1": clack_battle(6, 'n'), "calm-0": clack_battle(10, 'laugh'), "calm-1": clack_battle(4, 'laugh')},
    "animations": {"idle": {"frames": ["idle-0", "idle-1", "idle-0", "idle-0", "idle-1"], "rate": 5},
                   "calm": {"frames": ["calm-0", "calm-1"], "rate": 4}}})

# ════════════════════════ Granny Spool: a wooden thread spool, runs the sewing shop ════════════════════════
SP = {"k": "#1a1420", "w": "#a8794a", "W": "#c99a62", "q": "#6e4a22", "a": "#e0a63a", "A": "#b0781e", "z": "#f7f4ea",
      "Z": "#cfc8b8", "e": "#1a1420", "i": "#cfd6e0", "I": "#8f88a3", "r": "#e08a7a", "g": "#6b6680", "s": "#d65a6a"}
def spool_field(bob):
    g = Grid(16, 24)
    y0 = 2 - bob
    # hair: a curl of white thread
    g.rect(6, y0, 4, 2, 'z'); g.set(5, y0 + 1, 'z'); g.set(10, y0, 'Z'); g.set(9, y0 - 1 if y0 > 0 else 0, 'z')
    g.rect(2, y0 + 2, 12, 3, 'w'); g.rect(2, y0 + 2, 12, 1, 'W'); g.rect(2, y0 + 4, 12, 1, 'q')
    g.rect(4, y0 + 5, 8, 11, 'a')
    for y in range(y0 + 6, y0 + 16, 2): g.rect(4, y, 8, 1, 'A')
    g.rect(2, y0 + 16, 12, 3, 'w'); g.rect(2, y0 + 16, 12, 1, 'W'); g.rect(2, y0 + 18, 12, 1, 'q')
    # face: round glasses and a smile
    for ex in (5, 9):
        g.frame(ex, y0 + 7, 3, 3, 'g'); g.set(ex + 1, y0 + 8, 'e')
    g.set(8, y0 + 8, 'g')
    g.rect(7, y0 + 11, 2, 1, 'e'); g.set(5, y0 + 10, 'r'); g.set(10, y0 + 10, 'r')
    # needle cane
    g.rect(14, y0 + 6, 1, 15 - y0 + bob, 'i'); g.set(14, y0 + 5, 'I'); g.set(14, y0 + 6, 'I')
    g.outline('k')
    return g.rows()
save("spool", idle_doc([16, 24], SP, spool_field(0), spool_field(1), 2, ["idle-0", "idle-0", "idle-1"]))
def spool_portrait():
    g = Grid(48, 48)
    g.rect(16, 0, 14, 4, 'z'); g.disc(22, 3, 4, 'z'); g.disc(28, 2, 3, 'Z'); g.disc(19, 2, 2.5, 'z')
    g.rect(4, 5, 40, 7, 'w'); g.rect(4, 5, 40, 2, 'W'); g.rect(4, 11, 40, 1, 'q')
    g.rect(9, 12, 30, 28, 'a')
    for y in range(13, 40, 3): g.rect(9, y, 30, 1, 'A')
    g.rect(4, 40, 40, 8, 'w'); g.rect(4, 40, 40, 2, 'W'); g.rect(4, 46, 40, 2, 'q')
    for ex in (15, 27):
        g.frame(ex, 19, 7, 7, 'g'); g.rect(ex + 1, 20, 5, 5, 'z')
    g.rect(22, 21, 5, 1, 'g')
    g.outline('k')
    return g
def sp_eyes(kind):
    def f(g):
        for ex in (15, 27):
            if kind == 'happy':
                g.line(ex + 1, 23, ex + 3, 21, 'e'); g.line(ex + 3, 21, ex + 5, 23, 'e')
            elif kind == 'worried':
                g.rect(ex + 2, 22, 2, 2, 'e'); g.line(ex, 17 + (0 if ex > 20 else 1), ex + 6, 17 + (1 if ex > 20 else 0), 'A')
            else:
                g.rect(ex + 2, 21, 2, 3, 'e')
    return f
def sp_mouth(kind):
    def f(g):
        if kind == 'worried':
            for x in range(20, 28): g.set(x, 32 - (0 if x in (20, 27) else 1), 'e')
        else:
            for x in range(19, 29): g.set(x, 31 + (0 if x in (19, 28) else 1), 'e')
        g.rect(11, 28, 3, 2, 'r'); g.rect(34, 28, 3, 2, 'r')
    return f
save("portrait-spool", {"size": [48, 48], "palette": SP, "frames": faces(spool_portrait,
    {"neutral": sp_eyes('n'), "happy": sp_eyes('happy'), "worried": sp_eyes('worried')},
    {"neutral": sp_mouth('n'), "happy": sp_mouth('n'), "worried": sp_mouth('worried')}, {})})

# ════════════════════════ Pip and the town socks ════════════════════════
def sock_pal(c, C, s):
    return {"k": "#1a1420", "c": c, "C": C, "s": s, "y": "#f7f4ea", "Y": "#cfc8b8", "e": "#1a1420", "r": "#e08a7a"}
SOCK_KINDS = {
    "pip": (sock_pal("#5d8fd6", "#3c629e", "#f7f4ea"), 'stripes'),
    "sock-mint": (sock_pal("#6fbf73", "#3f8a4a", "#f7f4ea"), 'dots'),
    "sock-plum": (sock_pal("#a77fcf", "#6f4f94", "#f2b24c"), 'heel'),
    "lonesock": (sock_pal("#c8414b", "#8a2a33", "#f7f4ea"), 'stripes'),
}
def sock_field(pattern, bob, flip=False):
    g = Grid(16, 16)
    y0 = 1 - bob
    g.rect(4, y0, 7, 3, 'y');
    for x in range(4, 11, 2): g.set(x, y0 + 1, 'Y')
    g.rect(4, y0 + 3, 7, 7, 'c'); g.rect(10, y0 + 3, 1, 7, 'C')
    g.rect(4, y0 + 10, 9, 4, 'c'); g.rect(13, y0 + 11, 1, 3, 'c'); g.rect(4, y0 + 13, 10, 1, 'C')
    if pattern == 'stripes':
        for y in (y0 + 8, y0 + 11): g.rect(4, y, 9 if y > y0 + 9 else 7, 1, 's')
    elif pattern == 'dots':
        for (x, y) in ((5, y0 + 8), (8, y0 + 9), (11, y0 + 11), (6, y0 + 11)): g.set(x, y, 's')
    else:
        g.rect(4, y0 + 10, 3, 4, 's'); g.rect(11, y0 + 11, 3, 3, 's')
    g.set(6, y0 + 5, 'e'); g.set(9, y0 + 5, 'e'); g.rect(7, y0 + 7, 2, 1, 'e'); g.set(5, y0 + 6, 'r'); g.set(10, y0 + 6, 'r')
    g.outline('k')
    rows = g.rows()
    return [r[::-1] for r in rows] if flip else rows
for name, (pal, pattern) in SOCK_KINDS.items():
    save(name, idle_doc([16, 16], pal, sock_field(pattern, 0), sock_field(pattern, 1), 2, ["idle-0", "idle-0", "idle-0", "idle-1"]))
def pip_portrait():
    g = Grid(48, 48)
    g.rect(11, 2, 22, 9, 'y')
    for x in range(12, 33, 3): g.rect(x, 3, 1, 7, 'Y')
    g.rect(11, 11, 22, 26, 'c'); g.rect(30, 11, 3, 26, 'C')
    g.rect(11, 37, 30, 11, 'c'); g.rect(41, 40, 4, 8, 'c'); g.rect(11, 46, 34, 2, 'C')
    for y in (31, 41): g.rect(11, y, 22 if y < 37 else 34, 3, 's')
    g.outline('k')
    return g
def pip_eyes(kind):
    def f(g):
        for cx in (17, 26):
            if kind == 'happy': g.line(cx - 1, 19, cx + 1, 17, 'e'); g.line(cx + 1, 17, cx + 3, 19, 'e')
            elif kind == 'sad': g.rect(cx, 18, 2, 3, 'e'); g.line(cx - 2, 15 + (1 if cx < 20 else 0), cx + 3, 15 + (0 if cx < 20 else 1), 'C')
            elif kind == 'surprised': g.rect(cx - 1, 16, 3, 4, 'e'); g.set(cx - 1, 16, 'y')
            else: g.rect(cx, 17, 2, 3, 'e')
    return f
def pip_mouth(kind):
    def f(g):
        if kind == 'happy':
            for x in range(18, 26): g.set(x, 24 + (0 if x in (18, 25) else 1), 'e')
        elif kind == 'sad':
            for x in range(19, 25): g.set(x, 25 - (0 if x in (19, 24) else 1), 'e')
        elif kind == 'surprised': g.ring(21.5, 25, 1.8, 'e')
        else: g.rect(20, 24, 4, 1, 'e')
        g.rect(13, 22, 3, 1, 'r'); g.rect(28, 22, 3, 1, 'r')
    return f
save("portrait-pip", {"size": [48, 48], "palette": SOCK_KINDS["pip"][0], "frames": faces(pip_portrait,
    {"neutral": pip_eyes('n'), "happy": pip_eyes('happy'), "sad": pip_eyes('sad'), "surprised": pip_eyes('surprised')},
    {"neutral": pip_mouth('n'), "happy": pip_mouth('happy'), "sad": pip_mouth('sad'), "surprised": pip_mouth('surprised')}, {})})

# ════════════════════════ Tumble: the old dryer everyone blames ════════════════════════
TPAL = {"k": "#1a1420", "i": "#cfd6e0", "I": "#8f88a3", "h": "#eef2f6", "J": "#6b6680", "j": "#241d2c", "x": "#0f0d14",
        "w": "#ffd27a", "W": "#f2b24c", "l": "#fff1c4", "r": "#e8504f", "R": "#8a2a33", "M": "#2f2a3d", "m": "#4b4566",
        "n": "#b8b2c8", "z": "#f7f4ea", "b": "#5d8fd6", "u": "#6fbf73", "a": "#e0a63a", "f": "#a77fcf", "e": "#1a1420"}
def tumble_field(f):
    g = Grid(32, 32)
    dx = 1 if f else 0
    g.rect(3 + dx, 3, 26, 25, 'i'); g.rect(26 + dx, 3, 3, 25, 'I'); g.rect(3 + dx, 3, 26, 1, 'h')
    g.rect(3 + dx, 4, 26, 5, 'I'); g.rect(6 + dx, 6, 6, 1, 'J'); g.disc(22 + dx, 6, 1.5, 'J'); g.set(25 + dx, 6, 'W')
    g.disc(15.5 + dx, 18, 8, 'J'); g.disc(15.5 + dx, 18, 6.5, 'j')
    ex = 0 if not f else 1
    for x in (12, 18):
        g.rect(x + dx + ex, 16, 2, 3, 'w'); g.set(x + dx + ex, 16, 'l')
    g.set(11 + dx, 13, 'n'); g.set(12 + dx, 13, 'n')
    g.rect(5 + dx, 28, 3, 3, 'M'); g.rect(24 + dx, 28, 3, 3, 'M')
    g.outline('k')
    return g.rows()
save("tumble", idle_doc([32, 32], TPAL, tumble_field(0), tumble_field(1), 4, ["idle-0", "idle-1", "idle-0", "idle-0"]))
def tumble_portrait():
    g = Grid(48, 48)
    g.rect(0, 0, 48, 48, 'i'); g.rect(0, 0, 48, 2, 'h'); g.rect(44, 0, 4, 48, 'I')
    g.disc(23.5, 25, 20, 'J'); g.disc(23.5, 25, 17, 'j')
    g.set(13, 13, 'n'); g.set(14, 12, 'n'); g.set(15, 12, 'n')
    return g
def t_eyes(kind):
    def f(g):
        for cx in (17, 30):
            if kind == 'happy':
                g.line(cx - 3, 25, cx, 22, 'w'); g.line(cx, 22, cx + 3, 25, 'w'); g.line(cx - 3, 26, cx, 23, 'W'); g.line(cx, 23, cx + 3, 26, 'W')
            elif kind == 'sad':
                g.rect(cx - 2, 23, 4, 5, 'w'); g.rect(cx - 2, 23, 4, 1, 'W'); g.line(cx - 4, 20 + (1 if cx < 24 else 0), cx + 3, 20 + (0 if cx < 24 else 1), 'J')
            elif kind == 'angry':
                g.rect(cx - 2, 22, 5, 5, 'r'); g.rect(cx - 1, 23, 3, 3, 'w'); g.line(cx - 4, 18 + (0 if cx < 24 else 2), cx + 3, 18 + (2 if cx < 24 else 0), 'r')
            else:
                g.rect(cx - 2, 21, 4, 6, 'w'); g.rect(cx - 1, 21, 2, 1, 'l')
    return f
def t_mouth(kind):
    def f(g):
        if kind == 'happy':
            for x in range(19, 29): g.set(x, 33 + (0 if x in (19, 28) else 1), 'W')
        elif kind in ('sad',):
            for x in range(20, 28): g.set(x, 35 - (0 if x in (20, 27) else 1), 'W')
        elif kind == 'angry': g.rect(19, 34, 10, 1, 'r')
        else: g.rect(21, 34, 6, 1, 'W')
    return f
save("portrait-tumble", {"size": [48, 48], "palette": TPAL, "frames": faces(tumble_portrait,
    {"neutral": t_eyes('n'), "sad": t_eyes('sad'), "happy": t_eyes('happy'), "angry": t_eyes('angry')},
    {"neutral": t_mouth('n'), "sad": t_mouth('sad'), "happy": t_mouth('happy'), "angry": t_mouth('angry')}, {})})

def tumble_battle(mode, f):
    g = Grid(80, 80)
    sh = (1 if f else -1) if mode == 'spin' else 0
    g.rect(8 + sh, 6, 64, 66, 'i'); g.rect(66 + sh, 6, 6, 66, 'I'); g.rect(8 + sh, 6, 64, 2, 'h')
    g.rect(8 + sh, 8, 64, 12, 'I'); g.rect(13 + sh, 12, 18, 3, 'J'); g.disc(52 + sh, 13, 3.4, 'J'); g.rect(51 + sh, 10, 2, 3, 'm')
    g.rect(60 + sh, 12, 4, 3, 'W' if mode != 'calm' else 'w')
    cx, cy = 39.5 + sh, 46
    if mode == 'calm':
        # door swung open on its hinge (left): warm light inside
        g.disc(cx, cy, 22, 'J'); g.disc(cx, cy, 19, 'W'); g.disc(cx, cy, 15, 'w'); g.disc(cx - 4, cy - 5, 6, 'l')
        g.rect(2, 30, 10, 32, 'J'); g.rect(3, 32, 8, 28, 'b'); g.rect(3, 32, 2, 28, 'z')
        for (x, y, c) in ((30, 52, 'u'), (44, 54, 'f'), (38, 58, 'a')): g.rect(x, y, 6, 3, c); g.rect(x, y, 2, 3, 'z')
        for ex in (32, 47):
            g.line(ex - 3, 42, ex, 39, 'x'); g.line(ex, 39, ex + 3, 42, 'x')
        for x in range(35, 45): g.set(x, 47 + (0 if x in (35, 44) else 1), 'x')
    else:
        g.disc(cx, cy, 22, 'J'); g.disc(cx, cy, 19, 'j'); g.ring(cx, cy, 19.5, 'm')
        # tumbling socks inside: positions rotate with the frame
        ang0 = (0.6 if f else 0) + (0.3 if mode == 'spin' else 0)
        for i, c in enumerate(('u', 'f', 'r', 'b')):
            a = ang0 + i * math.pi / 2
            sx, sy = int(cx + math.cos(a) * 11), int(cy + math.sin(a) * 11)
            g.rect(sx - 2, sy - 1, 5, 3, c); g.set(sx - 2, sy - 1, 'z')
        if mode == 'spin':
            for r_ in (8, 14):
                for t in range(0, 360, 12):
                    a = math.radians(t + (20 if f else 0))
                    if (t // 12) % 3 == 0: g.set(int(cx + math.cos(a) * r_), int(cy + math.sin(a) * r_), 'n')
            for (x, y) in ((4, 4 + f), (74, 2 + f), (6, 22 - f)):
                g.disc(x, y, 2.5, 'z'); g.disc(x + 2, y - 1, 2, 'n')
        eye = 'r' if mode == 'spin' else 'w'
        for ex in (31, 48):
            g.rect(ex - 4, 37, 8, 9, 'x'); g.rect(ex - 3, 38, 6, 7, eye); g.rect(ex - 2, 39, 3, 2, 'l' if mode != 'spin' else 'w')
            if mode == 'spin': g.line(ex - 5, 34 + (0 if ex < 40 else 2), ex + 4, 34 + (2 if ex < 40 else 0), 'r')
    g.rect(12 + sh, 72, 8, 6, 'M'); g.rect(60 + sh, 72, 8, 6, 'M')
    g.outline('k')
    return g.rows()
save("enemy-tumble", {"size": [80, 80], "palette": TPAL,
    "frames": {"idle-0": tumble_battle('idle', 0), "idle-1": tumble_battle('idle', 1),
               "spin-0": tumble_battle('spin', 0), "spin-1": tumble_battle('spin', 1), "calm-0": tumble_battle('calm', 0)},
    "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 3}, "phase1": {"frames": ["spin-0", "spin-1"], "rate": 8},
                   "calm": {"frames": ["calm-0"], "rate": 1}}})

# ════════════════════════ Chapter 2 enemies (48x48) ════════════════════════
EP = {"k": "#1a1420", "p": "#a8794a", "P": "#c99a62", "q": "#6e4a22", "i": "#cfd6e0", "I": "#8f88a3", "J": "#6b6680",
      "e": "#1a1420", "w": "#ffffff", "r": "#e08a7a", "R": "#c8414b", "z": "#f7f4ea", "n": "#b8b2c8", "N": "#8f88a3",
      "h": "#e8e2d0", "b": "#5d8fd6", "a": "#f2b24c", "x": "#3a1a24", "t": "#7fd1ff"}
def clothespin(f, calm):
    g = Grid(48, 48)
    o = 0 if calm else (3 if f else 0)
    # two chunky prongs, hinged at the spring; the jaws open at the top
    g.rect(14 - o, 3, 9, 40, 'p'); g.rect(14 - o, 3, 3, 40, 'P')
    g.rect(25 + o, 3, 9, 40, 'p'); g.rect(31 + o, 3, 3, 40, 'q')
    g.rect(12, 21, 24, 7, 'J')
    for x in range(13, 35, 3): g.rect(x, 21, 1, 7, 'i')
    ey = 10
    for ex in (17 - o, 28 + o):
        if calm:
            g.line(ex - 1, ey + 2, ex + 1, ey, 'e'); g.line(ex + 1, ey, ex + 3, ey + 2, 'e')
        else:
            g.rect(ex, ey - 1, 3, 4, 'w'); g.rect(ex + 1, ey, 2, 3, 'e')
    if calm:
        for x in range(19, 30): g.set(x, 16 + (0 if x in (19, 29) else 1), 'e')
        g.rect(15, 15, 3, 1, 'r'); g.rect(31, 15, 3, 1, 'r')
        g.rect(19, 39, 11, 7, 'b'); g.rect(19, 39, 11, 1, 'z'); g.rect(27, 43, 6, 4, 'b')
    else:
        g.line(15 - o, 6, 21 - o, 8, 'e'); g.line(33 + o, 6, 27 + o, 8, 'e')
        g.rect(17 - o, 16, 5, 1, 'e'); g.rect(27 + o, 16, 5, 1, 'e')
    g.outline('k')
    return g.rows()
save("enemy-clothespin", {"size": [48, 48], "palette": EP,
    "frames": {"idle-0": clothespin(0, False), "idle-1": clothespin(1, False), "calm-0": clothespin(0, True), "calm-1": {"from": "calm-0", "shift": [0, -1]}},
    "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 4}, "calm": {"frames": ["calm-0", "calm-1"], "rate": 2}}})
def hanger(f, calm):
    g = Grid(48, 48)
    # hook
    g.ring(24, 9, 5, 'i'); g.rect(24, 4, 6, 6, '.'); g.rect(23, 13, 2, 5, 'i')
    if calm:
        g.line(23, 18, 5, 34, 'i'); g.line(25, 18, 43, 34, 'i'); g.line(5, 35, 43, 35, 'i')
        g.line(23, 19, 6, 34, 'I'); g.line(5, 36, 43, 36, 'I')
    else:
        k = 2 if f else 0
        pts = [(23, 18), (14, 22 + k), (17, 27), (6, 33 - k), (20, 37), (27, 31 + k), (31, 39), (43, 33), (34, 26 - k), (25, 18)]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            g.line(x0, y0, x1, y1, 'i'); g.line(x0, y0 + 1, x1, y1 + 1, 'I')
    # paper tag face hanging from the hook
    g.rect(29, 14, 10, 8, 'h'); g.rect(29, 14, 10, 1, 'z'); g.line(25, 13, 29, 15, 'N')
    if calm:
        g.line(31, 18, 32, 17, 'e'); g.line(32, 17, 33, 18, 'e'); g.line(35, 18, 36, 17, 'e'); g.line(36, 17, 37, 18, 'e'); g.rect(33, 20, 3, 1, 'e')
    else:
        g.rect(31, 16, 2, 2, 'e'); g.rect(35, 16 + (1 if f else 0), 2, 2, 'e'); g.line(32, 20, 36, 19, 'e')
    g.outline('k')
    return g.rows()
save("enemy-hanger", {"size": [48, 48], "palette": EP,
    "frames": {"idle-0": hanger(0, False), "idle-1": hanger(1, False), "calm-0": hanger(0, True), "calm-1": {"from": "calm-0", "shift": [0, -1]}},
    "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 3}, "calm": {"frames": ["calm-0", "calm-1"], "rate": 2}}})
def lint(f, calm):
    g = Grid(48, 48)
    r = random.Random(5 + f)
    base = 13 if not calm else 14
    g.disc(24, 28, base, 'n')
    for i in range(22):
        a = i / 22 * math.pi * 2
        rr = base + (r.random() * 3 if not calm else 1.2)
        g.disc(24 + math.cos(a) * rr * 0.92, 28 + math.sin(a) * rr * 0.85, 2.4, 'n')
    for _ in range(14):
        x, y = r.randrange(14, 34), r.randrange(18, 38)
        if g.get(x, y) == 'n': g.set(x, y, 'z' if r.random() < 0.5 else 'N')
    g.disc(19, 21, 3, 'z')
    if calm:
        for ex in (19, 29): g.line(ex - 2, 28, ex, 26, 'e'); g.line(ex, 26, ex + 2, 28, 'e')
        g.rect(15, 31, 3, 1, 'r'); g.rect(30, 31, 3, 1, 'r'); g.rect(23, 32, 3, 1, 'e')
    else:
        for ex in (19, 29): g.rect(ex - 1, 26 + (1 if f and ex > 24 else 0), 2, 3, 'e')
        g.rect(23, 33, 2, 2, 'x')
    g.outline('k')
    return g.rows()
save("enemy-lint", {"size": [48, 48], "palette": EP,
    "frames": {"idle-0": lint(0, False), "idle-1": lint(1, False), "calm-0": lint(0, True), "calm-1": {"from": "calm-0", "shift": [0, -1]}},
    "animations": {"idle": {"frames": ["idle-0", "idle-1"], "rate": 4}, "calm": {"frames": ["calm-0", "calm-1"], "rate": 2}}})

# ════════════════════════ new bullet frames (appended to bullets.json) ════════════════════════
bd = json.load(open(BULLETS))
NEW = {
    "kk": ["........", ".wwwww..", ".....w..", ".wwwww..", ".....w..", ".....w..", "........", "........"],
    "hh": ["...w....", ".wwwww..", "........", "..www...", ".w...w..", "..www...", "........", "........"],
    "pin": ["...qq...", "...qq...", "..qggq..", "...qq...", "...qq...", "...qq...", "...qq...", "........"],
    "hook": ["...ww...", "..w..w..", ".....w..", "....w...", "...w.w..", "..w...w.", ".wwwwwww", "........"],
    "sock": ["..ppp...", "..rrr...", "..ppp...", "..rrrr..", "..ppppp.", "...rrr..", "........", "........"],
    "steam": ["........", "..ww....", ".wpppw..", "wppgppw.", ".wpppw..", "..www...", "........", "........"],
}
for k, rows in NEW.items(): bd["frames"][k] = rows
json.dump(bd, open(f"{OUT}/bullets.json", "w"), indent=1)
print("ok")
