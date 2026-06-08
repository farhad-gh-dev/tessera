/**
 * Sync-engine contracts shared by the in-memory fakes, the Dexie local store,
 * and the Supabase remote adapter.
 *
 * Design (see README.md): every synced record is identified by a
 * client-generated UUID and carries `updatedAt` / `deletedAt`. Conflicts resolve
 * **last-write-wins** by `updatedAt`; deletes are **tombstones** (`deletedAt`
 * set), never hard removals, so they propagate to every device. Timestamps are
 * **client-authored** — the device that makes an edit stamps `updatedAt`, and
 * the server preserves it rather than re-stamping, so the policy is genuinely
 * "last edit wins" instead of "last device to sync wins".
 */
import type { SyncFields } from '@tessera/core';

/** A synced record: the shared sync fields plus arbitrary domain columns. */
export type SyncRecord = SyncFields & Record<string, unknown>;

/** Logical name of a synced table (matches the Postgres + Dexie table name). */
export type TableName = string;

/** ISO-8601 timestamp string, e.g. `"2026-06-07T15:04:05.000Z"`. */
export type Timestamp = string;

/** Returns the current time as an ISO-8601 string. Injectable for tests. */
export type Clock = () => Timestamp;

/** Default clock backed by the system wall clock. */
export const systemClock: Clock = () => new Date().toISOString();

/**
 * One pending local change awaiting push. The outbox holds at most one entry per
 * (table, recordId); re-editing a record before it syncs just refreshes the
 * captured timestamp.
 */
export interface OutboxEntry {
  table: TableName;
  recordId: string;
  /** `updatedAt` captured when enqueued; lets push detect re-edits mid-flight. */
  enqueuedUpdatedAt: Timestamp;
}

/** A page of remote changes pulled since a cursor. */
export interface PullPage {
  records: SyncRecord[];
  /** Advanced cursor to persist (max `updatedAt` seen), or the input cursor. */
  cursor: Timestamp | null;
}

/**
 * The remote backend. Implemented by {@link MemoryRemoteAdapter} (tests) and
 * `SupabaseRemoteAdapter` (production). Both apply last-write-wins server-side so
 * a stale push can never clobber a newer row.
 */
export interface RemoteAdapter {
  /**
   * Upsert `records` into `table` with last-write-wins by `updatedAt`. Returns
   * the authoritative server rows for the records that were written.
   */
  push(table: TableName, records: SyncRecord[]): Promise<SyncRecord[]>;
  /**
   * Pull rows whose `updatedAt` is strictly greater than `cursor` (tombstones
   * included), oldest first. `cursor === null` pulls everything.
   */
  pull(table: TableName, cursor: Timestamp | null, limit?: number): Promise<PullPage>;
}

/**
 * The local persistence layer. Implemented by {@link MemoryLocalStore} (tests)
 * and `DexieLocalStore` (production). `putRaw` writes without touching the
 * outbox and is used when applying remote changes.
 */
export interface LocalStore {
  get(table: TableName, id: string): Promise<SyncRecord | undefined>;
  getAll(table: TableName): Promise<SyncRecord[]>;
  /** Write records verbatim (no outbox enqueue). */
  putRaw(table: TableName, records: SyncRecord[]): Promise<void>;
  getCursor(table: TableName): Promise<Timestamp | null>;
  setCursor(table: TableName, cursor: Timestamp): Promise<void>;
  /** Upsert an outbox entry, keyed by (table, recordId). */
  enqueue(entry: OutboxEntry): Promise<void>;
  listOutbox(): Promise<OutboxEntry[]>;
  removeOutbox(
    keys: ReadonlyArray<Pick<OutboxEntry, 'table' | 'recordId'>>,
  ): Promise<void>;
}
