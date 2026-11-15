/**
 * PHASE 1 render-test room. Development only: replaced by the main menu and real maps
 * in PHASE 2 (kept reachable from the debug overlay afterwards).
 *
 * Verifies, in one place, everything PHASE 1 is responsible for:
 *  - tilemap + sprite rendering on the native pixel grid while the camera scrolls
 *  - crisp Korean/English pixel text at 1x and 2x
 *  - the scale modes (C cycles auto / pixel-perfect / fit and persists the choice)
 *  - keyboard, gamepad and touch input mapped to actions
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, PALETTE, SCENE_KEYS, TILE_SIZE } from '@/game/Constants';
import { getServices } from '@/game/Services';
import { placeholderAssets } from '@/systems/assets/AssetManifest';
import { ACTIONS, InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import { PixelText } from '@/ui/PixelText';
import { fadeIn, fadeToScene } from '@/utils/AnimationUtils';
import { SCALE_MODES, type ScaleResult } from '@/utils/ScaleUtils';

const MAP_W = 40;
const MAP_H = 24;
const PLAYER_SPEED = 80; // px/s
/** Frame indices in tiles.basement (see src/data/art/tiles-basement.json). */
const TILE = { floorA: 0, floorB: 1, wall: 5, marker: 11 } as const;
const BACK_BUTTON = { x: BASE_WIDTH - 46, y: 4, w: 42, h: 14 };

type Facing = 'down' | 'left' | 'right' | 'up';

export class DevRoomScene extends Phaser.Scene {
  private input$!: InputSystem;
  private player!: Phaser.GameObjects.Sprite;
  private facing: Facing = 'down';
  private scaleLine!: PixelText;
  private viewportLine!: PixelText;
  private inputLine!: PixelText;
  private unsubscribe: (() => void)[] = [];

  constructor() {
    super(SCENE_KEYS.DevRoom);
  }

