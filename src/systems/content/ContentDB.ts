/**
 * Loads every content file under src/data and validates it, including cross-references
 * (a map pointing at a missing script, a dialogue naming an unknown character, a
 * bullet using a frame that doesn't exist...). `validateContent()` is run by a unit test,
 * so broken content fails CI instead of crashing mid-game. At runtime, invalid entries
 * are reported and skipped.
 *
 * Pure TS (no Phaser).
 */

import sfxData from '@/data/audio/sfx.json';
import { getAsset } from '@/systems/assets/AssetManifest';
import { ConditionError, validateCondition } from '@/systems/script/Condition';
import type {
  CharacterDef,
  CondText,
  EndingDef,
  QuestDef,
  ShopDef,
  EmitterDef,
  EnemyDef,
  ItemDef,
  MapDef,
  PatternDef,
  ScriptBody,
  ScriptNode,
  ScriptTable,
  SongDef,
} from './types';

const glob = <T>(modules: Record<string, unknown>): [string, T][] =>
  Object.entries(modules).map(([path, mod]) => [path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, ''), mod as T]);

const characterFiles = glob<Record<string, CharacterDef>>(
  import.meta.glob('../../data/characters/*.json', { eager: true, import: 'default' }),
);
const itemFiles = glob<Record<string, ItemDef>>(import.meta.glob('../../data/items/*.json', { eager: true, import: 'default' }));
const mapFiles = glob<MapDef>(import.meta.glob('../../data/maps/*.json', { eager: true, import: 'default' }));
const dialogueFiles = glob<ScriptTable>(import.meta.glob('../../data/dialogues/*.json', { eager: true, import: 'default' }));
const enemyFiles = glob<EnemyDef>(import.meta.glob('../../data/enemies/*.json', { eager: true, import: 'default' }));
const songFiles = glob<SongDef>(import.meta.glob('../../data/audio/songs/*.json', { eager: true, import: 'default' }));
const shopFiles = glob<ShopDef>(import.meta.glob('../../data/shops/*.json', { eager: true, import: 'default' }));
const questFiles = glob<Record<string, QuestDef>>(import.meta.glob('../../data/story/quests.json', { eager: true, import: 'default' }));
const endingFiles = glob<Record<string, EndingDef>>(import.meta.glob('../../data/story/endings.json', { eager: true, import: 'default' }));

const strip = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([k]) => !k.startsWith('$')));

const characters = new Map<string, CharacterDef>();
const items = new Map<string, ItemDef>();
const maps = new Map<string, MapDef>();
const scripts = new Map<string, ScriptNode[]>();
const enemies = new Map<string, EnemyDef>();
const songs = new Map<string, SongDef>();
const shops = new Map<string, ShopDef>();
const quests: QuestDef[] = [];
const endings = new Map<string, EndingDef>();
const loadErrors: string[] = [];

for (const [file, table] of characterFiles) {
  for (const [id, def] of Object.entries(strip(table))) characters.set(id, { ...def, id });
  void file;
}
for (const [, table] of itemFiles) {
  for (const [id, def] of Object.entries(strip(table))) items.set(id, { ...def, id, droppable: def.droppable ?? true });
}
for (const [file, def] of mapFiles) {
  if (def.id !== file) loadErrors.push(`map file ${file}.json has id "${def.id}"`);
  maps.set(def.id, {
    ...def,
    npcs: def.npcs ?? [],
    objects: def.objects ?? [],
    exits: def.exits ?? [],
    triggers: def.triggers ?? [],
    savePoints: def.savePoints ?? [],
  });
}
for (const [file, table] of dialogueFiles) {
  for (const [id, nodes] of Object.entries(strip(table))) {
    if (scripts.has(id)) loadErrors.push(`script "${id}" defined twice (again in ${file}.json)`);
    scripts.set(id, nodes);
  }
}
for (const [file, def] of enemyFiles) {
  if (def.id !== file) loadErrors.push(`enemy file ${file}.json has id "${def.id}"`);
  enemies.set(def.id, def);
}
for (const [file, def] of songFiles) {
  if (def.id !== file) loadErrors.push(`song file ${file}.json has id "${def.id}"`);
  songs.set(def.id, def);
}
for (const [file, def] of shopFiles) {
  if (def.id !== file) loadErrors.push(`shop file ${file}.json has id "${def.id}"`);
  shops.set(def.id, def);
}
for (const [, table] of questFiles) for (const [id, def] of Object.entries(strip(table))) quests.push({ ...def, id });
for (const [, table] of endingFiles) for (const [id, def] of Object.entries(strip(table))) endings.set(id, { ...def, id });

