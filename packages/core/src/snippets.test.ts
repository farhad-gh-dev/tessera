import { describe, expect, it } from 'vitest';
import { formatDate, matchesQuery, relativeTime, typeLabel } from './snippets.js';
import type { Snippet } from './types.js';

function snippet(over: Partial<Snippet> = {}): Snippet {
  return {
    id: 's1',
    type: 'text',
    text: 'Mitochondria are the powerhouse of the cell.',
    note: 'review for midterm',
    url: 'https://en.wikipedia.org/wiki/Cell',
    domain: 'en.wikipedia.org',
    pageTitle: 'Cell — Wikipedia',
    userId: 'u1',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...over,
  } as Snippet;
}

describe('matchesQuery', () => {
  it('matches everything for an empty or whitespace-only query', () => {
    expect(matchesQuery(snippet(), '')).toBe(true);
    expect(matchesQuery(snippet(), '   ')).toBe(true);
  });

  it('matches text case-insensitively', () => {
    expect(matchesQuery(snippet(), 'POWERHOUSE')).toBe(true);
  });

  it('matches across note, page title, and domain', () => {
    expect(matchesQuery(snippet(), 'midterm')).toBe(true);
    expect(matchesQuery(snippet(), 'Wikipedia')).toBe(true);
    expect(matchesQuery(snippet(), 'en.wikipedia.org')).toBe(true);
  });

  it('folds in extra haystack strings (e.g. tag names, SP-3)', () => {
    const s = snippet({ note: undefined });
    expect(matchesQuery(s, 'biology')).toBe(false);
    expect(matchesQuery(s, 'biology', ['Biology', 'Exam'])).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesQuery(snippet(), 'zzz-nope')).toBe(false);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-06-10T12:00:00.000Z');

  it('reads "just now" under 45s', () => {
    expect(relativeTime('2026-06-10T11:59:30.000Z', now)).toBe('just now');
  });
  it('reads minutes', () => {
    expect(relativeTime('2026-06-10T11:30:00.000Z', now)).toBe('30m ago');
  });
  it('reads hours', () => {
    expect(relativeTime('2026-06-10T07:00:00.000Z', now)).toBe('5h ago');
  });
  it('reads days', () => {
    expect(relativeTime('2026-06-08T12:00:00.000Z', now)).toBe('2d ago');
  });
  it('falls back to a date past a week', () => {
    const old = '2026-05-01T12:00:00.000Z';
    expect(relativeTime(old, now)).toBe(formatDate(old));
  });
  it('returns "" for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('typeLabel', () => {
  it('labels each snippet type', () => {
    expect(typeLabel('text')).toBe('Text');
    expect(typeLabel('image')).toBe('Image');
    expect(typeLabel('screenshot')).toBe('Screenshot');
  });
});
