/**
 * Chapter ending: route title, conditional pages, a credits roll and a final line.
 * The route was already recorded in MetaSystem; the title screen changes afterwards.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, PALETTE, SCENE_KEYS } from '@/game/Constants';
import { getServices } from '@/game/Services';
import { stateResolver } from '@/game/GameState';
import { content } from '@/systems/content/ContentDB';
import { InputSystem } from '@/systems/InputSystem';
import { format } from '@/systems/LocaleSystem';
import { evaluateCondition } from '@/systems/script/Condition';
import type { Route } from '@/systems/StorySystem';
import { addPixelShadow, PixelText } from '@/ui/PixelText';
import { fadeIn, fadeToScene } from '@/utils/AnimationUtils';
import creditsData from '@/data/story/credits.json';

type Stage = 'title' | 'pages' | 'credits' | 'final' | 'done';

export class EndingScene extends Phaser.Scene {
  private input$!: InputSystem;
  private stage: Stage = 'title';
  private pages: string[] = [];
  private pageIndex = 0;
  private text!: PixelText;
  private credits!: PixelText;
  private elapsed = 0;
  private finalLine = '';
  private motes!: Phaser.GameObjects.Graphics;
  private dots: { x: number; y: number; s: number }[] = [];
  private route: Route = 'keep';

  constructor() {
    super(SCENE_KEYS.Ending);
  }

  create(data: { route: Route }): void {
    const services = getServices(this.game);
    this.input$ = new InputSystem(this);
    this.route = data.route;
    this.stage = 'title';
    this.pageIndex = 0;
    this.elapsed = 0;
    services.events.emit('scene:entered', { key: SCENE_KEYS.Ending });
    const ending = content.ending(data.route) ?? content.ending('keep');
    if (!ending) {
      this.scene.start(SCENE_KEYS.Menu);
      return;
    }
    services.audio.playMusic(ending.music, 1.5);

    const state = services.session?.state;
    const resolve = state ? stateResolver(state) : () => undefined;
    const vars = { player: state?.name ?? '' };
    this.pages = ending.pages
      .filter((p) => evaluateCondition(p.if, resolve))
      .flatMap((p) => (Array.isArray(p.text) ? p.text : [p.text]))
      .map((line) => format(line, vars));
    this.finalLine = format(ending.finalLine, vars);

    this.motes = this.add.graphics().setDepth(DEPTH.background);
    const color = data.route === 'clear' ? PALETTE.fog : data.route === 'return' ? PALETTE.amber : PALETTE.paper;
    this.dots = Array.from({ length: data.route === 'clear' ? 8 : 40 }, () => ({
      x: Math.random() * BASE_WIDTH,
      y: Math.random() * BASE_HEIGHT,
      s: 4 + Math.random() * 10,
    }));
    this.motes.setData('color', color);

    const title = new PixelText(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 14, ending.title, {
      font: 'bold',
      scale: 2,
      color,
      originX: 0.5,
    }).setDepth(DEPTH.ui);
    addPixelShadow(title, PALETTE.ink);
    this.text = new PixelText(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 20, '', {
      color: PALETTE.paper,
      originX: 0.5,
      align: 'center',
      lineSpacing: 4,
      maxWidth: 380,
    }).setDepth(DEPTH.ui);
    this.credits = new PixelText(this, BASE_WIDTH / 2, BASE_HEIGHT + 10, creditsData.lines.join('\n'), {
      color: PALETTE.mist,
      originX: 0.5,
      align: 'center',
      lineSpacing: 3,
    }).setDepth(DEPTH.ui).setVisible(false);
    this.time.delayedCall(3200, () => {
      this.tweens.add({ targets: title, alpha: 0, duration: 800 });
      this.time.delayedCall(900, () => this.showPage());
    });
    fadeIn(this, 2000);
  }

  override update(_time: number, delta: number): void {
    this.elapsed += delta;
    this.drawMotes(delta);
    const pressed = this.input$.justPressed('confirm') || this.input$.tapped();
    if (this.stage === 'pages' && pressed) {
      this.pageIndex++;
      this.showPage();
    } else if (this.stage === 'credits') {
      this.credits.y -= (delta / 1000) * (this.input$.isDown('confirm') ? 60 : 18);
      if (this.credits.y + this.credits.height < 0) this.showFinal();
    } else if (this.stage === 'final' && pressed && this.elapsed > 1500) {
      this.stage = 'done';
      getServices(this.game).session = null;
      fadeToScene(this, SCENE_KEYS.Menu, {}, 2000);
    }
  }

  private showPage(): void {
    if (this.pageIndex >= this.pages.length) {
      this.stage = 'credits';
      this.text.setVisible(false);
      this.credits.setVisible(true);
      return;
    }
    this.stage = 'pages';
    this.text.setText(this.pages[this.pageIndex] ?? '').setAlpha(0).setVisible(true);
    this.tweens.add({ targets: this.text, alpha: 1, duration: 600 });
  }

  private showFinal(): void {
    this.stage = 'final';
    this.elapsed = 0;
    this.credits.setVisible(false);
    this.text.setText(this.finalLine).setAlpha(0).setVisible(true);
    this.tweens.add({ targets: this.text, alpha: 1, duration: 1500 });
    if (this.route !== 'clear') {
      const tag = this.add.image(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 30, 'soul.tag').setDepth(DEPTH.ui).setAlpha(0);
      this.tweens.add({ targets: tag, alpha: 1, duration: 1500, delay: 800 });
    }
  }

  private drawMotes(delta: number): void {
    const g = this.motes;
    g.clear();
    const color = g.getData('color') as number;
    for (const d of this.dots) {
      d.y -= (d.s * delta) / 1000;
      if (d.y < -2) {
        d.y = BASE_HEIGHT + 2;
        d.x = Math.random() * BASE_WIDTH;
      }
      g.fillStyle(color, 0.5).fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
    }
  }
}
