/**
 * Name entry. Text comes from a visually hidden <input>, so the OS keyboard does the
 * work: Korean IME composition (ㅎ → 하 → 한), mobile on-screen keyboards, paste.
 * What the player sees is drawn in pixel text; the input itself is never visible.
 */

import Phaser from 'phaser';
import { PALETTE } from '@/game/Constants';
import { NAME_MAX_LENGTH, normalizeName } from '@/game/GameState';
import { getServices } from '@/game/Services';
import type { InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import { PixelText } from './PixelText';
import { Panel } from './UIStack';

export class NameEntryPanel extends Panel {
  private readonly field: HTMLInputElement;
  private readonly display: PixelText;
  private readonly caret: Phaser.GameObjects.Rectangle;
  private readonly error: PixelText;
  private submitHandler: ((name: string) => void) | null = null;
  private elapsed = 0;
  private readonly canvasTap = (): void => this.field.focus();

  constructor(scene: Phaser.Scene, initial = '') {
    super(scene, 90, 70, 300, 110, t('name.prompt'));
    const box = scene.add.graphics();
    box.fillStyle(PALETTE.night);
    box.fillRect(60, 36, 180, 22);
    box.fillStyle(PALETTE.paper);
    box.fillRect(60, 58, 180, 1);
    this.add(box);
    this.display = new PixelText(scene, 150, 40, '', { font: 'body', scale: 1, color: PALETTE.white, originX: 0.5 });
    this.caret = scene.add.rectangle(150, 40, 1, 12, PALETTE.tag).setOrigin(0, 0);
    this.error = new PixelText(scene, 150, 64, '', { font: 'small', color: PALETTE.sock, originX: 0.5 });
    const touch = scene.sys.game.device.input.touch;
    this.add([this.display, this.caret, this.error]);
    this.add(
      new PixelText(scene, 150, 88, t(touch ? 'name.hint.touch' : 'name.hint.keys'), {
        font: 'small',
        color: PALETTE.fog,
        originX: 0.5,
      }),
    );

    const field = document.createElement('input');
    field.type = 'text';
    field.value = initial;
    field.maxLength = NAME_MAX_LENGTH * 2;
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.setAttribute('autocapitalize', 'off');
    field.setAttribute('aria-label', t('name.prompt'));
    // Visually hidden but focusable; 16px avoids iOS zooming the page on focus.
    Object.assign(field.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      fontSize: '16px',
      border: '0',
      padding: '0',
    });
    field.addEventListener('keydown', this.onKey);
    field.addEventListener('keyup', this.stop);
    field.addEventListener('input', () => this.refresh());
    document.body.append(field);
    this.field = field;
    // Mobile browsers only open the keyboard from a real gesture: focus on canvas taps.
    scene.game.canvas.addEventListener('pointerdown', this.canvasTap);
    field.focus();
    this.refresh();

    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      field.removeEventListener('keydown', this.onKey);
      field.removeEventListener('keyup', this.stop);
      scene.game.canvas.removeEventListener('pointerdown', this.canvasTap);
      field.remove();
    });
  }

  onSubmit(fn: (name: string) => void): this {
    this.submitHandler = fn;
    return this;
  }

  override handle(_input: InputSystem): void {
    // Game input is ignored while typing; only the caret animates.
    this.elapsed += this.scene.game.loop.delta;
    this.caret.setVisible(Math.floor(this.elapsed / 500) % 2 === 0);
  }

  // Keys typed into the field must not reach the game's keyboard handlers.
  private readonly stop = (event: KeyboardEvent): void => event.stopPropagation();

  private readonly onKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.isComposing) return; // Enter that ends an IME composition is not a submit
    if (event.key === 'Enter') {
      event.preventDefault();
      const name = normalizeName(this.field.value);
      if (!name) {
        this.error.setText(t('name.empty'));
        getServices(this.scene.game).audio.playSfx('ui-deny');
        return;
      }
      getServices(this.scene.game).audio.playSfx('ui-confirm');
      const fn = this.submitHandler;
      this.close();
      fn?.(name);
    } else if (event.key === 'Escape') {
      getServices(this.scene.game).audio.playSfx('ui-cancel');
      this.close();
    }
  };

  private refresh(): void {
    const shown = [...this.field.value.replace(/\s+/g, ' ')].slice(0, NAME_MAX_LENGTH).join('');
    this.display.setText(shown);
    this.error.setText('');
    this.caret.setPosition(Math.round(150 + this.display.width / 2) + 1, 40);
    getServices(this.scene.game).audio.playSfx('ui-move');
  }
}
