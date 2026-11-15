/**
 * Word wrapping for rich text. Breaks at spaces; a word wider than the line (common
 * with long Korean phrases) is broken between syllables. Returns a new char list with
 * '\n' characters, plus a map from wrapped index back to the source index so typing
 * events stay aligned.
 */

import type { RichChar } from './RichText';

export interface WrapResult {
  chars: RichChar[];
  /** sourceIndex[i] = index in the input of wrapped char i (-1 for inserted breaks). */
  sourceIndex: number[];
  lines: number;
}

export function wrapRichText(input: RichChar[], maxWidth: number, measure: (ch: string) => number): WrapResult {
  const out: RichChar[] = [];
  const src: number[] = [];
  let lineWidth = 0;
  let lines = 1;
  let i = 0;

  const newline = (replaceSpaceAt?: number) => {
    if (replaceSpaceAt !== undefined) {
      out[replaceSpaceAt] = { ch: '\n' };
    } else {
      out.push({ ch: '\n' });
      src.push(-1);
    }
    lines++;
    lineWidth = 0;
  };

  while (i < input.length) {
    const c = input[i] as RichChar;
    if (c.ch === '\n') {
      out.push(c);
      src.push(i);
      lines++;
      lineWidth = 0;
      i++;
      continue;
    }
    if (c.ch === ' ') {
      out.push(c);
      src.push(i);
      lineWidth += measure(' ');
      i++;
      continue;
    }
    // Collect the word.
    let j = i;
    let wordWidth = 0;
    while (j < input.length && input[j]?.ch !== ' ' && input[j]?.ch !== '\n') {
      wordWidth += measure((input[j] as RichChar).ch);
      j++;
    }
    if (lineWidth + wordWidth > maxWidth && lineWidth > 0) {
      // Break before the word: turn the trailing space into a newline if there is one.
      const last = out.length - 1;
      if (last >= 0 && out[last]?.ch === ' ') {
        newline(last);
      } else {
        newline();
      }
    }
    for (let k = i; k < j; k++) {
      const ch = input[k] as RichChar;
      const w = measure(ch.ch);
      if (lineWidth + w > maxWidth && lineWidth > 0) newline();
      out.push(ch);
      src.push(k);
      lineWidth += w;
    }
    i = j;
  }
  return { chars: out, sourceIndex: src, lines };
}
