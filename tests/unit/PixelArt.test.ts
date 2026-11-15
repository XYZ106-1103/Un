import { describe, expect, it } from 'vitest';
import { PALETTE } from '@/game/Constants';
import { resolvePixelArt, type PixelArtDoc } from '@/systems/assets/PixelArt';

const doc: PixelArtDoc = {
  size: [3, 2],
  palette: { a: 'ink', b: '#ff0000', n: 'white' },
  frames: {
    base: ['ab.', 'n..'],
    mirrored: { mirror: 'base' },
    recoloured: { from: 'base', palette: { n: '#00ff00' } },
    shifted: { from: 'base', shift: [1, 0] },
    patched: { from: 'base', parts: ['dot'] },
  },
  parts: { dot: { at: [2, 1], rows: ['b'] } },
};

describe('PixelArt', () => {
  it('resolves explicit, mirrored, recoloured, shifted and patched frames', () => {
    const frames = Object.fromEntries(resolvePixelArt(doc).map((f) => [f.name, f.pixels]));
    expect(frames.base).toEqual([PALETTE.ink, 0xff0000, null, PALETTE.white, null, null]);
    expect(frames.mirrored).toEqual([null, 0xff0000, PALETTE.ink, null, null, PALETTE.white]);
    expect(frames.recoloured?.[3]).toBe(0x00ff00);
    expect(frames.shifted).toEqual([null, PALETTE.ink, 0xff0000, null, PALETTE.white, null]);
    expect(frames.patched?.[5]).toBe(0xff0000);
  });

  it('reports bad rows, symbols and cycles', () => {
    expect(() => resolvePixelArt({ ...doc, frames: { a: ['ab', 'n..'] } })).toThrow(/row 0/);
    expect(() => resolvePixelArt({ ...doc, frames: { a: ['abz', 'n..'] } })).toThrow(/symbol "z"/);
    expect(() => resolvePixelArt({ ...doc, frames: { a: { from: 'b' }, b: { from: 'a' } } })).toThrow(/itself/);
  });
});
