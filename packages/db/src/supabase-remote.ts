/**
 * Supabase-backed {@link RemoteAdapter}.
 *
 * Push goes through the `sync_push` Postgres function — a conditional upsert that
 * applies last-write-wins server-side (`excluded.updated_at >= row.updated_at`),
 * so a stale device can never clobber newer data. Pull is a cursor-filtered
 * select ordered by `updated_at`.
 *
 * Domain records are camelCase; Postgres columns are snake_case, so rows are
 * converted at the boundary — **top-level keys only**, leaving JSONB payloads
 * such as `anchor` and `prefs` in their original camelCase shape.
 *
 * Requires the `sync_push` function and the client-authored-timestamp trigger
 * from `supabase/migrations/` (applied during M0 provisioning).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PullPage,
  RemoteAdapter,
  SyncRecord,
  TableName,
  Timestamp,
} from './types.js';

export class SupabaseRemoteAdapter implements RemoteAdapter {
  constructor(private readonly client: SupabaseClient) {}

  async push(table: TableName, records: SyncRecord[]): Promise<SyncRecord[]> {
    const { data, error } = await this.client.rpc('sync_push', {
      _table: table,
      _rows: records.map(toSnakeRow),
    });
    if (error) throw new Error(`sync_push(${table}) failed: ${error.message}`);
    return asRows(data).map(toCamelRow);
  }

  async pull(table: TableName, cursor: Timestamp | null, limit = 500): Promise<PullPage> {
    let query = this.client
      .from(table)
      .select('*')
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (cursor) query = query.gt('updated_at', cursor);

    const { data, error } = await query;
    if (error) throw new Error(`pull(${table}) failed: ${error.message}`);

    const records = asRows(data).map(toCamelRow);
    let next = cursor;
    let nextTime = cursor ? Date.parse(cursor) : Number.NEGATIVE_INFINITY;
    for (const r of records) {
      const t = Date.parse(r.updatedAt);
      if (t > nextTime) {
        nextTime = t;
        next = r.updatedAt;
      }
    }
    return { records, cursor: next };
  }
}

function asRows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

const SNAKE_BOUNDARY = /_([a-z0-9])/g;
const CAMEL_BOUNDARY = /[A-Z]/g;

function toCamelKey(key: string): string {
  return key.replace(SNAKE_BOUNDARY, (_m, c: string) => c.toUpperCase());
}

function toSnakeKey(key: string): string {
  return key.replace(CAMEL_BOUNDARY, (m) => `_${m.toLowerCase()}`);
}

/** Convert top-level keys snake→camel (JSONB values left untouched). */
function toCamelRow(row: Record<string, unknown>): SyncRecord {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamelKey(k)] = v;
  return out as SyncRecord;
}

/** Convert top-level keys camel→snake (JSONB values left untouched). */
function toSnakeRow(record: SyncRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) out[toSnakeKey(k)] = v;
  return out;
}
