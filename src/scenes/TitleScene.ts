/**
 * Title screen (PHASE 1 version).
 *
 * Shows the title, a swinging claim-tag ornament and a start prompt. The logo and
 * backdrop are procedural stand-ins until the manifest entries `ui.logo` / `bg.title`
 * receive real files; while they are placeholders a TEMP ART notice is shown.
 *
 * PHASE 2 adds the real main menu (NEW GAME / CONTINUE / SETTINGS / CREDITS) here.
 * Until then, confirming opens the PHASE 1 render-test room.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, GAME_TITLE, GAME_VERSION, PALETTE, SCENE_KEYS } from '@/game/Constants';
import { getServices } from '@/game/Services';
import { getAsset } from '@/systems/assets/AssetManifest';
import { InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import { addPixelShadow, PixelText } from '@/ui/PixelText';
import { fadeIn, fadeToScene, isTransitioning, pixelLine } from '@/utils/AnimationUtils';
import { paintDitheredGradient } from '@/utils/DitherUtils';

/** Top of the logo block. */
const LOGO_TOP = 46;
const STRING_LENGTH = 18;

interface Mote {
  x: number;
  y: number;
  speed: number;
  sway: number;
  phase: number;
  color: number;
}

export class TitleScene extends Phaser.Scene {
  private input$!: InputSystem;
  private backdrop!: Phaser.GameObjects.Graphics;
  private motesLayer!: Phaser.GameObjects.Graphics;
  private stringLayer!: Phaser.GameObjects.Graphics;
  private tag!: Phaser.GameObjects.Image;
  private prompt!: PixelText;
  private motes: Mote[] = [];
  private tagAnchor = { x: 0, y: 0 };
  private elapsed = 0;
  private started = false;

  constructor() {
    super(SCENE_KEYS.Title);
  }

  create(): void {
    this.started = false;
    this.elapsed = 0;
    this.input$ = new InputSystem(this);
    const { events } = getServices(this.game);
    events.emit('scene:entered', { key: SCENE_KEYS.Title });

    this.backdrop = this.add.graphics().setDepth(DEPTH.background);
    this.drawBackdrop();
    this.motesLayer = this.add.graphics().setDepth(DEPTH.background + 1);
    this.motes = Array.from({ length: 48 }, () => this.spawnMote(true));

    this.tagAnchor = this.createLogo();

    this.stringLayer = this.add.graphics().setDepth(DEPTH.ui);
    // Origin on the punched hole (pixel 2,2 of the 10x6 sprite) so the string meets it.
    this.tag = this.add
      .image(this.tagAnchor.x, this.tagAnchor.y + STRING_LENGTH, 'soul.tag')
      .setOrigin(2 / 10, 2 / 6)
      .setDepth(DEPTH.ui);

    const touch = this.sys.game.device.input.touch;
    this.prompt = new PixelText(this, BASE_WIDTH / 2, 196, t(touch ? 'title.prompt.touch' : 'title.prompt.keys'), {
      color: PALETTE.paper,
      originX: 0.5,
    }).setDepth(DEPTH.ui);

    new PixelText(this, BASE_WIDTH - 6, BASE_HEIGHT - 14, `v${GAME_VERSION} · PHASE 1`, {
      font: 'small',
      color: PALETTE.fog,
      originX: 1,
    }).setDepth(DEPTH.ui);

    this.showPlaceholderNotice();
    fadeIn(this, 600);
  }

  override update(_time: number, delta: number): void {
    this.elapsed += delta;
    this.updateMotes(delta);
    this.updateTag();

    // Blink the prompt: steady rhythm, never faster than ~1 Hz (photosensitivity).
    if (!this.started) this.prompt.setVisible(Math.floor(this.elapsed / 600) % 2 === 0);

    if (!this.started && !isTransitioning(this) && (this.input$.justPressed('confirm') || this.input$.tapped())) {
      this.start();
    }
  }

  private start(): void {
    this.started = true;
    const { audio } = getServices(this.game);
    audio.playSfx('title-start');
    this.prompt.setVisible(true);
    this.tweens.add({ targets: this.prompt, alpha: 0, duration: 120, yoyo: true, repeat: 2 });
    this.time.delayedCall(500, () => fadeToScene(this, SCENE_KEYS.DevRoom, undefined, 500));
  }

