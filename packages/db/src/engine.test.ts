/**
 * The sync spike's success criteria, exercised in memory: two devices
 * (`MemoryLocalStore`s) talking to one cloud (`MemoryRemoteAdapter`).
 */
import { describe, expect, it } from 'vitest';
import type {
  PullPage,
  RemoteAdapter,
  SyncRecord,
  TableName,
  Timestamp,
} from './types.js';
import { SyncEngine } from './engine.js';
import { MemoryLocalStore, MemoryRemoteAdapter } from './memory.js';
import { localUpsert, localDelete } from './mutators.js';

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

  it('pushes tables parent-first so foreign keys resolve (documents before items)', async () => {
    // The outbox is keyed by [table+recordId], so its natural order is
    // alphabetical — which would push `document_items` before `documents`. The
    // engine must instead follow the declared `tables` order. A recording remote
    // captures the push sequence so the ordering is asserted directly.
    const pushOrder: TableName[] = [];
    const recording: RemoteAdapter = {
      async push(table: TableName, records: SyncRecord[]) {
        pushOrder.push(table);
        return records;
      },
      async pull(_t: TableName, cursor: Timestamp | null): Promise<PullPage> {
        return { records: [], cursor };
      },
    };
    const local = new MemoryLocalStore();
    const engine = new SyncEngine({
      local,
      remote: recording,
      tables: ['documents', 'document_items'],
    });

    const base = { userId: 'u1', createdAt: T(1), updatedAt: T(1) };
    // Enqueue the child first to make sure ordering is not just incidental.
    await localUpsert(
      local,
      'document_items',
      { id: 'i1', documentId: 'd1', position: '5', kind: 'snippet_ref', ...base },
      at(1),
    );
    await localUpsert(local, 'documents', { id: 'd1', title: 'Doc', ...base }, at(1));

    await engine.pushOnce();
    expect(pushOrder).toEqual(['documents', 'document_items']);
  });

  it('isolates a failing table — others still push and the pull still runs', async () => {
    // A remote that rejects every `document_items` push (as a foreign-key
    // violation would) but accepts everything else, and records pull calls.
    const pulled: TableName[] = [];
    const accepted = new MemoryRemoteAdapter();
    const remote: RemoteAdapter = {
      async push(table, records) {
        if (table === 'document_items') throw new Error('FK violation');
        return accepted.push(table, records);
      },
      async pull(table, cursor, limit) {
        pulled.push(table);
        return accepted.pull(table, cursor, limit);
      },
    };
    const local = new MemoryLocalStore();
    const engine = new SyncEngine({
      local,
      remote,
      tables: ['documents', 'document_items'],
    });

    const base = { userId: 'u1', createdAt: T(1), updatedAt: T(1) };
    await localUpsert(local, 'documents', { id: 'd1', title: 'Doc', ...base }, at(1));
    await localUpsert(
      local,
      'document_items',
      { id: 'i1', documentId: 'd1', position: '5', kind: 'snippet_ref', ...base },
      at(1),
    );

    // The run reports failure (the poison row really can't sync)...
    await expect(engine.syncOnce()).rejects.toThrow('FK violation');

    // ...but the healthy table pushed and drained, the poison row stayed queued,
    // and the pull phase still ran for every table despite the push failure.
    expect(await accepted.peek('documents', 'd1')).toBeTruthy();
    expect(await accepted.peek('document_items', 'i1')).toBeUndefined();
    const outbox = await local.listOutbox();
    expect(outbox.map((e) => e.table)).toEqual(['document_items']);
    expect(pulled).toEqual(['documents', 'document_items']);
  });

  it('isolates a single poison row — healthy rows in the same table still push', async () => {
    // A remote that rejects snippet s2 (as a row-level constraint violation
    // would) but accepts everything else. The batch push therefore fails, and the
    // engine must fall back to per-row pushes so s1/s3 still land.
    const accepted = new MemoryRemoteAdapter();
    const remote: RemoteAdapter = {
      async push(table, records) {
        if (records.some((r) => r.id === 's2')) throw new Error('row s2 rejected');
        return accepted.push(table, records);
      },
      async pull(table, cursor, limit) {
        return accepted.pull(table, cursor, limit);
      },
    };
    const local = new MemoryLocalStore();
    const engine = new SyncEngine({ local, remote, tables: ['snippets'] });

    await localUpsert(local, 'snippets', snippet('s1'), at(1));
    await localUpsert(local, 'snippets', snippet('s2'), at(1));
    await localUpsert(local, 'snippets', snippet('s3'), at(1));

    // The push still reports failure (the poison row really can't sync)...
    await expect(engine.pushOnce()).rejects.toThrow('row s2 rejected');

    // ...but the healthy rows pushed and drained; only the poison row stays queued.
    expect(await accepted.peek('snippets', 's1')).toBeTruthy();
    expect(await accepted.peek('snippets', 's3')).toBeTruthy();
    expect(await accepted.peek('snippets', 's2')).toBeUndefined();
    expect((await local.listOutbox()).map((e) => e.recordId)).toEqual(['s2']);
    expect(await engine.pendingCount()).toBe(1);
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
