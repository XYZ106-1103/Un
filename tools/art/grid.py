import math
class Grid:
    def __init__(self, w, h, fill='.'):
        self.w, self.h = w, h
        self.c = [[fill]*w for _ in range(h)]
    def copy(self):
        g = Grid(self.w, self.h); g.c = [r[:] for r in self.c]; return g
    def set(self, x, y, s):
        if 0 <= x < self.w and 0 <= y < self.h: self.c[y][x] = s
    def get(self, x, y):
        return self.c[y][x] if 0 <= x < self.w and 0 <= y < self.h else '.'
    def rect(self, x, y, w, h, s):
        for yy in range(y, y+h):
            for xx in range(x, x+w): self.set(xx, yy, s)
    def frame(self, x, y, w, h, s):
        for xx in range(x, x+w): self.set(xx, y, s); self.set(xx, y+h-1, s)
        for yy in range(y, y+h): self.set(x, yy, s); self.set(x+w-1, yy, s)
    def disc(self, cx, cy, r, s):
        for y in range(int(cy-r-1), int(cy+r+2)):
            for x in range(int(cx-r-1), int(cx+r+2)):
                if (x-cx)**2 + (y-cy)**2 <= r*r: self.set(x, y, s)
    def ring(self, cx, cy, r, s, inner=None):
        for y in range(int(cy-r-1), int(cy+r+2)):
            for x in range(int(cx-r-1), int(cx+r+2)):
                d = (x-cx)**2 + (y-cy)**2
                if d <= r*r and d > (r-1.1)**2: self.set(x, y, s)
    def line(self, x0, y0, x1, y1, s):
        dx, dy = abs(x1-x0), -abs(y1-y0); sx = 1 if x0 < x1 else -1; sy = 1 if y0 < y1 else -1; err = dx+dy
        while True:
            self.set(x0, y0, s)
            if x0 == x1 and y0 == y1: break
            e2 = 2*err
            if e2 >= dy: err += dy; x0 += sx
            if e2 <= dx: err += dx; y0 += sy
    def stamp(self, x, y, rows):
        for yy, row in enumerate(rows):
            for xx, ch in enumerate(row):
                if ch != '.': self.set(x+xx, y+yy, ch)
    def outline(self, s='k', bg='.'):
        """Adds a 1px outline around non-background pixels."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.c[y][x] != bg: continue
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    v = self.get(x+dx, y+dy)
                    if v != bg and v != s:
                        add.append((x, y)); break
        for x, y in add: self.c[y][x] = s
    def rows(self):
        return [''.join(r) for r in self.c]
