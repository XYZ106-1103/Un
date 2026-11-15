/**
 * Application root: creates the core services, boots Phaser with every scene, and owns
 * global hotkeys and teardown.
 */

import Phaser from 'phaser';
import { BootScene } from '@/scenes/BootScene';
import { DevRoomScene } from '@/scenes/DevRoomScene';
import { OverlayScene } from '@/scenes/OverlayScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { TitleScene } from '@/scenes/TitleScene';
import { EventSystem } from '@/systems/EventSystem';
import { SettingsSystem } from '@/systems/SettingsSystem';
import { SafeStorage } from '@/systems/storage/SafeStorage';
import { createPhaserConfig } from './GameConfig';
import { attachCoreServices, tryGetServices, type CoreServices } from './Services';

/** Scene list order is render order: OverlayScene must stay last (drawn on top). */
const SCENES = [BootScene, PreloadScene, TitleScene, DevRoomScene, OverlayScene];

export class GameApp {
  readonly game: Phaser.Game;
  private readonly core: CoreServices;
  private debugVisible = false;

  constructor(root: HTMLElement) {
    const events = new EventSystem();
    const storage = new SafeStorage('unclaimed:');
    const settings = new SettingsSystem(storage, events);
    this.core = { root, events, storage, settings };

    this.game = new Phaser.Game(createPhaserConfig(root, SCENES));
    attachCoreServices(this.game, this.core);

    window.addEventListener('keydown', this.onGlobalKey);
    this.game.events.once(Phaser.Core.Events.DESTROY, () => {
      window.removeEventListener('keydown', this.onGlobalKey);
      events.clear();
    });
  }

  destroy(): void {
    this.game.destroy(true);
  }

  private readonly onGlobalKey = (event: KeyboardEvent): void => {
    if (event.code === 'F3') {
      event.preventDefault();
      this.debugVisible = !this.debugVisible;
      this.core.events.emit('debug:toggled', { visible: this.debugVisible });
    } else if (event.code === 'F4' || (event.code === 'Enter' && event.altKey)) {
      event.preventDefault();
      // Runs inside the key event, which browsers require for entering fullscreen.
      tryGetServices(this.game)?.display.toggleFullscreen();
    }
  };
}
