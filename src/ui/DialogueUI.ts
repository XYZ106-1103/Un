/**
 * Dialogue box: typewriter text with inline effects, portrait + expression, name plate,
 * per-character voice blips, skip / advance, and choices.
 *
 * Driven by a scene that implements DialogueHost: `say()` and `choose()` return promises
 * that resolve when the player advances or picks an option.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, FONTS, PALETTE } from '@/game/Constants';
import { getServices } from '@/game/Services';
import { content } from '@/systems/content/ContentDB';
import type { CharacterDef, VoiceDef } from '@/systems/content/types';
import type { SayPage } from '@/systems/DialogueSystem';
import type { InputSystem } from '@/systems/InputSystem';
import { parseRichText, type RichChar, type RichEvent } from '@/systems/text/RichText';
import { wrapRichText } from '@/systems/text/TextWrap';
import { parseColor } from '@/systems/assets/PixelArt';
import { getLocale } from '@/systems/LocaleSystem';
import { ListMenu } from './ListMenu';
import { drawPanel } from './Panel';
import { PixelText } from './PixelText';

const BOX = { x: 8, w: BASE_WIDTH - 16, h: 70, margin: 6 };
const PORTRAIT = 48;
const LINE_SPACING = 2;
const MAX_LINES = 3;

/** Characters per second for each text speed setting. */
const SPEED_CPS = { slow: 22, normal: 40, fast: 80, instant: Infinity } as const;

const PAUSE_AFTER: Record<string, number> = { '.': 140, '!': 140, '?': 140, '…': 180, ',': 70, '~': 60 };
const SILENT = new Set([' ', '\n', '.', ',', '!', '?', '…', '~', '-', '—', '\'', '"', '(', ')']);

const NARRATOR_VOICE: VoiceDef = { wave: 'triangle', pitch: 330, variance: 20, volume: 0.12, every: 2 };

