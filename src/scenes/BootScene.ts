/**
 * First scene. Attaches the runtime services that need a booted Phaser instance,
 * waits for the pixel fonts, then hands over to PreloadScene.
 */

import Phaser from 'phaser';
import { SCENE_KEYS } from '@/game/Constants';
import { attachServices, getCoreServices } from '@/game/Services';
import { AudioSystem } from '@/systems/AudioSystem';
import { DisplaySystem } from '@/systems/DisplaySystem';
import { FontSystem, loadWebFonts } from '@/systems/FontSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.Boot);
  }

  async create(): Promise<void> {
    const core = getCoreServices(this.game);
    const display = new DisplaySystem(this.game, core.root, core.events, core.settings.get('scaleMode'));
    const audio = new AudioSystem(this.game, core.settings, core.events);

    const fontsLoaded = await loadWebFonts();
    if (!fontsLoaded) document.documentElement.dataset.fontFallback = 'true';
    const fonts = new FontSystem(this.textures, this.cache.bitmapFont);

    attachServices(this.game, { display, audio, fonts });

    // Keep the scale mode in sync with the settings (changed from menus or the dev room).
    core.events.on('settings:changed', ({ settings, changed }) => {
      if (changed.includes('scaleMode')) display.setMode(settings.scaleMode);
    });

    this.game.events.once(Phaser.Core.Events.DESTROY, () => {
      display.destroy();
      audio.destroy();
    });

    this.scene.launch(SCENE_KEYS.Overlay);
    this.scene.start(SCENE_KEYS.Preload);
  }
}
