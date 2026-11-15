/**
 * Typed, game-wide event bus.
 *
 * Systems talk to each other through events instead of importing one another, which
 * keeps the dependency graph flat (see docs/ARCHITECTURE.md). Each event name maps to
 * exactly one payload type, so emit/on are checked at compile time.
 *
 * Kept free of Phaser so it can be unit tested and reused by pure-logic systems.
 */

import type { Settings } from './SettingsSystem';
import type { ScaleResult } from '@/utils/ScaleUtils';

export interface GameEventMap {
  'settings:changed': { settings: Readonly<Settings>; changed: (keyof Settings)[] };
  'display:changed': ScaleResult;
  'audio:unlocked': undefined;
  'debug:toggled': { visible: boolean };
  'scene:entered': { key: string };
  /** Which touch controls a scene wants right now. */
  'touch:context': { mode: 'full' | 'dpad' | 'none' };
}

export type GameEventName = keyof GameEventMap;

type Listener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

interface Entry {
  fn: (payload: never) => void;
  once: boolean;
}

export class EventSystem {
  private readonly listeners = new Map<GameEventName, Entry[]>();

  /** Subscribes and returns an unsubscribe function (store it, call it on shutdown). */
  on<K extends GameEventName>(event: K, fn: Listener<K>): () => void {
    return this.add(event, fn, false);
  }

  once<K extends GameEventName>(event: K, fn: Listener<K>): () => void {
    return this.add(event, fn, true);
  }

  off<K extends GameEventName>(event: K, fn: Listener<K>): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const next = list.filter((entry) => entry.fn !== fn);
    if (next.length > 0) this.listeners.set(event, next);
    else this.listeners.delete(event);
  }

  emit<K extends GameEventName>(
    event: K,
    ...args: GameEventMap[K] extends undefined ? [] : [GameEventMap[K]]
  ): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const payload = args[0] as GameEventMap[K];
    // Snapshot: listeners may unsubscribe (or subscribe) while we iterate.
    for (const entry of [...list]) {
      if (entry.once) this.off(event, entry.fn as Listener<K>);
      try {
        (entry.fn as Listener<K>)(payload);
      } catch (error) {
        // One faulty listener must never break the others or the game loop.
        console.error(`[EventSystem] listener for "${event}" threw`, error);
      }
    }
  }

  listenerCount(event: GameEventName): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }

  private add<K extends GameEventName>(event: K, fn: Listener<K>, once: boolean): () => void {
    const list = this.listeners.get(event) ?? [];
    list.push({ fn: fn as (payload: never) => void, once });
    this.listeners.set(event, list);
    return () => this.off(event, fn);
  }
}
