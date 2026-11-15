import { describe, expect, it, vi } from 'vitest';
import {
  applyFlagChanges,
  createNewGameState,
  normalizeName,
  stateResolver,
  validateGameState,
} from '@/game/GameState';
import { SaveSystem } from '@/systems/SaveSystem';
import { SafeStorage } from '@/systems/storage/SafeStorage';

const fresh = () => createNewGameState({ name: '하늘', map: 'chute', x: 3, y: 4, facing: 'down', items: ['left-mitten'] });

describe('GameState', () => {
  it('new state validates and resolves condition keys', () => {
    const s = fresh();
    expect(validateGameState(s).ok).toBe(true);
    s.flags.met = true;
    s.relations.mitt = 2;
    s.encounters.earbuds = { met: 1, spared: 1, cleared: 0 };
    const r = stateResolver(s, (k) => (k === 'turn' ? 5 : undefined));
    expect(r('flag:met')).toBe(true);
    expect(r('item:left-mitten')).toBe(true);
    expect(r('item:nope')).toBe(false);
    expect(r('rel:mitt')).toBe(2);
    expect(r('spared:earbuds')).toBe(1);
    expect(r('cleared:earbuds')).toBe(0);
    expect(r('hp')).toBe(20);
    expect(r('turn')).toBe(5);
  });

  it('rejects malformed states with a reason', () => {
    const s = fresh() as unknown as Record<string, unknown>;
    expect(validateGameState({ ...s, hp: 'lots' })).toMatchObject({ ok: false, reason: 'hp' });
    expect(validateGameState({ ...s, inventory: new Array(9).fill('x') })).toMatchObject({ ok: false, reason: 'inventory' });
    expect(validateGameState({ ...s, location: { map: 'a', x: 1, y: 1, facing: 'sideways' } })).toMatchObject({ ok: false });
    expect(validateGameState(null)).toMatchObject({ ok: false });
  });

  it('flag changes: assignment and increments', () => {
    const flags: Record<string, boolean | number | string> = { n: 2 };
    applyFlagChanges(flags, { n: '+3', m: '-1', b: true, s: 'text' });
    expect(flags).toEqual({ n: 5, m: -1, b: true, s: 'text' });
  });

  it('normalizes names by code point', () => {
    expect(normalizeName('  가나다라마바사아자차  ')).toBe('가나다라마바사아');
    expect(normalizeName('a   b')).toBe('a b');
  });
});

describe('SaveSystem', () => {
  const setup = () => {
    const storage = new SafeStorage('t:', null);
    return { storage, saves: new SaveSystem(storage) };
  };

  it('saves, summarises and loads a slot', () => {
    const { saves } = setup();
    expect(saves.hasAnySave()).toBe(false);
    const s = fresh();
    s.stats.playTimeMs = 125000;
    saves.save(2, s);
    expect(saves.hasAnySave()).toBe(true);
    expect(saves.lastUsedSlot()).toBe(2);
    expect(saves.summary(2)).toMatchObject({ status: 'ok', name: '하늘', map: 'chute', kind: 'manual' });
    expect(saves.summary(1)).toEqual({ slot: 1, status: 'empty' });
    const loaded = saves.load(2);
    expect(loaded).toMatchObject({ status: 'ok', kind: 'manual', recovered: false });
  });

  it('prefers the newer of manual and autosave', async () => {
    const { saves } = setup();
    const s = fresh();
    saves.save(1, s, 'manual');
    await new Promise((r) => setTimeout(r, 5));
    s.location.map = 'sorting-room';
    saves.save(1, s, 'auto');
    expect(saves.load(1)).toMatchObject({ status: 'ok', kind: 'auto', state: { location: { map: 'sorting-room' } } });
    await new Promise((r) => setTimeout(r, 5));
    s.location.map = 'umbrella-path';
    saves.save(1, s, 'manual');
    expect(saves.load(1)).toMatchObject({ kind: 'manual', state: { location: { map: 'umbrella-path' } } });
    await new Promise((r) => setTimeout(r, 5));
    s.location.map = 'chute-bottom';
    saves.save(1, s, 'auto');
    expect(saves.load(1)).toMatchObject({ kind: 'auto' });
    // After a game over, "retry from the last record" means the last manual record.
    expect(saves.load(1, { prefer: 'manual' })).toMatchObject({ kind: 'manual', state: { location: { map: 'umbrella-path' } } });
  });

  it('recovers from the backup when the main save is damaged', () => {
    const { saves, storage } = setup();
    const s = fresh();
    saves.save(3, s);
    s.buttons = 99;
    saves.save(3, s);
    storage.write('save.3', '{"broken":');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = saves.load(3);
    expect(loaded).toMatchObject({ status: 'ok', recovered: true, state: { buttons: 0 } });
    expect(storage.read('save.3')).toBe('{"broken":'); // loading never mutates
    saves.save(3, s);
    expect(storage.read('save.3.corrupt')).toBe('{"broken":'); // quarantined on overwrite
    expect(saves.load(3)).toMatchObject({ status: 'ok', recovered: false, state: { buttons: 99 } });
    warn.mockRestore();
  });

  it('reports corruption when nothing is recoverable, without throwing', () => {
    const { saves, storage } = setup();
    storage.write('save.1', 'garbage');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(saves.load(1)).toMatchObject({ status: 'corrupt' });
    warn.mockRestore();
    expect(saves.summary(1)).toEqual({ slot: 1, status: 'corrupt' });
  });
});
