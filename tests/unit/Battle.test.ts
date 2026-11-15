import { describe, expect, it } from 'vitest';
import { createNewGameState } from '@/game/GameState';
import { BattleModel, damageMultiplier } from '@/systems/BattleSystem';
import type { EnemyDef, ItemDef } from '@/systems/content/types';
import { InventorySystem } from '@/systems/InventorySystem';
import { SeededRandom } from '@/utils/MathUtils';

const enemy: EnemyDef = {
  id: 'knot',
  name: '매듭',
  sprite: 'x',
  hp: 20,
  attack: 4,
  defense: 1,
  reward: { buttons: 10 },
  encounter: 'e',
  check: 'c',
  vars: { tangle: 2 },
  acts: [
    { id: 'check', label: '관찰', text: [{ text: '매듭이다.' }] },
    {
      id: 'untangle',
      label: '풀기',
      set: { tangle: '-1' },
      text: [{ if: 'var:tangle >= 2', text: '조금 풀렸다.' }, { text: '다 풀렸다!' }],
    },
    { id: 'sew', label: '꿰매기', requires: 'item:thread', deniedText: ['실이 없다.'], text: [{ text: '꿰맸다.' }] },
  ],
  spareWhen: 'var:tangle <= 0',
  flavor: [{ if: 'var:tangle > 0', text: '엉켜 있다.' }, { text: '느슨하다.' }],
  speech: [{ text: '…' }],
  patterns: [{ id: 'a', if: 'var:tangle > 0' }, { id: 'b' }],
  patternDefs: { a: { duration: 1000, emitters: [] }, b: { duration: 2000, emitters: [] } },
};
const items: Record<string, ItemDef> = { thread: { id: 'thread', name: '실', description: 'd', kind: 'key', droppable: true } };

const setup = (inv: string[] = []) => {
  const state = createNewGameState({ name: 'A', map: 'm', x: 0, y: 0, facing: 'down', items: inv });
  const model = new BattleModel([enemy], state, new InventorySystem(state, (id) => items[id]), new SeededRandom(1));
  return { state, model, e: model.enemies[0]! };
};

describe('BattleModel', () => {
  it('acts change variables, flavour and spareability', () => {
    const { state, model, e } = setup();
    expect(state.encounters.knot?.met).toBe(1);
    expect(model.canSpare(e)).toBe(false);
    expect(model.flavor()).toEqual(['엉켜 있다.']);
    expect(model.performAct(e, 'untangle')).toEqual(['조금 풀렸다.']);
    expect(model.performAct(e, 'untangle')).toEqual(['다 풀렸다!']);
    expect(model.canSpare(e)).toBe(true);
    expect(model.flavor()).toEqual(['느슨하다.']);
    expect(model.patterns().map((p) => p.pattern.duration)).toEqual([2000]);
    expect(model.spare(e)).toBe(true);
    expect(model.outcome()).toBe('victory');
    model.finish();
    expect(state.buttons).toBe(5);
    expect(state.encounters.knot?.spared).toBe(1);
  });

  it('requires gate acts', () => {
    const without = setup();
    expect(without.model.acts(without.e).find((a) => a.act.id === 'sew')?.enabled).toBe(false);
    expect(without.model.performAct(without.e, 'sew')).toEqual(['실이 없다.']);
    const withThread = setup(['thread']);
    expect(withThread.model.performAct(withThread.e, 'sew')).toEqual(['꿰맸다.']);
  });

  it('attacks scale with accuracy and clear the enemy at 0 HP', () => {
    const { state, model, e } = setup();
    expect(model.attack(e, null)).toMatchObject({ miss: true, damage: 0 });
    const weak = model.attack(e, 0).damage;
    expect(weak).toBeGreaterThanOrEqual(1);
    const strong = model.attack(e, 1);
    expect(strong.critical).toBe(true);
    expect(strong.damage).toBeGreaterThan(weak);
    while (e.status === 'active') model.attack(e, 1);
    expect(e.status).toBe('cleared');
    expect(model.outcome()).toBe('victory');
    model.finish();
    expect(state.buttons).toBe(10);
    expect(state.stats.cleared).toBe(1);
  });

  it('player damage respects defense and defeat ends the battle', () => {
    const { state, model, e } = setup();
    expect(model.damageToPlayer(e)).toBe(4);
    model.hurtPlayer(100);
    expect(state.hp).toBe(0);
    expect(model.outcome()).toBe('defeat');
  });

  it('damage multiplier is monotonic with a critical zone', () => {
    let prev = 0;
    for (let a = 0; a <= 0.93; a += 0.05) {
      const { mult } = damageMultiplier(a);
      expect(mult).toBeGreaterThanOrEqual(prev);
      prev = mult;
    }
    expect(damageMultiplier(0.97)).toEqual({ mult: 2.2, critical: true });
  });

  it('boss phases enter once, in order, by HP or variables', () => {
    const boss: EnemyDef = {
      ...enemy,
      id: 'boss',
      hp: 100,
      defense: 0,
      vars: { praised: 0 },
      acts: [...enemy.acts, { id: 'praise', label: 'p', set: { praised: '+1' }, text: [{ text: 'ok' }] }],
      phases: [{ id: 'open', if: 'var:hp% <= 60 || var:praised >= 2', soul: 'tether', enter: ['opened'] }],
    };
    const state = createNewGameState({ name: 'A', map: 'm', x: 0, y: 0, facing: 'down', items: [] });
    const model = new BattleModel([boss], state, new InventorySystem(state, () => undefined), new SeededRandom(3));
    const e = model.enemies[0]!;
    expect(model.advancePhases()).toEqual([]);
    model.performAct(e, 'praise');
    expect(model.advancePhases()).toEqual([]); // one compliment is not enough
    expect(model.soulMode()).toBe('free');
    model.performAct(e, 'praise');
    const entered = model.advancePhases();
    expect(entered.map((p) => p.phase.id)).toEqual(['open']);
    expect(e.vars.phase).toBe(1);
    expect(model.soulMode()).toBe('tether');
    expect(model.advancePhases()).toEqual([]); // never re-entered
  });

  it('acts can write story flags and end the battle', () => {
    const special: EnemyDef = {
      ...enemy,
      acts: [...enemy.acts, { id: 'retreat', label: 'r', endBattle: 'fled', flags: { tried: true }, text: [{ text: 'bye' }] }],
    };
    const state = createNewGameState({ name: 'A', map: 'm', x: 0, y: 0, facing: 'down', items: [] });
    const model = new BattleModel([special], state, new InventorySystem(state, () => undefined), new SeededRandom(3));
    model.performAct(model.enemies[0]!, 'retreat');
    expect(state.flags.tried).toBe(true);
    expect(model.outcome()).toBe('fled');
  });
});
