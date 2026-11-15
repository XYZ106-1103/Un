import { describe, expect, it } from 'vitest';
import { createNewGameState } from '@/game/GameState';
import type { QuestDef } from '@/systems/content/types';
import { MetaSystem } from '@/systems/MetaSystem';
import { SafeStorage } from '@/systems/storage/SafeStorage';
import { evaluateRoute, isHollow, questStatuses } from '@/systems/StorySystem';

const fresh = () => createNewGameState({ name: 'A', map: 'm', x: 0, y: 0, facing: 'down', items: [] });

describe('StorySystem', () => {
  it('return route needs no clears, Brolly spared and the mitten given', () => {
    const s = fresh();
    Object.assign(s.flags, { brolly_spared: true, mitt_given: true });
    s.stats.spared = 4;
    expect(evaluateRoute(s)).toBe('return');
    s.stats.cleared = 1;
    expect(evaluateRoute(s)).toBe('keep');
  });

  it('clear route: Brolly cleared and nothing ever spared', () => {
    const s = fresh();
    s.flags.brolly_cleared = true;
    s.stats.cleared = 5;
    expect(evaluateRoute(s)).toBe('clear');
    s.stats.spared = 1;
    expect(evaluateRoute(s)).toBe('keep');
  });

  it('the world turns hollow only after many clears and no mercy', () => {
    const s = fresh();
    s.stats.cleared = 3;
    expect(isHollow(s)).toBe(false);
    s.stats.cleared = 4;
    expect(isHollow(s)).toBe(true);
    s.stats.spared = 1;
    expect(isHollow(s)).toBe(false);
  });

  it('quests move from hidden to active to done', () => {
    const q: QuestDef = { id: 'q', title: 't', description: 'd', activeIf: 'flag:a', doneIf: 'flag:b' };
    const s = fresh();
    expect(questStatuses(s, [q])[0]?.status).toBe('hidden');
    s.flags.a = true;
    expect(questStatuses(s, [q])[0]?.status).toBe('active');
    s.flags.b = true;
    expect(questStatuses(s, [q])[0]?.status).toBe('done');
  });
});

describe('MetaSystem', () => {
  it('notices a reload that undid a clear, once', () => {
    const storage = new SafeStorage('t:', null);
    const meta = new MetaSystem(storage);
    const savedAt = new Date('2026-01-01T00:00:00Z').toISOString();
    meta.recordClear('earbuds', new Date('2026-01-01T00:05:00Z'));
    expect(new MetaSystem(storage).data.lastClear?.enemy).toBe('earbuds'); // persisted
    expect(meta.detectUndo(savedAt)).toBe('earbuds');
    expect(meta.detectUndo(savedAt)).toBeNull();
    expect(meta.data.undoNotices).toBe(1);
  });

  it('ignores clears that happened before the save', () => {
    const meta = new MetaSystem(new SafeStorage('t:', null));
    meta.recordClear('receipt', new Date('2026-01-01T00:00:00Z'));
    expect(meta.detectUndo(new Date('2026-01-01T01:00:00Z').toISOString())).toBeNull();
  });

  it('remembers endings across sessions', () => {
    const storage = new SafeStorage('t:', null);
    new MetaSystem(storage).recordEnding('keep');
    const again = new MetaSystem(storage);
    again.recordEnding('return');
    expect(new MetaSystem(storage).data.endings).toEqual(['keep', 'return']);
    expect(new MetaSystem(storage).lastEnding).toBe('return');
  });
});
