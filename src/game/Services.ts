/**
 * Service registry: the one place scenes get shared systems from.
 *
 * Core services (events, storage, settings) exist before Phaser boots. Runtime services
 * need a booted game (canvas, audio context, texture manager) and are attached by
 * BootScene. Fonts arrive last, once the web fonts have loaded.
 */

import type Phaser from 'phaser';
import type { AudioSystem } from '@/systems/AudioSystem';
import type { DisplaySystem } from '@/systems/DisplaySystem';
import type { EventSystem } from '@/systems/EventSystem';
import type { FontSystem } from '@/systems/FontSystem';
import type { MetaSystem } from '@/systems/MetaSystem';
import type { SaveSystem } from '@/systems/SaveSystem';
import type { SettingsSystem } from '@/systems/SettingsSystem';
import type { SafeStorage } from '@/systems/storage/SafeStorage';
import type { VirtualControls } from '@/systems/VirtualControls';
import type { GameSession } from './GameSession';

export interface CoreServices {
  root: HTMLElement;
  events: EventSystem;
  storage: SafeStorage;
  settings: SettingsSystem;
  saves: SaveSystem;
  meta: MetaSystem;
  touch: VirtualControls;
  /** The playthrough in progress (null on the title screen). */
  session: GameSession | null;
}

export interface Services extends CoreServices {
  display: DisplaySystem;
  audio: AudioSystem;
  fonts: FontSystem;
}

const core = new WeakMap<Phaser.Game, CoreServices>();
const full = new WeakMap<Phaser.Game, Services>();

export function attachCoreServices(game: Phaser.Game, services: CoreServices): void {
  core.set(game, services);
}

export function getCoreServices(game: Phaser.Game): CoreServices {
  const services = core.get(game);
  if (!services) throw new Error('Core services were not attached to this game');
  return services;
}

export function attachServices(game: Phaser.Game, services: Omit<Services, keyof CoreServices>): void {
  // Merge onto the core object itself so `session` stays shared and mutable.
  full.set(game, Object.assign(getCoreServices(game), services) as Services);
}

/** All services. Throws if called before BootScene finished (a programming error). */
export function getServices(game: Phaser.Game): Services {
  const services = full.get(game);
  if (!services) throw new Error('Services requested before BootScene finished initialising them');
  return services;
}

export function tryGetServices(game: Phaser.Game): Services | undefined {
  return full.get(game);
}
