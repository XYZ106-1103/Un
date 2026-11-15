/**
 * Title screen and main menu: NEW GAME / CONTINUE / SETTINGS / CREDITS.
 *
 * The logo and backdrop are procedural stand-ins until the manifest entries `ui.logo` /
 * `bg.title` receive real files; while they are placeholders a TEMP ART notice is shown.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, GAME_TITLE, GAME_VERSION, PALETTE, SCENE_KEYS } from '@/game/Constants';
import { GameSession } from '@/game/GameSession';
import { createNewGameState } from '@/game/GameState';
import { getServices } from '@/game/Services';
import { getAsset } from '@/systems/assets/AssetManifest';
import { content } from '@/systems/content/ContentDB';
import { InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import type { SlotId } from '@/systems/SaveSystem';
import { ListMenu } from '@/ui/ListMenu';
import { ConfirmPanel, CreditsPanel, MessagePanel, SettingsPanel, SlotPanel } from '@/ui/MenuPanels';
import { NameEntryPanel } from '@/ui/NameEntryPanel';
import { addPixelShadow, PixelText } from '@/ui/PixelText';
import { UIStack } from '@/ui/UIStack';
import { fadeIn, fadeToScene, isTransitioning, pixelLine } from '@/utils/AnimationUtils';
import { paintDitheredGradient } from '@/utils/DitherUtils';
import startData from '@/data/story/start.json';
import namesData from '@/data/story/names.json';
import creditsData from '@/data/story/credits.json';

/** Top of the logo block. */
const LOGO_TOP = 46;
const STRING_LENGTH = 18;
const MENU_Y = 168;

type NameReaction = { text: string; block?: boolean };
const NAME_REACTIONS = namesData as unknown as Record<string, NameReaction>;

interface Mote {
  x: number;
  y: number;
  speed: number;
  sway: number;
  phase: number;
  color: number;
}

export class MenuScene extends Phaser.Scene {
  private input$!: InputSystem;
  private backdrop!: Phaser.GameObjects.Graphics;
  private motesLayer!: Phaser.GameObjects.Graphics;
  private stringLayer!: Phaser.GameObjects.Graphics;
  private tag!: Phaser.GameObjects.Image;
  private prompt!: PixelText;
  private menu: ListMenu | null = null;
  private readonly ui = new UIStack();
  private motes: Mote[] = [];
  private tagAnchor = { x: 0, y: 0 };
  private pairTag: Phaser.GameObjects.Image | null = null;
  private elapsed = 0;
  private state: 'title' | 'menu' | 'starting' = 'title';

  constructor() {
    super(SCENE_KEYS.Menu);
  }

  create(data?: { skipTitle?: boolean }): void {
    this.state = 'title';
    this.elapsed = 0;
    this.menu = null;
    this.ui.clear();
    this.input$ = new InputSystem(this);
    const services = getServices(this.game);
    services.session = null;
    services.events.emit('scene:entered', { key: SCENE_KEYS.Menu });
    services.audio.playMusic('title');

    this.backdrop = this.add.graphics().setDepth(DEPTH.background);
    this.drawBackdrop();
    this.motesLayer = this.add.graphics().setDepth(DEPTH.background + 1);
    this.motes = Array.from({ length: 48 }, () => this.spawnMote(true));

    this.tagAnchor = this.createLogo();

    this.stringLayer = this.add.graphics().setDepth(DEPTH.ui);
    // Origin on the punched hole (pixel 2,2 of the 10x6 sprite) so the string meets it.
    this.tag = this.add
      .image(this.tagAnchor.x, this.tagAnchor.y + STRING_LENGTH, 'soul.tag')
      .setOrigin(2 / 10, 2 / 6)
      .setDepth(DEPTH.ui);
    // The title remembers how the last chapter ended (MetaSystem): a pair of tags after
    // the return ending, an empty string after the clear ending.
    const lastEnding = services.meta.lastEnding;
    this.tag.setVisible(lastEnding !== 'clear');
    this.pairTag?.destroy();
    this.pairTag =
      lastEnding === 'return'
        ? this.add.image(this.tagAnchor.x, this.tagAnchor.y + STRING_LENGTH + 7, 'soul.tag').setOrigin(2 / 10, 2 / 6).setDepth(DEPTH.ui)
        : null;

    const touch = this.sys.game.device.input.touch;
    this.prompt = new PixelText(this, BASE_WIDTH / 2, 196, t(touch ? 'title.prompt.touch' : 'title.prompt.keys'), {
      color: PALETTE.paper,
      originX: 0.5,
    }).setDepth(DEPTH.ui);

    new PixelText(this, BASE_WIDTH - 6, BASE_HEIGHT - 14, `v${GAME_VERSION}`, {
      font: 'small',
      color: PALETTE.fog,
      originX: 1,
    }).setDepth(DEPTH.ui);

    this.showPlaceholderNotice();
    fadeIn(this, 600);
    if (data?.skipTitle) this.openMenu(false);
  }

