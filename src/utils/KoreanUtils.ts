/**
 * Korean particle (조사) selection: "보풀 사탕을" vs "장갑을", "레저는" vs "미트는".
 * Item names, enemy names and the player's chosen name are inserted into sentences at
 * runtime, so the right particle has to be chosen from the word's final sound.
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const RIEUL = 8; // jongseong index of ㄹ

/** Digits read in Sino-Korean: 영 일 이 삼 사 오 육 칠 팔 구 → final consonant? */
const DIGIT_FINAL = [true, true, false, true, false, false, true, true, true, false];
const DIGIT_RIEUL = [false, true, false, false, false, false, false, true, true, false];

/** Returns [hasFinalConsonant, finalIsRieul] for the last meaningful character. */
function finalSound(word: string): [boolean, boolean] {
  const chars = [...word.replace(/[\s)\]}"'.,!?…]+$/u, '')];
  const last = chars[chars.length - 1];
  if (!last) return [false, false];
  const code = last.codePointAt(0) ?? 0;
  if (code >= HANGUL_START && code <= HANGUL_END) {
    const jong = (code - HANGUL_START) % 28;
    return [jong !== 0, jong === RIEUL];
  }
  if (/[0-9]/.test(last)) {
    const d = Number(last);
    return [DIGIT_FINAL[d] ?? false, DIGIT_RIEUL[d] ?? false];
  }
  // Latin: letters usually pronounced with a final consonant in Korean loanwords.
  if (/[lmnr]/i.test(last)) return [true, /[lr]/i.test(last)];
  return [false, false];
}

/**
 * Attaches the right particle. `pair` is "<after consonant>/<after vowel>":
 * 을/를, 은/는, 이/가, 과/와, 아/야, 으로/로 (ㄹ-final takes 로), 이에요/예요.
 */
export function withJosa(word: string, pair: string): string {
  const [withFinal, withoutFinal] = pair.split('/');
  if (withFinal === undefined || withoutFinal === undefined) return word + pair;
  const [hasFinal, isRieul] = finalSound(word);
  if (pair === '으로/로') return word + (hasFinal && !isRieul ? '으로' : '로');
  return word + (hasFinal ? withFinal : withoutFinal);
}
