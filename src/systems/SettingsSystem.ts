/**
 * Player preferences: persisted separately from save slots so that wiping a save never
 * resets someone's volume or accessibility choices.
 */

import { clamp } from '@/utils/MathUtils';
import { isScaleMode, type ScaleMode } from '@/utils/ScaleUtils';
import type { EventSystem } from './EventSystem';
import type { SafeStorage } from './storage/SafeStorage';
import { VersionedStore, type LoadResult } from './storage/VersionedStore';

export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export const TEXT_SPEEDS: readonly TextSpeed[] = ['slow', 'normal', 'fast', 'instant'];

export interface Settings {
  /** 0..1 */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  /** Character dialogue "voice" blips. */
  voiceVolume: number;
  textSpeed: TextSpeed;
  scaleMode: ScaleMode;
  /** 0..1 multiplier for camera shake. 0 disables shake entirely. */
  screenShake: number;
  /** Replaces full-screen flashes with gentler fades. */
  reduceFlashing: boolean;
  showFps: boolean;
  /** Show on-screen touch controls: auto = only on touch devices. */
  touchControls: 'auto' | 'on' | 'off';
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  voiceVolume: 0.8,
  textSpeed: 'normal',
  scaleMode: 'auto',
  screenShake: 1,
  reduceFlashing: false,
  showFps: false,
  touchControls: 'auto',
});

export const SETTINGS_VERSION = 1;

const unit = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : fallback;

/**
 * Field-by-field sanitising: one bad value (hand-edited storage, an old build) resets
 * only that field instead of discarding every preference.
 */
export function sanitizeSettings(input: unknown): Settings {
  const src = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    masterVolume: unit(src.masterVolume, d.masterVolume),
    musicVolume: unit(src.musicVolume, d.musicVolume),
    sfxVolume: unit(src.sfxVolume, d.sfxVolume),
    voiceVolume: unit(src.voiceVolume, d.voiceVolume),
    textSpeed: TEXT_SPEEDS.includes(src.textSpeed as TextSpeed) ? (src.textSpeed as TextSpeed) : d.textSpeed,
    scaleMode: isScaleMode(src.scaleMode) ? src.scaleMode : d.scaleMode,
    screenShake: unit(src.screenShake, d.screenShake),
    reduceFlashing: typeof src.reduceFlashing === 'boolean' ? src.reduceFlashing : d.reduceFlashing,
    showFps: typeof src.showFps === 'boolean' ? src.showFps : d.showFps,
    touchControls:
      src.touchControls === 'on' || src.touchControls === 'off' || src.touchControls === 'auto'
        ? src.touchControls
        : d.touchControls,
  };
}

export class SettingsSystem {
  private readonly store: VersionedStore<Settings>;
  private current: Settings;
  /** Outcome of the initial load, kept so the UI can tell the player if it was reset. */
  readonly loadStatus: LoadResult<Settings>['status'];

  constructor(
    storage: SafeStorage,
    private readonly events: EventSystem,
  ) {
    this.store = new VersionedStore<Settings>(storage, {
      key: 'settings',
      version: SETTINGS_VERSION,
      validate: (data) => ({ ok: true, value: sanitizeSettings(data) }),
    });

    const result = this.store.load();
    this.loadStatus = result.status;
    if (result.status === 'ok') {
      this.current = result.data;
    } else {
      if (result.status === 'corrupt') {
        console.warn(`[Settings] stored settings unreadable (${result.reason}); using defaults`);
        this.store.quarantine();
      }
      this.current = { ...DEFAULT_SETTINGS };
    }
  }

  get values(): Readonly<Settings> {
    return this.current;
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.current[key];
  }

  /** Applies a partial update, sanitises it, persists it and broadcasts what changed. */
  update(patch: Partial<Settings>): void {
    const next = sanitizeSettings({ ...this.current, ...patch });
    const changed = (Object.keys(next) as (keyof Settings)[]).filter((k) => next[k] !== this.current[k]);
    if (changed.length === 0) return;
    this.current = next;
    const result = this.store.save(next);
    if (!result.ok && result.reason !== 'unavailable') {
      console.warn(`[Settings] could not persist settings (${result.reason})`);
    }
    this.events.emit('settings:changed', { settings: next, changed });
  }

  reset(): void {
    this.update({ ...DEFAULT_SETTINGS });
  }
}
