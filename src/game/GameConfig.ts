import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, PALETTE, TARGET_FPS, toCss } from './Constants';

export * from './Constants';

export function createPhaserConfig(
  parent: HTMLElement,
  scenes: Phaser.Types.Scenes.SceneType[],
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    backgroundColor: toCss(PALETTE.ink),
    pixelArt: true, // nearest-neighbour sampling, no antialiasing
    roundPixels: true, // snap every draw to whole native pixels
    banner: false,
    disableContextMenu: true,
    autoFocus: true,
    fps: {
      target: TARGET_FPS,
      smoothStep: true,
    },
    scale: {
      // DisplaySystem owns sizing: it applies an integer (or fractional) zoom so the
      // native canvas maps cleanly onto device pixels.
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
      autoRound: false,
      zoom: 1,
      // Fullscreen the root container (not a Phaser-created wrapper) so DisplaySystem
      // keeps measuring the same element.
      fullscreenTarget: parent,
    },
    render: {
      antialias: false,
      antialiasGL: false,
      powerPreference: 'high-performance',
      clearBeforeRender: true,
    },
    input: {
      activePointers: 3,
      gamepad: true,
    },
    audio: {
      disableWebAudio: false,
    },
    scene: scenes,
  };
}
