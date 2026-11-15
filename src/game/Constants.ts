/**
 * Global, engine-level constants. Gameplay tuning values belong in src/data, not here.
 * Kept free of Phaser imports so pure-logic modules and unit tests can depend on it.
 */

/** Native render resolution. Every pixel of art is authored against this grid. */
export const BASE_WIDTH = 480;
export const BASE_HEIGHT = 270;

/** World tile size in native pixels. */
export const TILE_SIZE = 16;

export const TARGET_FPS = 60;

export const GAME_TITLE = 'UNCLAIMED';
export const GAME_VERSION = __APP_VERSION__;

export const SCENE_KEYS = {
  Boot: 'Boot',
  Preload: 'Preload',
  Menu: 'Menu',
  World: 'World',
  Battle: 'Battle',
  GameOver: 'GameOver',
  DevRoom: 'DevRoom',
  Overlay: 'Overlay',
} as const;

export type SceneKey = (typeof SCENE_KEYS)[keyof typeof SCENE_KEYS];

/**
 * Pixel fonts. `size` is the font's native pixel size: rendering at any other size
 * breaks the pixel grid, so larger text is produced by integer-scaling the bitmap font.
 * `ascent`/`descent` come from the font's hhea table (units / unitsPerEm * size).
 */
export const FONTS = {
  body: { key: 'font-body', family: 'Galmuri11', size: 12, ascent: 12, descent: 2 },
  bold: { key: 'font-bold', family: 'Galmuri11 Bold', size: 12, ascent: 12, descent: 2 },
  small: { key: 'font-small', family: 'Galmuri9', size: 10, ascent: 10, descent: 1 },
} as const;

export type FontId = keyof typeof FONTS;

/**
 * Master palette. Art, UI and effects should pull from these swatches so the whole game
 * reads as one piece. Named for what they evoke in the world (a basement full of lost things).
 */
export const PALETTE = {
  ink: 0x0b0a10,
  night: 0x16131f,
  dusk: 0x2a2338,
  slate: 0x3f3a52,
  fog: 0x6b6680,
  mist: 0xa39fb3,
  paper: 0xe8e2d0,
  white: 0xf7f4ea,
  amber: 0xf2b24c,
  ember: 0xd9663a,
  rust: 0x9c3d2e,
  sock: 0xc8414b,
  mitten: 0x3fa7a0,
  moss: 0x6f9c4a,
  sky: 0x5d8fd6,
  lilac: 0xa77fcf,
  tag: 0xffcf4a,
  placeholder: 0xff00ff,
} as const;

export type PaletteColor = keyof typeof PALETTE;

export const toCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** Render-order bands. Keep new layers inside a band instead of inventing magic numbers. */
export const DEPTH = {
  background: 0,
  world: 100,
  worldOverlay: 500,
  ui: 1000,
  dialogue: 2000,
  transition: 8000,
  debug: 9000,
} as const;
