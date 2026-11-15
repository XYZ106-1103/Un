/** Promise-based helpers for sequencing tweens, delays and scene transitions. */

import type Phaser from 'phaser';

export function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => {
    scene.time.delayedCall(ms, () => resolve());
  });
}

export function tween(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

const TRANSITION_FLAG = '__transitioning';

/**
 * Fades the camera to black, then starts `key`. Repeated calls while a transition is
 * running are ignored, so mashing confirm can't start a scene twice.
 */
export function fadeToScene(scene: Phaser.Scene, key: string, data?: object, durationMs = 400): void {
  if (scene.data.get(TRANSITION_FLAG)) return;
  scene.data.set(TRANSITION_FLAG, true);
  const camera = scene.cameras.main;
  camera.once('camerafadeoutcomplete', () => {
    scene.data.set(TRANSITION_FLAG, false); // scene data survives a restart; never leave it stuck
    scene.scene.start(key, data);
  });
  camera.fadeOut(durationMs, 0x0b, 0x0a, 0x10);
}

export function fadeIn(scene: Phaser.Scene, durationMs = 400): void {
  scene.data.set(TRANSITION_FLAG, false);
  scene.cameras.main.fadeIn(durationMs, 0x0b, 0x0a, 0x10);
}

export function isTransitioning(scene: Phaser.Scene): boolean {
  return Boolean(scene.data.get(TRANSITION_FLAG));
}

/** Pixel-exact line made of 1x1 rects (Bresenham), for strings, wires and outlines. */
export function pixelLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard++) {
    g.fillRect(x, y, 1, 1);
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
