/**
 * Story rules derived from the game state: which route the player is on, whether the
 * world has gone "hollow", and quest progress. Pure logic.
 *
 * Routes are judged at the end of each chapter from everything done so far:
 *   return — nothing ever cleared, and each chapter's key soul let go the kind way
 *            (ch1: Sir Brolly spared with rain and the mitten given back;
 *             ch2: Tumble spared after seeing the festival lit)
 *   clear  — every chapter boss cleared and nothing ever spared
 *   keep   — everything in between
 */

import { isHollowState, stateResolver, type GameState } from '@/game/GameState';
import type { QuestDef } from './content/types';
import { evaluateCondition } from './script/Condition';

export type Route = 'return' | 'keep' | 'clear';

export function evaluateRoute(state: GameState, chapter = 1): Route {
  const f = state.flags;
  const ch1Return = f.brolly_spared === true && f.mitt_given === true;
  const ch2Return = f.tumble_spared === true && f.festival_lit === true;
  if (state.stats.cleared === 0 && ch1Return && (chapter < 2 || ch2Return)) return 'return';
  const bossesCleared = f.brolly_cleared === true && (chapter < 2 || f.tumble_cleared === true);
  if (bossesCleared && state.stats.spared === 0) return 'clear';
  return 'keep';
}

/** See `isHollowState` (kept in GameState so conditions can use `hollow`). */
export function isHollow(state: GameState): boolean {
  return isHollowState(state);
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
