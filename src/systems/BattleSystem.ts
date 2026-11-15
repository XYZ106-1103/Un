/**
 * Battle rules: enemy state, acts, mercy, damage, rewards. Pure logic.
 * BattleScene owns timing and visuals and asks this model what happens.
 */

import { applyFlagChanges, encounterRecord, stateResolver, type GameState } from '@/game/GameState';
import type { SeededRandom } from '@/utils/MathUtils';
import type { ActDef, CondText, EnemyDef, FlagValue, PatternDef, PhaseDef, SoulMode } from './content/types';
import type { InventorySystem, UseResult } from './InventorySystem';
import { format } from './LocaleSystem';
import { evaluateCondition, type ConditionValue, type Resolver } from './script/Condition';

export type EnemyStatus = 'active' | 'spared' | 'cleared';

export interface EnemyState {
  index: number;
  def: EnemyDef;
  hp: number;
  vars: Record<string, FlagValue>;
  status: EnemyStatus;
  /** Times each act was used, for "second time" reactions. */
  actCounts: Record<string, number>;
  /** Index of the current boss phase (-1 = none yet). */
  phase: number;
}

export interface AttackResult {
  damage: number;
  miss: boolean;
  critical: boolean;
  cleared: boolean;
}

export type BattleOutcome = 'victory' | 'defeat' | 'fled';

/** Accuracy (0 = edge of the meter, 1 = dead centre) → damage multiplier. */
export function damageMultiplier(accuracy: number): { mult: number; critical: boolean } {
  const a = Math.min(Math.max(accuracy, 0), 1);
  if (a >= 0.94) return { mult: 2.2, critical: true };
  return { mult: 0.4 + 1.4 * a * a, critical: false };
}

export class BattleModel {
  readonly enemies: EnemyState[];
  turn = 0;
  fled = false;
  buttonsEarned = 0;

  constructor(
    defs: EnemyDef[],
    private readonly state: GameState,
    private readonly inventory: InventorySystem,
    private readonly rng: SeededRandom,
  ) {
    this.enemies = defs.map((def, index) => ({
      index,
      def,
      hp: def.hp,
      vars: { ...(def.vars ?? {}) },
      status: 'active',
      actCounts: {},
      phase: -1,
    }));
    for (const e of this.enemies) encounterRecord(state, e.def.id).met += 1;
    state.stats.battles += 1;
  }

  get active(): EnemyState[] {
    return this.enemies.filter((e) => e.status === 'active');
  }

  resolver(enemy?: EnemyState): Resolver {
    return stateResolver(this.state, (key): ConditionValue => {
      if (key === 'turn') return this.turn;
      if (!enemy) return undefined;
      // Both spellings work: `hp%` and `var:hp%` (content authors reach for the latter).
      if (key === 'hp%' || key === 'var:hp%') return (enemy.hp / enemy.def.hp) * 100;
      if (key.startsWith('var:')) return enemy.vars[key.slice(4)];
      if (key.startsWith('acted:')) return enemy.actCounts[key.slice(6)] ?? 0;
      return undefined;
    });
  }

  private pick(list: CondText[], enemy?: EnemyState): string[] {
    const resolve = this.resolver(enemy);
    const hit = list.find((c) => evaluateCondition(c.if, resolve));
    if (!hit) return [];
    const lines = Array.isArray(hit.text) ? hit.text : [hit.text];
    return lines.map((l) => format(l, { name: this.state.name, enemy: enemy?.def.name ?? '' }));
  }

  canSpare(enemy: EnemyState): boolean {
    return enemy.status === 'active' && evaluateCondition(enemy.def.spareWhen, this.resolver(enemy));
  }

  /** Text in the battle box while choosing a command. */
  flavor(): string[] {
    const first = this.active[0];
    return first ? this.pick(first.def.flavor, first) : [];
  }

  speech(enemy: EnemyState): string[] {
    return this.pick(enemy.def.speech, enemy);
  }

  acts(enemy: EnemyState): { act: ActDef; enabled: boolean }[] {
    const resolve = this.resolver(enemy);
    return enemy.def.acts
      .filter((a) => evaluateCondition(a.if, resolve))
      .map((act) => ({ act, enabled: evaluateCondition(act.requires, resolve) }));
  }

  performAct(enemy: EnemyState, actId: string): string[] {
    const act = enemy.def.acts.find((a) => a.id === actId);
    if (!act) return [];
    const resolve = this.resolver(enemy);
    if (!evaluateCondition(act.requires, resolve)) {
      return (act.deniedText ?? []).map((l) => format(l, { name: this.state.name, enemy: enemy.def.name }));
    }
    // Text is chosen before the variables change, so it can describe the transition.
    const text = this.pick(act.text, enemy);
    enemy.actCounts[actId] = (enemy.actCounts[actId] ?? 0) + 1;
    if (act.set) applyFlagChanges(enemy.vars, act.set);
    if (act.flags) applyFlagChanges(this.state.flags, act.flags);
    if (act.endBattle === 'fled') this.fled = true;
    return text;
  }

