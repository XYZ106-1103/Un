import { describe, expect, it, vi } from 'vitest';
import { evaluateCondition, validateCondition } from '@/systems/script/Condition';

const vars: Record<string, unknown> = { 'flag:a': true, 'flag:n': 3, 'flag:s': 'hello', 'item:x': false, 'var:tangle': 0 };
const resolve = (k: string) => vars[k] as never;

describe('Condition', () => {
  it('truthiness, negation, comparison', () => {
    expect(evaluateCondition('flag:a', resolve)).toBe(true);
    expect(evaluateCondition('!flag:a', resolve)).toBe(false);
    expect(evaluateCondition('flag:missing', resolve)).toBe(false);
    expect(evaluateCondition('flag:n >= 3', resolve)).toBe(true);
    expect(evaluateCondition('flag:n > 3', resolve)).toBe(false);
    expect(evaluateCondition('flag:missing < 1', resolve)).toBe(true);
    expect(evaluateCondition('var:tangle <= 0', resolve)).toBe(true);
    expect(evaluateCondition('flag:s == hello', resolve)).toBe(true);
    expect(evaluateCondition('flag:s != "bye"', resolve)).toBe(true);
    expect(evaluateCondition('flag:a == true', resolve)).toBe(true);
  });

  it('precedence and grouping', () => {
    expect(evaluateCondition('flag:a || item:x && flag:missing', resolve)).toBe(true);
    expect(evaluateCondition('(flag:a || item:x) && flag:missing', resolve)).toBe(false);
    expect(evaluateCondition('!(item:x) && flag:n == 3', resolve)).toBe(true);
    expect(evaluateCondition('flag:n == -1 || flag:n == 3', resolve)).toBe(true);
  });

  it('absent conditions pass; malformed ones fail closed', () => {
    expect(evaluateCondition(undefined, resolve)).toBe(true);
    expect(evaluateCondition('  ', resolve)).toBe(true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(evaluateCondition('flag:a &&', resolve)).toBe(false);
    err.mockRestore();
  });

  it('validateCondition reports keys and throws on syntax errors', () => {
    expect(validateCondition('flag:a && rel:mitt > 2')).toEqual(['flag:a', 'rel:mitt']);
    expect(() => validateCondition('(flag:a')).toThrow();
    expect(() => validateCondition('flag:a >')).toThrow();
    expect(() => validateCondition('flag:a @ b')).toThrow();
  });
});
