/**
 * Shared state of the on-screen touch controls (drawn by OverlayScene).
 * Every scene's InputSystem merges `held` into its action state, and ignores taps that
 * land on a control so pressing the d-pad never counts as "tap to continue".
 */

import type { Action } from './InputSystem';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class VirtualControls {
  readonly held = new Set<Action>();
  private regions: Rect[] = [];
  visible = false;

  setRegions(regions: Rect[]): void {
    this.regions = regions;
  }

  isOverControl(x: number, y: number): boolean {
    if (!this.visible) return false;
    return this.regions.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }

  clear(): void {
    this.held.clear();
  }
}
