/**
 * UI string lookup. Text lives in src/data/strings/<locale>.json, never in code.
 * Korean is the primary language; English is the fallback for missing keys.
 * (Dialogue has its own data format, introduced with the dialogue system in PHASE 3.)
 */

import en from '@/data/strings/en.json';
import ko from '@/data/strings/ko.json';
import { withJosa } from '@/utils/KoreanUtils';

export type Locale = 'ko' | 'en';
export type StringKey = keyof typeof ko;

const TABLES: Record<Locale, Partial<Record<string, string>>> = { ko, en };

let current: Locale = detectLocale(globalThis.navigator?.language);

export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'ko';
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/**
 * Looks up `key` and fills placeholders. Missing keys render as the key itself.
 *   {name}          plain substitution
 *   {item|을/를}    substitution + Korean particle chosen from the word's final sound
 *                   (the particle part is ignored for other locales)
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  return format(TABLES[current][key] ?? TABLES.en[key] ?? key, vars);
}

/** Same placeholder rules as t(), for text that comes from content data. */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (match, name: string, josa: string | undefined) => {
    if (!(name in vars)) return match;
    const value = String(vars[name]);
    return josa && current === 'ko' ? withJosa(value, josa) : value;
  });
}