  override update(_time: number, delta: number): void {
    this.elapsed += delta;
    this.updateMotes(delta);
    this.updateTag();
    if (isTransitioning(this) || this.state === 'starting') return;

    if (this.state === 'title') {
      // Blink the prompt: steady rhythm, never faster than ~1 Hz (photosensitivity).
      this.prompt.setVisible(Math.floor(this.elapsed / 600) % 2 === 0);
      if (this.input$.justPressed('confirm') || this.input$.tapped()) this.openMenu(true);
      if (import.meta.env.DEV && this.input.keyboard?.checkDown(this.input.keyboard.addKey('F2'), 1000)) {
        fadeToScene(this, SCENE_KEYS.DevRoom);
      }
      return;
    }
    if (this.ui.size > 0) this.ui.handle(this.input$);
    else this.menu?.handle(this.input$);
  }

  private openMenu(withSound: boolean): void {
    this.state = 'menu';
    this.prompt.setVisible(false);
    if (withSound) getServices(this.game).audio.playSfx('title-start');
    const hasSave = getServices(this.game).saves.hasAnySave();
    const items = [
      { label: t('menu.newGame') },
      { label: t('menu.continue'), disabled: !hasSave },
      { label: t('menu.settings') },
      { label: t('menu.credits') },
    ];
    const width = 120;
    // Dark pool behind the menu so it stays legible over the busy backdrop. The edge
    // fades out over 4px with an ordered (Bayer) dither: hard pixels, no alpha blending.
    const pool = this.add.graphics().setDepth(DEPTH.ui - 1);
    const pw = 184;
    const ph = 88;
    const px = (BASE_WIDTH - pw) / 2;
    const py = MENU_Y - 8;
    const FADE = 4;
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    pool.fillStyle(PALETTE.ink).fillRect(px + FADE, py + FADE, pw - FADE * 2, ph - FADE * 2);
    for (let y = py; y < py + ph; y++) {
      for (let x = px; x < px + pw; x++) {
        const edge = Math.min(x - px, px + pw - 1 - x, y - py, py + ph - 1 - y);
        if (edge >= FADE) continue;
        const density = ((edge + 1) / (FADE + 1)) * 16;
        if ((BAYER[(y % 4) * 4 + (x % 4)] ?? 0) < density) pool.fillRect(x, y, 1, 1);
      }
    }
    pool.setAlpha(0);
    this.tweens.add({ targets: pool, alpha: 1, duration: 250 });
    this.menu = new ListMenu(this, (BASE_WIDTH - width) / 2, MENU_Y, items, {
      width,
      lineHeight: 15,
      onConfirm: (i) => this.choose(i),
    }).setDepth(DEPTH.ui);
    if (hasSave) this.menu.select(1, true);
    new PixelText(this, BASE_WIDTH / 2, MENU_Y + 64, hasSave ? t('menu.hint') : t('menu.noSave'), {
      font: 'small',
      color: PALETTE.fog,
      originX: 0.5,
    }).setDepth(DEPTH.ui);
    this.menu.setAlpha(0);
    this.tweens.add({ targets: this.menu, alpha: 1, duration: 250 });
  }

  private choose(index: number): void {
    switch (index) {
      case 0:
        return this.pushPanel(
          new SlotPanel(this, 'new').onPick((slot, summary) => {
            if (summary.status === 'empty') this.askName(slot);
            else {
              this.pushPanel(
                new ConfirmPanel(this, t('slot.overwrite', { n: slot })).onResult((yes) => {
                  if (yes) this.askName(slot);
                }),
              );
            }
          }),
        );
      case 1:
        return this.pushPanel(new SlotPanel(this, 'load').onPick((slot) => this.continueGame(slot)));
      case 2:
        return this.pushPanel(new SettingsPanel(this));
      case 3:
        return this.pushPanel(new CreditsPanel(this, creditsData.lines));
    }
  }