export class DialogueUI extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.DynamicBitmapText;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly namePlate: Phaser.GameObjects.Graphics;
  private readonly nameText: PixelText;
  private readonly nextMark: Phaser.GameObjects.Image;

  private chars: RichChar[] = [];
  private events: RichEvent[] = [];
  private eventCursor = 0;
  private revealed = 0;
  private budget = 0;
  private waitMs = 0;
  private speedMult = 1;
  private pageSpeed = 1;
  private blips = 0;
  private time = 0;
  private speaker: CharacterDef | undefined;
  private advance: (() => void) | null = null;
  private choice: { menu: ListMenu; panel: Phaser.GameObjects.Container; resolve: (i: number) => void } | null = null;
  private atTop = false;
  /** Lets the story rewrite name plates (the hollow world shows "(물품)"). */
  nameFilter: ((name: string) => string) | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, BOX.x, BASE_HEIGHT - BOX.h - BOX.margin);
    this.bg = scene.add.graphics();
    drawPanel(this.bg, 0, 0, BOX.w, BOX.h);
    this.portrait = scene.add.image(10, 11, '__DEFAULT').setOrigin(0).setVisible(false);
    this.text = new Phaser.GameObjects.DynamicBitmapText(scene, 16, 11, FONTS.body.key, '', FONTS.body.size);
    this.text.setLineSpacing(LINE_SPACING);
    this.text.setDisplayCallback(this.displayCallback);
    this.namePlate = scene.add.graphics();
    this.nameText = new PixelText(scene, 0, 0, '', { font: 'bold' });
    this.nextMark = scene.add.image(BOX.w - 14, BOX.h - 9, 'soul.tag').setOrigin(0.5).setVisible(false);
    this.add([this.bg, this.portrait, this.text, this.namePlate, this.nameText, this.nextMark]);
    this.setDepth(DEPTH.dialogue);
    this.setScrollFactor(0, 0, true);
    this.setVisible(false);
    scene.add.existing(this);
  }

  get isOpen(): boolean {
    return this.visible;
  }

  get typing(): boolean {
    return this.revealed < this.chars.length;
  }

  /** Box at the top of the screen (so it doesn't cover a player standing low). */
  placeTop(top: boolean): void {
    this.atTop = top;
    this.y = top ? BOX.margin + 12 : BASE_HEIGHT - BOX.h - BOX.margin;
  }

  close(): void {
    this.setVisible(false);
    this.closeChoice();
    this.advance = null;
  }

  say(page: SayPage, vars: Record<string, string | number>): Promise<void> {
    if (!this.visible) {
      // Pop in from slightly below/above (whole pixels).
      const targetY = this.y;
      const from = this.atTop ? -6 : 6;
      this.y = targetY + from;
      this.scene.tweens.addCounter({ from, to: 0, duration: 120, onUpdate: (tw) => (this.y = targetY + Math.round(tw.getValue() ?? 0)) });
    }
    this.setVisible(true);
    this.closeChoice();
    this.speaker = page.who ? content.character(page.who) : undefined;
    this.layoutSpeaker(page.face);

    const rich = parseRichText(page.text, vars, getLocale() === 'ko');
    const textX = this.portrait.visible ? 10 + PORTRAIT + 10 : 14;
    const width = BOX.w - textX - 14;
    const { fonts } = getServices(this.scene.game);
    const wrapped = wrapRichText(rich.chars, width, (ch) => fonts.measure('body', ch));
    if (wrapped.lines > MAX_LINES) {
      console.warn(`[Dialogue] page wraps to ${wrapped.lines} lines (max ${MAX_LINES}): "${rich.text.slice(0, 30)}…"`);
    }
    // Re-map event positions onto the wrapped text.
    const remap = new Map<number, number>();
    wrapped.sourceIndex.forEach((src, i) => {
      if (src >= 0 && !remap.has(src)) remap.set(src, i);
    });
    this.events = rich.events
      .map((e) => ({ ...e, at: remap.get(e.at) ?? wrapped.chars.length }))
      .sort((a, b) => a.at - b.at);
    this.chars = wrapped.chars;

    const plain = this.chars.map((c) => c.ch).join('');
    fonts.ensure('body', plain);
    this.text.setPosition(textX, 11);
    this.text.setText(plain);

    this.revealed = 0;
    this.eventCursor = 0;
    this.budget = 0;
    this.waitMs = 0;
    this.blips = 0;
    this.speedMult = 1;
    this.pageSpeed = page.speed ?? 1;
    this.nextMark.setVisible(false);
    if (getServices(this.scene.game).settings.get('textSpeed') === 'instant') this.revealAll();
    return new Promise((resolve) => {
      this.advance = resolve;
    });
  }

  choose(options: string[]): Promise<number> {
    this.closeChoice();
    const { fonts } = getServices(this.scene.game);
    const width = Math.max(...options.map((o) => fonts.measure('body', o))) + 30;
    const h = options.length * 15 + 14;
    const x = BOX.x + BOX.w - width - 4;
    const y = this.atTop ? this.y + BOX.h + 4 : this.y - h - 4;
    const panel = this.scene.add.container(x, y).setDepth(DEPTH.dialogue + 1);
    const g = this.scene.add.graphics();
    drawPanel(g, 0, 0, width, h);
    panel.add(g);
    return new Promise((resolve) => {
      const menu = new ListMenu(this.scene, 8, 7, options.map((label) => ({ label })), {
        width: width - 16,
        lineHeight: 15,
        onConfirm: (i) => {
          this.closeChoice();
          resolve(i);
        },
      });
      panel.add(menu);
      panel.setScrollFactor(0, 0, true);
      this.choice = { menu, panel, resolve };
    });
  }

  /** Changes the current speaker's expression (from a `face` command or `{face=}` tag). */
  setFace(face: string): void {
    if (this.speaker?.portrait && this.scene.textures.get(this.speaker.portrait).has(face)) {
      this.portrait.setFrame(face);
    }
  }

  handle(input: InputSystem): void {
    if (!this.visible) return;
    if (this.choice) {
      this.choice.menu.handle(input);
      return;
    }
    const pressed = input.justPressed('confirm') || input.tapped();
    if (this.typing) {
      // Skip: confirm or cancel reveals the rest of the page.
      if (pressed || input.justPressed('cancel')) this.revealAll();
      return;
    }
    if (pressed && this.advance) {
      const done = this.advance;
      this.advance = null;
      this.nextMark.setVisible(false);
      done();
    }
  }

  tick(delta: number): void {
    this.time += delta;
    if (!this.visible) return;
    if (!this.typing) {
      this.nextMark.setVisible(this.advance !== null && Math.floor(this.time / 400) % 2 === 0);
      this.nextMark.y = BOX.h - 9 + (Math.floor(this.time / 400) % 2);
      return;
    }
    if (this.waitMs > 0) {
      this.waitMs -= delta;
      return;
    }
    const setting = getServices(this.scene.game).settings.get('textSpeed');
    const cps = SPEED_CPS[setting] * this.speedMult * this.pageSpeed;
    this.budget += (delta / 1000) * cps;
    while (this.budget >= 1 && this.typing && this.waitMs <= 0) {
      this.budget -= 1;
      this.revealOne(true);
    }
  }

  private revealOne(withPauses: boolean): void {
    this.fireEvents(withPauses);
    if (this.waitMs > 0 && withPauses) return;
    const c = this.chars[this.revealed];
    this.revealed++;
    if (!c) return;
    if (!SILENT.has(c.ch)) {
      this.blips++;
      const voice = this.speaker?.voice ?? NARRATOR_VOICE;
      if (this.blips % Math.max(1, voice.every) === 1 || voice.every <= 1) {
        getServices(this.scene.game).audio.playVoice(voice);
      }
    }
    if (withPauses && PAUSE_AFTER[c.ch] && this.chars[this.revealed]?.ch !== c.ch) {
      this.waitMs += PAUSE_AFTER[c.ch] as number;
    }
  }

  private fireEvents(withPauses: boolean): void {
    while (this.eventCursor < this.events.length && (this.events[this.eventCursor]?.at ?? Infinity) <= this.revealed) {
      const e = this.events[this.eventCursor++] as RichEvent;
      if (e.type === 'wait' && withPauses) this.waitMs += e.ms;
      else if (e.type === 'speed') this.speedMult = e.value;
      else if (e.type === 'face') this.setFace(e.face);
      else if (e.type === 'sfx' && withPauses) getServices(this.scene.game).audio.playSfx(e.id as never);
    }
  }

  private revealAll(): void {
    while (this.typing) {
      this.fireEvents(false);
      this.revealed++;
    }
    this.fireEvents(false);
    this.waitMs = 0;
  }

  private layoutSpeaker(face?: string): void {
    const sp = this.speaker;
    const hasPortrait = Boolean(sp?.portrait && this.scene.textures.exists(sp.portrait));
    this.portrait.setVisible(hasPortrait);
    if (hasPortrait && sp?.portrait) {
      this.portrait.setTexture(sp.portrait, face ?? sp.defaultFace);
      if (face && !this.scene.textures.get(sp.portrait).has(face)) this.portrait.setFrame(sp.defaultFace ?? 0);
    }
    this.namePlate.clear();
    if (sp) {
      this.nameText.setText(this.nameFilter ? this.nameFilter(sp.name) : sp.name);
      const w = this.nameText.width + 12;
      const color = parseColor(sp.color) ?? PALETTE.paper;
      this.namePlate.fillStyle(PALETTE.ink);
      this.namePlate.fillRect(8, -12, w, 13);
      this.namePlate.fillStyle(color);
      this.namePlate.fillRect(8, -12, w, 1);
      this.namePlate.fillRect(8, -12, 1, 12);
      this.namePlate.fillRect(8 + w - 1, -12, 1, 12);
      this.nameText.setPosition(14, -10).setTint(color).setVisible(true);
    } else {
      this.nameText.setVisible(false);
    }
  }

  private closeChoice(): void {
    if (!this.choice) return;
    this.choice.panel.destroy();
    this.choice = null;
  }

  private readonly displayCallback = (
    data: Phaser.Types.GameObjects.BitmapText.DisplayCallbackConfig,
  ): Phaser.Types.GameObjects.BitmapText.DisplayCallbackConfig => {
    const i = data.index;
    if (i >= this.revealed) {
      data.scale = 0; // not typed yet
      return data;
    }
    const c = this.chars[i];
    const baseColor = this.speaker ? PALETTE.white : PALETTE.paper;
    // Always set an explicit colour: Phaser reuses the previous char's tint otherwise.
    // (`color` exists at runtime but is missing from Phaser's type definitions.)
    (data as typeof data & { color: number }).color = c?.color ?? baseColor;
    if (c?.effect === 'shake') {
      const slice = Math.floor(this.time / 60);
      const h = Math.sin((i + 1) * 12.9898 + slice * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      data.x += r < 0.33 ? -1 : r > 0.66 ? 1 : 0;
      data.y += ((r * 7) % 1) < 0.5 ? 0 : 1;
    } else if (c?.effect === 'wave') {
      data.y += Math.round(Math.sin(this.time / 160 + i * 0.7) * 1.5);
    }
    return data;
  };
}
