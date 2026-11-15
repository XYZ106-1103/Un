"""Render pixel-art JSON docs (raw-row frames, plus from/shift/mirror derivations) to a PNG sheet."""
import json, sys
from PIL import Image

def resolve(doc, name, seen=None):
    f = doc["frames"][name]
    if isinstance(f, list):
        return f
    if "mirror" in f:
        return [r[::-1] for r in resolve(doc, f["mirror"])]
    if "from" in f:
        rows = resolve(doc, f["from"])
        dx, dy = f.get("shift", [0, 0])
        w, h = doc["size"]
        out = [["."] * w for _ in range(h)]
        for y, r in enumerate(rows):
            for x, c in enumerate(r):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    out[ny][nx] = c
        rows = ["".join(r) for r in out]
        if "palette" in f:
            rows = ["".join(f["palette"].get(c, c) for c in r) for r in rows]
        return rows
    raise ValueError(name)

def sheet(paths, out, scale=3, bg=(40, 36, 52)):
    blocks = []
    for p in paths:
        doc = json.load(open(p))
        w, h = doc["size"]
        names = list(doc["frames"].keys())
        blocks.append((doc, w, h, names))
    cols = 8
    widths, heights = [], []
    for doc, w, h, names in blocks:
        n = len(names)
        widths.append(min(cols, n) * (w + 2))
        heights.append(((n + cols - 1) // cols) * (h + 2))
    W = max(widths) * scale
    H = sum(heights) * scale + 4 * len(blocks)
    img = Image.new("RGB", (W, H), bg)
    y0 = 0
    for (doc, w, h, names), bh in zip(blocks, heights):
        pal = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in doc["palette"].items()}
        for i, n in enumerate(names):
            rows = resolve(doc, n)
            ox = (i % cols) * (w + 2)
            oy = (i // cols) * (h + 2)
            for y, r in enumerate(rows):
                for x, c in enumerate(r):
                    if c == "." or c not in pal:
                        continue
                    for sy in range(scale):
                        for sx in range(scale):
                            img.putpixel(((ox + x) * scale + sx, y0 + (oy + y) * scale + sy), pal[c])
        y0 += bh * scale + 4
    img.save(out)

if __name__ == "__main__":
    sheet(sys.argv[2:], sys.argv[1], scale=int(__import__("os").environ.get("SCALE", "3")))
