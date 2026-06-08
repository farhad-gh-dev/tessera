/**
 * IndexedDB-backed {@link LocalStore} using Dexie — the production local mirror
 * shared by the web app and the extension.
 *
 * The synced domain tables grow as milestones land; the v1 sync spike registers
 * `snippets` plus the engine's own bookkeeping tables: `_meta` (per-table pull
 * cursors) and `_outbox` (pending pushes, keyed by `[table+recordId]`).
 */
import { Dexie, type Table } from 'dexie';
import type { Snippet } from '@tessera/core';
import type {
  LocalStore,
  OutboxEntry,
  SyncRecord,
  TableName,
  Timestamp,
} from './types.js';

interface MetaRow {
  key: string;
  value: string;
}

export class TesseraDexie extends Dexie {
  snippets!: Table<Snippet, string>;
  _meta!: Table<MetaRow, string>;
  _outbox!: Table<OutboxEntry, [string, string]>;

  constructor(name = 'tessera') {
    super(name);
    this.version(1).stores({
      // Primary key `id`; secondary indexes power library queries + delta pulls.
      snippets: 'id, domain, url, updatedAt, deletedAt',
      _meta: 'key',
      _outbox: '[table+recordId]',
    });
  }

  /** Resolve a logical table name to its Dexie table. */
  domainTable(name: TableName): Table<SyncRecord, string> {
    return this.table(name) as Table<SyncRecord, string>;
  }
}

export class DexieLocalStore implements LocalStore {
  constructor(private readonly db: TesseraDexie) {}

  async get(table: TableName, id: string): Promise<SyncRecord | undefined> {
    return this.db.domainTable(table).get(id);
  }

  async getAll(table: TableName): Promise<SyncRecord[]> {
    return this.db.domainTable(table).toArray();
  }

  async putRaw(table: TableName, records: SyncRecord[]): Promise<void> {
    await this.db.domainTable(table).bulkPut(records);
  }

  async getCursor(table: TableName): Promise<Timestamp | null> {
    const row = await this.db._meta.get(cursorKey(table));
    return row?.value ?? null;
  }

  async setCursor(table: TableName, cursor: Timestamp): Promise<void> {
    await this.db._meta.put({ key: cursorKey(table), value: cursor });
  }

  async enqueue(entry: OutboxEntry): Promise<void> {
    await this.db._outbox.put(entry);
  }

  async listOutbox(): Promise<OutboxEntry[]> {
    return this.db._outbox.toArray();
  }

  async removeOutbox(
    keys: ReadonlyArray<Pick<OutboxEntry, 'table' | 'recordId'>>,
  ): Promise<void> {
    await this.db._outbox.bulkDelete(
      keys.map((k) => [k.table, k.recordId] as [string, string]),
    );
  }
}

function cursorKey(table: TableName): string {
  return `cursor:${table}`;
}
