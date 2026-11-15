/**
 * Keeps the native 480x270 canvas filling the screen with crisp pixels.
 *
 * Phaser's ScaleManager runs in NONE mode; this system decides the zoom (see
 * utils/ScaleUtils.ts), positions the canvas on the device-pixel grid and reacts to
 * window resizes, orientation changes, mobile browser chrome, fullscreen and DPR changes
 * (dragging the window to another monitor).
 */

import type Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH } from '@/game/Constants';
import { computeScale, type ScaleMode, type ScaleResult } from '@/utils/ScaleUtils';
import type { EventSystem } from './EventSystem';

export class DisplaySystem {
  private mode: ScaleMode;
  private last: ScaleResult | null = null;
  private readonly cleanup: (() => void)[] = [];
  private frameRequest = 0;

  constructor(
    private readonly game: Phaser.Game,
    private readonly root: HTMLElement,
    private readonly events: EventSystem,
    initialMode: ScaleMode,
  ) {
    this.mode = initialMode;

    const schedule = (): void => this.scheduleApply();
    this.listen(window, 'resize', schedule);
    this.listen(window, 'orientationchange', schedule);
    this.listen(document, 'fullscreenchange', schedule);
    if (window.visualViewport) this.listen(window.visualViewport, 'resize', schedule);
    this.watchDevicePixelRatio();

    // The parent can also change size without a window resize (e.g. safe-area insets).
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(schedule);
      observer.observe(this.root);
      this.cleanup.push(() => observer.disconnect());
    }

    this.apply();
  }

  get current(): ScaleResult | null {
    return this.last;
  }

  get scaleMode(): ScaleMode {
    return this.mode;
  }

  setMode(mode: ScaleMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.apply();
  }

  get isFullscreen(): boolean {
    return this.game.scale.isFullscreen;
  }

  /** Must be called from a user gesture (key press / tap) or browsers will refuse. */
  toggleFullscreen(): void {
    if (this.game.scale.isFullscreen) this.game.scale.stopFullscreen();
    else this.game.scale.startFullscreen({ navigationUI: 'hide' });
  }

  /** Converts a page-space point into native game coordinates (for DOM overlays). */
  pageToGame(pageX: number, pageY: number): { x: number; y: number } {
    return { x: this.game.scale.transformX(pageX), y: this.game.scale.transformY(pageY) };
  }

  destroy(): void {
    cancelAnimationFrame(this.frameRequest);
    for (const fn of this.cleanup.splice(0)) fn();
  }

  private scheduleApply(): void {
    // Coalesce bursts of resize events into one layout pass per frame.
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = requestAnimationFrame(() => this.apply());
  }

  private apply(): void {
    const rect = this.root.getBoundingClientRect();
    const result = computeScale(
      { width: rect.width, height: rect.height, dpr: window.devicePixelRatio || 1 },
      BASE_WIDTH,
      BASE_HEIGHT,
      this.mode,
    );

    const canvas = this.game.canvas;
    canvas.style.position = 'absolute';
    canvas.style.left = `${result.left}px`;
    canvas.style.top = `${result.top}px`;

    if (this.game.scale.zoom !== result.zoom) {
      this.game.scale.setZoom(result.zoom); // resizes the canvas and refreshes input mapping
    } else {
      this.game.scale.refresh(); // only the offset may have moved: keep pointer mapping correct
    }

    canvas.dataset.integerScale = String(result.integer);
    const changed = !this.sameLayout(result);
    this.last = result;
    if (changed) this.events.emit('display:changed', result);
  }

  private sameLayout(next: ScaleResult): boolean {
    const prev = this.last;
    return (
      prev !== null &&
      prev.zoom === next.zoom &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.cssWidth === next.cssWidth &&
      prev.cssHeight === next.cssHeight
    );
  }

  private watchDevicePixelRatio(): void {
    // matchMedia on the current DPR fires once when DPR changes; re-arm each time.
    let query: MediaQueryList | null = null;
    const onChange = (): void => {
      query?.removeEventListener('change', onChange);
      arm();
      this.scheduleApply();
    };
    const arm = (): void => {
      if (typeof window.matchMedia !== 'function') return;
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      query.addEventListener('change', onChange);
    };
    arm();
    this.cleanup.push(() => query?.removeEventListener('change', onChange));
  }

  private listen(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn, { passive: true });
    this.cleanup.push(() => target.removeEventListener(type, fn));
  }
}
