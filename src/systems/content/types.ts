/**
 * Shapes of the JSON content under src/data. Validation lives in ContentDB.ts;
 * these types describe what the rest of the game may rely on after validation.
 */

export type Facing = 'down' | 'left' | 'right' | 'up';
export type FlagValue = boolean | number | string;

// ── Characters ────────────────────────────────────────────────────────────────

export interface VoiceDef {
  wave: OscillatorType;
  /** Base pitch in Hz. */
  pitch: number;
  /** Random pitch spread in Hz. */
  variance: number;
  volume: number;
  /** Blip on every Nth visible character. */
  every: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** Palette colour name for the name plate. */
  color: string;
  /** Art asset key of the portrait sheet (frames = expressions). */
  portrait?: string;
  defaultFace?: string;
  /** Art asset key of the overworld sprite. */
  sprite?: string;
  voice: VoiceDef;
  /** Writers' notes: personality and speech style. Not shown in game. */
  notes?: string;
}

// ── Items ─────────────────────────────────────────────────────────────────────

export type ItemKind = 'consumable' | 'weapon' | 'armor' | 'key';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  heal?: number;
  attack?: number;
  defense?: number;
  /** Shown when used; `{heal}` and `{name}` are substituted. */
  useText?: string[];
  /** Key items can't be dropped. */
  droppable: boolean;
  price?: number;
}

// ── Dialogue scripts ──────────────────────────────────────────────────────────

export type ScriptBody = ScriptNode[] | string;

export interface SayNode {
  say: string | string[];
  who?: string;
  face?: string;
  /** Typing speed multiplier for these pages. */
  speed?: number;
}

export interface ChoiceOption {
  text: string;
  if?: string;
  set?: Record<string, FlagValue>;
  then?: ScriptBody;
}

export interface ChoiceNode {
  choice: ChoiceOption[];
}

export interface IfNode {
  if: string;
  then: ScriptBody;
  else?: ScriptBody;
}

export interface GotoNode {
  goto: string;
}

export interface CallNode {
  call: string;
}

/** `"+1"` / `"-2"` strings increment numeric flags. */
export interface SetNode {
  set: Record<string, FlagValue>;
}

export type CommandName =
  | 'sfx'
  | 'music'
  | 'shake'
  | 'flash'
  | 'wait'
  | 'face'
  | 'item.add'
  | 'item.remove'
  | 'buttons'
  | 'heal'
  | 'relation'
  | 'battle'
  | 'save'
  | 'map'
  | 'npc.hide'
  | 'npc.show'
  | 'npc.face'
  | 'npc.move'
  | 'player.face'
  | 'shop'
  | 'cinema'
  | 'follower'
  | 'ending'
  | 'end';

export interface CommandNode {
  do: CommandName;
  [arg: string]: unknown;
}

export type ScriptNode = SayNode | ChoiceNode | IfNode | GotoNode | CallNode | SetNode | CommandNode;

export type ScriptTable = Record<string, ScriptNode[]>;

// ── Maps ──────────────────────────────────────────────────────────────────────

export interface LegendEntry {
  /** Frame name in the tileset art. */
  tile: string;
  /** Overlay frame drawn above the ground (props, wall tops). */
  deco?: string;
  solid?: boolean;
  /** Looks like the tile above but is walkable (hidden passages). */
  secret?: boolean;
  /** Draw `deco` above characters (tops of shelves, door frames). */
  over?: boolean;
}

export interface SpawnDef {
  x: number;
  y: number;
  facing?: Facing;
}

export interface NpcDef {
  id: string;
  character: string;
  x: number;
  y: number;
  facing?: Facing;
  behavior?: 'idle' | 'wander' | 'turn';
  script: string;
  /** NPC is present only while this holds. */
  if?: string;
}

export interface ObjectDef {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  script: string;
  if?: string;
  /** Optional art frame drawn at the object's tile. */
  sprite?: string;
  /** Conditional frames (first match wins), re-evaluated after every script. */
  sprites?: { if: string; frame: string }[];
  solid?: boolean;
}

export interface ExitDef {
  x: number;
  y: number;
  w?: number;
  h?: number;
  to: string;
  spawn: string;
  if?: string;
}

export interface TriggerDef {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  script: string;
  if?: string;
  /** Fires once per save file (remembered as flag `trigger:<map>.<id>`). */
  once?: boolean;
}

export interface SavePointDef {
  id: string;
  x: number;
  y: number;
  script: string;
}

export interface EncounterTable {
  /** Average steps (tiles walked) between random encounters. */
  steps: number;
  groups: string[][];
  if?: string;
}

export interface MapDef {
  id: string;
  name: string;
  music: string | null;
  tileset: string;
  legend: Record<string, LegendEntry>;
  layout: string[];
  spawns: Record<string, SpawnDef>;
  npcs: NpcDef[];
  objects: ObjectDef[];
  exits: ExitDef[];
  triggers: TriggerDef[];
  savePoints: SavePointDef[];
  encounters?: EncounterTable;
  /** Ambient effects. */
  ambience?: { dust?: boolean; rain?: boolean; lightShaft?: { x: number; width: number } };
  /** Script run every time the map is entered (after fade-in). */
  onEnter?: string;
}

