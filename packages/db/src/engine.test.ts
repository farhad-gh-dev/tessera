/**
 * The sync spike's success criteria, exercised in memory: two devices
 * (`MemoryLocalStore`s) talking to one cloud (`MemoryRemoteAdapter`).
 */
import { describe, expect, it } from 'vitest';
import type { SyncRecord } from './types.js';
import { SyncEngine } from './engine.js';
import { MemoryLocalStore, MemoryRemoteAdapter } from './memory.js';
import { localDelete, localUpsert } from './mutators.js';

const T = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
/** A constant clock fixed at second `s` — makes last-write-wins deterministic. */
const at = (s: number) => () => T(s);

function snippet(id: string, over: Partial<SyncRecord> = {}): SyncRecord {
  return {
    id,
    userId: 'u1',
    type: 'text',
    text: 'v0',
    url: `https://x.com/${id}`,
    domain: 'x.com',
    pageTitle: 'A',
    createdAt: T(0),
    updatedAt: T(0),
    ...over,
  };
}

function twoDevices() {
  const remote = new MemoryRemoteAdapter();
  const a = new MemoryLocalStore();
  const b = new MemoryLocalStore();
  const tables = ['snippets'];
  return {
    remote,
    a,
    b,
    engA: new SyncEngine({ local: a, remote, tables }),
    engB: new SyncEngine({ local: b, remote, tables }),
  };
}

const liveCount = async (store: MemoryLocalStore) =>
  (await store.getAll('snippets')).filter((r) => r.deletedAt == null).length;

describe('SyncEngine', () => {
  it('propagates a new snippet from one device to another', async () => {
    const { a, b, engA, engB } = twoDevices();

    await localUpsert(a, 'snippets', snippet('s1', { text: 'hello' }), at(1));
    await engA.syncOnce();
    const result = await engB.syncOnce();

    expect(result.pulled).toBe(1);
    expect((await b.get('snippets', 's1'))?.text).toBe('hello');
  });

  it('replays an offline queue of edits on reconnect', async () => {
    const { a, b, engA, engB } = twoDevices();

    await localUpsert(a, 'snippets', snippet('s1'), at(1));
    await localUpsert(a, 'snippets', snippet('s2'), at(2));
    await localUpsert(a, 'snippets', snippet('s3'), at(3));

    const pushResult = await engA.syncOnce();
    expect(pushResult.pushed).toBe(3);

    await engB.syncOnce();
    expect(await liveCount(b)).toBe(3);
  });

  it('converges concurrent edits to the same record by last-write-wins', async () => {
    const { a, b, engA, engB } = twoDevices();

    await localUpsert(a, 'snippets', snippet('s1', { text: 'v0' }), at(0));
    await engA.syncOnce();
    await engB.syncOnce();

    // Both edit the same snippet while "offline"; B's edit is later.
    await localUpsert(a, 'snippets', snippet('s1', { text: 'A edit' }), at(10));
    await localUpsert(b, 'snippets', snippet('s1', { text: 'B edit' }), at(20));

    await engA.syncOnce();
    await engB.syncOnce();
    await engA.syncOnce();
    await engB.syncOnce();

    expect((await a.get('snippets', 's1'))?.text).toBe('B edit');
    expect((await b.get('snippets', 's1'))?.text).toBe('B edit');
    expect((await a.get('snippets', 's1'))?.updatedAt).toBe(T(20));
  });

  it('propagates deletes as tombstones', async () => {
    const { a, b, engA, engB } = twoDevices();

    await localUpsert(a, 'snippets', snippet('s1'), at(1));
    await engA.syncOnce();
    await engB.syncOnce();
    expect(await liveCount(b)).toBe(1);

    await localDelete(a, 'snippets', 's1', at(30));
    await engA.syncOnce();
    await engB.syncOnce();

    expect((await b.get('snippets', 's1'))?.deletedAt).toBe(T(30));
    expect(await liveCount(b)).toBe(0);
  });

  it('is a no-op once converged (idempotent)', async () => {
    const { a, engA, engB } = twoDevices();

    await localUpsert(a, 'snippets', snippet('s1'), at(1));
    await engA.syncOnce();
    await engB.syncOnce();
    await engA.syncOnce();

    expect(await engA.syncOnce()).toEqual({ pushed: 0, pulled: 0 });
  });
});
