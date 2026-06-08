/**
 * Local-first write helpers. Apps call these instead of writing the store
 * directly: each mutation stamps a fresh client `updatedAt` and enqueues the
 * record for the next push. Reads stay instant and the network is never on the
 * critical path.
 */
import type { SyncFields } from '@tessera/core';
import type { Clock, LocalStore, SyncRecord, TableName } from './types.js';
import { systemClock } from './types.js';

/**
 * Insert or update a record locally and queue it for sync. Accepts any concrete
 * domain type (e.g. `Snippet`) — not just the opaque `SyncRecord` — so callers
 * keep their precise types.
 */
export async function localUpsert<T extends SyncFields>(
  store: LocalStore,
  table: TableName,
  record: T,
  clock: Clock = systemClock,
): Promise<T> {
  const now = clock();
  const next = { ...record, updatedAt: now } as T;
  await store.putRaw(table, [next as unknown as SyncRecord]);
  await store.enqueue({ table, recordId: next.id, enqueuedUpdatedAt: now });
  return next;
}

/**
 * Soft-delete a record (write a tombstone) and queue it for sync. Returns the
 * tombstone, or `undefined` if the record was not present locally.
 */
export async function localDelete(
  store: LocalStore,
  table: TableName,
  id: string,
  clock: Clock = systemClock,
): Promise<SyncRecord | undefined> {
  const current = await store.get(table, id);
  if (!current) return undefined;
  const now = clock();
  const tombstone: SyncRecord = { ...current, deletedAt: now, updatedAt: now };
  await store.putRaw(table, [tombstone]);
  await store.enqueue({ table, recordId: id, enqueuedUpdatedAt: now });
  return tombstone;
}
