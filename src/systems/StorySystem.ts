/**
 * Story rules derived from the game state: which route the player is on, whether the
 * world has gone "hollow", and quest progress. Pure logic.
 *
 * Routes (chapter 1):
 *   return — nothing cleared, Sir Brolly let go with rain, the mitten given back
 *   clear  — Brolly cleared and nothing ever spared
 *   keep   — everything in between
 */

import { stateResolver, type GameState } from '@/game/GameState';
import type { QuestDef } from './content/types';
import { evaluateCondition } from './script/Condition';

export type Route = 'return' | 'keep' | 'clear';

export function evaluateRoute(state: GameState): Route {
  const f = state.flags;
  if (state.stats.cleared === 0 && f.brolly_spared === true && f.mitt_given === true) return 'return';
  if (f.brolly_cleared === true && state.stats.spared === 0) return 'clear';
  return 'keep';
}

/**
 * The world goes quiet when the player clears everything they meet: name plates read
 * "(물품)", songs lose instruments, shops close.
 */
export function isHollow(state: GameState): boolean {
  return state.stats.cleared >= 4 && state.stats.spared === 0;
}

export type QuestStatus = 'hidden' | 'active' | 'done';

export function questStatuses(state: GameState, quests: readonly QuestDef[]): { quest: QuestDef; status: QuestStatus }[] {
  const resolve = stateResolver(state);
  return quests.map((quest) => {
    const done = evaluateCondition(quest.doneIf, resolve);
    const active = evaluateCondition(quest.activeIf, resolve);
    return { quest, status: done ? 'done' : active ? 'active' : 'hidden' };
  });
}