  /**
   * Advances bosses into the next phase whose condition now holds. Returns the phases
   * entered (so the scene can show their lines). `var:phase` exposes the phase number
   * (1-based) to pattern and act conditions.
   */
  advancePhases(): { enemy: EnemyState; phase: PhaseDef }[] {
    const entered: { enemy: EnemyState; phase: PhaseDef }[] = [];
    for (const enemy of this.active) {
      const phases = enemy.def.phases ?? [];
      for (let i = enemy.phase + 1; i < phases.length; i++) {
        const phase = phases[i] as PhaseDef;
        if (!evaluateCondition(phase.if, this.resolver(enemy))) break;
        enemy.phase = i;
        enemy.vars.phase = i + 1;
        entered.push({ enemy, phase });
      }
    }
    return entered;
  }

  /** Soul rule for this enemy turn: the first active boss phase that sets one wins. */
  soulMode(): SoulMode {
    for (const enemy of this.active) {
      const phase = enemy.def.phases?.[enemy.phase];
      if (phase?.soul && phase.soul !== 'free') return phase.soul;
    }
    return 'free';
  }

  attack(enemy: EnemyState, accuracy: number | null): AttackResult {
    if (accuracy === null) return { damage: 0, miss: true, critical: false, cleared: false };
    const base = Math.max(1, this.inventory.attack - enemy.def.defense);
    const { mult, critical } = damageMultiplier(accuracy);
    const spread = 0.9 + this.rng.next() * 0.2;
    const damage = Math.max(1, Math.round(base * mult * spread));
    enemy.hp = Math.max(0, enemy.hp - damage);
    const cleared = enemy.hp === 0;
    if (cleared) {
      enemy.status = 'cleared';
      encounterRecord(this.state, enemy.def.id).cleared += 1;
      this.state.stats.cleared += 1;
      this.buttonsEarned += enemy.def.reward.buttons;
    }
    return { damage, miss: false, critical, cleared };
  }

  spare(enemy: EnemyState): boolean {
    if (!this.canSpare(enemy)) return false;
    enemy.status = 'spared';
    encounterRecord(this.state, enemy.def.id).spared += 1;
    this.state.stats.spared += 1;
    // Spared enemies leave a smaller thank-you than cleared ones drop.
    this.buttonsEarned += Math.floor(enemy.def.reward.buttons / 2);
    return true;
  }

  /** Spares every spareable enemy; returns those spared. */
  spareAll(): EnemyState[] {
    return this.active.filter((e) => this.spare(e));
  }

  canFlee(): boolean {
    return this.active.every((e) => e.def.canFlee !== false);
  }

  tryFlee(): boolean {
    if (!this.canFlee()) return false;
    // Fleeing gets easier the longer the fight drags on.
    const chance = Math.min(0.95, 0.5 + this.turn * 0.15);
    this.fled = this.rng.next() < chance;
    return this.fled;
  }

  useItem(index: number): UseResult {
    return this.inventory.use(index);
  }

  /** Patterns for this enemy turn: one per active enemy, played together. */
  patterns(): { enemy: EnemyState; pattern: PatternDef }[] {
    return this.active.flatMap((enemy) => {
      const resolve = this.resolver(enemy);
      const options = enemy.def.patterns.filter((p) => evaluateCondition(p.if, resolve));
      const choice = options.length > 0 ? this.rng.pick(options) : undefined;
      const pattern = choice ? enemy.def.patternDefs[choice.id] : undefined;
      return pattern ? [{ enemy, pattern }] : [];
    });
  }

  damageToPlayer(enemy: EnemyState, bulletDamage?: number): number {
    const raw = bulletDamage ?? enemy.def.attack;
    return Math.max(1, raw - this.inventory.defense);
  }

  hurtPlayer(amount: number): void {
    this.state.hp = Math.max(0, this.state.hp - amount);
  }

  nextTurn(): void {
    this.turn += 1;
  }

  outcome(): BattleOutcome | null {
    if (this.state.hp <= 0) return 'defeat';
    if (this.fled) return 'fled';
    if (this.active.length === 0) return 'victory';
    return null;
  }

  /** Applies end-of-battle rewards to the game state. */
  finish(): void {
    this.state.buttons += this.buttonsEarned;
  }
}
