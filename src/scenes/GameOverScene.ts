/**
 * Shown when HP reaches zero: "storage period expired". Offers the last record of the
 * current slot (if one exists) or the title screen.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, PALETTE, SCENE_KEYS } from '@/game/Constants';
import { GameSession } from '@/game/GameSession';
import { getServices } from '@/game/Services';
import { InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import { ListMenu } from '@/ui/ListMenu';
import { addPixelShadow, PixelText } from '@/ui/PixelText';
import { fadeIn, fadeToScene } from '@/utils/AnimationUtils';

export class GameOverScene extends Phaser.Scene {
  private input$!: InputSystem;
  private menu: ListMenu | null = null;
  private line!: PixelText;
  private elapsed = 0;

  constructor() {
    super(SCENE_KEYS.GameOver);
  }

  create(): void {
    const services = getServices(this.game);
    this.input$ = new InputSystem(this);
    this.menu = null;
    this.elapsed = 0;
    services.events.emit('scene:entered', { key: SCENE_KEYS.GameOver });
    services.audio.playMusic('lost', 1.5);

    const title = new PixelText(this, BASE_WIDTH / 2, 70, t('gameover.title'), {
      font: 'bold',
      scale: 2,
      color: PALETTE.paper,
      originX: 0.5,
    }).setDepth(DEPTH.ui);
    addPixelShadow(title, PALETTE.rust);
    this.line = new PixelText(this, BASE_WIDTH / 2, 120, '', { color: PALETTE.mist, originX: 0.5 }).setDepth(DEPTH.ui);
    const tag = this.add.image(BASE_WIDTH / 2, 150, 'soul.tag').setDepth(DEPTH.ui).setAlpha(0.5);
    this.tweens.add({ targets: tag, y: 154, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const slot = services.session?.slot;
    const canRetry = slot !== undefined && services.saves.load(slot, { prefer: 'manual' }).status === 'ok';
    this.time.delayedCall(900, () => {
      this.line.setText(t('gameover.line'));
      this.menu = new ListMenu(
        this,
        BASE_WIDTH / 2 - 60,
        BASE_HEIGHT - 70,
        [{ label: t('gameover.retry'), disabled: !canRetry }, { label: t('gameover.title.menu') }],
        { width: 140, onConfirm: (i) => (i === 0 && slot !== undefined ? this.retry(slot) : this.toTitle()) },
      ).setDepth(DEPTH.ui);
      if (!canRetry) this.menu.select(1, true);
    });
    fadeIn(this, 1200);
  }

  override update(_time: number, delta: number): void {
    this.elapsed += delta;
    this.menu?.handle(this.input$);
  }

  private retry(slot: 1 | 2 | 3): void {
    const services = getServices(this.game);
    const result = services.saves.load(slot, { prefer: 'manual' });
    if (result.status !== 'ok') return this.toTitle();
    services.session = new GameSession(result.state, slot, services.saves);
    const undone = services.meta.detectUndo(result.savedAt);
    if (undone) services.session.setFlags({ meta_undo: undone, meta_undo_seen: false });
    fadeToScene(this, SCENE_KEYS.World, {}, 600);
  }

  private toTitle(): void {
    fadeToScene(this, SCENE_KEYS.Menu, { skipTitle: true }, 600);
  }
}
