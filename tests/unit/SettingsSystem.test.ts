import { describe, expect, it, vi } from 'vitest';
import { EventSystem } from '@/systems/EventSystem';
import { DEFAULT_SETTINGS, sanitizeSettings, SettingsSystem } from '@/systems/SettingsSystem';
import { SafeStorage } from '@/systems/storage/SafeStorage';

describe('sanitizeSettings', () => {
  it('fills defaults for missing or invalid input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps volumes and resets only the bad fields', () => {
    const s = sanitizeSettings({ masterVolume: 7, musicVolume: -1, sfxVolume: Number.NaN, textSpeed: 'warp', showFps: true });
    expect(s.masterVolume).toBe(1);
    expect(s.musicVolume).toBe(0);
    expect(s.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
    expect(s.textSpeed).toBe(DEFAULT_SETTINGS.textSpeed);
    expect(s.showFps).toBe(true);
  });
});

describe('SettingsSystem', () => {
  it('persists updates and emits only real changes', () => {
    const storage = new SafeStorage('t:', null);
    const events = new EventSystem();
    const listener = vi.fn();
    events.on('settings:changed', listener);

    const settings = new SettingsSystem(storage, events);
    expect(settings.loadStatus).toBe('empty');
    settings.update({ scaleMode: 'fit', musicVolume: 0.25 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].changed.sort()).toEqual(['musicVolume', 'scaleMode']);

    settings.update({ scaleMode: 'fit' });
    expect(listener).toHaveBeenCalledTimes(1);

    const reloaded = new SettingsSystem(storage, new EventSystem());
    expect(reloaded.loadStatus).toBe('ok');
    expect(reloaded.get('scaleMode')).toBe('fit');
    expect(reloaded.get('musicVolume')).toBe(0.25);
  });

  it('recovers from corrupt stored settings with defaults', () => {
    const storage = new SafeStorage('t:', null);
    storage.write('settings', '{{{{');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = new SettingsSystem(storage, new EventSystem());
    expect(settings.loadStatus).toBe('corrupt');
    expect(settings.values).toEqual(DEFAULT_SETTINGS);
    expect(storage.read('settings.corrupt')).toBe('{{{{');
    warn.mockRestore();
  });
});
