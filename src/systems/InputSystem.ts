/**
 * Maps physical inputs (keyboard, gamepad, touch) onto abstract game actions.
 *
 * Gameplay code never asks "is Z down?", it asks "was confirm pressed?". That keeps
 * keyboard, gamepad and on-screen touch controls interchangeable and makes rebinding a
 * data change.
 *
 * Keyboard uses `KeyboardEvent.code` (physical key position) instead of `key`, so the
 * bindings keep working with a Korean IME switched on (where `key` reports "Process"
 * or a Hangul jamo) and on AZERTY/QWERTZ layouts.
 *
 * One InputSystem is created per scene and is torn down with it.
 */

import Phaser from 'phaser';

export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'pause';

export const ACTIONS: readonly Action[] = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu', 'pause'];

export const DEFAULT_KEY_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['KeyZ', 'Enter', 'NumpadEnter', 'Space'],
  cancel: ['KeyX', 'ShiftLeft', 'ShiftRight', 'Backspace'],
  menu: ['KeyC', 'ControlLeft', 'ControlRight'],
  pause: ['Escape'],
};

/** Standard Gamepad API mapping (https://w3c.github.io/gamepad/#remapping). */
const PAD_BUTTONS: Readonly<Record<Action, readonly number[]>> = {
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  confirm: [0],
  cancel: [1],
  menu: [3, 2],
  pause: [9],
};

const STICK_DEADZONE = 0.5;

/** Menu auto-repeat timings (ms). */
export const REPEAT_DELAY = 380;
export const REPEAT_RATE = 90;

/**
 * Keys whose browser default (page scroll, history back) must be suppressed. Phaser can
 * only cancel them inside the native listener, so they are registered as captures
 * (legacy keyCodes) instead of calling preventDefault from our queued handler.
 */
const CAPTURED_KEYCODES = [8, 32, 37, 38, 39, 40];

export class InputSystem {
  private readonly codeToActions = new Map<string, Action[]>();
  private readonly heldCodes = new Set<string>();
  private readonly pendingPresses = new Set<Action>();
  private readonly virtualHeld = new Set<Action>();
  private readonly down = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private readonly holdTime = new Map<Action, number>();
  private readonly repeatFired = new Set<Action>();
  private pointerTapped = false;
  private anyKeyPressed = false;
  private enabled = true;

  constructor(private readonly scene: Phaser.Scene) {
    for (const action of ACTIONS) {
      for (const code of DEFAULT_KEY_BINDINGS[action]) {
        const list = this.codeToActions.get(code) ?? [];
        list.push(action);
        this.codeToActions.set(code, list);
      }
    }

    const keyboard = scene.input.keyboard;
    keyboard?.addCapture(CAPTURED_KEYCODES);
    keyboard?.on('keydown', this.onKeyDown, this);
    keyboard?.on('keyup', this.onKeyUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    window.addEventListener('blur', this.releaseAll);

    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.poll, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  /** Held this frame. */
  isDown(action: Action): boolean {
    return this.enabled && this.down.has(action);
  }

  /** Became held this frame. */
  justPressed(action: Action): boolean {
    return this.enabled && this.pressed.has(action);
  }

  /** justPressed, plus auto-repeat while held. Use for menu cursors. */
  pressedOrRepeated(action: Action): boolean {
    return this.enabled && (this.pressed.has(action) || this.repeatFired.has(action));
  }

  /** Any key, button or tap this frame ("PRESS ANY KEY" screens). */
  anyPressed(): boolean {
    return this.enabled && (this.anyKeyPressed || this.pointerTapped || this.pressed.size > 0);
  }

  /** A pointer/touch press began this frame. */
  tapped(): boolean {
    return this.enabled && this.pointerTapped;
  }

  /** Unit movement vector from directional actions (diagonals normalised). */
  axis(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    const x = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    const y = (this.down.has('down') ? 1 : 0) - (this.down.has('up') ? 1 : 0);
    if (x !== 0 && y !== 0) return { x: x * Math.SQRT1_2, y: y * Math.SQRT1_2 };
    return { x, y };
  }

  /** On-screen touch controls feed actions through here. */
  setVirtual(action: Action, held: boolean): void {
    if (held) {
      if (!this.virtualHeld.has(action)) this.pendingPresses.add(action);
      this.virtualHeld.add(action);
    } else {
      this.virtualHeld.delete(action);
    }
  }

  /** Temporarily ignore input (cutscenes, transitions) without losing held-key state. */
  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return; // we generate our own repeats with consistent timing
    this.anyKeyPressed = true;
    this.heldCodes.add(event.code);
    for (const action of this.codeToActions.get(event.code) ?? []) this.pendingPresses.add(action);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.heldCodes.delete(event.code);
  }

  private onPointerDown(): void {
    this.pointerTapped = true;
  }

  private readonly releaseAll = (): void => {
    this.heldCodes.clear();
    this.virtualHeld.clear();
  };

  /** Runs before the scene's update(): rebuilds this frame's action state. */
  private poll(_time: number, delta: number): void {
    const previous = new Set(this.down);
    this.down.clear();
    this.pressed.clear();
    this.repeatFired.clear();

    for (const code of this.heldCodes) {
      for (const action of this.codeToActions.get(code) ?? []) this.down.add(action);
    }
    for (const action of this.virtualHeld) this.down.add(action);
    this.pollGamepads();

    // Presses that started and ended between two frames still count.
    for (const action of this.pendingPresses) this.pressed.add(action);
    for (const action of this.down) if (!previous.has(action)) this.pressed.add(action);
    this.pendingPresses.clear();

    for (const action of ACTIONS) {
      if (!this.down.has(action)) {
        this.holdTime.delete(action);
        continue;
      }
      const before = this.holdTime.get(action) ?? 0;
      const after = before + delta;
      this.holdTime.set(action, after);
      if (after >= REPEAT_DELAY) {
        const ticksBefore = before < REPEAT_DELAY ? -1 : Math.floor((before - REPEAT_DELAY) / REPEAT_RATE);
        const ticksAfter = Math.floor((after - REPEAT_DELAY) / REPEAT_RATE);
        if (ticksAfter > ticksBefore) this.repeatFired.add(action);
      }
    }

    // One-frame flags are consumed by this frame's update().
    this.scene.events.once(Phaser.Scenes.Events.POST_UPDATE, this.clearFrameFlags, this);
  }

  private clearFrameFlags(): void {
    this.pointerTapped = false;
    this.anyKeyPressed = false;
  }

  private pollGamepads(): void {
    const plugin = this.scene.input.gamepad;
    if (!plugin || !plugin.total) return;
    for (const pad of plugin.gamepads) {
      if (!pad || !pad.connected) continue;
      for (const action of ACTIONS) {
        if (PAD_BUTTONS[action].some((i) => pad.buttons[i]?.pressed)) this.down.add(action);
      }
      const ax = pad.axes[0]?.getValue() ?? 0;
      const ay = pad.axes[1]?.getValue() ?? 0;
      if (ax <= -STICK_DEADZONE) this.down.add('left');
      if (ax >= STICK_DEADZONE) this.down.add('right');
      if (ay <= -STICK_DEADZONE) this.down.add('up');
      if (ay >= STICK_DEADZONE) this.down.add('down');
    }
  }

  private destroy(): void {
    const keyboard = this.scene.input?.keyboard;
    keyboard?.off('keydown', this.onKeyDown, this);
    keyboard?.off('keyup', this.onKeyUp, this);
    this.scene.input?.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.poll, this);
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.clearFrameFlags, this);
    window.removeEventListener('blur', this.releaseAll);
    this.releaseAll();
  }
}
