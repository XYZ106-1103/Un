/**
 * Audio routing and playback.
 *
 * Shares Phaser's Web Audio context so that Phaser's unlock-on-first-gesture handling
 * and pause-on-blur apply to everything. Signal flow:
 *
 *   music bus ─┐
 *   sfx bus   ─┼─> Phaser master (mute -> volume = settings.masterVolume) -> speakers
 *   voice bus ─┘
 *
 * PHASE 1 provides the buses, volume settings and synthesised UI sounds. Streamed music
 * with crossfades and per-character dialogue voices build on these buses in later phases.
 */

import Phaser from 'phaser';
import sfxData from '@/data/audio/sfx.json';
import { content } from './content/ContentDB';
import type { VoiceDef } from './content/types';
import { MusicPlayer } from './audio/MusicPlayer';
import type { EventSystem } from './EventSystem';
import type { Settings, SettingsSystem } from './SettingsSystem';

export interface SfxStep {
  /** Hz. 0 = silence for this step. */
  freq: number;
  /** Seconds. */
  duration: number;
  slideTo?: number;
}

export interface SfxDefinition {
  wave: OscillatorType;
  volume: number;
  release?: number;
  steps: SfxStep[];
}

type SfxTable = Record<string, SfxDefinition>;

const SFX: SfxTable = Object.fromEntries(
  Object.entries(sfxData as Record<string, unknown>).filter(([key]) => !key.startsWith('$')),
) as SfxTable;

export type SfxId = Exclude<keyof typeof sfxData, '$comment'>;

/** Guards against stacking: the same SFX can't restart more often than this (s). */
const MIN_RETRIGGER = 0.02;

export class AudioSystem {
  private readonly ctx: AudioContext | null;
  private readonly buses: { music: GainNode; sfx: GainNode; voice: GainNode } | null;
  private readonly lastPlayed = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;
  private readonly music: MusicPlayer | null;
  /** Song requested while audio was still locked; started on unlock. */
  private pendingSong: string | null = null;

  constructor(
    private readonly game: Phaser.Game,
    settings: SettingsSystem,
    private readonly events: EventSystem,
  ) {
    const manager = game.sound;
    if (manager instanceof Phaser.Sound.WebAudioSoundManager) {
      this.ctx = manager.context;
      const make = (): GainNode => {
        const node = manager.context.createGain();
        node.connect(manager.destination);
        return node;
      };
      this.buses = { music: make(), sfx: make(), voice: make() };
      this.music = new MusicPlayer(manager.context, this.buses.music);
    } else {
      this.music = null;
      // HTML5/no-audio fallback: synthesis needs Web Audio, so SFX stay silent.
      this.ctx = null;
      this.buses = null;
      console.warn('[AudioSystem] Web Audio unavailable; synthesised sounds disabled');
    }

    this.applyVolumes(settings.values);
    this.unsubscribe = events.on('settings:changed', ({ settings: next }) => this.applyVolumes(next));

    if (manager.locked) {
      manager.once(Phaser.Sound.Events.UNLOCKED, () => {
        this.events.emit('audio:unlocked');
        if (this.pendingSong) this.playMusic(this.pendingSong);
      });
    }
  }

  get currentMusic(): string | null {
    return this.music?.currentId ?? this.pendingSong;
  }

  /** Crossfades to a song from src/data/audio/songs. `null` fades music out. */
  playMusic(id: string | null, fadeS = 0.6): void {
    if (!this.music) return;
    if (id === null) {
      this.pendingSong = null;
      this.music.stop(fadeS);
      return;
    }
    const song = content.song(id);
    if (!song) {
      console.warn(`[AudioSystem] unknown song "${id}"`);
      return;
    }
    if (this.ctx?.state !== 'running') {
      this.pendingSong = id;
      return;
    }
    this.pendingSong = null;
    this.music.play(song, fadeS);
  }

  /** One dialogue "voice" blip with a little random pitch so speech doesn't drone. */
  playVoice(voice: VoiceDef): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(voice.pitch + (Math.random() * 2 - 1) * voice.variance, t);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(voice.volume, t + 0.004);
    env.gain.linearRampToValueAtTime(0, t + 0.045);
    osc.connect(env);
    env.connect(this.buses.voice);
    osc.start(t);
    osc.stop(t + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  /** False until the browser lets audio play (first tap/click/key press). */
  get unlocked(): boolean {
    return !this.game.sound.locked && this.ctx?.state === 'running';
  }

  playSfx(id: SfxId): void {
    const def = SFX[id];
    const ctx = this.ctx;
    if (!def || !ctx || !this.buses || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const last = this.lastPlayed.get(id) ?? -1;
    if (now - last < MIN_RETRIGGER) return;
    this.lastPlayed.set(id, now);

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = def.wave;
    osc.connect(env);
    env.connect(this.buses.sfx);

    const attack = 0.004;
    const release = def.release ?? 0.03;
    let t = now;
    env.gain.setValueAtTime(0, t);
    for (const step of def.steps) {
      if (step.freq <= 0) {
        env.gain.setValueAtTime(0, t);
      } else {
        osc.frequency.setValueAtTime(step.freq, t);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(def.volume, t + attack);
        if (step.slideTo !== undefined) {
          osc.frequency.linearRampToValueAtTime(step.slideTo, t + step.duration);
        }
      }
      t += step.duration;
    }
    const endsSilent = (def.steps[def.steps.length - 1]?.freq ?? 0) <= 0;
    env.gain.setValueAtTime(endsSilent ? 0 : def.volume, t);
    env.gain.linearRampToValueAtTime(0, t + release);

    osc.start(now);
    osc.stop(t + release + 0.01);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  destroy(): void {
    this.music?.destroy();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.buses) {
      this.buses.music.disconnect();
      this.buses.sfx.disconnect();
      this.buses.voice.disconnect();
    }
  }

  private applyVolumes(settings: Readonly<Settings>): void {
    this.game.sound.volume = settings.masterVolume;
    if (!this.buses || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Short ramps avoid zipper noise when sliders move.
    this.buses.music.gain.setTargetAtTime(settings.musicVolume, t, 0.015);
    this.buses.sfx.gain.setTargetAtTime(settings.sfxVolume, t, 0.015);
    this.buses.voice.gain.setTargetAtTime(settings.voiceVolume, t, 0.015);
  }
}