  create(): void {
    this.input$ = new InputSystem(this);
    const services = getServices(this.game);
    services.events.emit('scene:entered', { key: SCENE_KEYS.DevRoom });

    this.buildRoom();
    this.buildSign();

    this.player = this.add
      .sprite((MAP_W * TILE_SIZE) / 2, (MAP_H * TILE_SIZE) / 2, 'char.player', 'down-0')
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.world);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, MAP_W * TILE_SIZE, MAP_H * TILE_SIZE);
    camera.startFollow(this.player, true, 0.15, 0.15);

    this.buildHud();
    this.refreshDisplayInfo(services.display.current);
    this.unsubscribe.push(
      services.events.on('display:changed', (r) => this.refreshDisplayInfo(r)),
      // The mode can change without the layout changing (e.g. auto -> pixel-perfect at 1080p).
      services.events.on('settings:changed', ({ changed }) => {
        if (changed.includes('scaleMode')) this.refreshDisplayInfo(services.display.current);
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.unsubscribe.splice(0)) off();
    });

    fadeIn(this, 400);
  }

  override update(_time: number, delta: number): void {
    const { audio, settings } = getServices(this.game);

    if (this.input$.justPressed('cancel') || this.backButtonTapped()) {
      audio.playSfx('ui-cancel');
      fadeToScene(this, SCENE_KEYS.Menu);
      return;
    }
    if (this.input$.justPressed('menu')) {
      const modes = SCALE_MODES;
      const next = modes[(modes.indexOf(settings.get('scaleMode')) + 1) % modes.length] ?? 'auto';
      settings.update({ scaleMode: next });
      audio.playSfx('ui-confirm');
    }

    this.movePlayer(delta);
    this.refreshInputInfo();
  }

  private movePlayer(delta: number): void {
    let { x: dx, y: dy } = this.input$.axis();

    // Touch: hold anywhere (outside the HUD button) to walk toward the finger.
    const pointer = this.input.activePointer;
    if (dx === 0 && dy === 0 && pointer.isDown && !this.pointerOnBackButton(pointer)) {
      const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const vx = world.x - this.player.x;
      const vy = world.y - (this.player.y - 12);
      const len = Math.hypot(vx, vy);
      if (len > 4) {
        dx = vx / len;
        dy = vy / len;
      }
    }

    if (dx === 0 && dy === 0) {
      this.player.anims.stop();
      this.player.setFrame(`${this.facing}-0`);
      return;
    }

    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    this.player.anims.play(`char.player:walk-${this.facing}`, true);

    const step = (PLAYER_SPEED * delta) / 1000;
    const minX = TILE_SIZE + 6;
    const maxX = (MAP_W - 1) * TILE_SIZE - 6;
    const minY = TILE_SIZE * 2 + 4;
    const maxY = (MAP_H - 1) * TILE_SIZE;
    this.player.x = Phaser.Math.Clamp(this.player.x + dx * step, minX, maxX);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy * step, minY, maxY);
    this.player.setDepth(DEPTH.world + this.player.y / 1000); // y-sort for later props
  }

  private buildRoom(): void {
    const data: number[][] = [];
    for (let y = 0; y < MAP_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_W; x++) {
        const edge = x === 0 || y <= 1 || x === MAP_W - 1 || y === MAP_H - 1;
        const corner = (x === 2 || x === MAP_W - 3) && (y === 3 || y === MAP_H - 3);
        row.push(edge ? TILE.wall : corner ? TILE.marker : (x + y) % 2 === 0 ? TILE.floorA : TILE.floorB);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage('dev', 'tiles.basement', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('DevRoom: tileset missing');
    map.createLayer(0, tileset, 0, 0)?.setDepth(DEPTH.background);
  }

  /** In-world text block: checks text stays crisp while the camera scrolls past it. */
  private buildSign(): void {
    const x = TILE_SIZE * 3;
    const y = TILE_SIZE * 3;
    const g = this.add.graphics().setDepth(DEPTH.world - 1);
    g.fillStyle(PALETTE.ink, 0.85);
    g.fillRect(x - 4, y - 4, 300, 92);
    g.fillStyle(PALETTE.slate);
    g.fillRect(x - 4, y - 4, 300, 1);
    g.fillRect(x - 4, y + 87, 300, 1);

    new PixelText(this, x, y, t('dev.sample.ko'), { color: PALETTE.paper }).setDepth(DEPTH.world);
    new PixelText(this, x, y + 16, t('dev.sample.en'), { color: PALETTE.mist }).setDepth(DEPTH.world);
    new PixelText(this, x, y + 32, t('dev.sample.ko'), { font: 'small', color: PALETTE.mitten }).setDepth(DEPTH.world);
    new PixelText(this, x, y + 44, t('dev.sample.en'), { font: 'bold', color: PALETTE.amber }).setDepth(DEPTH.world);
    new PixelText(this, x, y + 58, '잃어버린 것들 2x', { font: 'bold', scale: 2, color: PALETTE.sock }).setDepth(DEPTH.world);
  }

  private buildHud(): void {
    const hud = (obj: Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth): void => {
      obj.setScrollFactor(0);
      obj.setDepth(DEPTH.ui);
    };

    const panel = this.add.graphics();
    panel.fillStyle(PALETTE.ink, 0.8);
    panel.fillRect(0, 0, BASE_WIDTH, 22);
    panel.fillRect(0, BASE_HEIGHT - 44, BASE_WIDTH, 44);
    // Back button (for touch players; keyboard players use X).
    panel.fillStyle(PALETTE.slate);
    panel.fillRect(BACK_BUTTON.x, BACK_BUTTON.y, BACK_BUTTON.w, BACK_BUTTON.h);
    hud(panel);

    hud(new PixelText(this, 6, 5, t('dev.header'), { font: 'bold', color: PALETTE.tag }));
    hud(new PixelText(this, BACK_BUTTON.x + BACK_BUTTON.w / 2, BACK_BUTTON.y + 2, '← TITLE', { font: 'small', color: PALETTE.white, originX: 0.5 }));

    // Bottom panel: help on its own row, then scale | viewport, then input | temp-art notice.
    const touch = this.sys.game.device.input.touch;
    hud(new PixelText(this, 6, BASE_HEIGHT - 41, t(touch ? 'dev.help.touch' : 'dev.help'), {
      font: 'small',
      color: PALETTE.fog,
    }));
    this.scaleLine = new PixelText(this, 6, BASE_HEIGHT - 30, '', { font: 'small', color: PALETTE.paper });
    this.viewportLine = new PixelText(this, BASE_WIDTH - 6, BASE_HEIGHT - 30, '', {
      font: 'small',
      color: PALETTE.mist,
      originX: 1,
    });
    this.inputLine = new PixelText(this, 6, BASE_HEIGHT - 19, '', { font: 'small', color: PALETTE.mitten });
    [this.scaleLine, this.viewportLine, this.inputLine].forEach(hud);
    const temp = placeholderAssets().map((a) => a.key);
    if (temp.length > 0) {
      hud(new PixelText(this, BASE_WIDTH - 6, BASE_HEIGHT - 19, t('title.temp', { list: temp.join(', ') }), {
        font: 'small',
        color: PALETTE.placeholder,
        originX: 1,
      }));
    }
  }

  private refreshDisplayInfo(result: ScaleResult | null): void {
    if (!result || !this.scaleLine) return;
    const { display } = getServices(this.game);
    const device = Number.isInteger(result.deviceScale) ? String(result.deviceScale) : result.deviceScale.toFixed(2);
    this.scaleLine.setText(
      t('dev.scale', {
        mode: t(`scale.${display.scaleMode}`),
        device,
        integer: t(result.integer ? 'dev.integer.yes' : 'dev.integer.no'),
      }),
    );
    this.viewportLine.setText(
      t('dev.viewport', {
        w: Math.round(window.innerWidth),
        h: Math.round(window.innerHeight),
        dpr: Number((window.devicePixelRatio || 1).toFixed(2)),
      }),
    );
  }

  private refreshInputInfo(): void {
    const held = ACTIONS.filter((a) => this.input$.isDown(a));
    const text = t('dev.input', { actions: held.length > 0 ? held.join(' ') : t('dev.input.none') });
    if (this.inputLine.text !== text) this.inputLine.setText(text);
  }

  private pointerOnBackButton(pointer: Phaser.Input.Pointer): boolean {
    const b = BACK_BUTTON;
    return pointer.x >= b.x && pointer.x <= b.x + b.w && pointer.y >= b.y && pointer.y <= b.y + b.h;
  }

  private backButtonTapped(): boolean {
    return this.input$.tapped() && this.pointerOnBackButton(this.input.activePointer);
  }
}
