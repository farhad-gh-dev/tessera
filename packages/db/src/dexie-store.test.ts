// Verifies the real Dexie/IndexedDB local store (not the in-memory fake) against
// a polyfilled IndexedDB, including the `url` index the extension queries on.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Snippet } from '@tessera/core';
import { DexieLocalStore, TesseraDexie } from './dexie-store.js';
import { localDelete, localUpsert } from './mutators.js';
import { SyncEngine } from './engine.js';
import { MemoryRemoteAdapter } from './memory.js';

let dbCounter = 0;
function freshStore() {
  const db = new TesseraDexie(`tessera-test-${dbCounter++}`);
  return { db, store: new DexieLocalStore(db) };
}

function makeSnippet(id: string, url: string): Snippet {
  return {
    id,
    userId: 'u',
    type: 'text',
    text: 'hello',
    url,
    domain: 'x.com',
    pageTitle: 'A',
    anchor: { quote: { exact: 'hello' } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('DexieLocalStore', () => {
  it('persists a snippet and finds it by the url index', async () => {
    const { db, store } = freshStore();
    await localUpsert(store, 'snippets', makeSnippet('s1', 'https://x.com/a'));
    await localUpsert(store, 'snippets', makeSnippet('s2', 'https://x.com/b'));

    const rows = await db.snippets.where('url').equals('https://x.com/a').toArray();
    expect(rows.map((r) => r.id)).toEqual(['s1']);
    expect(rows[0]?.anchor?.quote?.exact).toBe('hello');
    db.close();
  });

  it('drives the sync engine end to end (Dexie → remote)', async () => {
    const { db, store } = freshStore();
    const remote = new MemoryRemoteAdapter();
    const engine = new SyncEngine({ local: store, remote, tables: ['snippets'] });

    await localUpsert(store, 'snippets', makeSnippet('s1', 'https://x.com/a'));
    const result = await engine.syncOnce();

    expect(result.pushed).toBe(1);
    expect(await remote.peek('snippets', 's1')).toBeTruthy();
    expect(await store.listOutbox()).toHaveLength(0); // drained after push
    db.close();
  });

  it('writes a tombstone on delete', async () => {
    const { db, store } = freshStore();
    await localUpsert(store, 'snippets', makeSnippet('s1', 'https://x.com/a'));
    await localDelete(store, 'snippets', 's1');

    const row = await db.snippets.get('s1');
    expect(row?.deletedAt).toBeTruthy();
    db.close();
  });
});
