/**
 * Selectable list used by every menu: main menu, settings, pause menu, pocket, battle
 * acts. Keyboard/gamepad via `handle(input)`, touch/mouse by tapping a row (a tap on the
 * selected row confirms it). The cursor is the claim-tag soul.
 */

import Phaser from 'phaser';
import { PALETTE, type FontId } from '@/game/Constants';
import { getServices } from '@/game/Services';
import type { InputSystem } from '@/systems/InputSystem';
import { PixelText } from './PixelText';

export interface ListItem {
  label: string;
  disabled?: boolean;
  /** Right-aligned value (settings values, item counts). */
  value?: string;
  color?: number;
}

export interface ListMenuOptions {
  width: number;
  lineHeight?: number;
  columns?: number;
  font?: FontId;
  /** Rows visible before scrolling (single column only). */
  visibleRows?: number;
  onConfirm?: (index: number) => void;
  onCancel?: () => void;
  onChange?: (index: number) => void;
  /** Left/right callbacks (settings); when absent, left/right move between columns. */
  onAdjust?: (index: number, delta: -1 | 1) => void;
  wrap?: boolean;
  sounds?: boolean;
}

const CURSOR_GAP = 14;

export class ListMenu extends Phaser.GameObjects.Container {
  private items: ListItem[] = [];
  private rows: { label: PixelText; value?: PixelText }[] = [];
  private readonly cursor: Phaser.GameObjects.Image;
  private readonly hitZone: Phaser.GameObjects.Zone;
  private scroll = 0;
  private focused = true;
  index = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    items: ListItem[],
    private readonly opts: ListMenuOptions,
  ) {
    super(scene, Math.round(x), Math.round(y));
    this.cursor = scene.add.image(0, 0, 'soul.tag').setOrigin(0, 0.5);
    this.add(this.cursor);
    this.hitZone = scene.add.zone(0, 0, 1, 1).setOrigin(0);
    this.add(this.hitZone);
    this.hitZone.setInteractive();
    this.hitZone.on(Phaser.Input.Events.POINTER_DOWN, this.onTap, this);
    this.setItems(items);
    scene.add.existing(this);
  }

  private get lineHeight(): number {
    return this.opts.lineHeight ?? 14;
  }

  private get columns(): number {
    return Math.max(1, this.opts.columns ?? 1);
  }

  private get visibleRows(): number {
    return this.columns === 1 ? (this.opts.visibleRows ?? this.items.length) : Math.ceil(this.items.length / this.columns);
  }

  get selected(): ListItem | undefined {
    return this.items[this.index];
  }

  setItems(items: ListItem[], keepIndex = true): this {
    this.items = items;
    for (const row of this.rows) {
      row.label.destroy();
      row.value?.destroy();
    }
    this.rows = items.map((item) => {
      const label = new PixelText(this.scene, 0, 0, item.label, { font: this.opts.font ?? 'body' });
      this.add(label);
      let value: PixelText | undefined;
      if (item.value !== undefined) {
        value = new PixelText(this.scene, 0, 0, item.value, { font: this.opts.font ?? 'body', originX: 1 });
        this.add(value);
      }
      return value ? { label, value } : { label };
    });
    if (!keepIndex) this.index = 0;
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    const colWidth = this.opts.width / this.columns;
    const rows = Math.min(this.visibleRows, Math.ceil(items.length / this.columns));
    this.hitZone.setSize(this.opts.width, rows * this.lineHeight);
    this.hitZone.input?.hitArea.setTo(0, 0, this.opts.width, rows * this.lineHeight);
    void colWidth;
    this.layout();
    return this;
  }

  /** Updates one row's value text without rebuilding the list. */
  setValue(index: number, value: string): void {
    const row = this.rows[index];
    const item = this.items[index];
    if (row?.value && item) {
      item.value = value;
      row.value.setText(value);
    }
  }

  setFocused(focused: boolean): this {
    this.focused = focused;
    this.layout();
    return this;
  }

  handle(input: InputSystem): void {
    if (!this.focused || this.items.length === 0) return;
    const cols = this.columns;
    let next = this.index;
    if (input.pressedOrRepeated('up')) next = this.step(-cols);
    else if (input.pressedOrRepeated('down')) next = this.step(cols);
    else if (input.pressedOrRepeated('left')) {
      if (this.opts.onAdjust) this.adjust(-1);
      else if (cols > 1) next = this.step(-1);
    } else if (input.pressedOrRepeated('right')) {
      if (this.opts.onAdjust) this.adjust(1);
      else if (cols > 1) next = this.step(1);
    }
    if (next !== this.index) this.select(next);
    if (input.justPressed('confirm')) this.confirm();
    else if (input.justPressed('cancel') && this.opts.onCancel) {
      this.sfx('ui-cancel');
      this.opts.onCancel();
    }
  }

  select(index: number, silent = false): void {
    if (index < 0 || index >= this.items.length || index === this.index) return;
    this.index = index;
    if (!silent) this.sfx('ui-move');
    this.layout();
    this.opts.onChange?.(index);
  }

  confirm(): void {
    const item = this.items[this.index];
    if (!item) return;
    if (item.disabled) {
      this.sfx('ui-deny');
      return;
    }
    this.sfx('ui-confirm');
    this.opts.onConfirm?.(this.index);
  }

  private adjust(delta: -1 | 1): void {
    const item = this.items[this.index];
    if (!item || item.disabled) return;
    this.sfx('ui-move');
    this.opts.onAdjust?.(this.index, delta);
  }

  private step(delta: number): number {
    const n = this.items.length;
    const target = this.index + delta;
    if (this.opts.wrap === false) return Math.min(Math.max(target, 0), n - 1);
    if (Math.abs(delta) === 1 || this.columns === 1) return ((target % n) + n) % n;
    return target < 0 || target >= n ? this.index : target;
  }

  private onTap(pointer: Phaser.Input.Pointer): void {
    if (!this.focused) return;
    // UI lives in screen space (scroll factor 0 or an unscrolled camera), so compare
    // against the pointer's screen position and the container's world transform.
    const m = this.getWorldTransformMatrix();
    const lx = pointer.x - m.tx;
    const ly = pointer.y - m.ty;
    const colWidth = this.opts.width / this.columns;
    const row = Math.floor(ly / this.lineHeight) + (this.columns === 1 ? this.scroll : 0);
    const col = Math.min(this.columns - 1, Math.max(0, Math.floor(lx / colWidth)));
    const index = row * this.columns + col;
    if (index < 0 || index >= this.items.length) return;
    if (index === this.index) this.confirm();
    else this.select(index);
  }

  private layout(): void {
    const lh = this.lineHeight;
    const cols = this.columns;
    const colWidth = this.opts.width / cols;
    if (cols === 1) {
      const visible = this.visibleRows;
      if (this.index < this.scroll) this.scroll = this.index;
      if (this.index >= this.scroll + visible) this.scroll = this.index - visible + 1;
    }
    this.rows.forEach((row, i) => {
      const item = this.items[i] as ListItem;
      const r = cols === 1 ? i - this.scroll : Math.floor(i / cols);
      const c = cols === 1 ? 0 : i % cols;
      const visible = cols > 1 || (r >= 0 && r < this.visibleRows);
      const x = Math.round(c * colWidth + CURSOR_GAP);
      const y = r * lh;
      const color = item.disabled
        ? PALETTE.fog
        : i === this.index && this.focused
          ? PALETTE.tag
          : (item.color ?? PALETTE.paper);
      row.label.setPosition(x, y).setVisible(visible).setTint(color);
      row.value?.setPosition(Math.round((c + 1) * colWidth), y).setVisible(visible).setTint(color);
    });
    const r = cols === 1 ? this.index - this.scroll : Math.floor(this.index / cols);
    const c = cols === 1 ? 0 : this.index % cols;
    this.cursor.setPosition(Math.round(c * colWidth), r * lh + 7).setVisible(this.focused && this.items.length > 0);
  }

  private sfx(id: 'ui-move' | 'ui-confirm' | 'ui-cancel' | 'ui-deny'): void {
    if (this.opts.sounds === false) return;
    getServices(this.scene.game).audio.playSfx(id);
  }
}