export const content = {
  character: (id: string): CharacterDef | undefined => characters.get(id),
  item: (id: string): ItemDef | undefined => items.get(id),
  map: (id: string): MapDef | undefined => maps.get(id),
  script: (id: string): ScriptNode[] | undefined => scripts.get(id),
  enemy: (id: string): EnemyDef | undefined => enemies.get(id),
  song: (id: string): SongDef | undefined => songs.get(id),
  shop: (id: string): ShopDef | undefined => shops.get(id),
  ending: (id: string): EndingDef | undefined => endings.get(id),
  quests: (): readonly QuestDef[] => quests,
  allScripts: (): [string, ScriptNode[]][] => [...scripts.entries()],
  allMaps: (): MapDef[] => [...maps.values()],
  allEnemies: (): EnemyDef[] => [...enemies.values()],
  allItems: (): ItemDef[] => [...items.values()],
  /** Every string a player could read: used to pre-rasterise glyphs while loading. */
  allText(): string {
    const parts: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') parts.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk([...scripts.values()]);
    walk([...items.values()].map((i) => [i.name, i.description, i.useText]));
    walk([...enemies.values()].map((e) => [e.name, e.encounter, e.check, e.acts, e.flavor, e.speech, e.sparedText, e.clearedText]));
    walk([...maps.values()].map((m) => m.name));
    walk([...characters.values()].map((c) => c.name));
    walk([...shops.values()].map((s) => [s.name, s.greeting, s.thanks, s.broke]));
    walk(quests.map((q) => [q.title, q.description, q.doneText]));
    walk([...endings.values()].map((e) => [e.title, e.pages, e.finalLine]));
    return parts.join('');
  },
};

// ── Validation ────────────────────────────────────────────────────────────────

const COMMANDS = new Set([
  'sfx', 'music', 'shake', 'flash', 'wait', 'face', 'item.add', 'item.remove', 'buttons', 'heal',
  'relation', 'battle', 'save', 'map', 'npc.hide', 'npc.show', 'npc.face', 'npc.move', 'player.face', 'end',
  'shop', 'cinema', 'follower', 'ending',
]);
const EMITTERS = new Set(['linear', 'ring', 'radial', 'spiral', 'fall', 'homing', 'stream', 'sequence']);
const FACINGS = new Set(['down', 'up', 'left', 'right']);

function artFrames(key: string | undefined): Set<string> | null {
  if (!key) return null;
  const asset = getAsset(key);
  if (!asset) return null;
  if (asset.kind === 'pixelart') return new Set(Object.keys(asset.doc.frames));
  if (asset.kind === 'spritesheet') return new Set(Array.from({ length: asset.frames }, (_, i) => String(i)));
  return new Set(['__BASE']);
}

