import { describe, expect, it } from 'vitest';
import type { SyncRecord } from './types.js';
import { MemoryLocalStore } from './memory.js';
import { localDelete, localUpsert } from './mutators.js';

const T = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

function baseSnippet(over: Partial<SyncRecord> = {}): SyncRecord {
  return {
    id: 's1',
    userId: 'u1',
    type: 'text',
    text: 'hello',
    url: 'https://x.com/a',
    domain: 'x.com',
    pageTitle: 'A',
    createdAt: T(0),
    updatedAt: T(0),
    ...over,
  };
}

describe('localUpsert', () => {
  it('stamps a fresh updatedAt and enqueues the record', async () => {
    const store = new MemoryLocalStore();
    const saved = await localUpsert(store, 'snippets', baseSnippet(), () => T(5));

    expect(saved.updatedAt).toBe(T(5));
    expect(await store.get('snippets', 's1')).toMatchObject({ updatedAt: T(5) });

    const outbox = await store.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      table: 'snippets',
      recordId: 's1',
      enqueuedUpdatedAt: T(5),
    });
  });

  it('keeps a single outbox entry per record with the latest timestamp', async () => {
    const store = new MemoryLocalStore();
    await localUpsert(store, 'snippets', baseSnippet(), () => T(5));
    await localUpsert(store, 'snippets', baseSnippet({ text: 'again' }), () => T(9));

    const outbox = await store.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.enqueuedUpdatedAt).toBe(T(9));
  });
});

describe('localDelete', () => {
  it('writes a tombstone and enqueues it', async () => {
    const store = new MemoryLocalStore();
    await localUpsert(store, 'snippets', baseSnippet(), () => T(1));

    const tombstone = await localDelete(store, 'snippets', 's1', () => T(7));

    expect(tombstone?.deletedAt).toBe(T(7));
    expect((await store.get('snippets', 's1'))?.deletedAt).toBe(T(7));
  });

  it('is a no-op when the record is absent', async () => {
    const store = new MemoryLocalStore();
    const result = await localDelete(store, 'snippets', 'missing', () => T(7));

    expect(result).toBeUndefined();
    expect(await store.listOutbox()).toHaveLength(0);
  });
});
