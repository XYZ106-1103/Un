/**
 * Shop: buy items with buttons (the currency). Greeting, thanks and "not enough" lines
 * come from the shop data; the keeper's portrait sits on the left.
 */

import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, PALETTE } from '@/game/Constants';
import type { GameSession } from '@/game/GameSession';
import { getServices } from '@/game/Services';
import { content } from '@/systems/content/ContentDB';
import type { ShopDef } from '@/systems/content/types';
import type { InputSystem } from '@/systems/InputSystem';
import { format, t } from '@/systems/LocaleSystem';
import { ListMenu } from './ListMenu';
import { PixelText } from './PixelText';
import { Panel } from './UIStack';

export class ShopPanel extends Panel {
  private readonly menu: ListMenu;
  private readonly line: PixelText;
  private readonly wallet: PixelText;
  private readonly desc: PixelText;

  constructor(
    scene: Phaser.Scene,
    private readonly session: GameSession,
    private readonly shop: ShopDef,
  ) {
    super(scene, 16, 16, BASE_WIDTH - 32, BASE_HEIGHT - 32, shop.name);
    const keeper = content.character(shop.keeper);
    if (keeper?.portrait && scene.textures.exists(keeper.portrait)) {
      this.add(scene.add.image(16, 26, keeper.portrait, keeper.defaultFace).setOrigin(0));
    }
    this.line = new PixelText(scene, 72, 28, '', { color: PALETTE.paper, maxWidth: this.pw - 90 });
    this.wallet = new PixelText(scene, this.pw - 14, this.ph - 18, '', { font: 'small', color: PALETTE.tag, originX: 1 });
    this.desc = new PixelText(scene, 16, this.ph - 34, '', { font: 'small', color: PALETTE.mist, maxWidth: this.pw - 32 });
    this.add([this.line, this.wallet, this.desc]);
    this.menu = new ListMenu(scene, 16, 80, this.items(), {
      width: this.pw - 32,
      lineHeight: 13,
      onConfirm: (i) => this.buy(i),
      onCancel: () => this.close(),
      onChange: () => this.describe(),
    });
    this.add(this.menu);
    this.say(shop.greeting);
    this.refresh();
  }

  private items() {
    return [
      ...this.shop.items.map((it) => ({ label: content.item(it.id)?.name ?? it.id, value: `${it.price}` })),
      { label: t('common.back'), color: PALETTE.mist },
    ];
  }

  private say(lines: string[]): void {
    const pick = lines[Math.floor(Math.random() * lines.length)] ?? '';
    this.line.setText(format(pick, { player: this.session.state.name }));
  }

  private refresh(): void {
    this.wallet.setText(`${t('status.buttons')} ${this.session.state.buttons}`);
    this.describe();
  }

  private describe(): void {
    const it = this.shop.items[this.menu.index];
    this.desc.setText(it ? (content.item(it.id)?.description.replace(/\n/g, ' ') ?? '') : '');
  }

  private buy(index: number): void {
    const audio = getServices(this.scene.game).audio;
    const it = this.shop.items[index];
    if (!it) {
      this.close();
      return;
    }
    const state = this.session.state;
    if (state.buttons < it.price) {
      audio.playSfx('ui-deny');
      this.say(this.shop.broke);
      return;
    }
    if (!this.session.inventory.add(it.id)) {
      audio.playSfx('ui-deny');
      this.line.setText(t('item.full'));
      return;
    }
    state.buttons -= it.price;
    audio.playSfx('tag-chime');
    this.say(this.shop.thanks);
    this.refresh();
  }

  override handle(input: InputSystem): void {
    this.menu.handle(input);
  }
}
