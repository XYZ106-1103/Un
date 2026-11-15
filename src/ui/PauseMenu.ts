/**
 * In-game menu (menu key): POCKET, STATUS, SETTINGS, TO TITLE, with a summary card.
 * Item results are handed back to the scene (`onText`) so they appear in the dialogue
 * box like any other text.
 */

import Phaser from 'phaser';
import { PALETTE } from '@/game/Constants';
import type { GameSession } from '@/game/GameSession';
import { getServices } from '@/game/Services';
import type { InputSystem } from '@/systems/InputSystem';
import { t } from '@/systems/LocaleSystem';
import { formatPlayTime } from '@/systems/SaveSystem';
import { ListMenu } from './ListMenu';
import { ConfirmPanel, SettingsPanel } from './MenuPanels';
import { drawBar } from './Panel';
import { PixelText } from './PixelText';
import { Panel, UIStack } from './UIStack';

export interface PauseCallbacks {
  onText: (lines: string[]) => void;
  onQuit: () => void;
  onClose: () => void;
}

class StatusCard extends Panel {
  constructor(scene: Phaser.Scene, session: GameSession) {
    super(scene, 8, 8, 110, 56);
    const s = session.state;
    this.add(new PixelText(scene, 10, 8, s.name, { font: 'bold', color: PALETTE.paper }));
    this.add(new PixelText(scene, 10, 24, `${t('battle.hp')} ${s.hp}/${s.maxHp}`, { font: 'small', color: PALETTE.paper }));
    const g = scene.add.graphics();
    drawBar(g, 60, 26, 40, 5, s.hp / s.maxHp, PALETTE.tag);
    this.add(g);
    this.add(new PixelText(scene, 10, 38, `${t('status.buttons')} ${s.buttons}`, { font: 'small', color: PALETTE.mist }));
  }
}

class StatusPanel extends Panel {
  constructor(scene: Phaser.Scene, session: GameSession) {
    super(scene, 126, 8, 230, 132, t('pause.status'));
    const s = session.state;
    const inv = session.inventory;
    const lines: [string, string][] = [
      [t('battle.hp'), `${s.hp} / ${s.maxHp}`],
      [t('status.attack'), `${inv.attack} (${s.attack}+${inv.attack - s.attack})`],
      [t('status.defense'), `${inv.defense} (${s.defense}+${inv.defense - s.defense})`],
      [t('status.weapon'), inv.equippedDef('weapon')?.name ?? t('status.none')],
      [t('status.armor'), inv.equippedDef('armor')?.name ?? t('status.none')],
      [t('status.buttons'), String(s.buttons)],
      [t('status.time'), formatPlayTime(s.stats.playTimeMs)],
    ];
    this.add(new PixelText(scene, 14, 22, s.name, { font: 'bold', color: PALETTE.tag }));
    lines.forEach(([k, v], i) => {
      this.add(new PixelText(scene, 14, 38 + i * 13, k, { font: 'small', color: PALETTE.mist }));
      this.add(new PixelText(scene, 216, 38 + i * 13, v, { font: 'small', color: PALETTE.paper, originX: 1 }));
    });
  }

  override handle(input: InputSystem): void {
    if (input.justPressed('cancel') || input.justPressed('confirm') || input.tapped()) {
      getServices(this.scene.game).audio.playSfx('ui-cancel');
      this.close();
    }
  }
}

class PocketPanel extends Panel {
  private readonly menu: ListMenu;
  private actions: ListMenu | null = null;
  private desc: PixelText;

  constructor(
    scene: Phaser.Scene,
    private readonly session: GameSession,
    private readonly callbacks: PauseCallbacks,
  ) {
    super(scene, 126, 8, 230, 176, t('pause.pocket'));
    this.menu = new ListMenu(scene, 12, 24, this.items(), {
      width: 206,
      onConfirm: (i) => this.pick(i),
      onCancel: () => this.close(),
      onChange: () => this.describe(),
    });
    this.add(this.menu);
    this.desc = new PixelText(scene, 14, 150, '', { font: 'small', color: PALETTE.mist, maxWidth: 200 });
    this.add(this.desc);
    this.describe();
  }

  private items() {
    const list = this.session.inventory.items.map((item) => ({ label: item.name }));
    if (list.length === 0) return [{ label: t('pocket.empty'), disabled: true }];
    return [...list, { label: t('pocket.sort'), color: PALETTE.mist }];
  }

  private describe(): void {
    const item = this.session.inventory.items[this.menu.index];
    this.desc.setText(item ? item.description.split('\n')[0] ?? '' : '');
  }

  private pick(index: number): void {
    const inv = this.session.inventory;
    if (index >= inv.items.length) {
      inv.sort();
      this.menu.setItems(this.items());
      this.describe();
      return;
    }
    this.menu.setFocused(false);
    const actions = new ListMenu(this.scene, 150, 24 + index * 14, [{ label: t('pocket.use') }, { label: t('pocket.info') }, { label: t('pocket.drop') }], {
      width: 70,
      onConfirm: (a) => this.act(index, a),
      onCancel: () => this.closeActions(),
    });
    this.add(actions);
    this.actions = actions;
  }

  private act(index: number, action: number): void {
    const inv = this.session.inventory;
    const item = inv.items[index];
    if (!item) return;
    let lines: string[];
    if (action === 0) lines = inv.use(index).text;
    else if (action === 1) lines = item.description.split('\n');
    else lines = inv.drop(index).text;
    this.closeActions();
    this.callbacks.onText(lines.length > 0 ? lines : [item.name]);
  }

  private closeActions(): void {
    this.actions?.destroy();
    this.actions = null;
    this.menu.setItems(this.items());
    this.menu.setFocused(true);
    this.describe();
  }

