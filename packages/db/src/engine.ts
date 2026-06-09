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

/** A queued outbox entry paired with its current local record, ready to push. */
interface OutboxPair {
  entry: OutboxEntry;
  record: SyncRecord;
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
    // Attempt every table in both phases even if some fail, so one table's
    // problem (e.g. a row the server rejects) can't starve the others or the
    // pull. Errors are still surfaced once everything has been attempted.
    const push = await this.pushAll();
    const pull = await this.pullAll();
    const errors = [...push.errors, ...pull.errors];
    if (errors.length > 0) throw combineErrors(errors);
    return { pushed: push.count, pulled: pull.count };
  }

  /** Drain the outbox to the remote. Returns the number of records pushed. */
  async pushOnce(): Promise<number> {
    const { count, errors } = await this.pushAll();
    if (errors.length > 0) throw combineErrors(errors);
    return count;
  }

  private async pushAll(): Promise<{ count: number; errors: unknown[] }> {
    const errors: unknown[] = [];
    const outbox = await this.local.listOutbox();
    if (outbox.length === 0) return { count: 0, errors };

    const byTable = new Map<TableName, OutboxEntry[]>();
    for (const entry of outbox) {
      const list = byTable.get(entry.table);
      if (list) list.push(entry);
      else byTable.set(entry.table, [entry]);
    }

    // Push in declared-table order so a parent row lands before a child that
    // references it (e.g. `documents` before `document_items`) — each table's
    // push is its own committed RPC, so cross-table foreign keys are satisfied.
    // Any table not in the declared list is pushed afterwards.
    const ordered: TableName[] = [
      ...this.tables.filter((t) => byTable.has(t)),
      ...[...byTable.keys()].filter((t) => !this.tables.includes(t)),
    ];

    let pushed = 0;
    for (const table of ordered) {
      const entries = byTable.get(table)!;

      // Resolve the current record for each queued entry. An entry whose record
      // has vanished locally has nothing to push, so drop it from the outbox.
      const pairs: OutboxPair[] = [];
      const missing: OutboxEntry[] = [];
      for (const entry of entries) {
        const rec = await this.local.get(table, entry.recordId);
        if (rec) pairs.push({ entry, record: rec });
        else missing.push(entry);
      }
      if (missing.length > 0) await this.local.removeOutbox(missing);
      if (pairs.length === 0) continue;

      try {
        // Fast path: one batched push for the whole table.
        await this.remote.push(
          table,
          pairs.map((p) => p.record),
        );
        pushed += await this.settle(table, pairs);
      } catch (batchErr) {
        if (pairs.length === 1) {
          // Nothing to isolate — this single row genuinely can't sync. Leave it
          // queued to retry next run and surface the error.
          errors.push(batchErr);
          continue;
        }
        // Row-level isolation: a batch can fail because of just one poison row
        // (e.g. a constraint the server rejects). Retry each row on its own so
        // the healthy rows still land and only the offending row(s) stay queued.
        for (const pair of pairs) {
          try {
            await this.remote.push(table, [pair.record]);
            pushed += await this.settle(table, [pair]);
          } catch (rowErr) {
            errors.push(rowErr);
          }
        }
      }
    }

    return { count: pushed, errors };
  }

  /**
   * Drop outbox entries for records that pushed cleanly, keeping any re-edited
   * mid-flight (their `updatedAt` no longer matches what was enqueued, so they
   * stay queued and push next run). Returns how many records were pushed.
   */
  private async settle(table: TableName, pairs: readonly OutboxPair[]): Promise<number> {
    const settled: OutboxEntry[] = [];
    for (const { entry } of pairs) {
      const rec = await this.local.get(table, entry.recordId);
      if (!rec || rec.updatedAt === entry.enqueuedUpdatedAt) settled.push(entry);
    }
    if (settled.length > 0) await this.local.removeOutbox(settled);
    return pairs.length;
  }

  /** Count of local changes still awaiting push — for surfacing pending/stuck state in the UI. */
  async pendingCount(): Promise<number> {
    return (await this.local.listOutbox()).length;
  }

  /** Pull remote deltas for every registered table and reconcile them locally. */
  async pullOnce(): Promise<number> {
    const { count, errors } = await this.pullAll();
    if (errors.length > 0) throw combineErrors(errors);
    return count;
  }

  private async pullAll(): Promise<{ count: number; errors: unknown[] }> {
    const errors: unknown[] = [];
    let pulled = 0;
    for (const table of this.tables) {
      try {
        pulled += await this.pullTable(table);
      } catch (err) {
        errors.push(err);
      }
    }
    return { count: pulled, errors };
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

/** Fold one-or-more per-table errors into a single throwable, preserving messages. */
function combineErrors(errors: unknown[]): Error {
  if (errors.length === 1 && errors[0] instanceof Error) return errors[0];
  const message = errors
    .map((e) => (e instanceof Error ? e.message : String(e)))
    .join('; ');
  return new Error(message);
}