export function validateContent(): string[] {
  const errors: string[] = [...loadErrors];
  const err = (where: string, msg: string): void => {
    errors.push(`${where}: ${msg}`);
  };
  const cond = (where: string, src: unknown) => {
    if (src === undefined) return;
    if (typeof src !== 'string') return err(where, 'condition must be a string');
    try {
      validateCondition(src);
    } catch (e) {
      err(where, e instanceof ConditionError ? e.message : String(e));
    }
  };
  const text = (where: string, value: unknown) => {
    const ok = typeof value === 'string' || (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string'));
    if (!ok) err(where, 'text must be a string or non-empty string array');
  };
  const condTexts = (where: string, list: unknown) => {
    if (!Array.isArray(list) || list.length === 0) return err(where, 'needs at least one entry');
    (list as CondText[]).forEach((c, i) => {
      cond(`${where}[${i}].if`, c.if);
      text(`${where}[${i}].text`, c.text);
    });
  };

  // Characters
  for (const c of characters.values()) {
    const w = `character ${c.id}`;
    if (!c.name) err(w, 'missing name');
    if (!c.voice || typeof c.voice.pitch !== 'number') err(w, 'missing voice');
    if (c.portrait && !artFrames(c.portrait)) err(w, `portrait asset "${c.portrait}" missing`);
    if (c.sprite && !artFrames(c.sprite)) err(w, `sprite asset "${c.sprite}" missing`);
    if (c.defaultFace && c.portrait && !artFrames(c.portrait)?.has(c.defaultFace)) err(w, `default face "${c.defaultFace}" missing`);
  }

  // Items
  for (const item of items.values()) {
    const w = `item ${item.id}`;
    if (!item.name || !item.description) err(w, 'needs name and description');
    if (!['consumable', 'weapon', 'armor', 'key'].includes(item.kind)) err(w, `bad kind "${item.kind}"`);
    if (item.kind === 'consumable' && !(typeof item.heal === 'number')) err(w, 'consumable needs heal');
  }

  // Scripts
  const checkBody = (where: string, body: ScriptBody | undefined) => {
    if (body === undefined) return;
    if (typeof body === 'string') {
      if (!scripts.has(body)) err(where, `unknown script "${body}"`);
    } else if (Array.isArray(body)) body.forEach((n, i) => checkNode(`${where}[${i}]`, n));
    else err(where, 'body must be a script id or node list');
  };
  const checkNode = (where: string, node: ScriptNode): void => {
    if (!node || typeof node !== 'object') return err(where, 'node must be an object');
    if ('do' in node) {
      const c = node;
      if (!COMMANDS.has(c.do)) return err(where, `unknown command "${String(c.do)}"`);
      const arg = (k: string) => c[k];
      switch (c.do) {
        case 'sfx':
          if (!(String(arg('id')) in sfxData)) err(where, `unknown sfx "${String(arg('id'))}"`);
          break;
        case 'music':
          if (arg('id') !== null && !songs.has(String(arg('id')))) err(where, `unknown song "${String(arg('id'))}"`);
          break;
        case 'item.add':
        case 'item.remove':
          if (!items.has(String(arg('id')))) err(where, `unknown item "${String(arg('id'))}"`);
          break;
        case 'battle': {
          const list = arg('enemies');
          if (!Array.isArray(list) || list.length === 0) err(where, 'battle needs enemies');
          else for (const e of list) if (!enemies.has(String(e))) err(where, `unknown enemy "${String(e)}"`);
          break;
        }
        case 'map': {
          const m = maps.get(String(arg('to')));
          if (!m) err(where, `unknown map "${String(arg('to'))}"`);
          else if (!m.spawns[String(arg('spawn'))]) err(where, `map ${m.id} has no spawn "${String(arg('spawn'))}"`);
          break;
        }
        case 'face':
          if (!characters.has(String(arg('who')))) err(where, `unknown character "${String(arg('who'))}"`);
          break;
        case 'shop':
          if (!shops.has(String(arg('id')))) err(where, `unknown shop "${String(arg('id'))}"`);
          break;
        case 'follower':
          if (arg('id') !== null && !characters.has(String(arg('id')))) err(where, `unknown follower "${String(arg('id'))}"`);
          break;
        case 'npc.face':
        case 'player.face':
          if (!FACINGS.has(String(arg('facing')))) err(where, 'needs facing');
          break;
        default:
          break;
      }
    } else if ('say' in node) {
      text(where, node.say);
      if (node.who !== undefined) {
        const who = characters.get(node.who);
        if (!who) err(where, `unknown character "${node.who}"`);
        else if (node.face && !(who.portrait && artFrames(who.portrait)?.has(node.face))) {
          err(where, `character "${node.who}" has no face "${node.face}"`);
        }
      }
    } else if ('choice' in node) {
      if (!Array.isArray(node.choice) || node.choice.length < 2) err(where, 'choice needs 2+ options');
      node.choice.forEach((o, i) => {
        if (typeof o.text !== 'string') err(`${where}.choice[${i}]`, 'needs text');
        cond(`${where}.choice[${i}].if`, o.if);
        checkBody(`${where}.choice[${i}].then`, o.then);
      });
    } else if ('if' in node) {
      cond(`${where}.if`, node.if);
      checkBody(`${where}.then`, node.then);
      checkBody(`${where}.else`, node.else);
    } else if ('goto' in node) {
      if (!scripts.has(node.goto)) err(where, `goto unknown script "${node.goto}"`);
    } else if ('call' in node) {
      if (!scripts.has(node.call)) err(where, `call unknown script "${node.call}"`);
    } else if ('set' in node) {
      if (typeof node.set !== 'object') err(where, 'set needs an object');
    } else {
      err(where, 'unrecognised node');
    }
  };
  for (const [id, nodes] of scripts) {
    if (!Array.isArray(nodes)) err(`script ${id}`, 'must be an array');
    else nodes.forEach((n, i) => checkNode(`script ${id}[${i}]`, n));
  }

  // Maps
  for (const m of maps.values()) {
    const w = `map ${m.id}`;
    const tiles = artFrames(m.tileset);
    if (!tiles) err(w, `tileset "${m.tileset}" missing`);
    if (m.music !== null && !songs.has(m.music)) err(w, `unknown song "${m.music}"`);
    const width = [...(m.layout[0] ?? '')].length;
    if (width === 0) err(w, 'empty layout');
    m.layout.forEach((row, y) => {
      if ([...row].length !== width) err(w, `layout row ${y} width ${[...row].length} != ${width}`);
      for (const ch of row) if (!m.legend[ch]) err(w, `layout uses "${ch}" which is not in the legend`);
    });
    for (const [ch, entry] of Object.entries(m.legend)) {
      if (tiles && !tiles.has(entry.tile)) err(w, `legend "${ch}" tile "${entry.tile}" not in tileset`);
      if (tiles && entry.deco && !tiles.has(entry.deco)) err(w, `legend "${ch}" deco "${entry.deco}" not in tileset`);
    }
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < m.layout.length;
    const walkable = (x: number, y: number) => {
      const ch = [...(m.layout[y] ?? '')][x];
      const entry = ch ? m.legend[ch] : undefined;
      return Boolean(entry && (!entry.solid || entry.secret));
    };
    for (const [name, sp] of Object.entries(m.spawns)) {
      if (!inside(sp.x, sp.y)) err(w, `spawn ${name} outside map`);
      else if (!walkable(sp.x, sp.y)) err(w, `spawn ${name} on a solid tile`);
    }
    for (const n of m.npcs) {
      if (!characters.has(n.character)) err(w, `npc ${n.id} unknown character "${n.character}"`);
      if (!scripts.has(n.script)) err(w, `npc ${n.id} unknown script "${n.script}"`);
      if (!inside(n.x, n.y)) err(w, `npc ${n.id} outside map`);
      cond(`${w} npc ${n.id}`, n.if);
    }
    for (const o of m.objects) {
      if (!scripts.has(o.script)) err(w, `object ${o.id} unknown script "${o.script}"`);
      if (o.sprite && tiles && !tiles.has(o.sprite)) err(w, `object ${o.id} sprite "${o.sprite}" not in tileset`);
      for (const sp of o.sprites ?? []) {
        cond(`${w} object ${o.id} sprites`, sp.if);
        if (tiles && !tiles.has(sp.frame)) err(w, `object ${o.id} sprite "${sp.frame}" not in tileset`);
      }
      cond(`${w} object ${o.id}`, o.if);
    }
    for (const [i, e] of m.exits.entries()) {
      const target = maps.get(e.to);
      if (!target) err(w, `exit ${i} to unknown map "${e.to}"`);
      else if (!target.spawns[e.spawn]) err(w, `exit ${i} to ${e.to} unknown spawn "${e.spawn}"`);
      cond(`${w} exit ${i}`, e.if);
    }
    for (const t of m.triggers) {
      if (!scripts.has(t.script)) err(w, `trigger ${t.id} unknown script "${t.script}"`);
      cond(`${w} trigger ${t.id}`, t.if);
    }
    for (const s of m.savePoints) if (!scripts.has(s.script)) err(w, `save point ${s.id} unknown script "${s.script}"`);
    if (m.onEnter && !scripts.has(m.onEnter)) err(w, `onEnter unknown script "${m.onEnter}"`);
    if (m.encounters) {
      cond(`${w} encounters`, m.encounters.if);
      for (const g of m.encounters.groups) for (const e of g) if (!enemies.has(e)) err(w, `encounter unknown enemy "${e}"`);
    }
  }

  // Enemies
  const bulletFrames = artFrames('bullets');
  const checkEmitter = (where: string, e: EmitterDef): void => {
    if (!EMITTERS.has(e.type)) return err(where, `unknown emitter "${e.type}"`);
    if (e.type === 'sequence') {
      if (!e.children?.length) err(where, 'sequence needs children');
      e.children?.forEach((c, i) => checkEmitter(`${where}.children[${i}]`, c));
      return;
    }
    if (!e.bullet) return err(where, 'needs bullet');
    if (bulletFrames && !bulletFrames.has(e.bullet.frame)) err(where, `bullet frame "${e.bullet.frame}" missing`);
    if (!(e.bullet.radius > 0)) err(where, 'bullet radius must be > 0');
  };
  for (const e of enemies.values()) {
    const w = `enemy ${e.id}`;
    if (!artFrames(e.sprite)) err(w, `sprite "${e.sprite}" missing`);
    if (!(e.hp > 0)) err(w, 'hp must be > 0');
    cond(`${w} spareWhen`, e.spareWhen);
    condTexts(`${w} flavor`, e.flavor);
    condTexts(`${w} speech`, e.speech);
    if (!e.acts.some((a) => a.id === 'check')) err(w, 'needs a "check" act');
    for (const a of e.acts) {
      cond(`${w} act ${a.id}.if`, a.if);
      cond(`${w} act ${a.id}.requires`, a.requires);
      condTexts(`${w} act ${a.id}.text`, a.text);
    }
    if (!e.patterns.length) err(w, 'needs patterns');
    for (const p of e.patterns) {
      cond(`${w} pattern ${p.id}`, p.if);
      if (!e.patternDefs[p.id]) err(w, `pattern "${p.id}" not defined`);
    }
    for (const [id, def] of Object.entries(e.patternDefs) as [string, PatternDef][]) {
      if (!(def.duration > 0)) err(`${w} patternDef ${id}`, 'duration must be > 0');
      def.emitters.forEach((em, i) => checkEmitter(`${w} patternDef ${id}.emitters[${i}]`, em));
    }
  }

  // Shops, quests, endings
  for (const shop of shops.values()) {
    const w = `shop ${shop.id}`;
    if (!characters.has(shop.keeper)) err(w, `unknown keeper "${shop.keeper}"`);
    for (const it of shop.items) {
      if (!items.has(it.id)) err(w, `unknown item "${it.id}"`);
      if (!(it.price > 0)) err(w, `item ${it.id} needs a positive price`);
    }
    text(`${w} greeting`, shop.greeting);
  }
  for (const q of quests) {
    cond(`quest ${q.id}.activeIf`, q.activeIf);
    cond(`quest ${q.id}.doneIf`, q.doneIf);
  }
  // Every chapter that has an ending has all three routes; interludes lead to a real spawn.
  const chapters = new Set([...endings.keys()].map((id) => /^ch(\d+)\./.exec(id)?.[1] ?? '?'));
  if (chapters.has('?')) err('endings', 'ending ids must look like "ch<chapter>.<route>"');
  for (const ch of chapters) {
    if (ch === '?') continue;
    for (const route of ['return', 'keep', 'clear']) if (!endings.has(`ch${ch}.${route}`)) err('endings', `missing ending "ch${ch}.${route}"`);
  }
  for (const e of endings.values()) {
    if (!songs.has(e.music)) err(`ending ${e.id}`, `unknown song "${e.music}"`);
    condTexts(`ending ${e.id} pages`, e.pages);
    if (e.next) {
      const m = maps.get(e.next.map);
      if (!m) err(`ending ${e.id}`, `next map "${e.next.map}" does not exist`);
      else if (!m.spawns[e.next.spawn]) err(`ending ${e.id}`, `next spawn "${e.next.spawn}" not in ${e.next.map}`);
    }
  }
  for (const e of enemies.values()) {
    for (const ph of e.phases ?? []) {
      cond(`enemy ${e.id} phase ${ph.id}`, ph.if);
      if (ph.soul && !['free', 'tether', 'spin'].includes(ph.soul)) err(`enemy ${e.id} phase ${ph.id}`, `unknown soul rule "${ph.soul}"`);
    }
    if (e.music && !songs.has(e.music)) err(`enemy ${e.id}`, `unknown song "${e.music}"`);
  }

  // Songs
  for (const s of songs.values()) {
    const w = `song ${s.id}`;
    if (!(s.bpm > 0) || !(s.stepsPerBeat > 0)) err(w, 'bad tempo');
    const len = s.channels[0]?.pattern.length ?? 0;
    s.channels.forEach((c, i) => {
      if (c.pattern.length !== len) err(w, `channel ${i} length ${c.pattern.length} != ${len}`);
      c.pattern.forEach((n, j) => {
        if (n !== '.' && n !== '-' && !/^[A-G][#b]?\d$/.test(n) && !(c.wave === 'noise' && /^[xkso]$/.test(n))) {
          err(w, `channel ${i} step ${j}: bad note "${n}"`);
        }
      });
    });
  }
  return errors;
}

/** Validates once at startup and logs problems (the game keeps running). */
export function reportContentErrors(): number {
  const errors = validateContent();
  for (const e of errors) console.error(`[Content] ${e}`);
  return errors.length;
}
