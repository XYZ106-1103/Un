/**
 * Reusable menu panels: yes/no confirmation, message box, settings, save slots, credits.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, PALETTE } from '@/game/Constants';
import { getServices } from '@/game/Services';
import type { InputSystem } from '@/systems/InputSystem';
import { t, type StringKey } from '@/systems/LocaleSystem';
import { formatPlayTime, SLOT_IDS, type SlotId, type SlotSummary } from '@/systems/SaveSystem';
import { TEXT_SPEEDS, type Settings } from '@/systems/SettingsSystem';
import { content } from '@/systems/content/ContentDB';
import { SCALE_MODES } from '@/utils/ScaleUtils';
import { ListMenu, type ListItem } from './ListMenu';
import { PixelText } from './PixelText';
import { Panel } from './UIStack';

// ── Confirm / message ─────────────────────────────────────────────────────────

export class ConfirmPanel extends Panel {
  private readonly menu: ListMenu;
  private resultHandler: ((yes: boolean) => void) | null = null;

  constructor(scene: Phaser.Scene, message: string, defaultYes = false) {
    const lines = message.split('\n').length;
    const h = 30 + lines * 14 + 16;
    super(scene, (BASE_WIDTH - 260) / 2, (BASE_HEIGHT - h) / 2, 260, h);
    this.add(new PixelText(scene, 130, 10, message, { color: PALETTE.paper, originX: 0.5, align: 'center' }));
    this.menu = new ListMenu(scene, 70, 16 + lines * 14, [{ label: t('common.yes') }, { label: t('common.no') }], {
      width: 140,
      columns: 2,
      onConfirm: (i) => this.finish(i === 0),
      onCancel: () => this.finish(false),
    });
    this.menu.index = defaultYes ? 0 : 1;
    this.menu.setItems([{ label: t('common.yes') }, { label: t('common.no') }]);
    this.add(this.menu);
  }

  onResult(fn: (yes: boolean) => void): this {
    this.resultHandler = fn;
    return this;
  }

  override handle(input: InputSystem): void {
    this.menu.handle(input);
  }

  private finish(yes: boolean): void {
    const fn = this.resultHandler;
    this.close();
    fn?.(yes);
  }
}

export class MessagePanel extends Panel {
  constructor(scene: Phaser.Scene, message: string) {
    const lines = message.split('\n').length;
    const h = 22 + lines * 14;
    super(scene, (BASE_WIDTH - 280) / 2, (BASE_HEIGHT - h) / 2, 280, h);
    this.add(new PixelText(scene, 140, 11, message, { color: PALETTE.paper, originX: 0.5, align: 'center' }));
  }

  override handle(input: InputSystem): void {
    if (input.justPressed('confirm') || input.justPressed('cancel') || input.tapped()) {
      getServices(this.scene.game).audio.playSfx('ui-confirm');
      this.close();
    }
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

type SettingRow = {
  label: StringKey;
  value: (s: Readonly<Settings>) => string;
  adjust?: (s: Readonly<Settings>, delta: -1 | 1) => Partial<Settings>;
  confirm?: () => void;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const stepVolume = (v: number, d: number) => Math.min(1, Math.max(0, Math.round((v + d * 0.1) * 10) / 10));
const cycle = <T>(list: readonly T[], current: T, d: number): T =>
  list[(((list.indexOf(current) + d) % list.length) + list.length) % list.length] as T;
const onOff = (v: boolean) => t(v ? 'settings.on' : 'settings.off');

export class SettingsPanel extends Panel {
  private readonly menu: ListMenu;
  private readonly rows: SettingRow[];
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene) {
    super(scene, (BASE_WIDTH - 300) / 2, 18, 300, BASE_HEIGHT - 36, t('settings.title'));
    const { settings, events } = getServices(scene.game);
    this.rows = [
      { label: 'settings.master', value: (s) => pct(s.masterVolume), adjust: (s, d) => ({ masterVolume: stepVolume(s.masterVolume, d) }) },
      { label: 'settings.music', value: (s) => pct(s.musicVolume), adjust: (s, d) => ({ musicVolume: stepVolume(s.musicVolume, d) }) },
      { label: 'settings.sfx', value: (s) => pct(s.sfxVolume), adjust: (s, d) => ({ sfxVolume: stepVolume(s.sfxVolume, d) }) },
      { label: 'settings.voice', value: (s) => pct(s.voiceVolume), adjust: (s, d) => ({ voiceVolume: stepVolume(s.voiceVolume, d) }) },
      { label: 'settings.textSpeed', value: (s) => t(`speed.${s.textSpeed}`), adjust: (s, d) => ({ textSpeed: cycle(TEXT_SPEEDS, s.textSpeed, d) }) },
      { label: 'settings.scale', value: (s) => t(`scale.${s.scaleMode}`), adjust: (s, d) => ({ scaleMode: cycle(SCALE_MODES, s.scaleMode, d) }) },
      { label: 'settings.shake', value: (s) => pct(s.screenShake), adjust: (s, d) => ({ screenShake: Math.min(1, Math.max(0, s.screenShake + d * 0.5)) }) },
      { label: 'settings.flash', value: (s) => onOff(s.reduceFlashing), adjust: (s) => ({ reduceFlashing: !s.reduceFlashing }) },
      { label: 'settings.fps', value: (s) => onOff(s.showFps), adjust: (s) => ({ showFps: !s.showFps }) },
      {
        label: 'settings.touch',
        value: (s) => t(s.touchControls === 'auto' ? 'settings.auto' : s.touchControls === 'on' ? 'settings.on' : 'settings.off'),
        adjust: (s, d) => ({ touchControls: cycle(['auto', 'on', 'off'] as const, s.touchControls, d) }),
      },
      {
        label: 'settings.language',
        value: (s) => t(`lang.${s.language}`),
        adjust: (s, d) => ({ language: cycle(['auto', 'ko', 'en'] as const, s.language, d) }),
      },
      { label: 'settings.reset', value: () => '', confirm: () => settings.reset() },
    ];
    this.menu = new ListMenu(scene, 16, 26, this.items(), {
      width: this.pw - 32,
      onAdjust: (i, d) => {
        const row = this.rows[i];
        if (row?.adjust) settings.update(row.adjust(settings.values, d));
      },
      onConfirm: (i) => {
        const row = this.rows[i];
        if (row?.confirm) row.confirm();
        else if (row?.adjust) settings.update(row.adjust(settings.values, 1));
      },
      onCancel: () => this.close(),
    });
    this.add(this.menu);
    this.add(new PixelText(scene, this.pw / 2, this.ph - 16, t('settings.hint'), { font: 'small', color: PALETTE.fog, originX: 0.5 }));
    this.unsubscribe = events.on('settings:changed', ({ changed }) => {
      // Language changes relabel everything; other changes only touch values.
      if (changed.includes('language')) this.menu.setItems(this.items());
      else this.rows.forEach((row, i) => this.menu.setValue(i, row.value(settings.values)));
    });
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.unsubscribe());
  }

  private items(): ListItem[] {
    const s = getServices(this.scene.game).settings.values;
    return this.rows.map((row) => ({ label: t(row.label), value: row.value(s) }));
  }

  override handle(input: InputSystem): void {
    this.menu.handle(input);
  }
}

// ── Save slots ────────────────────────────────────────────────────────────────

export function describeSlot(summary: SlotSummary): ListItem {
  const label = t('slot.label', { n: summary.slot });
  switch (summary.status) {
    case 'ok': {
      const mapName = content.map(summary.map)?.name ?? summary.map;
      const extra = summary.recovered ? ` · ${t('slot.recovered')}` : summary.kind === 'auto' ? ` · ${t('slot.auto')}` : '';
      return { label: `${label}  ${summary.name}  ${mapName}${extra}`, value: formatPlayTime(summary.playTimeMs) };
    }
    case 'empty':
      return { label: `${label}  ${t('slot.empty')}`, color: PALETTE.mist };
    case 'corrupt':
      return { label: `${label}  ${t('slot.corrupt')}`, color: PALETTE.sock };
    case 'future-version':
      return { label: `${label}  ${t('slot.future')}`, color: PALETTE.sock };
  }
}

export class SlotPanel extends Panel {
  private readonly menu: ListMenu;
  private pickHandler: ((slot: SlotId, summary: SlotSummary) => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    readonly mode: 'new' | 'load',
  ) {
    super(scene, 40, 70, BASE_WIDTH - 80, 92, t(mode === 'new' ? 'slot.title.new' : 'slot.title.load'));
    const summaries = getServices(scene.game).saves.summaries();
    const items = summaries.map((s) => ({ ...describeSlot(s), disabled: mode === 'load' && s.status !== 'ok' }));
    this.menu = new ListMenu(scene, 16, 28, items, {
      width: this.pw - 32,
      lineHeight: 18,
      onConfirm: (i) => {
        const slot = SLOT_IDS[i];
        const summary = summaries[i];
        if (slot && summary) this.pickHandler?.(slot, summary);
      },
      onCancel: () => this.close(),
    });
    const lastUsed = getServices(scene.game).saves.lastUsedSlot();
    if (mode === 'load' && lastUsed) this.menu.select(lastUsed - 1, true);
    this.add(this.menu);
  }

  onPick(fn: (slot: SlotId, summary: SlotSummary) => void): this {
    this.pickHandler = fn;
    return this;
  }

  override handle(input: InputSystem): void {
    this.menu.handle(input);
  }
}

// ── Credits ───────────────────────────────────────────────────────────────────

export class CreditsPanel extends Panel {
  private readonly scrollText: PixelText;
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private offset = 0;

  constructor(scene: Phaser.Scene, lines: string[]) {
    super(scene, 60, 14, BASE_WIDTH - 120, BASE_HEIGHT - 28, t('credits.title'));
    this.scrollText = new PixelText(scene, this.pw / 2, this.ph, lines.join('\n'), {
      color: PALETTE.paper,
      originX: 0.5,
      align: 'center',
      lineSpacing: 3,
    });
    this.add(this.scrollText);
    this.maskShape = scene.make.graphics({});
    this.maskShape.fillStyle(0xffffff);
    this.maskShape.fillRect(this.x + 4, this.y + 24, this.pw - 8, this.ph - 30);
    this.scrollText.setMask(this.maskShape.createGeometryMask());
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.maskShape.destroy());
  }

  override handle(input: InputSystem): void {
    this.offset += input.isDown('confirm') ? 1.2 : 0.35;
    const y = Math.round(this.ph - this.offset);
    this.scrollText.setY(y);
    const ended = y + this.scrollText.height < 24;
    if (input.justPressed('cancel') || ended) {
      getServices(this.scene.game).audio.playSfx('ui-cancel');
      this.close();
    }
  }
}
