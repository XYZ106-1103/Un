/**
 * Battle-side view of an enemy: sprite with idle animation, hit shake, damage numbers,
 * an HP bar shown after attacks, and the two endings: let go (floats away, fading) or
 * cleared (stops moving and greys out: it's just an object now).
 */

import Phaser from 'phaser';
import { DEPTH, PALETTE } from '@/game/Constants';
import type { EnemyState } from '@/systems/BattleSystem';
import { drawBar } from '@/ui/Panel';
import { PixelText } from '@/ui/PixelText';

export class EnemyView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly baseX: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly state: EnemyState,
    x: number,
    y: number,
  ) {
    const key = state.def.sprite;
    this.sprite = scene.add.sprite(x, y, key).setOrigin(0.5, 1).setDepth(DEPTH.world);
    if (scene.anims.exists(`${key}:idle`)) this.sprite.play(`${key}:idle`);
    this.baseX = x;
    this.hpBar = scene.add.graphics().setDepth(DEPTH.world + 2).setVisible(false);
  }

  /** Point bullets with origin "enemy" are fired from. */
  get center(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y - this.sprite.height / 2 };
  }

  hit(damage: number, critical: boolean, miss: boolean): Promise<void> {
    const scene = this.scene;
    const label = new PixelText(scene, this.sprite.x, this.sprite.y - this.sprite.height - 4, miss ? 'MISS' : String(damage), {
      font: 'bold',
      scale: 2,
      color: miss ? PALETTE.mist : critical ? PALETTE.tag : PALETTE.sock,
      originX: 0.5,
      originY: 1,
    }).setDepth(DEPTH.ui);
    scene.tweens.add({ targets: label, y: label.y - 10, duration: 500, ease: 'Cubic.easeOut' });
    scene.tweens.add({ targets: label, alpha: 0, delay: 700, duration: 300, onComplete: () => label.destroy() });
    if (!miss) {
      this.showHp();
      scene.tweens.add({
        targets: this.sprite,
        x: { from: this.baseX - 3, to: this.baseX },
        duration: 60,
        repeat: 4,
        yoyo: true,
        onComplete: () => this.sprite.setX(this.baseX),
      });
    }
    return new Promise((resolve) => scene.time.delayedCall(1000, () => {
      this.hpBar.setVisible(false);
      resolve();
    }));
  }

  private showHp(): void {
    const w = 50;
    const x = Math.round(this.sprite.x - w / 2);
    const y = Math.round(this.sprite.y + 4);
    this.hpBar.clear();
    drawBar(this.hpBar, x, y, w, 4, this.state.hp / this.state.def.hp, PALETTE.moss, PALETTE.rust);
    this.hpBar.setVisible(true);
  }

  /** Brief white flash on a hit (a gentle tint pulse when flashing is reduced). */
  flash(reduced: boolean): void {
    if (reduced) {
      this.sprite.setTint(PALETTE.paper);
      this.scene.time.delayedCall(120, () => this.sprite.clearTint());
    } else {
      this.sprite.setTintFill(PALETTE.white);
      this.scene.time.delayedCall(70, () => this.sprite.clearTint());
    }
  }

  /** Mercy feedback: a calmer pose once the enemy can be let go (if the art has one). */
  setCalm(calm: boolean): void {
    const key = this.state.def.sprite;
    const anim = calm && this.scene.anims.exists(`${key}:calm`) ? `${key}:calm` : this.idleKey();
    if (anim && this.sprite.anims.currentAnim?.key !== anim) this.sprite.play(anim);
  }

  /** Boss phase art: plays `<sprite>:phase<N>` when the art defines it (N = 1 for the first phase change). */
  setPhase(index: number): void {
    const key = `${this.state.def.sprite}:phase${index + 1}`;
    if (this.scene.anims.exists(key)) {
      this.phaseAnim = key;
      this.sprite.play(key);
    }
  }

  private phaseAnim: string | null = null;

  private idleKey(): string | null {
    if (this.phaseAnim) return this.phaseAnim;
    const key = `${this.state.def.sprite}:idle`;
    return this.scene.anims.exists(key) ? key : null;
  }

  spared(): void {
    this.sprite.anims.pause();
    this.scene.tweens.add({ targets: this.sprite, alpha: 0.35, y: this.sprite.y - 6, duration: 600, ease: 'Sine.easeOut' });
  }

  cleared(): void {
    this.sprite.anims.stop();
    this.sprite.setTint(PALETTE.fog);
    this.scene.tweens.add({ targets: this.sprite, alpha: 0.55, duration: 900 });
  }

  speechAnchor(): { x: number; y: number } {
    return { x: Math.round(this.sprite.x + this.sprite.width / 2 + 6), y: Math.round(this.sprite.y - this.sprite.height + 4) };
  }
}
