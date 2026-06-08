import { describe, expect, it } from 'vitest';
import type { SyncRecord } from './types.js';
import { isDeleted, pickWinner, reconcilePull } from './reconcile.js';

const T = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

function rec(id: string, over: Partial<SyncRecord> = {}): SyncRecord {
  return { id, userId: 'u', createdAt: T(0), updatedAt: T(0), ...over };
}

describe('isDeleted', () => {
  it('is true only when a tombstone is present', () => {
    expect(isDeleted(rec('a'))).toBe(false);
    expect(isDeleted(rec('a', { deletedAt: null }))).toBe(false);
    expect(isDeleted(rec('a', { deletedAt: T(1) }))).toBe(true);
  });
});

describe('pickWinner', () => {
  it('prefers the later updatedAt', () => {
    const older = rec('a', { updatedAt: T(1) });
    const newer = rec('a', { updatedAt: T(2) });
    expect(pickWinner(older, newer)).toBe(newer);
    expect(pickWinner(newer, older)).toBe(newer);
  });

  it('lets a tombstone win a tie so deletes converge', () => {
    const live = rec('a', { updatedAt: T(5) });
    const dead = rec('a', { updatedAt: T(5), deletedAt: T(5) });
    expect(pickWinner(live, dead)).toBe(dead);
    expect(pickWinner(dead, live)).toBe(dead);
  });
});

describe('reconcilePull', () => {
  it('writes new and newer incoming records, skips older ones', () => {
    const local = new Map<string, SyncRecord>([
      ['a', rec('a', { updatedAt: T(5) })],
      ['b', rec('b', { updatedAt: T(5) })],
    ]);
    const incoming = [
      rec('a', { updatedAt: T(9) }), // newer -> write
      rec('b', { updatedAt: T(1) }), // older -> skip
      rec('c', { updatedAt: T(3) }), // new -> write
    ];

    const { toWrite, cursor } = reconcilePull(local, incoming, null);

    expect(toWrite.map((r) => r.id).sort()).toEqual(['a', 'c']);
    expect(cursor).toBe(T(9)); // advanced to the max seen
  });

  it('keeps the current cursor when nothing is newer', () => {
    const { toWrite, cursor } = reconcilePull(new Map(), [], T(7));
    expect(toWrite).toHaveLength(0);
    expect(cursor).toBe(T(7));
  });
});
