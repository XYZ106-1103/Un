/**
 * Overworld: builds a map from data, runs exploration (movement, collision, NPCs,
 * inspection, triggers, exits, save points, random encounters) and hosts dialogue
 * scripts. Map transitions restart this scene with new data.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, PALETTE, SCENE_KEYS, TILE_SIZE } from '@/game/Constants';
import type { GameSession } from '@/game/GameSession';
import { getServices } from '@/game/Services';
import { NPC } from '@/entities/NPC';
import { Player } from '@/entities/Player';
import { getAsset } from '@/systems/assets/AssetManifest';
import { content } from '@/systems/content/ContentDB';
import type { CommandNode, Facing, FlagValue, MapDef, ObjectDef, SavePointDef } from '@/systems/content/types';
import { DialogueRunner, type DialogueHost, type SayPage } from '@/systems/DialogueSystem';
import { InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import { evaluateCondition, type Resolver } from '@/systems/script/Condition';
import type { Rect } from '@/systems/VirtualControls';
import { DialogueUI } from '@/ui/DialogueUI';
import { PauseMenu, SavePanel, showMapBanner } from '@/ui/PauseMenu';
import { UIStack } from '@/ui/UIStack';
import { fadeIn, fadeToScene, isTransitioning, wait } from '@/utils/AnimationUtils';
import type { BattleData, BattleResult } from './BattleScene';

export interface WorldData {
  map?: string;
  spawn?: string;
  introScript?: string;
}

interface WorldObject {
  def: ObjectDef | SavePointDef;
  rect: Rect;
  solid: boolean;
  sprite?: Phaser.GameObjects.Image;
  save: boolean;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const contains = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const tileRect = (x: number, y: number, w = 1, h = 1): Rect => ({ x: x * TILE_SIZE, y: y * TILE_SIZE, w: w * TILE_SIZE, h: h * TILE_SIZE });

export class WorldScene extends Phaser.Scene implements DialogueHost {
  private input$!: InputSystem;
  private session!: GameSession;
  private map!: MapDef;
  private solid: boolean[] = [];
  private mapW = 0;
  private mapH = 0;
  private player!: Player;
  private npcs: NPC[] = [];
  private objects: WorldObject[] = [];
  private dialogue!: DialogueUI;
  private readonly ui = new UIStack();
  private runner: DialogueRunner | null = null;
  private busy = false;
  private insideTriggers = new Set<string>();
  private insideExit = false;
  private stepsToEncounter = Infinity;
  private hint!: Phaser.GameObjects.Image;
  private motes: { x: number; y: number; s: number; p: number }[] = [];
  private motesLayer: Phaser.GameObjects.Graphics | null = null;
  private elapsed = 0;

  constructor() {
    super(SCENE_KEYS.World);
  }

  create(data: WorldData = {}): void {
    const services = getServices(this.game);
    if (!services.session) {
      this.scene.start(SCENE_KEYS.Menu);
      return;
    }
    this.session = services.session;
    this.input$ = new InputSystem(this);
    this.ui.clear();
    this.busy = false;
    this.runner = null;
    this.npcs = [];
    this.objects = [];
    this.insideTriggers = new Set();
    this.elapsed = 0;

    const state = this.session.state;
    const map = content.map(data.map ?? state.location.map) ?? content.map('chute-bottom');
    if (!map) throw new Error('WorldScene: no map available');
    this.map = map;

    const spawn = data.spawn ? map.spawns[data.spawn] : undefined;
    const tx = spawn?.x ?? state.location.x;
    const ty = spawn?.y ?? state.location.y;
    const facing: Facing = spawn?.facing ?? state.location.facing;
    state.location = { map: map.id, x: tx, y: ty, facing };

    this.buildTiles();
    this.buildObjects();
    this.buildNpcs();
    this.player = new Player(this, tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE - 2, facing);
    // Standing on an exit/trigger at spawn must not fire it immediately.
    this.insideExit = this.exitAt() !== null;
    for (const trig of map.triggers) if (overlaps(this.player.hitbox(), tileRect(trig.x, trig.y, trig.w, trig.h))) this.insideTriggers.add(trig.id);

    this.setupCamera();
    this.buildAmbience();
    this.hint = this.add.image(0, 0, 'ui.icons', 'talk').setOrigin(0.5, 1).setDepth(DEPTH.worldOverlay).setVisible(false);
    this.dialogue = new DialogueUI(this);
    this.resetEncounterCounter();

    services.events.emit('scene:entered', { key: SCENE_KEYS.World });
    services.audio.playMusic(map.music);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.runner?.abort());

    fadeIn(this, 400);
    if (data.map && !data.introScript) this.session.save('auto');
    showMapBanner(this, map.name);

    const intro = data.introScript ?? map.onEnter;
    if (intro) this.time.delayedCall(450, () => void this.runScript(intro));
  }

  override update(_time: number, delta: number): void {
    if (!this.session) return;
    this.elapsed += delta;
    this.session.addPlayTime(delta);
    this.dialogue.tick(delta);
    this.updateAmbience(delta);
    const frozen = this.busy || this.ui.size > 0 || isTransitioning(this);
    for (const npc of this.npcs) npc.update(delta, (r, self) => this.blockedFor(r, self), frozen);

    // Panels opened by a running script (e.g. the save panel) take input before dialogue.
    if (this.ui.size > 0) {
      this.player.stop();
      this.hint.setVisible(false);
      this.ui.handle(this.input$);
      return;
    }
    if (this.busy) {
      this.player.stop();
      this.hint.setVisible(false);
      this.dialogue.handle(this.input$);
      return;
    }
    if (isTransitioning(this)) return;

    if (this.input$.justPressed('menu')) {
      this.player.stop();
      this.openPauseMenu();
      return;
    }

    const axis = this.input$.axis();
    // A quick tap (pressed and released within one frame) still turns the player,
    // so they can face something adjacent without stepping.
    if (axis.x === 0 && axis.y === 0) {
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        if (this.input$.justPressed(dir)) this.player.face(dir);
      }
    }
    const moved = this.player.move(axis, this.input$.isDown('cancel'), delta, (r) => this.blocked(r));
    if (moved > 0) {
      const st = this.session.state;
      st.location.x = Math.floor(this.player.x / TILE_SIZE);
      st.location.y = Math.floor((this.player.y - 1) / TILE_SIZE);
      st.location.facing = this.player.facing;
      st.stats.steps += moved / TILE_SIZE;
      if (this.checkExits() || this.checkTriggers() || this.checkEncounter(moved)) return;
    } else {
      this.session.state.location.facing = this.player.facing;
    }

    const target = this.interactTarget();
    this.updateHint(target);
    if (target && this.input$.justPressed('confirm')) this.interact(target);
  }

  // ── Map building ────────────────────────────────────────────────────────────

  private buildTiles(): void {
    const m = this.map;
    const rows = m.layout.map((r) => [...r]);
    this.mapH = rows.length;
    this.mapW = rows[0]?.length ?? 0;
    const asset = getAsset(m.tileset);
    const frameNames = asset?.kind === 'pixelart' ? Object.keys(asset.doc.frames) : [];
    const index = (name?: string) => (name ? frameNames.indexOf(name) : -1);

    const ground: number[][] = [];
    const deco: number[][] = [];
    const over: number[][] = [];
    this.solid = new Array(this.mapW * this.mapH).fill(false);
    rows.forEach((row, y) => {
      ground.push([]);
      deco.push([]);
      over.push([]);
      row.forEach((ch, x) => {
        const entry = m.legend[ch];
        ground[y]?.push(index(entry?.tile));
        const decoIndex = index(entry?.deco);
        const isOver = Boolean(entry?.over);
        deco[y]?.push(isOver ? -1 : decoIndex);
        over[y]?.push(isOver ? decoIndex : -1);
        this.solid[y * this.mapW + x] = Boolean(entry?.solid && !entry.secret);
      });
    });
    const build = (data: number[][], depth: number) => {
      const tm = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
      const ts = tm.addTilesetImage('tiles', m.tileset, TILE_SIZE, TILE_SIZE, 0, 0);
      if (ts) tm.createLayer(0, ts, 0, 0)?.setDepth(depth);
    };
    build(ground, DEPTH.background);
    build(deco, DEPTH.background + 1);
    build(over, DEPTH.worldOverlay - 1);
  }

  private buildObjects(): void {
    const resolve = this.session.resolver();
    for (const def of this.map.objects) {
      if (!evaluateCondition(def.if, resolve)) continue;
      const rect = tileRect(def.x, def.y, def.w, def.h);
      const obj: WorldObject = { def, rect, solid: Boolean(def.solid), save: false };
      if (def.sprite) {
        obj.sprite = this.add
          .image(rect.x + rect.w / 2, rect.y + rect.h, this.map.tileset, def.sprite)
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.world + (rect.y + rect.h) / 10);
      }
      this.objects.push(obj);
    }
    for (const def of this.map.savePoints) {
      const rect = tileRect(def.x, def.y);
      const sprite = this.add
        .sprite(rect.x + 8, rect.y + 16, 'obj.stamp-desk')
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.world + (rect.y + 16) / 10);
      if (this.anims.exists('obj.stamp-desk:idle')) sprite.play('obj.stamp-desk:idle');
      this.objects.push({ def, rect, solid: true, save: true, sprite });
    }
  }

  private buildNpcs(): void {
    const resolve = this.session.resolver();
    for (const def of this.map.npcs) {
      if (!evaluateCondition(def.if, resolve)) continue;
      const character = content.character(def.character);
      if (!character) continue;
      const npc = new NPC(this, def, character);
      if (this.session.flag(`hidden:${def.id}`) === true) npc.setHidden(true);
      this.npcs.push(npc);
    }
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    const w = this.mapW * TILE_SIZE;
    const h = this.mapH * TILE_SIZE;
    // Small rooms are centred instead of pinned to the top-left.
    const bx = w < BASE_WIDTH ? -(BASE_WIDTH - w) / 2 : 0;
    const by = h < BASE_HEIGHT ? -(BASE_HEIGHT - h) / 2 : 0;
    cam.setBounds(Math.round(bx), Math.round(by), Math.max(w, BASE_WIDTH), Math.max(h, BASE_HEIGHT));
    cam.startFollow(this.player.sprite, true, 0.2, 0.2, 0, 8);
    cam.setBackgroundColor(PALETTE.ink);
  }

  private buildAmbience(): void {
    const amb = this.map.ambience;
    if (amb?.lightShaft) {
      const g = this.add.graphics().setDepth(DEPTH.worldOverlay);
      const { x, width } = amb.lightShaft;
      const h = this.mapH * TILE_SIZE;
      g.fillStyle(PALETTE.amber, 0.07);
      for (let y = 0; y < h; y++) {
        const spread = y * 0.25;
        g.fillRect(Math.round(x - width / 2 - spread), y, Math.round(width + spread * 2), 1);
      }
    }
    if (amb?.dust) {
      // Dust drifts inside the room only (world space), never over the void outside it.
      this.motesLayer = this.add.graphics().setDepth(DEPTH.worldOverlay + 1);
      const area = (this.mapW * this.mapH) / 240;
      this.motes = Array.from({ length: Math.round(Math.min(60, Math.max(12, area * 12))) }, () => ({
        x: TILE_SIZE + Math.random() * (this.mapW - 2) * TILE_SIZE,
        y: TILE_SIZE + Math.random() * (this.mapH - 2) * TILE_SIZE,
        s: 3 + Math.random() * 8,
        p: Math.random() * Math.PI * 2,
      }));
    } else {
      this.motesLayer = null;
    }
  }

  private updateAmbience(delta: number): void {
    const g = this.motesLayer;
    if (!g) return;
    g.clear();
    for (const m of this.motes) {
      m.y += (m.s * delta) / 1000;
      m.p += delta / 1200;
      if (m.y > (this.mapH - 1) * TILE_SIZE) {
        m.y = TILE_SIZE;
        m.x = TILE_SIZE + Math.random() * (this.mapW - 2) * TILE_SIZE;
      }
      g.fillStyle(PALETTE.paper, 0.35);
      g.fillRect(Math.round(m.x + Math.sin(m.p) * 4), Math.round(m.y), 1, 1);
    }
  }

  // ── Collision & queries ─────────────────────────────────────────────────────

  private solidTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return true;
    return this.solid[ty * this.mapW + tx] === true;
  }

  private rectHitsTiles(r: Rect): boolean {
    const x0 = Math.floor(r.x / TILE_SIZE);
    const y0 = Math.floor(r.y / TILE_SIZE);
    const x1 = Math.floor((r.x + r.w - 0.01) / TILE_SIZE);
    const y1 = Math.floor((r.y + r.h - 0.01) / TILE_SIZE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.solidTile(x, y)) return true;
    return false;
  }

  private blocked(r: Rect): boolean {
    if (this.rectHitsTiles(r)) return true;
    if (this.npcs.some((n) => !n.hidden && overlaps(r, n.body()))) return true;
    return this.objects.some((o) => o.solid && overlaps(r, this.objectBody(o)));
  }

  private blockedFor(r: Rect, self: NPC): boolean {
    if (this.rectHitsTiles(r)) return true;
    if (overlaps(r, this.player.hitbox())) return true;
    if (this.npcs.some((n) => n !== self && !n.hidden && overlaps(r, n.body()))) return true;
    return this.objects.some((o) => o.solid && overlaps(r, this.objectBody(o)));
  }

  /** Solid objects block with their lower part only, so the player can stand "behind" them. */
  private objectBody(o: WorldObject): Rect {
    return { x: o.rect.x + 1, y: o.rect.y + o.rect.h - 10, w: o.rect.w - 2, h: 10 };
  }

  private interactTarget(): NPC | WorldObject | null {
    const p = this.player.probe();
    const npc = this.npcs.find((n) => !n.hidden && contains(n.talkArea(), p.x, p.y));
    if (npc) return npc;
    // A little slack so standing flush against an object still counts as facing it.
    const slack = (r: Rect): Rect => ({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 });
    return this.objects.find((o) => contains(slack(o.rect), p.x, p.y)) ?? null;
  }

  private updateHint(target: NPC | WorldObject | null): void {
    if (!target) {
      this.hint.setVisible(false);
      return;
    }
    const bob = Math.floor(this.elapsed / 350) % 2;
    const x = target instanceof NPC ? target.x : target.rect.x + target.rect.w / 2;
    const top = target instanceof NPC ? target.sprite.getTopCenter().y : (target.sprite?.getTopCenter().y ?? target.rect.y);
    this.hint.setPosition(Math.round(x), Math.round(top - 2 - bob)).setVisible(true);
  }

  private exitAt() {
    const hb = this.player.hitbox();
    const resolve = this.session.resolver();
    return this.map.exits.find((e) => overlaps(hb, tileRect(e.x, e.y, e.w, e.h)) && evaluateCondition(e.if, resolve)) ?? null;
  }

  private checkExits(): boolean {
    const exit = this.exitAt();
    if (!exit) {
      this.insideExit = false;
      return false;
    }
    if (this.insideExit) return false;
    this.insideExit = true;
    this.goToMap(exit.to, exit.spawn);
    return true;
  }

  private checkTriggers(): boolean {
    const hb = this.player.hitbox();
    const resolve = this.session.resolver();
    for (const trig of this.map.triggers) {
      const inside = overlaps(hb, tileRect(trig.x, trig.y, trig.w, trig.h));
      if (!inside) {
        this.insideTriggers.delete(trig.id);
        continue;
      }
      if (this.insideTriggers.has(trig.id)) continue;
      this.insideTriggers.add(trig.id);
      const onceFlag = `trigger:${this.map.id}.${trig.id}`;
      if (trig.once && this.session.flag(onceFlag)) continue;
      if (!evaluateCondition(trig.if, resolve)) continue;
      if (trig.once) this.session.setFlags({ [onceFlag]: true });
      void this.runScript(trig.script);
      return true;
    }
    return false;
  }

  private resetEncounterCounter(): void {
    const enc = this.map.encounters;
    this.stepsToEncounter = enc ? enc.steps * (0.6 + Math.random() * 0.8) : Infinity;
  }

  private checkEncounter(movedPx: number): boolean {
    const enc = this.map.encounters;
    if (!enc || !evaluateCondition(enc.if, this.session.resolver())) return false;
    this.stepsToEncounter -= movedPx / TILE_SIZE;
    if (this.stepsToEncounter > 0) return false;
    this.resetEncounterCounter();
    const group = Phaser.Utils.Array.GetRandom(enc.groups) as string[];
    void this.runCommands(async () => {
      await this.battle(group);
    });
    return true;
  }

  // ── Interaction & scripts ───────────────────────────────────────────────────

  private interact(target: NPC | WorldObject): void {
    if (target instanceof NPC) {
      target.faceTowards(this.player.x, this.player.y);
      void this.runScript(target.def.script);
    } else {
      void this.runScript(target.def.script);
    }
  }

  async runScript(id: string): Promise<void> {
    if (this.busy) return;
    await this.runCommands(async () => {
      this.runner = new DialogueRunner((sid) => content.script(sid), this);
      await this.runner.run(id);
    });
  }

  /** Locks exploration while `body` runs, then closes the dialogue box. */
  private async runCommands(body: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      await body();
    } finally {
      if (this.scene.isActive() || this.scene.isSleeping()) {
        this.dialogue.close();
        this.busy = false;
        this.runner = null;
      }
    }
  }

  say(page: SayPage): Promise<void> {
    const screenY = this.player.y - this.cameras.main.worldView.y;
    this.dialogue.placeTop(screenY > BASE_HEIGHT - 96);
    return this.dialogue.say(page, { player: this.session.state.name, buttons: this.session.state.buttons });
  }

  choose(options: string[]): Promise<number> {
    return this.dialogue.choose(options);
  }

  setFlags(changes: Record<string, FlagValue>): void {
    this.session.setFlags(changes);
  }

  resolver(): Resolver {
    return this.session.resolver((key) => (key === 'map' ? this.map.id : undefined));
  }

  async command(cmd: CommandNode): Promise<void> {
    const services = getServices(this.game);
    const num = (k: string, d = 0) => (typeof cmd[k] === 'number' ? (cmd[k] as number) : d);
    const str = (k: string) => (typeof cmd[k] === 'string' ? (cmd[k] as string) : '');
    const state = this.session.state;
    switch (cmd.do) {
      case 'sfx':
        services.audio.playSfx(str('id') as never);
        return;
      case 'music':
        services.audio.playMusic(cmd.id === null ? null : str('id'), num('fade', 0.6));
        return;
      case 'shake': {
        const strength = services.settings.get('screenShake');
        const duration = num('duration', 300);
        if (strength > 0) this.cameras.main.shake(duration, 0.004 * num('intensity', 2) * strength);
        await wait(this, duration);
        return;
      }
      case 'flash': {
        const duration = num('duration', 300);
        if (services.settings.get('reduceFlashing')) {
          this.cameras.main.fadeOut(duration / 2, 40, 36, 52);
          await wait(this, duration / 2);
          this.cameras.main.fadeIn(duration / 2, 40, 36, 52);
        } else {
          this.cameras.main.flash(duration, 247, 244, 234);
        }
        await wait(this, duration);
        return;
      }
      case 'wait':
        await wait(this, num('ms', 500));
        return;
      case 'face':
        this.dialogue.setFace(str('face'));
        return;
      case 'item.add': {
        const item = content.item(str('id'));
        if (!item) return;
        const ok = this.session.inventory.add(item.id);
        if (cmd.quiet !== true) {
          services.audio.playSfx(ok ? 'tag-chime' : 'ui-deny');
          await this.say({ text: ok ? t('item.got', { item: item.name }) : t('item.full'), page: 0, pages: 1 });
        }
        if (!ok && typeof cmd.failFlag === 'string') this.session.setFlags({ [cmd.failFlag]: true });
        return;
      }
      case 'item.remove':
        this.session.inventory.remove(str('id'));
        return;
      case 'buttons':
        state.buttons = Math.max(0, state.buttons + num('amount'));
        return;
      case 'heal':
        state.hp = cmd.amount === 'full' ? state.maxHp : Math.min(state.maxHp, state.hp + num('amount'));
        return;
      case 'relation':
        this.session.addRelation(str('id'), num('amount', 1));
        return;
      case 'battle': {
        const enemies = Array.isArray(cmd.enemies) ? (cmd.enemies as string[]) : [];
        const result = await this.battle(enemies, cmd.canFlee !== false);
        this.session.setFlags({ last_battle: result });
        return;
      }
      case 'save':
        await this.openSavePanel();
        return;
      case 'map':
        this.goToMap(str('to'), str('spawn'));
        this.runner?.abort();
        return;
      case 'npc.hide':
      case 'npc.show': {
        const npc = this.npcs.find((n) => n.def.id === str('id'));
        const hide = cmd.do === 'npc.hide';
        npc?.setHidden(hide);
        this.session.setFlags({ [`hidden:${str('id')}`]: hide });
        return;
      }
      case 'npc.face':
        this.npcs.find((n) => n.def.id === str('id'))?.face(str('facing') as Facing);
        return;
      case 'npc.move': {
        const npc = this.npcs.find((n) => n.def.id === str('id'));
        if (npc) await npc.walkTo(num('x') * TILE_SIZE + TILE_SIZE / 2, num('y') * TILE_SIZE + TILE_SIZE - 2, num('speed', 50));
        return;
      }
      case 'player.face':
        this.player.face(str('facing') as Facing);
        return;
      default:
        return;
    }
  }

  // ── Battles, saving, transitions ────────────────────────────────────────────

  private battle(enemies: string[], canFlee = true): Promise<BattleResult> {
    return new Promise((resolve) => {
      const services = getServices(this.game);
      this.player.stop();
      this.dialogue.close();
      services.audio.playSfx('ui-deny');
      // Encounter sting: the claim tag blinks over the player before the screen cuts.
      const tag = this.add.image(this.player.x, this.player.y - 28, 'soul.tag').setDepth(DEPTH.transition);
      this.tweens.add({ targets: tag, alpha: 0, yoyo: true, repeat: 2, duration: 90 });
      this.time.delayedCall(560, () => {
        tag.destroy();
        const data: BattleData = {
          enemies,
          canFlee,
          returnTo: SCENE_KEYS.World,
          onEnd: (result) => {
            if (result !== 'defeat') {
              services.audio.playMusic(this.map.music);
              this.cameras.main.fadeIn(300, 11, 10, 16);
            }
            resolve(result);
          },
        };
        this.scene.launch(SCENE_KEYS.Battle, data);
        this.scene.sleep();
      });
    });
  }

  private openSavePanel(): Promise<void> {
    return new Promise((resolve) => {
      this.dialogue.close();
      const panel = new SavePanel(this, this.session, this.map.name).onResult((saved) => {
        this.ui.remove(panel);
        if (saved) this.session.state.hp = this.session.state.maxHp;
        resolve();
      });
      this.session.state.lastSavePoint = this.map.id;
      this.ui.push(panel);
    });
  }

  private openPauseMenu(): void {
    const menu = new PauseMenu(this, this.session, {
      onText: (lines) => {
        void this.runCommands(async () => {
          for (let i = 0; i < lines.length; i++) await this.say({ text: lines[i] as string, page: i, pages: lines.length });
        });
      },
      onQuit: () => {
        getServices(this.game).audio.playMusic(null);
        fadeToScene(this, SCENE_KEYS.Menu, { skipTitle: true });
      },
      onClose: () => this.ui.remove(menu),
    });
    this.ui.push(menu);
  }

  private goToMap(mapId: string, spawn: string): void {
    if (!content.map(mapId)?.spawns[spawn]) {
      console.error(`[World] exit to unknown ${mapId}:${spawn}`);
      return;
    }
    this.player.stop();
    getServices(this.game).audio.playSfx('ui-move');
    fadeToScene(this, SCENE_KEYS.World, { map: mapId, spawn } satisfies WorldData, 300);
  }
}
