/**
 * Pixel-art source format (src/data/art/*.json) and its resolver.
 *
 * Art is authored as palette-indexed text rows, which keeps every pixel reviewable in
 * a diff. A document holds frames of one size; frames can be derived from others:
 *
 *   "frames": {
 *     "down-0": ["....kkkk....", ...],                 explicit rows
 *     "down-1": { "from": "down-0", "parts": ["step-l"] }, copy + overlay parts
 *     "left-0": { "mirror": "right-0", "palette": { "n": "mitten" } },  flip + recolour
 *     "bob":    { "from": "idle", "shift": [0, -1] }    translate
 *   }
 *   "parts": { "step-l": { "at": [3, 21], "rows": ["kbb", ".kk"] } }   '.' = untouched
 *
 * Palette values are PALETTE names (src/game/Constants.ts) or "#rrggbb".
 * The resolver is pure so art documents are validated by unit tests.
 */

import { PALETTE, type PaletteColor } from '@/game/Constants';

export interface PartDef {
  at: [number, number];
  rows: string[];
}

export interface DerivedFrame {
  rows?: string[];
  from?: string;
  mirror?: string;
  parts?: string[];
  palette?: Record<string, string>;
  shift?: [number, number];
}

export type FrameDef = string[] | DerivedFrame;

export interface AnimationDef {
  frames: string[];
  rate: number;
  repeat?: number;
}

export interface PixelArtDoc {
  size: [number, number];
  palette: Record<string, string>;
  frames: Record<string, FrameDef>;
  parts?: Record<string, PartDef>;
  animations?: Record<string, AnimationDef>;
  /** Default display origin in pixels (e.g. feet position). */
  origin?: [number, number];
}

/** Resolved frame: row-major colours, null = transparent. */
export interface ResolvedFrame {
  name: string;
  pixels: (number | null)[];
}

export function parseColor(value: string): number | null {
  if (value in PALETTE) return PALETTE[value as PaletteColor];
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return Number.parseInt(value.slice(1), 16);
  return null;
}

type SymbolGrid = string[]; // one char per pixel, row-major

export class PixelArtError extends Error {}

export function resolvePixelArt(doc: PixelArtDoc, label = 'art'): ResolvedFrame[] {
  const [w, h] = doc.size;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) throw new PixelArtError(`${label}: bad size`);
  const basePalette = new Map<string, number | null>();
  for (const [symbol, value] of Object.entries(doc.palette)) {
    if ([...symbol].length !== 1 || symbol === '.') throw new PixelArtError(`${label}: bad palette symbol "${symbol}"`);
    const color = parseColor(value);
    if (color === null) throw new PixelArtError(`${label}: bad colour "${value}" for "${symbol}"`);
    basePalette.set(symbol, color);
  }

  const gridCache = new Map<string, SymbolGrid>();
  const paletteCache = new Map<string, Map<string, number | null>>();
  const visiting = new Set<string>();

  const rowsToGrid = (rows: string[], where: string): SymbolGrid => {
    if (rows.length !== h) throw new PixelArtError(`${label}/${where}: expected ${h} rows, got ${rows.length}`);
    const grid: SymbolGrid = [];
    rows.forEach((row, y) => {
      const chars = [...row];
      if (chars.length !== w) throw new PixelArtError(`${label}/${where}: row ${y} has ${chars.length} px, expected ${w}`);
      grid.push(...chars);
    });
    return grid;
  };

  const resolveFrame = (name: string): { grid: SymbolGrid; palette: Map<string, number | null> } => {
    const cachedGrid = gridCache.get(name);
    const cachedPalette = paletteCache.get(name);
    if (cachedGrid && cachedPalette) return { grid: cachedGrid, palette: cachedPalette };
    const def = doc.frames[name];
    if (!def) throw new PixelArtError(`${label}: unknown frame "${name}"`);
    if (visiting.has(name)) throw new PixelArtError(`${label}: frame "${name}" derives from itself`);
    visiting.add(name);

    let grid: SymbolGrid;
    let palette = basePalette;
    if (Array.isArray(def)) {
      grid = rowsToGrid(def, name);
    } else {
      if (def.rows) grid = rowsToGrid(def.rows, name);
      else if (def.from) {
        const base = resolveFrame(def.from);
        grid = [...base.grid];
        palette = base.palette;
      } else if (def.mirror) {
        const base = resolveFrame(def.mirror);
        grid = [];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) grid.push(base.grid[y * w + (w - 1 - x)] as string);
        }
        palette = base.palette;
      } else {
        throw new PixelArtError(`${label}/${name}: needs rows, from or mirror`);
      }
      if (def.shift) {
        const [dx, dy] = def.shift;
        const shifted: SymbolGrid = new Array(w * h).fill('.');
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const sx = x - dx;
            const sy = y - dy;
            if (sx >= 0 && sx < w && sy >= 0 && sy < h) shifted[y * w + x] = grid[sy * w + sx] as string;
          }
        }
        grid = shifted;
      }
      for (const partName of def.parts ?? []) {
        const part = doc.parts?.[partName];
        if (!part) throw new PixelArtError(`${label}/${name}: unknown part "${partName}"`);
        part.rows.forEach((row, py) => {
          [...row].forEach((ch, px) => {
            if (ch === '.') return;
            const x = part.at[0] + px;
            const y = part.at[1] + py;
            if (x < 0 || x >= w || y < 0 || y >= h) throw new PixelArtError(`${label}/${partName}: outside frame`);
            grid[y * w + x] = ch;
          });
        });
      }
      if (def.palette) {
        palette = new Map(palette);
        for (const [symbol, value] of Object.entries(def.palette)) {
          const color = value === 'none' ? null : parseColor(value);
          if (color === null && value !== 'none') throw new PixelArtError(`${label}/${name}: bad colour "${value}"`);
          palette.set(symbol, color);
        }
      }
    }
    visiting.delete(name);
    gridCache.set(name, grid);
    paletteCache.set(name, palette);
    return { grid, palette };
  };

  // Parts may use a ' ' (space) as "erase to transparent".
  return Object.keys(doc.frames).map((name) => {
    const { grid, palette } = resolveFrame(name);
    const pixels = grid.map((symbol, i) => {
      if (symbol === '.' || symbol === ' ') return null;
      if (!palette.has(symbol)) throw new PixelArtError(`${label}/${name}: symbol "${symbol}" at ${i % w},${Math.floor(i / w)} not in palette`);
      return palette.get(symbol) ?? null;
    });
    return { name, pixels };
  });
}

export function validateAnimations(doc: PixelArtDoc, label = 'art'): void {
  for (const [anim, def] of Object.entries(doc.animations ?? {})) {
    if (!Array.isArray(def.frames) || def.frames.length === 0) throw new PixelArtError(`${label}: animation "${anim}" has no frames`);
    for (const f of def.frames) {
      if (!(f in doc.frames)) throw new PixelArtError(`${label}: animation "${anim}" uses unknown frame "${f}"`);
    }
    if (!(def.rate > 0)) throw new PixelArtError(`${label}: animation "${anim}" needs a positive rate`);
  }
}
