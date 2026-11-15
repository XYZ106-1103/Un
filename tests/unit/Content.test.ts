import { describe, expect, it } from 'vitest';
import { validateContent } from '@/systems/content/ContentDB';

describe('shipped content', () => {
  it('has no structural or cross-reference errors', () => {
    expect(validateContent()).toEqual([]);
  });
});
