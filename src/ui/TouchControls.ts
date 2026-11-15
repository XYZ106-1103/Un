/**
 * On-screen controls for touch devices: a d-pad and Z / X / C buttons, multi-touch,
 * with sliding between d-pad directions. Feeds the shared VirtualControls state.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, PALETTE } from '@/game/Constants';
import { getServices } from '@/game/Services';
import type { Action } from '@/systems/InputSystem';
import type { Rect } from '@/systems/VirtualControls';
import { PixelText } from './PixelText';

type Mode = 'full' | 'dpad' | 'none';

interface Control {
  action: Action;
  rect: Rect;
  label: string;
  dpad: boolean;
}

const S = 22;
const DX = 18;
const DY = BASE_HEIGHT - 82;

const CONTROLS: Control[] = [
  { action: 'up', rect: { x: DX + S, y: DY, w: S, h: S }, label: '▲', dpad: true },
  { action: 'down', rect: { x: DX + S, y: DY + S * 2, w: S, h: S }, label: '▼', dpad: true },
  { action: 'left', rect: { x: DX, y: DY + S, w: S, h: S }, label: '◀', dpad: true },
  { action: 'right', rect: { x: DX + S * 2, y: DY + S, w: S, h: S }, label: '▶', dpad: true },
  { action: 'confirm', rect: { x: BASE_WIDTH - 50, y: BASE_HEIGHT - 70, w: 32, h: 32 }, label: 'Z', dpad: false },
  { action: 'cancel', rect: { x: BASE_WIDTH - 88, y: BASE_HEIGHT - 44, w: 28, h: 28 }, label: 'X', dpad: false },
  { action: 'menu', rect: { x: BASE_WIDTH - 88, y: BASE_HEIGHT - 92, w: 28, h: 28 }, label: 'C', dpad: false },
];

export class TouchControls {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly labels: PixelText[];
  private mode: Mode = 'none';
  private enabledSetting = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.debug - 10);
    this.labels = CONTROLS.map((c) =>
      new PixelText(scene, c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2 - 6, c.label, {
        font: 'bold',
        color: PALETTE.paper,
        originX: 0.5,
      }).setDepth(DEPTH.debug - 9),
    );
    const update = (p: Phaser.Input.Pointer) => this.refresh(p);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, update);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, update);
    scene.input.on(Phaser.Input.Events.POINTER_UP, update);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, update);
    this.applySetting();
  }

  applySetting(): void {
    const { settings } = getServices(this.scene.game);
    const pref = settings.get('touchControls');
    this.enabledSetting = pref === 'on' || (pref === 'auto' && this.scene.sys.game.device.input.touch);
    this.setMode(this.mode);
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    const { touch } = getServices(this.scene.game);
    const visible = this.enabledSetting && mode !== 'none';
    touch.visible = visible;
    touch.setRegions(visible ? this.activeControls().map((c) => c.rect) : []);
    if (!visible) touch.clear();
    this.draw();
  }

  private activeControls(): Control[] {
    if (!this.enabledSetting || this.mode === 'none') return [];
    return this.mode === 'dpad' ? CONTROLS.filter((c) => c.dpad || c.action === 'cancel') : CONTROLS;
  }

  private refresh(_p: Phaser.Input.Pointer): void {
    const { touch } = getServices(this.scene.game);
    touch.held.clear();
    const active = this.activeControls();
    if (active.length > 0) {
      for (const pointer of this.scene.input.manager.pointers) {
        if (!pointer.isDown) continue;
        for (const c of active) {
          const r = c.rect;
          // A little slop around the d-pad makes sliding between directions forgiving.
          const pad = c.dpad ? 4 : 2;
          if (pointer.x >= r.x - pad && pointer.x <= r.x + r.w + pad && pointer.y >= r.y - pad && pointer.y <= r.y + r.h + pad) {
            touch.held.add(c.action);
          }
        }
      }
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const active = new Set(this.activeControls());
    const held = getServices(this.scene.game).touch.held;
    CONTROLS.forEach((c, i) => {
      const show = active.has(c);
      this.labels[i]?.setVisible(show);
      if (!show) return;
      const pressed = held.has(c.action);
      g.fillStyle(PALETTE.ink, pressed ? 0.75 : 0.45);
      g.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
      g.fillStyle(pressed ? PALETTE.tag : PALETTE.paper, pressed ? 0.9 : 0.5);
      g.fillRect(c.rect.x, c.rect.y, c.rect.w, 1);
      g.fillRect(c.rect.x, c.rect.y + c.rect.h - 1, c.rect.w, 1);
      g.fillRect(c.rect.x, c.rect.y, 1, c.rect.h);
      g.fillRect(c.rect.x + c.rect.w - 1, c.rect.y, 1, c.rect.h);
      this.labels[i]?.setAlpha(pressed ? 1 : 0.7);
    });
  }
}
