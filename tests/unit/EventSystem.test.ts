import { describe, expect, it, vi } from 'vitest';
import { EventSystem } from '@/systems/EventSystem';

describe('EventSystem', () => {
  it('delivers typed payloads and unsubscribes', () => {
    const bus = new EventSystem();
    const fn = vi.fn();
    const off = bus.on('scene:entered', fn);
    bus.emit('scene:entered', { key: 'Title' });
    off();
    bus.emit('scene:entered', { key: 'Again' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ key: 'Title' });
    expect(bus.listenerCount('scene:entered')).toBe(0);
  });

  it('once fires a single time', () => {
    const bus = new EventSystem();
    const fn = vi.fn();
    bus.once('audio:unlocked', fn);
    bus.emit('audio:unlocked');
    bus.emit('audio:unlocked');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener from the others', () => {
    const bus = new EventSystem();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    bus.on('debug:toggled', () => {
      throw new Error('boom');
    });
    bus.on('debug:toggled', after);
    bus.emit('debug:toggled', { visible: true });
    expect(after).toHaveBeenCalled();
    error.mockRestore();
  });

  it('tolerates unsubscribing during emit', () => {
    const bus = new EventSystem();
    const second = vi.fn();
    const offFirst = bus.on('scene:entered', () => offFirst());
    bus.on('scene:entered', second);
    bus.emit('scene:entered', { key: 'A' });
    bus.emit('scene:entered', { key: 'B' });
    expect(second).toHaveBeenCalledTimes(2);
  });
});
