/**
 * Step sequencer for the original chiptune songs in src/data/audio/songs.
 *
 * Uses the standard Web Audio look-ahead pattern: a coarse timer wakes every 25 ms and
 * schedules any notes due in the next 120 ms on the audio clock, so timing stays tight
 * even when the main thread stutters. Each song plays through its own gain node so
 * songs can crossfade.
 */

import type { SongChannel, SongDef } from '@/systems/content/types';

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToFrequency(note: string): number | null {
  const m = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!m) return null;
  const [, letter, accidental, octave] = m;
  let semitone = NOTE_INDEX[letter as string] ?? 0;
  if (accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;
  const midi = (Number(octave) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

interface Playing {
  song: SongDef;
  gain: GainNode;
  step: number;
  nextTime: number;
}

export class MusicPlayer {
  private playing: Playing | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private noise: AudioBuffer | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: GainNode,
  ) {}

  get currentId(): string | null {
    return this.playing?.song.id ?? null;
  }

  play(song: SongDef, fadeS = 0.6): void {
    if (this.playing?.song.id === song.id) return;
    this.stop(fadeS);
    const gain = this.ctx.createGain();
    gain.connect(this.bus);
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + Math.max(0.01, fadeS));
    this.playing = { song, gain, step: 0, nextTime: now + 0.05 };
    if (!this.timer) this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(fadeS = 0.6): void {
    const old = this.playing;
    if (!old) return;
    this.playing = null;
    const now = this.ctx.currentTime;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.01, fadeS));
    setTimeout(() => old.gain.disconnect(), (fadeS + 0.5) * 1000);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.stop(0.05);
  }

  private schedule(): void {
    const p = this.playing;
    if (!p || this.ctx.state !== 'running') return;
    const stepDur = 60 / p.song.bpm / p.song.stepsPerBeat;
    const length = p.song.channels[0]?.pattern.length ?? 0;
    if (length === 0) return;
    // If the tab was asleep, skip ahead instead of firing a burst of stale notes.
    if (p.nextTime < this.ctx.currentTime - 0.2) p.nextTime = this.ctx.currentTime + 0.05;
    while (p.nextTime < this.ctx.currentTime + LOOKAHEAD_S) {
      for (const channel of p.song.channels) this.playStep(channel, p, stepDur, length);
      p.step = (p.step + 1) % length;
      p.nextTime += stepDur;
    }
  }

  private playStep(channel: SongChannel, p: Playing, stepDur: number, length: number): void {
    const symbol = channel.pattern[p.step];
    if (!symbol || symbol === '.' || symbol === '-') return;
    // Holds ('-') extend the note.
    let steps = 1;
    while (channel.pattern[(p.step + steps) % length] === '-' && steps < length) steps++;
    const duration = stepDur * steps * (channel.gate ?? 0.9);
    const t = p.nextTime;

    if (channel.wave === 'noise') {
      this.drum(symbol, t, channel.volume, p.gain);
      return;
    }
    const base = noteToFrequency(symbol);
    if (base === null) return;
    const freq = base * 2 ** (channel.octave ?? 0);
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = channel.wave;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(channel.volume, t + 0.006);
    env.gain.setValueAtTime(channel.volume, t + Math.max(0.01, duration - 0.02));
    env.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(env);
    env.connect(p.gain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  /** x = closed hat, o = open hat, s = snare, k = kick. */
  private drum(kind: string, t: number, volume: number, out: GainNode): void {
    const ctx = this.ctx;
    if (kind === 'k') {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      env.gain.setValueAtTime(volume, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + 0.16);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    const len = kind === 's' ? 0.12 : kind === 'o' ? 0.18 : 0.04;
    filter.type = kind === 's' ? 'bandpass' : 'highpass';
    filter.frequency.value = kind === 's' ? 1800 : 7000;
    env.gain.setValueAtTime(volume, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(filter);
    filter.connect(env);
    env.connect(out);
    src.start(t);
    src.stop(t + len + 0.01);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    return this.noise;
  }
}