  override handle(input: InputSystem): void {
    if (this.actions) this.actions.handle(input);
    else this.menu.handle(input);
  }
}

export class PauseMenu extends Panel {
  private readonly menu: ListMenu;
  private readonly card: StatusCard;
  private readonly stack = new UIStack();

  constructor(
    scene: Phaser.Scene,
    private readonly session: GameSession,
    private readonly callbacks: PauseCallbacks,
  ) {
    super(scene, 8, 70, 110, 72);
    this.card = new StatusCard(scene, session);
    this.menu = new ListMenu(
      scene,
      12,
      10,
      [{ label: t('pause.pocket') }, { label: t('pause.status') }, { label: t('pause.settings') }, { label: t('pause.quit') }],
      { width: 90, lineHeight: 13, onConfirm: (i) => this.choose(i), onCancel: () => this.closeAll() },
    );
    this.add(this.menu);
    getServices(scene.game).audio.playSfx('ui-confirm');
  }

  private choose(i: number): void {
    const scene = this.scene;
    if (i === 0) {
      this.open(
        new PocketPanel(scene, this.session, {
          ...this.callbacks,
          onText: (lines) => {
            this.closeAll();
            this.callbacks.onText(lines);
          },
        }),
      );
    } else if (i === 1) this.open(new StatusPanel(scene, this.session));
    else if (i === 2) this.open(new SettingsPanel(scene));
    else {
      this.open(
        new ConfirmPanel(scene, t('pause.quitConfirm')).onResult((yes) => {
          if (yes) {
            this.closeAll();
            this.callbacks.onQuit();
          }
        }),
      );
    }
  }

  private open(panel: Panel): void {
    this.menu.setFocused(false);
    this.stack.push(panel);
    panel.onClose(() => {
      this.stack.remove(panel);
      if (this.stack.size === 0 && this.active) this.menu.setFocused(true);
    });
  }

  private closeAll(): void {
    this.card.destroy();
    this.close();
    this.callbacks.onClose();
  }

  override handle(input: InputSystem): void {
    if (this.stack.size > 0) this.stack.handle(input);
    else if (input.justPressed('menu')) {
      getServices(this.scene.game).audio.playSfx('ui-cancel');
      this.closeAll();
    } else this.menu.handle(input);
  }
}

export class SavePanel extends Panel {
  private readonly menu: ListMenu;
  private readonly status: PixelText;
  private done = false;
  private resultHandler: ((saved: boolean) => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly session: GameSession,
    mapName: string,
  ) {
    super(scene, 100, 60, 280, 104, t('save.title'));
    const s = session.state;
    this.add(new PixelText(scene, 16, 26, s.name, { font: 'bold', color: PALETTE.paper }));
    this.add(new PixelText(scene, 264, 26, formatPlayTime(s.stats.playTimeMs), { color: PALETTE.paper, originX: 1 }));
    this.add(new PixelText(scene, 16, 42, `${mapName} · ${t('slot.label', { n: session.slot })}`, { font: 'small', color: PALETTE.mist }));
    this.status = new PixelText(scene, 140, 60, '', { font: 'small', color: PALETTE.tag, originX: 0.5, align: 'center' });
    this.add(this.status);
    this.menu = new ListMenu(scene, 60, 80, [{ label: t('save.do') }, { label: t('save.cancel') }], {
      width: 170,
      columns: 2,
      onConfirm: (i) => (i === 0 ? this.save() : this.finish(false)),
      onCancel: () => this.finish(false),
    });
    this.add(this.menu);
  }

  onResult(fn: (saved: boolean) => void): this {
    this.resultHandler = fn;
    return this;
  }

  private save(): void {
    const services = getServices(this.scene.game);
    const result = this.session.save('manual');
    this.done = true;
    this.menu.setVisible(false).setFocused(false);
    if (result.ok) {
      services.audio.playSfx('tag-chime');
      this.status.setText(t('save.done')).setTint(PALETTE.tag);
    } else if (result.reason === 'unavailable') {
      this.status.setText(t('save.memoryOnly')).setTint(PALETTE.amber);
    } else {
      services.audio.playSfx('ui-deny');
      this.status.setText(t('save.failed')).setTint(PALETTE.sock);
    }
  }

  private finish(saved: boolean): void {
    const fn = this.resultHandler;
    this.close();
    fn?.(saved);
  }

  override handle(input: InputSystem): void {
    if (this.done) {
      if (input.justPressed('confirm') || input.justPressed('cancel') || input.tapped()) this.finish(true);
      return;
    }
    this.menu.handle(input);
  }
}

/** Shown once per map entry: the area's name in a small card. */
export function showMapBanner(scene: Phaser.Scene, name: string): void {
  const text = new PixelText(scene, 12, 0, name, { font: 'bold', color: PALETTE.paper });
  const w = text.width + 16;
  const card = scene.add.container(-w, 12);
  const g = scene.add.graphics();
  g.fillStyle(PALETTE.ink, 0.85);
  g.fillRect(0, 0, w, 18);
  g.fillStyle(PALETTE.tag);
  g.fillRect(0, 17, w, 1);
  text.setPosition(8, 3);
  card.add([g, text]);
  card.setScrollFactor(0, 0, true).setDepth(2500);
  scene.tweens.chain({
    targets: card,
    tweens: [
      { x: 0, duration: 300, ease: 'Cubic.easeOut' },
      { x: 0, duration: 1800 },
      { x: -w - 4, duration: 300, ease: 'Cubic.easeIn' },
    ],
    onComplete: () => card.destroy(),
  });
}
