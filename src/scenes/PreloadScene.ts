/**
 * Loads every file listed in the asset manifest with a real progress bar, then builds
 * generated textures (inline pixel art and clearly-marked placeholders) and shared
 * animations. A file that fails to load falls back to a placeholder instead of crashing.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, PALETTE, SCENE_KEYS } from '@/game/Constants';
import { ASSETS } from '@/systems/assets/AssetManifest';
import { buildGeneratedTextures } from '@/systems/assets/PlaceholderFactory';
import { t } from '@/systems/LocaleSystem';
import { PixelText } from '@/ui/PixelText';
import { fadeToScene } from '@/utils/AnimationUtils';

/** Every file under src/assets, resolved to its built URL (hashed in production). */
const ASSET_URLS = import.meta.glob('../assets/**/*.{png,json,ogg,mp3,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function urlFor(file: string): string | undefined {
  return ASSET_URLS[`../assets/${file}`];
}

const BAR_W = 160;
const BAR_H = 6;

export class PreloadScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private label!: PixelText;
  private readonly failed: string[] = [];

  constructor() {
    super(SCENE_KEYS.Preload);
  }

  preload(): void {
    const cx = BASE_WIDTH / 2;
    const cy = BASE_HEIGHT / 2;
    this.label = new PixelText(this, cx, cy - 16, t('loading'), { color: PALETTE.mist, originX: 0.5 });
    this.bar = this.add.graphics();
    this.drawBar(0);

    for (const entry of ASSETS) {
      if (entry.kind === 'pixels' || entry.file === null) continue;
      const url = urlFor(entry.file);
      if (!url) {
        console.error(`[Preload] "${entry.key}" points at missing file src/assets/${entry.file}`);
        this.failed.push(entry.key);
        continue;
      }
      if (entry.kind === 'image') this.load.image(entry.key, url);
      else this.load.spritesheet(entry.key, url, { frameWidth: entry.size[0], frameHeight: entry.size[1] });
    }

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => this.drawBar(value));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[Preload] failed to load "${file.key}" (${file.src})`);
      this.failed.push(file.key);
    });
  }

  create(): void {
    this.drawBar(1);
    // Missing/failed files get the placeholder treatment, so the game still runs.
    buildGeneratedTextures(this.textures, ASSETS);
    if (this.failed.length > 0) {
      console.warn(`[Preload] using placeholders for: ${this.failed.join(', ')}`);
    }
    this.createAnimations();
    fadeToScene(this, SCENE_KEYS.Title, undefined, 250);
  }

  private drawBar(progress: number): void {
    const x = Math.round((BASE_WIDTH - BAR_W) / 2);
    const y = Math.round(BASE_HEIGHT / 2);
    const g = this.bar;
    g.clear();
    g.fillStyle(PALETTE.slate);
    g.fillRect(x - 1, y - 1, BAR_W + 2, BAR_H + 2);
    g.fillStyle(PALETTE.night);
    g.fillRect(x, y, BAR_W, BAR_H);
    g.fillStyle(PALETTE.tag);
    g.fillRect(x, y, Math.round(BAR_W * Phaser.Math.Clamp(progress, 0, 1)), BAR_H);
    this.label?.setText(`${t('loading')} ${Math.round(progress * 100)}%`);
  }

  private createAnimations(): void {
    const directions = ['down', 'left', 'right', 'up'] as const;
    directions.forEach((dir, row) => {
      const key = `player-walk-${dir}`;
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('char.player', { start: row * 4, end: row * 4 + 3 }),
        frameRate: 8,
        repeat: -1,
      });
    });
  }
}
