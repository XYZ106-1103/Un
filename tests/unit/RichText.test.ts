import { describe, expect, it } from 'vitest';
import { PALETTE } from '@/game/Constants';
import { parseRichText } from '@/systems/text/RichText';
import { withJosa } from '@/utils/KoreanUtils';

describe('RichText', () => {
  it('substitutes variables with particles and strips tags', () => {
    const r = parseRichText('안녕, {player|아/야}! {w=300}나는 {c=amber}레저{/c}.', { player: '하늘' });
    expect(r.text).toBe('안녕, 하늘아! 나는 레저.');
    expect(r.events).toEqual([{ at: 9, type: 'wait', ms: 300 }]);
    const ledger = r.chars.slice(12, 14);
    expect(ledger.every((c) => c.color === PALETTE.amber)).toBe(true);
    expect(r.chars[14]?.color).toBeUndefined();
  });

  it('nests effects and records face/sfx/speed events', () => {
    const r = parseRichText('{shake}무{wave}서{/wave}워{/shake}{face=sad}{s=0.5}{sfx=ui-deny}.');
    expect(r.chars.map((c) => c.effect)).toEqual(['shake', 'wave', 'shake', undefined]);
    expect(r.events.map((e) => e.type)).toEqual(['face', 'speed', 'sfx']);
  });

  it('keeps unknown tags visible', () => {
    expect(parseRichText('a {typo} b').text).toBe('a {typo} b');
    expect(parseRichText('a {c=notacolour}b').text).toBe('a {c=notacolour}b');
    expect(parseRichText('unclosed {brace').text).toBe('unclosed {brace');
  });
});

describe('withJosa', () => {
  it('chooses particles by final consonant', () => {
    expect(withJosa('장갑', '을/를')).toBe('장갑을');
    expect(withJosa('사탕', '을/를')).toBe('사탕을');
    expect(withJosa('레저', '은/는')).toBe('레저는');
    expect(withJosa('미트', '이/가')).toBe('미트가');
    expect(withJosa('하늘', '으로/로')).toBe('하늘로');
    expect(withJosa('집', '으로/로')).toBe('집으로');
    expect(withJosa('우산', '과/와')).toBe('우산과');
    expect(withJosa('3', '을/를')).toBe('3을');
    expect(withJosa('2', '을/를')).toBe('2를');
    expect(withJosa('Sam', '이/가')).toBe('Sam이');
  });
});
