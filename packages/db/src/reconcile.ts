/**
 * Pure last-write-wins + tombstone merge logic. No I/O, so it is exhaustively
 * unit-testable and shared by every adapter.
 */
import type { SyncFields } from '@tessera/core';
import type { SyncRecord, Timestamp } from './types.js';

/** True when a record is a tombstone (soft-deleted). */
export function isDeleted(record: Pick<SyncFields, 'deletedAt'>): boolean {
  return record.deletedAt != null;
}

/**
 * Pick the winning version of a record under last-write-wins. The later
 * `updatedAt` wins; on an exact tie a tombstone wins (so a concurrent
 * delete-vs-edit converges to the delete on every device), otherwise `b` wins
 * deterministically.
 */
export function pickWinner<T extends SyncFields>(a: T, b: T): T {
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  if (ta > tb) return a;
  if (tb > ta) return b;
  if (isDeleted(a) && !isDeleted(b)) return a;
  if (isDeleted(b) && !isDeleted(a)) return b;
  return b;
}

/**
 * Merge a page of incoming (remote) records over the current local versions.
 * Returns the records that should be written locally (remote won or is new) and
 * the advanced cursor (the greatest `updatedAt` across the page).
 */
export function reconcilePull(
  local: ReadonlyMap<string, SyncRecord>,
  incoming: readonly SyncRecord[],
  currentCursor: Timestamp | null,
): { toWrite: SyncRecord[]; cursor: Timestamp | null } {
  const toWrite: SyncRecord[] = [];
  let cursor = currentCursor;
  let cursorTime = currentCursor ? Date.parse(currentCursor) : Number.NEGATIVE_INFINITY;

  for (const remote of incoming) {
    const mine = local.get(remote.id);
    if (!mine || pickWinner(mine, remote) === remote) {
      toWrite.push(remote);
    }
    const t = Date.parse(remote.updatedAt);
    if (t > cursorTime) {
      cursorTime = t;
      cursor = remote.updatedAt;
    }
  }

  return { toWrite, cursor };
}