  /** Draws the logo and subtitle; returns where the tag's string hangs from. */
  private createLogo(): { x: number; y: number } {
    let right: number;
    let bottom: number;
    const logo = getAsset('ui.logo');
    if (logo && logo.kind === 'image' && logo.file !== null && this.textures.exists('ui.logo')) {
      const image = this.add.image(BASE_WIDTH / 2, LOGO_TOP, 'ui.logo').setOrigin(0.5, 0).setDepth(DEPTH.ui);
      right = image.x + image.width / 2;
      bottom = image.y + image.height;
    } else {
      // Typeset stand-in for the hand-lettered wordmark (see manifest entry ui.logo).
      const title = new PixelText(this, BASE_WIDTH / 2, LOGO_TOP, GAME_TITLE, {
        font: 'bold',
        scale: 3,
        color: PALETTE.paper,
        originX: 0.5,
      }).setDepth(DEPTH.ui);
      addPixelShadow(title, PALETTE.rust);
      right = title.x + title.width / 2;
      bottom = title.y + title.height;
    }
    new PixelText(this, BASE_WIDTH / 2, bottom + 24, t('title.subtitle'), {
      color: PALETTE.mist,
      originX: 0.5,
    }).setDepth(DEPTH.ui);
    // The tag hangs from just under the last letter.
    return { x: Math.round(right - 8), y: Math.round(bottom - 2) };
  }

  private showPlaceholderNotice(): void {
    const temp = ['ui.logo', 'bg.title'].filter((key) => getAsset(key)?.status === 'placeholder');
    if (temp.length === 0) return;
    new PixelText(this, 6, BASE_HEIGHT - 14, t('title.temp', { list: temp.join(', ') }), {
      font: 'small',
      color: PALETTE.placeholder,
    }).setDepth(DEPTH.ui);
  }

  /** Stand-in backdrop: Bayer-dithered gradient and a light shaft from the drop slot above. */
  private drawBackdrop(): void {
    const key = 'bg.title.standin';
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key, BASE_WIDTH, BASE_HEIGHT);
      if (texture) {
        paintDitheredGradient(texture.context, BASE_WIDTH, BASE_HEIGHT, [
          PALETTE.ink,
          PALETTE.ink,
          PALETTE.night,
          PALETTE.dusk,
        ]);
        texture.refresh();
      }
    }
    this.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH.background - 1);

    const g = this.backdrop;
    // Light shaft: a warm trapezoid with a stepped, dithered edge.
    g.fillStyle(PALETTE.amber, 0.06);
    const top = { l: BASE_WIDTH / 2 - 18, r: BASE_WIDTH / 2 + 18 };
    for (let y = 0; y < BASE_HEIGHT; y++) {
      const spread = y * 0.35;
      const l = Math.round(top.l - spread);
      const r = Math.round(top.r + spread);
      g.fillRect(l, y, r - l, 1);
      if (y % 2 === 0) g.fillRect(l - 2, y, 2, 1);
      else g.fillRect(r, y, 2, 1);
    }
    // The slot itself.
    g.fillStyle(PALETTE.amber, 0.5);
    g.fillRect(top.l, 0, top.r - top.l, 2);
  }

  private spawnMote(anywhere: boolean): Mote {
    const colors = [PALETTE.paper, PALETTE.mist, PALETTE.amber, PALETTE.fog];
    return {
      x: Phaser.Math.Between(0, BASE_WIDTH),
      y: anywhere ? Phaser.Math.Between(0, BASE_HEIGHT) : -2,
      speed: Phaser.Math.FloatBetween(4, 12),
      sway: Phaser.Math.FloatBetween(2, 8),
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      color: colors[Phaser.Math.Between(0, colors.length - 1)] as number,
    };
  }

  private updateMotes(delta: number): void {
    const g = this.motesLayer;
    g.clear();
    const dt = delta / 1000;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i] as Mote;
      m.y += m.speed * dt;
      m.phase += dt * 0.8;
      if (m.y > BASE_HEIGHT + 2) this.motes[i] = this.spawnMote(false);
      const x = Math.round(m.x + Math.sin(m.phase) * m.sway);
      // Motes inside the light shaft glow brighter.
      const inShaft = Math.abs(x - BASE_WIDTH / 2) < 18 + m.y * 0.35;
      g.fillStyle(m.color, inShaft ? 0.9 : 0.35);
      g.fillRect(x, Math.round(m.y), 1, 1);
    }
  }

  private updateTag(): void {
    const angle = Math.sin(this.elapsed / 900) * 0.35;
    const x = this.tagAnchor.x + Math.sin(angle) * STRING_LENGTH;
    const y = this.tagAnchor.y + Math.cos(angle) * STRING_LENGTH;
    // Move without rotating: rotation would smear the 10px sprite's pixels.
    this.tag.setPosition(Math.round(x), Math.round(y));
    const g = this.stringLayer;
    g.clear();
    g.fillStyle(PALETTE.mist);
    pixelLine(g, this.tagAnchor.x, this.tagAnchor.y, Math.round(x), Math.round(y));
  }
}
