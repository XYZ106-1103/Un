import { describe, expect, it } from 'vitest';
import en from '@/data/strings/en.json';
import ko from '@/data/strings/ko.json';
import { detectLocale, setLocale, t } from '@/systems/LocaleSystem';

describe('LocaleSystem', () => {
  it('Korean and English tables define the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
  });

  it('fills placeholders and keeps unknown ones', () => {
    setLocale('en');
    expect(t('title.temp', { list: 'a, b' })).toBe('TEMP ART: a, b');
    expect(t('title.temp')).toBe('TEMP ART: {list}');
    setLocale('ko');
    expect(t('loading')).toBe('불러오는 중');
  });

  it('defaults to Korean unless the browser is English', () => {
    expect(detectLocale('ko-KR')).toBe('ko');
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('ja-JP')).toBe('ko');
    expect(detectLocale(undefined)).toBe('ko');
  });
});