  private pushPanel(panel: SlotPanel | ConfirmPanel | SettingsPanel | CreditsPanel | MessagePanel | NameEntryPanel): void {
    this.menu?.setFocused(false);
    this.ui.push(panel);
    panel.onClose(() => {
      this.ui.remove(panel);
      if (this.ui.size === 0) this.menu?.setFocused(true);
    });
  }

  private askName(slot: SlotId, initial = ''): void {
    this.pushPanel(
      new NameEntryPanel(this, initial).onSubmit((name) => {
        const reaction = NAME_REACTIONS[name.toLowerCase()];
        const confirmName = () =>
          this.pushPanel(
            new ConfirmPanel(this, t('name.confirm', { name }), true).onResult((yes) => {
              if (yes) this.startNewGame(slot, name);
              else this.askName(slot, name);
            }),
          );
        if (!reaction) return confirmName();
        const msg = new MessagePanel(this, reaction.text);
        this.pushPanel(msg);
        msg.onClose(() => {
          this.ui.remove(msg);
          if (reaction.block) this.askName(slot, '');
          else confirmName();
        });
      }),
    );
  }

  private startNewGame(slot: SlotId, name: string): void {
    const map = content.map(startData.map);
    const spawn = map?.spawns[startData.spawn];
    if (!map || !spawn) {
      this.pushPanel(new MessagePanel(this, `start map "${startData.map}" missing`));
      return;
    }
    const state = createNewGameState({
      name,
      map: map.id,
      x: spawn.x,
      y: spawn.y,
      facing: spawn.facing ?? 'down',
      items: startData.items,
    });
    getServices(this.game).meta.recordStart();
    this.launch(new GameSession(state, slot, getServices(this.game).saves), startData.introScript);
  }

  private continueGame(slot: SlotId): void {
    const services = getServices(this.game);
    const result = services.saves.load(slot);
    if (result.status !== 'ok' || !content.map(result.state.location.map)) {
      this.pushPanel(new MessagePanel(this, t('slot.cannotLoad')));
      return;
    }
    const session = new GameSession(result.state, slot, services.saves);
    const undone = services.meta.detectUndo(result.savedAt);
    if (undone) session.setFlags({ meta_undo: undone, meta_undo_seen: false });
    this.launch(session);
  }

  private launch(session: GameSession, introScript?: string): void {
    this.state = 'starting';
    getServices(this.game).session = session;
    getServices(this.game).audio.playMusic(null, 0.8);
    this.ui.clear();
    this.time.delayedCall(200, () => fadeToScene(this, SCENE_KEYS.World, { introScript }, 700));
  }

  /** Draws the logo and subtitle; returns where the tag's string hangs from. */
  private createLogo(): { x: number; y: number } {
    let right: number;
    let bottom: number;
    const logo = getAsset('ui.logo');
    const hasLogoArt = logo && logo.status !== 'placeholder' && this.textures.exists('ui.logo');
    if (hasLogoArt) {
      const frame = logo.kind === 'pixelart' ? 'logo' : undefined;
      const image = this.add.image(BASE_WIDTH / 2, LOGO_TOP - 12, 'ui.logo', frame).setOrigin(0.5, 0).setDepth(DEPTH.ui);
      right = image.x + image.width / 2;
      bottom = image.y + image.height;
    } else {
      // Typeset stand-in for the hand-lettered wordmark (see manifest entry ui.logo).
      const title = new PixelText(this, BASE_WIDTH / 2, LOGO_TOP, GAME_TITLE, {
        font: 'bold',
        scale: 3,
        color: PALETTE.paper,
        originX: 0.5,
      }).setDepth(DEPTH.ui);
      addPixelShadow(title, PALETTE.rust);
      right = title.x + title.width / 2;
      bottom = title.y + title.height;
    }
    new PixelText(this, BASE_WIDTH / 2, bottom + 24, t('title.subtitle'), {
      color: PALETTE.mist,
      originX: 0.5,
    }).setDepth(DEPTH.ui);
    // The tag hangs from just under the last letter.
    return { x: Math.round(right - 8), y: Math.round(bottom - 2) };
  }

  private showPlaceholderNotice(): void {
    const temp = ['ui.logo', 'bg.title'].filter((key) => getAsset(key)?.status === 'placeholder');
    if (temp.length === 0) return;
    new PixelText(this, 6, BASE_HEIGHT - 14, t('title.temp', { list: temp.join(', ') }), {
      font: 'small',
      color: PALETTE.placeholder,
    }).setDepth(DEPTH.ui);
  }