// ── Enemies & bullet patterns ─────────────────────────────────────────────────

export interface CondText {
  if?: string;
  text: string | string[];
}

export interface ActDef {
  id: string;
  label: string;
  /** Act is listed only while this holds. */
  if?: string;
  /** Required to perform it; otherwise `deniedText` is shown. */
  requires?: string;
  deniedText?: string[];
  /** Variable changes, e.g. { "tangle": "-1" }. */
  set?: Record<string, FlagValue>;
  /** Story flags written to the save when this act is performed. */
  flags?: Record<string, FlagValue>;
  /** Ends the battle right after the text (e.g. a boss letting you retreat). */
  endBattle?: 'fled';
  text: CondText[];
}

/**
 * Soul rules: `free` moves in eight directions; `tether` swings from a pin (Sir Brolly);
 * `spin` is pushed by a slowly rotating current the player has to steer against (Tumble).
 */
export type SoulMode = 'free' | 'tether' | 'spin';

/** Boss phase: entered once, in order, when its condition first holds. */
export interface PhaseDef {
  id: string;
  if: string;
  /** Lines shown when the phase begins. */
  enter?: string[];
  /** Soul rule while this phase is active. */
  soul?: SoulMode;
}

export interface BulletSpec {
  /** Frame in the `bullets` art sheet. */
  frame: string;
  /** Hitbox radius in px (smaller than the art: near misses feel fair). */
  radius: number;
  speed: number;
  accel?: number;
  /** Visual spin (deg/s). */
  spin?: number;
  damage?: number;
  lifetime?: number;
}

export type EmitterType = 'linear' | 'ring' | 'radial' | 'spiral' | 'fall' | 'homing' | 'stream' | 'sequence';

export type Origin = 'left' | 'right' | 'top' | 'bottom' | 'edges' | 'center' | 'enemy' | [number, number];

export interface EmitterDef {
  type: EmitterType;
  /** ms after pattern start. */
  start?: number;
  /** ms after pattern start; emitter stops spawning afterwards. */
  end?: number;
  /** ms between volleys. */
  interval?: number;
  /** Number of volleys (default: until `end`). */
  count?: number;
  bullet?: BulletSpec;
  from?: Origin;
  /** Degrees; 0 = right, 90 = down. */
  angle?: number;
  spread?: number;
  /** Bullets per volley (ring/radial/spiral arms). */
  amount?: number;
  /** Ring: empty slots for the soul to slip through. */
  gap?: number;
  /** Spiral rotation speed (deg/s). */
  rotate?: number;
  /** Homing turn rate (deg/s). */
  turn?: number;
  /** Aim each volley at the soul. */
  aim?: boolean;
  /** Sequence children run one after another. */
  children?: EmitterDef[];
  /** Per-child duration for sequences (ms). */
  step?: number;
}

export interface PatternDef {
  duration: number;
  box?: { w: number; h: number };
  emitters: EmitterDef[];
}

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  attack: number;
  defense: number;
  reward: { buttons: number };
  encounter: string;
  check: string;
  vars?: Record<string, number>;
  acts: ActDef[];
  spareWhen: string;
  flavor: CondText[];
  speech: CondText[];
  patterns: { id: string; if?: string }[];
  patternDefs: Record<string, PatternDef>;
  sparedText?: string;
  clearedText?: string;
  canFlee?: boolean;
  /** Battle song override (bosses). */
  music?: string;
  phases?: PhaseDef[];
}

// ── Shops & quests ────────────────────────────────────────────────────────────

export interface ShopDef {
  id: string;
  name: string;
  keeper: string;
  items: { id: string; price: number }[];
  greeting: string[];
  thanks: string[];
  broke: string[];
}

export interface EndingDef {
  /** `ch<chapter>.<route>`, e.g. `ch1.return`. */
  id: string;
  title: string;
  music: string;
  /** Pages shown before the credits (or before the next chapter card); each may be conditional. */
  pages: CondText[];
  finalLine: string;
  /**
   * Chapter interlude: instead of credits, show a chapter card and continue the same
   * game on `map`/`spawn`. `set` applies flag changes at the hand-over (e.g. a companion
   * staying behind). Without `next` this is the game's current final ending.
   */
  next?: { label: string; title: string; map: string; spawn: string; set?: Record<string, FlagValue> };
}

export interface QuestDef {
  id: string;
  title: string;
  /** Shown while active. */
  description: string;
  activeIf: string;
  doneIf: string;
  doneText?: string;
}

// ── Music ─────────────────────────────────────────────────────────────────────

export interface SongChannel {
  wave: OscillatorType | 'noise';
  volume: number;
  /** Note names ("C4", "F#3"), "." rest, "-" hold. One entry per step. */
  pattern: string[];
  /** Note length as a fraction of a step (staccato < 1). */
  gate?: number;
  octave?: number;
}

export interface SongDef {
  id: string;
  title: string;
  bpm: number;
  /** Steps per beat (4 = sixteenth notes). */
  stepsPerBeat: number;
  channels: SongChannel[];
}
