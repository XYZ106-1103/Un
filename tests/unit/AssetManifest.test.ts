import { describe, expect, it } from 'vitest';
import manifest from '@/data/assets/manifest.json';
import { ASSETS, validateEntry } from '@/systems/assets/AssetManifest';

describe('asset manifest', () => {
  it('every entry in the shipped manifest is valid and unique', () => {
    for (const raw of manifest.assets) {
      const result = validateEntry(raw);
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    }
    expect(ASSETS.length).toBe(manifest.assets.length);
    expect(new Set(ASSETS.map((a) => a.key)).size).toBe(ASSETS.length);
  });

  it('rejects broken entries with a reason', () => {
    expect(validateEntry({ key: 'a', kind: 'pixels', status: 'wip', palette: { o: 'tag' }, rows: ['oo', 'o'] })).toMatchObject({
      ok: false,
    });
    expect(validateEntry({ key: 'a', kind: 'pixels', status: 'wip', palette: { o: 'notacolour' }, rows: ['o'] })).toMatchObject({
      ok: false,
    });
    expect(validateEntry({ key: 'a', kind: 'image', status: 'final', size: [8, 8], file: null })).toMatchObject({
      ok: false,
      reason: 'a: only placeholders may omit a file',
    });
    expect(validateEntry({ key: 'a', kind: 'video', status: 'wip' })).toMatchObject({ ok: false });
  });
});
