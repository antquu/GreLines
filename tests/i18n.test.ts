import { describe, expect, it } from 'vitest';
import { messages } from '../src/i18n';

function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, shape((value as Record<string, unknown>)[key])]));
  }
  return typeof value;
}

describe('translations', () => {
  it('has the same keys in french and english', () => {
    expect(shape(messages.en)).toEqual(shape(messages.fr));
  });

  it('has no empty text', () => {
    const texts = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(texts) : [];
    for (const language of ['fr', 'en'] as const) {
      expect(texts(messages[language]).filter(text => text.trim() === '')).toEqual([]);
    }
  });
});
