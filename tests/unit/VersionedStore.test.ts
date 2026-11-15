import { describe, expect, it } from 'vitest';
import { SafeStorage, type KeyValueStore } from '@/systems/storage/SafeStorage';
import { checksum, VersionedStore } from '@/systems/storage/VersionedStore';

class MapStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

interface Data {
  name: string;
  gold: number;
}

const validate = (d: unknown) => {
  const o = d as Partial<Data>;
  return typeof o?.name === 'string' && typeof o.gold === 'number'
    ? ({ ok: true, value: o as Data } as const)
    : ({ ok: false, reason: 'bad shape' } as const);
};

function setup(version = 1, migrations = [] as { from: number; migrate: (d: unknown) => unknown }[]) {
  const backend = new MapStore();
  const storage = new SafeStorage('t:', backend);
  const store = new VersionedStore<Data>(storage, { key: 'slot', version, validate, migrations });
  return { backend, storage, store };
}

describe('VersionedStore', () => {
  it('round-trips data with an envelope', () => {
    const { store, backend } = setup();
    expect(store.load()).toEqual({ status: 'empty' });
    expect(store.save({ name: 'Kid', gold: 3 }).ok).toBe(true);
    const raw = JSON.parse(backend.getItem('t:slot') as string);
    expect(raw).toMatchObject({ format: 'unclaimed-save', version: 1, data: { name: 'Kid', gold: 3 } });
    expect(store.load()).toMatchObject({ status: 'ok', data: { name: 'Kid', gold: 3 } });
  });

  it('reports invalid JSON as corrupt instead of throwing', () => {
    const { store, backend } = setup();
    backend.setItem('t:slot', '{not json');
    expect(store.load()).toMatchObject({ status: 'corrupt' });
  });

  it('detects tampering via checksum', () => {
    const { store, backend } = setup();
    store.save({ name: 'Kid', gold: 3 });
    backend.setItem('t:slot', (backend.getItem('t:slot') as string).replace('"gold":3', '"gold":9999'));
    expect(store.load()).toMatchObject({ status: 'corrupt', reason: 'checksum mismatch' });
  });

  it('rejects structurally invalid data', () => {
    const { store } = setup();
    store.save({ name: 'Kid' } as unknown as Data);
    expect(store.load()).toMatchObject({ status: 'corrupt', reason: 'bad shape' });
  });

  it('refuses saves from a newer game version', () => {
    const v2 = setup(2);
    v2.store.save({ name: 'Kid', gold: 1 });
    const v1 = new VersionedStore<Data>(v2.storage, { key: 'slot', version: 1, validate });
    expect(v1.load()).toEqual({ status: 'future-version', version: 2 });
  });

  it('migrates old versions step by step', () => {
    const old = setup(1);
    old.store.save({ name: 'Kid', gold: 5 } as Data);
    const migrations = [
      { from: 2, migrate: (d: unknown) => ({ ...(d as object), gold: (d as Data).gold * 10 }) },
      { from: 1, migrate: (d: unknown) => ({ ...(d as object), name: `${(d as Data).name}!` }) },
    ];
    const v3 = new VersionedStore<Data>(old.storage, { key: 'slot', version: 3, validate, migrations });
    expect(v3.load()).toMatchObject({ status: 'ok', data: { name: 'Kid!', gold: 50 }, migratedFrom: 1 });
  });

  it('reports a missing migration as corrupt', () => {
    const old = setup(1);
    old.store.save({ name: 'Kid', gold: 5 });
    const v2 = new VersionedStore<Data>(old.storage, { key: 'slot', version: 2, validate });
    expect(v2.load()).toMatchObject({ status: 'corrupt', reason: 'no migration from v1' });
  });

  it('quarantines unreadable data instead of destroying it', () => {
    const { store, backend } = setup();
    backend.setItem('t:slot', 'garbage');
    store.quarantine();
    expect(backend.getItem('t:slot')).toBeNull();
    expect(backend.getItem('t:slot.corrupt')).toBe('garbage');
  });

  it('checksum is stable and sensitive', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
    expect(checksum('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('SafeStorage', () => {
  it('falls back to memory when the backend throws', () => {
    const exploding: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const storage = new SafeStorage('x:', exploding);
    expect(storage.write('k', 'v')).toEqual({ ok: false, reason: 'error' });
    expect(storage.read('k')).toBe('v');
    expect(() => storage.remove('k')).not.toThrow();
  });

  it('works without any backend (memory only)', () => {
    const storage = new SafeStorage('x:', null);
    expect(storage.persistent).toBe(false);
    expect(storage.write('k', 'v')).toEqual({ ok: false, reason: 'unavailable' });
    expect(storage.read('k')).toBe('v');
  });
});
