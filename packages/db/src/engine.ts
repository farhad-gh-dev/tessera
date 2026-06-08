/**
 * The sync engine: drains the outbox to the remote (push), then pulls remote
 * deltas since a per-table cursor and reconciles them into the local store
 * (pull). Every operation is idempotent, so it is safe to call repeatedly and
 * safe to interrupt — an aborted sync just leaves work in the outbox for the
 * next run.
 */
import type {
  Clock,
  LocalStore,
  OutboxEntry,
  RemoteAdapter,
  SyncRecord,
  TableName,
} from './types.js';
import { systemClock } from './types.js';
import { reconcilePull } from './reconcile.js';

export interface SyncEngineOptions {
  local: LocalStore;
  remote: RemoteAdapter;
  /** Tables to sync, in order. The v1 sync spike registers only `['snippets']`. */
  tables: readonly TableName[];
  /** Max rows per pull page. */
  pullLimit?: number;
  clock?: Clock;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

export class SyncEngine {
  private readonly local: LocalStore;
  private readonly remote: RemoteAdapter;
  private readonly tables: readonly TableName[];
  private readonly pullLimit: number;
  private readonly clock: Clock;
  /** Coalesces overlapping syncs so the outbox is never drained twice at once. */
  private running: Promise<SyncResult> | null = null;

  constructor(opts: SyncEngineOptions) {
    this.local = opts.local;
    this.remote = opts.remote;
    this.tables = opts.tables;
    this.pullLimit = opts.pullLimit ?? 500;
    this.clock = opts.clock ?? systemClock;
  }

  /** Push then pull every registered table. Concurrent calls coalesce. */
  async syncOnce(): Promise<SyncResult> {
    if (this.running) return this.running;
    this.running = this.run();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async run(): Promise<SyncResult> {
    const pushed = await this.pushOnce();
    const pulled = await this.pullOnce();
    return { pushed, pulled };
  }

  /** Drain the outbox to the remote. Returns the number of records pushed. */
  async pushOnce(): Promise<number> {
    const outbox = await this.local.listOutbox();
    if (outbox.length === 0) return 0;

    const byTable = new Map<TableName, OutboxEntry[]>();
    for (const entry of outbox) {
      const list = byTable.get(entry.table);
      if (list) list.push(entry);
      else byTable.set(entry.table, [entry]);
    }

    let pushed = 0;
    for (const [table, entries] of byTable) {
      const records: SyncRecord[] = [];
      for (const entry of entries) {
        const rec = await this.local.get(table, entry.recordId);
        if (rec) records.push(rec);
      }
      if (records.length === 0) {
        await this.local.removeOutbox(entries);
        continue;
      }

      await this.remote.push(table, records);
      pushed += records.length;

      // Clear only entries not re-edited while the push was in flight. A record
      // edited mid-push has a newer `updatedAt` and a refreshed outbox entry, so
      // it stays queued and pushes on the next run.
      const settled: OutboxEntry[] = [];
      for (const entry of entries) {
        const rec = await this.local.get(table, entry.recordId);
        if (!rec || rec.updatedAt === entry.enqueuedUpdatedAt) {
          settled.push(entry);
        }
      }
      await this.local.removeOutbox(settled);
    }

    return pushed;
  }

  /** Pull remote deltas for every registered table and reconcile them locally. */
  async pullOnce(): Promise<number> {
    let pulled = 0;
    for (const table of this.tables) {
      pulled += await this.pullTable(table);
    }
    return pulled;
  }

  private async pullTable(table: TableName): Promise<number> {
    let applied = 0;
    // Page until the remote returns a short page or the cursor stops advancing.
    for (;;) {
      const cursor = await this.local.getCursor(table);
      const page = await this.remote.pull(table, cursor, this.pullLimit);
      if (page.records.length === 0) break;

      const localMap = new Map<string, SyncRecord>();
      for (const row of await this.local.getAll(table)) {
        localMap.set(row.id, row);
      }

      const { toWrite, cursor: nextCursor } = reconcilePull(
        localMap,
        page.records,
        cursor,
      );
      if (toWrite.length > 0) {
        await this.local.putRaw(table, toWrite);
        applied += toWrite.length;
      }
      if (nextCursor && nextCursor !== cursor) {
        await this.local.setCursor(table, nextCursor);
      }

      if (page.records.length < this.pullLimit) break;
      // Guard against a non-advancing cursor (e.g. a clump of equal timestamps).
      if (!nextCursor || nextCursor === cursor) break;
    }
    return applied;
  }
}
