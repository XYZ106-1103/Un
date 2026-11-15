/**
 * Inline markup for dialogue text.
 *
 *   {player}            player's name (any key in `vars`)
 *   {item|을/를}        variable + Korean particle (see utils/KoreanUtils.ts)
 *   {w=400}             pause typing for 400 ms
 *   {s=0.5}             typing speed multiplier from here on (1 = normal)
 *   {c=amber}…{/c}      colour (PALETTE name or #rrggbb)
 *   {shake}…{/shake}    trembling letters
 *   {wave}…{/wave}      bobbing letters
 *   {face=nervous}      change the speaker's expression at this point
 *   {sfx=ui-deny}       play a sound at this point
 *
 * Unknown tags are left in the text verbatim so typos are visible, not silently eaten.
 */

import { parseColor } from '@/systems/assets/PixelArt';
import { withJosa } from '@/utils/KoreanUtils';

export type TextEffect = 'shake' | 'wave';

export interface RichChar {
  ch: string;
  color?: number;
  effect?: TextEffect;
}

export type RichEvent =
  | { at: number; type: 'wait'; ms: number }
  | { at: number; type: 'speed'; value: number }
  | { at: number; type: 'face'; face: string }
  | { at: number; type: 'sfx'; id: string };

export interface RichText {
  chars: RichChar[];
  /** Plain text (what is laid out and word-wrapped). */
  text: string;
  /** Events fire just before the character at index `at` is revealed. */
  events: RichEvent[];
}

export function parseRichText(src: string, vars: Record<string, string | number> = {}, useJosa = true): RichText {
  const chars: RichChar[] = [];
  const events: RichEvent[] = [];
  const colorStack: number[] = [];
  const effectStack: TextEffect[] = [];

  const push = (text: string) => {
    for (const ch of text) {
      const c: RichChar = { ch };
      const color = colorStack[colorStack.length - 1];
      const effect = effectStack[effectStack.length - 1];
      if (color !== undefined) c.color = color;
      if (effect !== undefined) c.effect = effect;
      chars.push(c);
    }
  };

  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) {
      push(src.slice(i));
      break;
    }
    push(src.slice(i, open));
    const close = src.indexOf('}', open);
    if (close < 0) {
      push(src.slice(open));
      break;
    }
    const tag = src.slice(open + 1, close);
    const at = chars.length;
    let handled = true;
    const [name, value] = tag.includes('=') ? [tag.slice(0, tag.indexOf('=')), tag.slice(tag.indexOf('=') + 1)] : [tag, ''];

    if (name === 'w' && value) events.push({ at, type: 'wait', ms: Number(value) || 0 });
    else if (name === 's' && value) events.push({ at, type: 'speed', value: Number(value) || 1 });
    else if (name === 'face' && value) events.push({ at, type: 'face', face: value });
    else if (name === 'sfx' && value) events.push({ at, type: 'sfx', id: value });
    else if (name === 'c' && value) {
      const color = parseColor(value);
      if (color === null) handled = false;
      else colorStack.push(color);
    } else if (name === '/c') colorStack.pop();
    else if (name === 'shake' || name === 'wave') effectStack.push(name);
    else if (name === '/shake' || name === '/wave') effectStack.pop();
    else {
      const [varName, josa] = tag.split('|');
      if (varName && varName in vars) {
        const v = String(vars[varName]);
        push(josa && useJosa ? withJosa(v, josa) : v);
      } else handled = false;
    }
    if (!handled) push(src.slice(open, close + 1));
    i = close + 1;
  }

  return { chars, text: chars.map((c) => c.ch).join(''), events };
}
