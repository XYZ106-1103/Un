/**
 * Typed access to src/data/assets/manifest.json and validation of its entries.
 *
 * The manifest makes art status explicit: anything marked `placeholder` is drawn as an
 * obvious stand-in and is listed by the debug overlay and `npm run assets:report`, so
 * temporary art can never quietly ship as if it were finished.
 */

import manifestJson from '@/data/assets/manifest.json';
import { PALETTE, type PaletteColor } from '@/game/Constants';

export type AssetStatus = 'placeholder' | 'wip' | 'final';
export type AssetKind = 'image' | 'spritesheet' | 'pixels';

interface BaseEntry {
  key: string;
  status: AssetStatus;
  usage: string;
  brief: string;
}

export interface ImageEntry extends BaseEntry {
  kind: 'image';
  size: [number, number];
  file: string | null;
}

export interface SpritesheetEntry extends BaseEntry {
  kind: 'spritesheet';
  /** Frame size. */
  size: [number, number];
  frames: number;
  file: string | null;
}

export interface PixelsEntry extends BaseEntry {
  kind: 'pixels';
  palette: Record<string, PaletteColor>;
  rows: string[];
}

export type AssetEntry = ImageEntry | SpritesheetEntry | PixelsEntry;

export function validateEntry(raw: unknown): { ok: true; entry: AssetEntry } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'not an object' };
  const e = raw as Record<string, unknown>;
  const key = typeof e.key === 'string' ? e.key : '(no key)';
  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason: `${key}: ${reason}` });

  if (typeof e.key !== 'string' || e.key.length === 0) return fail('missing key');
  if (e.status !== 'placeholder' && e.status !== 'wip' && e.status !== 'final') return fail('bad status');
  if (e.kind === 'pixels') {
    if (!Array.isArray(e.rows) || e.rows.length === 0) return fail('pixels need rows');
    const width = (e.rows[0] as string).length;
    if (!e.rows.every((r) => typeof r === 'string' && r.length === width)) return fail('rows must share one width');
    const palette = (e.palette ?? {}) as Record<string, string>;
    for (const [symbol, color] of Object.entries(palette)) {
      if (symbol.length !== 1) return fail(`palette symbol "${symbol}" must be one character`);
      if (!(color in PALETTE)) return fail(`unknown palette colour "${color}"`);
    }
    for (const row of e.rows as string[]) {
      for (const ch of row) if (ch !== '.' && !(ch in palette)) return fail(`symbol "${ch}" not in palette`);
    }
  } else if (e.kind === 'image' || e.kind === 'spritesheet') {
    const size = e.size;
    if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => Number.isInteger(n) && n > 0)) {
      return fail('size must be [w, h]');
    }
    if (e.file !== null && typeof e.file !== 'string') return fail('file must be a path or null');
    if (e.file === null && e.status !== 'placeholder') return fail('only placeholders may omit a file');
    if (e.kind === 'spritesheet' && !(Number.isInteger(e.frames) && (e.frames as number) > 0)) {
      return fail('spritesheet needs frames');
    }
  } else {
    return fail(`unknown kind "${String(e.kind)}"`);
  }
  return { ok: true, entry: raw as AssetEntry };
}

function loadManifest(): AssetEntry[] {
  const entries: AssetEntry[] = [];
  const seen = new Set<string>();
  for (const raw of manifestJson.assets as unknown[]) {
    const result = validateEntry(raw);
    if (!result.ok) {
      // A broken entry is a content bug: report loudly, skip it, keep the game running.
      console.error(`[AssetManifest] invalid entry - ${result.reason}`);
      continue;
    }
    if (seen.has(result.entry.key)) {
      console.error(`[AssetManifest] duplicate key "${result.entry.key}"`);
      continue;
    }
    seen.add(result.entry.key);
    entries.push(result.entry);
  }
  return entries;
}

export const ASSETS: readonly AssetEntry[] = loadManifest();

export function getAsset(key: string): AssetEntry | undefined {
  return ASSETS.find((a) => a.key === key);
}

export function placeholderAssets(): AssetEntry[] {
  return ASSETS.filter((a) => a.status === 'placeholder');
}