  /** Stand-in backdrop: Bayer-dithered gradient and a light shaft from the drop slot above. */
  private drawBackdrop(): void {
    const art = getAsset('bg.title');
    if (art && art.status !== 'placeholder' && this.textures.exists('bg.title')) {
      this.add.image(0, 0, 'bg.title', art.kind === 'pixelart' ? 'bg' : undefined).setOrigin(0).setDepth(DEPTH.background - 1);
      return;
    }
    const key = 'bg.title.standin';
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key, BASE_WIDTH, BASE_HEIGHT);
      if (texture) {
        paintDitheredGradient(texture.context, BASE_WIDTH, BASE_HEIGHT, [
          PALETTE.ink,
          PALETTE.ink,
          PALETTE.night,
          PALETTE.dusk,
        ]);
        texture.refresh();
      }
    }
    this.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH.background - 1);

    const g = this.backdrop;
    // Light shaft: a warm trapezoid with a stepped, dithered edge.
    g.fillStyle(PALETTE.amber, 0.06);
    const top = { l: BASE_WIDTH / 2 - 18, r: BASE_WIDTH / 2 + 18 };
    for (let y = 0; y < BASE_HEIGHT; y++) {
      const spread = y * 0.35;
      const l = Math.round(top.l - spread);
      const r = Math.round(top.r + spread);
      g.fillRect(l, y, r - l, 1);
      if (y % 2 === 0) g.fillRect(l - 2, y, 2, 1);
      else g.fillRect(r, y, 2, 1);
    }
    // The slot itself.
    g.fillStyle(PALETTE.amber, 0.5);
    g.fillRect(top.l, 0, top.r - top.l, 2);
  }

  private spawnMote(anywhere: boolean): Mote {
    const colors = [PALETTE.paper, PALETTE.mist, PALETTE.amber, PALETTE.fog];
    return {
      x: Phaser.Math.Between(0, BASE_WIDTH),
      y: anywhere ? Phaser.Math.Between(0, BASE_HEIGHT) : -2,
      speed: Phaser.Math.FloatBetween(4, 12),
      sway: Phaser.Math.FloatBetween(2, 8),
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      color: colors[Phaser.Math.Between(0, colors.length - 1)] as number,
    };
  }

  private updateMotes(delta: number): void {
    const g = this.motesLayer;
    g.clear();
    const dt = delta / 1000;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i] as Mote;
      m.y += m.speed * dt;
      m.phase += dt * 0.8;
      if (m.y > BASE_HEIGHT + 2) this.motes[i] = this.spawnMote(false);
      const x = Math.round(m.x + Math.sin(m.phase) * m.sway);
      // Motes inside the light shaft glow brighter.
      const inShaft = Math.abs(x - BASE_WIDTH / 2) < 18 + m.y * 0.35;
      g.fillStyle(m.color, inShaft ? 0.9 : 0.35);
      g.fillRect(x, Math.round(m.y), 1, 1);
    }
  }

  private updateTag(): void {
    const angle = Math.sin(this.elapsed / 900) * 0.35;
    const x = this.tagAnchor.x + Math.sin(angle) * STRING_LENGTH;
    const y = this.tagAnchor.y + Math.cos(angle) * STRING_LENGTH;
    // Move without rotating: rotation would smear the 10px sprite's pixels.
    this.tag.setPosition(Math.round(x), Math.round(y));
    const g = this.stringLayer;
    g.clear();
    g.fillStyle(PALETTE.mist);
    // After the clear ending the string hangs empty and still.
    if (!this.tag.visible) {
      pixelLine(g, this.tagAnchor.x, this.tagAnchor.y, this.tagAnchor.x, this.tagAnchor.y + STRING_LENGTH);
      return;
    }
    pixelLine(g, this.tagAnchor.x, this.tagAnchor.y, Math.round(x), Math.round(y));
    if (this.pairTag) {
      // The second tag hangs a little lower on the same string, swinging slightly out of step.
      const a2 = Math.sin(this.elapsed / 900 - 0.4) * 0.35;
      const x2 = this.tagAnchor.x + Math.sin(a2) * (STRING_LENGTH + 7);
      const y2 = this.tagAnchor.y + Math.cos(a2) * (STRING_LENGTH + 7);
      this.pairTag.setPosition(Math.round(x2), Math.round(y2));
      pixelLine(g, Math.round(x), Math.round(y), Math.round(x2), Math.round(y2));
    }
  }
}
