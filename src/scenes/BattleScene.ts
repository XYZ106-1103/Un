/**
 * Battle: the turn loop of player action → enemy speech → dodging, ending in victory
 * (everyone let go or cleared), flight, or defeat.
 *
 * Written as an async sequence; each frame routes input to whichever widget is waiting
 * (`focus`) and steps the soul and bullets while dodging.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, DEPTH, PALETTE, SCENE_KEYS } from '@/game/Constants';
import type { GameSession } from '@/game/GameSession';
import { getServices } from '@/game/Services';
import { EnemyView } from '@/entities/Enemy';
import { Soul, SOUL_RADIUS } from '@/entities/Soul';
import { BattleModel, type EnemyState } from '@/systems/BattleSystem';
import { BulletSystem } from '@/systems/BulletSystem';
import { content } from '@/systems/content/ContentDB';
import type { EnemyDef } from '@/systems/content/types';
import { InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import type { Rect } from '@/systems/VirtualControls';
import { AttackMeter, BattleBox, BoxText, CommandBar, SpeechBubble, StatsLine } from '@/ui/BattleUI';
import { ListMenu, type ListItem } from '@/ui/ListMenu';
import { paintDitheredGradient } from '@/utils/DitherUtils';
import { SeededRandom } from '@/utils/MathUtils';
import { wait } from '@/utils/AnimationUtils';

export type BattleResult = 'spared' | 'cleared' | 'mixed' | 'fled' | 'defeat';

export interface BattleData {
  enemies: string[];
  canFlee?: boolean;
  returnTo: string;
  onEnd: (result: BattleResult) => void;
  music?: string;
  seed?: number;
}

const TEXT_BOX: Rect = { x: 20, y: 124, w: BASE_WIDTH - 40, h: 72 };
const ENEMY_BASELINE = 116;

interface Focus {
  handle(input: InputSystem): void;
}

export class BattleScene extends Phaser.Scene {
  private input$!: InputSystem;
  private session!: GameSession;
  private model!: BattleModel;
  private views: EnemyView[] = [];
  private box!: BattleBox;
  private boxText!: BoxText;
  private commands!: CommandBar;
  private stats!: StatsLine;
  private bubble!: SpeechBubble;
  private meter!: AttackMeter;
  private bullets!: BulletSystem;
  private soul!: Soul;
  private focus: Focus | null = null;
  private dodging = false;
  private data$!: BattleData;
  private rng!: SeededRandom;
  private finished = false;
  private maskShape: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super(SCENE_KEYS.Battle);
  }

  create(data: BattleData): void {
    const services = getServices(this.game);
    if (!services.session) {
      this.scene.stop();
      return;
    }
    this.session = services.session;
    this.data$ = data;
    this.finished = false;
    this.dodging = false;
    this.focus = null;
    this.input$ = new InputSystem(this);
    this.rng = new SeededRandom(data.seed ?? Math.floor(Math.random() * 2 ** 31));
    services.events.emit('scene:entered', { key: SCENE_KEYS.Battle });
    services.audio.playMusic(data.music ?? 'battle', 0.2);

    const defs = data.enemies.map((id) => content.enemy(id)).filter((d): d is EnemyDef => d !== undefined);
    this.model = new BattleModel(defs, this.session.state, this.session.inventory, this.rng);
    this.drawBackground();
    this.views = this.model.enemies.map((e, i, all) => {
      const spacing = BASE_WIDTH / (all.length + 1);
      return new EnemyView(this, e, Math.round(spacing * (i + 1)), ENEMY_BASELINE);
    });

    this.box = new BattleBox(this, TEXT_BOX);
    this.boxText = new BoxText(this, this.box);
    this.stats = new StatsLine(this, 204);
    this.stats.refresh(this.session.state);
    this.commands = new CommandBar(this, 226);
    this.bubble = new SpeechBubble(this);
    this.meter = new AttackMeter(this, this.box);
    const bulletLayer = this.add.container(0, 0).setDepth(DEPTH.ui + 4);
    // Bullets are clipped to the battle box. The mask shape is not on the display list,
    // so it must be destroyed explicitly when the battle ends.
    this.maskShape = this.make.graphics({});
    bulletLayer.setMask(this.maskShape.createGeometryMask());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.maskShape?.destroy();
      this.maskShape = null;
    });
    this.bullets = new BulletSystem(this, bulletLayer);
    this.soul = new Soul(this);

    this.cameras.main.fadeIn(250, 11, 10, 16);
    void this.run();
  }

  override update(_time: number, delta: number): void {
    if (!this.model) return;
    if (this.maskShape) {
      const r = this.box.rect;
      this.maskShape.clear().fillStyle(0xffffff).fillRect(r.x, r.y, r.w, r.h);
    }
    this.session.addPlayTime(delta);
    this.boxText.update(delta);
    this.bubble.update(delta);
    this.meter.update(delta);
    if (this.dodging) this.updateDodge(delta);
    else this.focus?.handle(this.input$);
  }

  // ── Turn loop ───────────────────────────────────────────────────────────────

  private async run(): Promise<void> {
    const first = this.model.enemies[0];
    if (!first) return this.end('fled');
    await this.say([first.def.encounter]);
    for (;;) {
      await this.playerTurn();
      if (this.checkEnd()) return;
      await this.enemyTurn();
      if (this.checkEnd()) return;
      this.model.nextTurn();
    }
  }

  private checkEnd(): boolean {
    const outcome = this.model.outcome();
    if (!outcome) return false;
    if (outcome === 'defeat') void this.defeat();
    else if (outcome === 'fled') void this.end('fled');
    else void this.victory();
    return true;
  }

  private async playerTurn(): Promise<void> {
    for (;;) {
      this.boxText.show(this.model.flavor()[0] ?? '', this.vars(), false);
      this.focus = { handle: (input) => this.commands.handle(input) };
      const command = await this.commands.choose();
      this.boxText.clear();
      const acted = await [this.doClear, this.doAct, this.doPocket, this.doLetGo][command]?.call(this);
      if (acted) return;
    }
  }

  private async doClear(): Promise<boolean> {
    const target = await this.pickTarget();
    if (!target) return false;
    this.focus = this.meter;
    const accuracy = await this.meter.run();
    const result = this.model.attack(target, accuracy);
    const view = this.views[target.index];
    getServices(this.game).audio.playSfx(result.miss ? 'ui-deny' : 'ui-cancel');
    if (!result.miss && getServices(this.game).settings.get('screenShake') > 0) this.cameras.main.shake(120, 0.004);
    await view?.hit(result.damage, result.critical, result.miss);
    if (result.cleared) {
      view?.cleared();
      await this.say([t('battle.cleared', { enemy: target.def.name }), ...(target.def.clearedText ? [target.def.clearedText] : [])]);
    }
    return true;
  }

  private async doAct(): Promise<boolean> {
    const target = await this.pickTarget();
    if (!target) return false;
    const acts = this.model.acts(target);
    const index = await this.pickFromList(
      acts.map(({ act, enabled }) => ({ label: act.label, disabled: false, color: enabled ? undefined : PALETTE.fog })),
      2,
    );
    if (index === null) return false;
    const chosen = acts[index];
    if (!chosen) return false;
    let lines: string[];
    if (chosen.act.id === 'check') {
      const checkLine = t('battle.check', { enemy: target.def.name, atk: target.def.attack, def: target.def.defense });
      lines = [`${checkLine}\n${target.def.check}`, ...this.model.performAct(target, 'check')];
    } else {
      lines = this.model.performAct(target, chosen.act.id);
    }
    await this.say(lines);
    return true;
  }

  private async doPocket(): Promise<boolean> {
    const items = this.session.inventory.items;
    if (items.length === 0) {
      await this.say([t('pocket.empty')]);
      return false;
    }
    const index = await this.pickFromList(items.map((i) => ({ label: i.name })), 2);
    if (index === null) return false;
    const result = this.model.useItem(index);
    getServices(this.game).audio.playSfx(result.healed > 0 ? 'tag-chime' : 'ui-confirm');
    this.stats.refresh(this.session.state);
    await this.say(result.text);
    return true;
  }

  private async doLetGo(): Promise<boolean> {
    const options: ListItem[] = [
      { label: t('battle.spare'), color: this.model.active.some((e) => this.model.canSpare(e)) ? PALETTE.tag : undefined },
      { label: t('battle.flee'), disabled: this.data$.canFlee === false || !this.model.canFlee() },
    ];
    const choice = await this.pickFromList(options, 1);
    if (choice === null) return false;
    if (choice === 0) {
      const candidates = this.model.active;
      const spared = this.model.spareAll();
      for (const e of spared) this.views[e.index]?.spared();
      if (spared.length > 0) getServices(this.game).audio.playSfx('tag-chime');
      const lines = candidates.map((e) =>
        spared.includes(e)
          ? [t('battle.spared', { enemy: e.def.name }), ...(e.def.sparedText ? [e.def.sparedText] : [])]
          : [t('battle.notReady', { enemy: e.def.name })],
      );
      await this.say(lines.flat());
      return true;
    }
    if (this.model.tryFlee()) {
      getServices(this.game).audio.playSfx('ui-cancel');
      await this.say([t('battle.fled')]);
    } else {
      await this.say([t('battle.fleeFail')]);
    }
    return true;
  }

  private async enemyTurn(): Promise<void> {
    for (const enemy of this.model.active) {
      const lines = this.model.speech(enemy);
      const anchor = this.views[enemy.index]?.speechAnchor();
      for (const line of lines) {
        if (!anchor) break;
        this.focus = this.bubble;
        await this.bubble.say(line, anchor.x, anchor.y);
      }
    }
    const patterns = this.model.patterns();
    if (patterns.length === 0) return;
    const w = Math.max(...patterns.map((p) => p.pattern.box?.w ?? 120));
    const h = Math.max(...patterns.map((p) => p.pattern.box?.h ?? 80));
    const target: Rect = { x: Math.round((BASE_WIDTH - w) / 2), y: Math.round(TEXT_BOX.y + TEXT_BOX.h - h), w, h };
    this.focus = null;
    await this.box.resize(target);
    this.soul.place(target.x + w / 2, target.y + h / 2);
    this.bullets.start(patterns.map((p) => ({ pattern: p.pattern, owner: p.enemy.index })));
    getServices(this.game).events.emit('touch:context', { mode: 'dpad' });
    this.dodging = true;
    await new Promise<void>((resolve) => {
      this.dodgeDone = resolve;
    });
    this.dodging = false;
    getServices(this.game).events.emit('touch:context', { mode: 'none' });
    this.bullets.clear();
    this.soul.hide();
    if (this.session.state.hp > 0) await this.box.resize(TEXT_BOX);
  }

  private dodgeDone: (() => void) | null = null;

  private updateDodge(delta: number): void {
    const settings = getServices(this.game).settings;
    this.soul.update(delta, this.input$.axis(), this.input$.isDown('cancel'), this.box.rect, settings.get('reduceFlashing'));
    const enemy = this.views[0]?.center ?? { x: BASE_WIDTH / 2, y: 60 };
    const hit = this.bullets.update(
      delta,
      { box: this.box.rect, soul: { x: this.soul.x, y: this.soul.y }, enemy, rng: () => this.rng.next() },
      SOUL_RADIUS,
    );
    if (hit && !this.soul.isInvulnerable) {
      const owner = this.model.enemies[hit.owner];
      const damage = owner ? this.model.damageToPlayer(owner, hit.damage) : 1;
      this.model.hurtPlayer(damage);
      this.bullets.kill(hit);
      this.soul.hurt();
      this.stats.refresh(this.session.state);
      getServices(this.game).audio.playSfx('ui-deny');
      if (settings.get('screenShake') > 0) this.cameras.main.shake(100, 0.003 * settings.get('screenShake'));
      if (this.session.state.hp <= 0) this.finishDodge();
    }
    if (!this.bullets.running) this.finishDodge();
  }

  private finishDodge(): void {
    const fn = this.dodgeDone;
    this.dodgeDone = null;
    fn?.();
  }

  // ── Menus ───────────────────────────────────────────────────────────────────

  private async pickTarget(): Promise<EnemyState | null> {
    const active = this.model.active;
    if (active.length === 1) return active[0] ?? null;
    const items = active.map((e) => ({ label: e.def.name, color: this.model.canSpare(e) ? PALETTE.tag : undefined }));
    const i = await this.pickFromList(items, 1);
    return i === null ? null : (active[i] ?? null);
  }

  private pickFromList(items: ListItem[], columns: number): Promise<number | null> {
    return new Promise((resolve) => {
      const menu = new ListMenu(this, this.box.rect.x + 14, this.box.rect.y + 10, items, {
        width: this.box.rect.w - 28,
        columns,
        lineHeight: 16,
        onConfirm: (i) => {
          menu.destroy();
          resolve(i);
        },
        onCancel: () => {
          menu.destroy();
          resolve(null);
        },
      }).setDepth(DEPTH.ui + 2);
      this.focus = menu;
    });
  }

  private async say(lines: string[]): Promise<void> {
    this.focus = this.boxText;
    for (const line of lines) if (line) await this.boxText.show(line, this.vars());
    this.boxText.clear();
  }

  private vars(): Record<string, string | number> {
    return { player: this.session.state.name };
  }

  // ── Endings ─────────────────────────────────────────────────────────────────

  private async victory(): Promise<void> {
    this.model.finish();
    const lines = [t('battle.victory')];
    if (this.model.buttonsEarned > 0) lines.push(t('battle.reward', { n: this.model.buttonsEarned }));
    await this.say(lines);
    const cleared = this.model.enemies.filter((e) => e.status === 'cleared').length;
    const spared = this.model.enemies.filter((e) => e.status === 'spared').length;
    await this.end(cleared === 0 ? 'spared' : spared === 0 ? 'cleared' : 'mixed');
  }

  private async defeat(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    const services = getServices(this.game);
    services.audio.playMusic(null, 0.1);
    this.focus = null;
    // The tag tears in two.
    const { x, y } = this.soul;
    this.soul.hide();
    const left = this.add.image(x - 1, y, 'soul.tag').setCrop(0, 0, 5, 6).setDepth(DEPTH.transition);
    const right = this.add.image(x + 1, y, 'soul.tag').setCrop(5, 0, 5, 6).setDepth(DEPTH.transition);
    services.audio.playSfx('ui-deny');
    await wait(this, 500);
    this.tweens.add({ targets: left, x: x - 8, y: y + 30, alpha: 0, duration: 900 });
    this.tweens.add({ targets: right, x: x + 8, y: y + 30, alpha: 0, duration: 900 });
    await wait(this, 1000);
    this.data$.onEnd('defeat');
    this.scene.stop(this.data$.returnTo);
    this.scene.start(SCENE_KEYS.GameOver);
  }

  private async end(result: BattleResult): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.focus = null;
    this.cameras.main.fadeOut(300, 11, 10, 16);
    await wait(this, 320);
    this.scene.wake(this.data$.returnTo);
    this.data$.onEnd(result);
    this.scene.stop();
  }

  private drawBackground(): void {
    const key = 'bg.battle.standin';
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, BASE_WIDTH, BASE_HEIGHT);
      if (tex) {
        paintDitheredGradient(tex.context, BASE_WIDTH, BASE_HEIGHT, [PALETTE.night, PALETTE.ink, PALETTE.ink, PALETTE.ink]);
        // Faint shelf grid: the battle happens among the lost-and-found racks.
        const ctx = tex.context;
        ctx.fillStyle = '#1f1a2b';
        for (let x = 0; x < BASE_WIDTH; x += 48) ctx.fillRect(x, 0, 1, 120);
        for (let y = 24; y < 120; y += 32) ctx.fillRect(0, y, BASE_WIDTH, 1);
        tex.refresh();
      }
    }
    this.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH.background);
  }
}
