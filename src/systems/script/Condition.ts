/**
 * Tiny condition language used by dialogue, map events and enemy data.
 *
 *   flag:met_ledger                     truthy check
 *   !flag:met_ledger                    negation
 *   flag:visits >= 3 && item:thread     comparison, and
 *   var:tangle <= 0 || turn > 4         or, enemy/battle variables
 *   (rel:mitt > 2) && !cleared:earbuds  grouping
 *
 * Keys are opaque to the parser; a resolver supplied by the caller maps them to values
 * (see game/GameState.ts `stateResolver`). Content is validated at load time by parsing
 * every condition, so syntax errors surface in tests rather than mid-game.
 */

export type ConditionValue = number | boolean | string | null | undefined;
export type Resolver = (key: string) => ConditionValue;

type Op = '==' | '!=' | '>=' | '<=' | '>' | '<';

type Node =
  | { kind: 'or' | 'and'; left: Node; right: Node }
  | { kind: 'not'; inner: Node }
  | { kind: 'test'; key: string; op?: Op; value?: ConditionValue };

type Token =
  | { t: 'ident'; v: string }
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'op'; v: Op }
  | { t: '&&' | '||' | '!' | '(' | ')' };

export class ConditionError extends Error {}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      tokens.push({ t: two });
      i += 2;
      continue;
    }
    if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if (ch === '>' || ch === '<') {
      tokens.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '!' || ch === '(' || ch === ')') {
      tokens.push({ t: ch });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) throw new ConditionError(`unterminated string in "${src}"`);
      tokens.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num && (tokens.length === 0 || tokens[tokens.length - 1]?.t === 'op')) {
      tokens.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const ident = /^[A-Za-z0-9_][\w.:%\-]*/.exec(src.slice(i));
    if (ident) {
      tokens.push({ t: 'ident', v: ident[0] });
      i += ident[0].length;
      continue;
    }
    throw new ConditionError(`unexpected "${ch}" in "${src}"`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly src: string,
  ) {}

  parse(): Node {
    const node = this.or();
    if (this.pos < this.tokens.length) throw new ConditionError(`unexpected token in "${this.src}"`);
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private or(): Node {
    let left = this.and();
    while (this.peek()?.t === '||') {
      this.pos++;
      left = { kind: 'or', left, right: this.and() };
    }
    return left;
  }

  private and(): Node {
    let left = this.not();
    while (this.peek()?.t === '&&') {
      this.pos++;
      left = { kind: 'and', left, right: this.not() };
    }
    return left;
  }

  private not(): Node {
    if (this.peek()?.t === '!') {
      this.pos++;
      return { kind: 'not', inner: this.not() };
    }
    return this.primary();
  }

  private primary(): Node {
    const tok = this.peek();
    if (!tok) throw new ConditionError(`unexpected end of "${this.src}"`);
    if (tok.t === '(') {
      this.pos++;
      const inner = this.or();
      if (this.peek()?.t !== ')') throw new ConditionError(`missing ")" in "${this.src}"`);
      this.pos++;
      return inner;
    }
    if (tok.t !== 'ident') throw new ConditionError(`expected a key in "${this.src}"`);
    this.pos++;
    const next = this.peek();
    if (next?.t !== 'op') return { kind: 'test', key: tok.v };
    this.pos++;
    const lit = this.peek();
    if (!lit || (lit.t !== 'num' && lit.t !== 'str' && lit.t !== 'ident')) {
      throw new ConditionError(`expected a value after ${next.v} in "${this.src}"`);
    }
    this.pos++;
    let value: ConditionValue = lit.v;
    if (lit.t === 'ident') value = lit.v === 'true' ? true : lit.v === 'false' ? false : lit.v === 'null' ? null : lit.v;
    return { kind: 'test', key: tok.v, op: next.v, value };
  }
}

const truthy = (v: ConditionValue): boolean => v !== undefined && v !== null && v !== false && v !== 0 && v !== '';

function compare(actual: ConditionValue, op: Op, expected: ConditionValue): boolean {
  if (typeof expected === 'number') {
    const a = typeof actual === 'number' ? actual : typeof actual === 'boolean' ? Number(actual) : Number(actual ?? 0);
    if (Number.isNaN(a)) return op === '!=';
    switch (op) {
      case '==':
        return a === expected;
      case '!=':
        return a !== expected;
      case '>=':
        return a >= expected;
      case '<=':
        return a <= expected;
      case '>':
        return a > expected;
      case '<':
        return a < expected;
    }
  }
  if (typeof expected === 'boolean') {
    const eq = truthy(actual) === expected;
    return op === '!=' ? !eq : op === '==' ? eq : false;
  }
  const eq = (actual ?? null) === expected || String(actual ?? '') === String(expected ?? '');
  return op === '!=' ? !eq : op === '==' ? eq : false;
}

function evaluateNode(node: Node, resolve: Resolver): boolean {
  switch (node.kind) {
    case 'or':
      return evaluateNode(node.left, resolve) || evaluateNode(node.right, resolve);
    case 'and':
      return evaluateNode(node.left, resolve) && evaluateNode(node.right, resolve);
    case 'not':
      return !evaluateNode(node.inner, resolve);
    case 'test': {
      const actual = resolve(node.key);
      return node.op ? compare(actual, node.op, node.value) : truthy(actual);
    }
  }
}

function collectKeys(node: Node, out: string[]): void {
  if (node.kind === 'test') out.push(node.key);
  else if (node.kind === 'not') collectKeys(node.inner, out);
  else {
    collectKeys(node.left, out);
    collectKeys(node.right, out);
  }
}

const cache = new Map<string, Node>();

function parse(src: string): Node {
  let node = cache.get(src);
  if (!node) {
    node = new Parser(tokenize(src), src).parse();
    cache.set(src, node);
  }
  return node;
}

/** Throws ConditionError on syntax errors. Used by content validation. */
export function validateCondition(src: string): string[] {
  const keys: string[] = [];
  collectKeys(parse(src), keys);
  return keys;
}

/** An absent condition is always true. Malformed conditions log and evaluate false. */
export function evaluateCondition(src: string | undefined | null, resolve: Resolver): boolean {
  if (src === undefined || src === null || src.trim() === '') return true;
  try {
    return evaluateNode(parse(src), resolve);
  } catch (error) {
    console.error(`[Condition] ${(error as Error).message}`);
    return false;
  }
}
