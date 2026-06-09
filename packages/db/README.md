# @tessera/db

Tessera's local-first store and sync engine. The same code runs in the web app
and the browser extension: every read and write hits a local IndexedDB mirror
first (instant, offline-capable), and a background engine reconciles changes with
Supabase.

## Sync model

- **Identity:** client-generated UUIDs (`@tessera/core`'s `newId()`), so a record
  has its final id the moment it is created — even offline.
- **Conflict resolution:** last-write-wins per record by `updatedAt`.
- **Deletes:** tombstones (`deletedAt` set), never hard deletes, so a deletion
  propagates to every device. A delete wins a same-timestamp tie.
- **Client-authored timestamps:** the device that makes an edit stamps
  `updatedAt`. The server preserves it (the `set_updated_at` trigger only bumps
  when the writer didn't set one) and `sync_push` applies the guard
  `excluded.updated_at >= row.updated_at`. The result is "last _edit_ wins"
  rather than "last device to _sync_ wins" — the subtlety a naive always-bump
  trigger gets wrong.

## Pieces

| File                 | Role                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `types.ts`           | `LocalStore` / `RemoteAdapter` contracts, `OutboxEntry`, `Clock`. |
| `reconcile.ts`       | Pure LWW + tombstone merge (`pickWinner`, `reconcilePull`).        |
| `mutators.ts`        | Local-first writes (`localUpsert`, `localDelete`): stamp + queue.  |
| `engine.ts`          | `SyncEngine`: drain outbox → push, cursor delta-pull → reconcile.  |
| `memory.ts`          | In-memory `LocalStore` / `RemoteAdapter` for tests and demos.      |
| `dexie-store.ts`     | Production IndexedDB `LocalStore` (Dexie).                         |
| `supabase-remote.ts` | Production `RemoteAdapter` (Supabase PostgREST + `sync_push`).     |

## How it flows

1. The app calls `localUpsert(store, 'snippets', record)` → writes locally with a
   fresh `updatedAt` and enqueues an outbox entry. The UI renders from the local
   store; the network is never on the critical path.
2. `engine.syncOnce()` **pushes**: drains the outbox, upserts via `sync_push`
   (server-side LWW), and clears only entries not re-edited mid-flight.
3. …then **pulls**: for each table, fetches rows with `updated_at > cursor`
   (tombstones included), merges them with `reconcilePull`, and advances the
   per-table cursor.

It is idempotent throughout — interrupt it anywhere and the next run finishes the
job, with no data loss.

Failures are isolated so they never starve healthy data: tables push
**parent-first** (cross-table foreign keys resolve — `documents` before
`document_items`), each table's push and pull is attempted independently, and a
**batch the server rejects for one bad row is retried row-by-row** so only the
offending record stays queued while its siblings push. `engine.pendingCount()`
reports how many local changes are still waiting (offline, or a server-rejected
row) so the UI can surface an unsynced/stuck state.

## Backend requirements

`supabase/migrations/` carries the two server-side pieces this engine relies on
(both applied during M0 provisioning):

- the **`set_updated_at` trigger** that honors a client-supplied `updated_at`;
- **`sync_push(_table, _rows)`** — a generic conditional upsert that enforces
  last-write-wins underneath row-level security.

## Spike status (M0)

The conflict logic and engine are validated end-to-end **in memory**:
`engine.test.ts` runs two `MemoryLocalStore`s through one `MemoryRemoteAdapter`
and asserts create / offline-queue / delete propagation, last-write-wins
convergence, and idempotency. The Dexie and Supabase adapters implement the same
contracts; they get their end-to-end validation against a real Supabase project
during provisioning (two browser profiles, one cloud).
