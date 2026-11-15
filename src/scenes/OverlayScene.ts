/**
 * Always-on-top scene for diagnostics: FPS counter (settings.showFps) and the F3 debug
 * panel (renderer, scaling, active scenes, glyph atlases, placeholder assets).
 * It never takes input, so it can't interfere with the scenes underneath.
 */

import Phaser from 'phaser';
import { BASE_WIDTH, DEPTH, PALETTE, SCENE_KEYS } from '@/game/Constants';
import { getServices } from '@/game/Services';
import { placeholderAssets } from '@/systems/assets/AssetManifest';
import { PixelText } from '@/ui/PixelText';

const REFRESH_MS = 250;

export class OverlayScene extends Phaser.Scene {
  private fpsText!: PixelText;
  private panelBg!: Phaser.GameObjects.Graphics;
  private panelText!: PixelText;
  private debugVisible = false;
  private sinceRefresh = 0;
  private lastScene = '';
  private readonly unsubscribe: (() => void)[] = [];

  constructor() {
    super({ key: SCENE_KEYS.Overlay, active: false });
  }

  create(): void {
    this.input.enabled = false;
    const { events, settings } = getServices(this.game);

    this.panelBg = this.add.graphics().setDepth(DEPTH.debug).setVisible(false);
    this.panelText = new PixelText(this, 8, 40, '', { font: 'small', color: PALETTE.white, lineSpacing: 1 })
      .setDepth(DEPTH.debug + 1)
      .setVisible(false);
    this.fpsText = new PixelText(this, BASE_WIDTH - 6, 24, '', { font: 'small', color: PALETTE.moss, originX: 1 })
      .setDepth(DEPTH.debug + 1)
      .setVisible(settings.get('showFps'));

    this.unsubscribe.push(
      events.on('debug:toggled', ({ visible }) => this.setDebugVisible(visible)),
      events.on('settings:changed', ({ settings: s }) => this.fpsText.setVisible(s.showFps || this.debugVisible)),
      events.on('scene:entered', ({ key }) => {
        this.lastScene = key;
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.unsubscribe.splice(0)) off();
    });
  }

  override update(_time: number, delta: number): void {
    this.sinceRefresh += delta;
    if (this.sinceRefresh < REFRESH_MS) return;
    this.sinceRefresh = 0;

    if (this.fpsText.visible) this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    if (this.debugVisible) this.refreshPanel();
  }

  private setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    this.panelBg.setVisible(visible);
    this.panelText.setVisible(visible);
    this.fpsText.setVisible(visible || getServices(this.game).settings.get('showFps'));
    if (visible) this.refreshPanel();
  }

  private refreshPanel(): void {
    const { display, fonts, audio, storage } = getServices(this.game);
    const scale = display.current;
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    const active = this.game.scene
      .getScenes(true)
      .map((s) => s.scene.key)
      .filter((k) => k !== SCENE_KEYS.Overlay);
    const placeholders = placeholderAssets();

    const lines = [
      `DEBUG (F3)  scene: ${this.lastScene || '-'}  active: ${active.join(', ')}`,
      `renderer ${renderer} · frame ${this.game.loop.delta.toFixed(1)}ms`,
      scale
        ? `zoom ${scale.zoom.toFixed(3)} css · ${scale.deviceScale.toFixed(2)} dev px · ${scale.integer ? 'integer' : 'fractional'} · mode ${display.scaleMode}`
        : 'zoom -',
      `canvas ${scale ? `${scale.cssWidth.toFixed(0)}x${scale.cssHeight.toFixed(0)}` : '-'} css · dpr ${window.devicePixelRatio}`,
      `audio ${audio.unlocked ? 'running' : 'locked (waiting for input)'} · storage ${storage.persistent ? 'localStorage' : 'memory only'}`,
      `glyphs ${fonts.stats().map((f) => `${f.key.replace('font-', '')} ${f.glyphs}/${f.atlas}px`).join(' · ')}`,
      `placeholder assets ${placeholders.length}: ${placeholders.map((a) => a.key).join(', ') || 'none'}`,
    ];
    this.panelText.setText(lines.join('\n'));

    const g = this.panelBg;
    g.clear();
    g.fillStyle(PALETTE.ink, 0.88);
    g.fillRect(2, 36, Math.min(476, this.panelText.width + 10), this.panelText.height + 8);
    g.fillStyle(PALETTE.moss);
    g.fillRect(2, 36, 2, this.panelText.height + 8);
  }
}
