'use client';

import type { Snippet } from '@tessera/core';
import {
  DexieLocalStore,
  SupabaseRemoteAdapter,
  SyncEngine,
  TesseraDexie,
  localDelete,
  localUpsert,
} from '@tessera/db';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The web app's local-first store + sync engine, wired from the shared
 * `@tessera/db` package — the very same pieces the extension uses. The web app
 * gets its own IndexedDB (a different origin than the extension), seeded by the
 * first cloud pull after sign-in.
 *
 * Singletons are created lazily so importing this module never opens IndexedDB
 * during server rendering (Dexie touches `indexedDB` only on first use).
 */

const IMAGE_BUCKET = 'snippet-images';

let dexie: TesseraDexie | null = null;
let store: DexieLocalStore | null = null;

export function getDb(): TesseraDexie {
  dexie ??= new TesseraDexie();
  return dexie;
}

export function getStore(): DexieLocalStore {
  store ??= new DexieLocalStore(getDb());
  return store;
}

/**
 * Wipe every local table — including the sync outbox — so nothing lingers or
 * replays. Used after account deletion (so a deleted account leaves no trace in
 * the browser, and a different user signing in next starts clean).
 */
export async function clearLocalData(): Promise<void> {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
}

/**
 * Build a sync engine over the given authenticated client. Tables are listed
 * parent-first so a push lands referenced rows before their referrers (e.g.
 * `documents` before `document_items`), satisfying the cross-table foreign keys.
 */
export function createEngine(supabase: SupabaseClient): SyncEngine {
  return new SyncEngine({
    local: getStore(),
    remote: new SupabaseRemoteAdapter(supabase),
    tables: ['snippets', 'tags', 'documents', 'snippet_tags', 'document_items'],
  });
}

/**
 * Patch a snippet locally and queue it for sync (NOTE-1/2/3 — note, color, tags
 * live in joins, and light text edits). Editing the captured `text` sets the
 * `edited` flag so the platform can show the passage was hand-corrected while the
 * source link stays intact. The caller triggers a sync afterwards.
 */
export async function updateSnippet(
  snippet: Snippet,
  patch: Partial<Pick<Snippet, 'text' | 'note' | 'color'>>,
): Promise<void> {
  const next: Snippet = { ...snippet, ...patch };
  if (patch.text !== undefined && patch.text !== snippet.text) next.edited = true;
  await localUpsert(getStore(), 'snippets', next);
}

/**
 * Soft-delete a snippet locally (a tombstone that syncs via last-write-wins) and
 * best-effort remove its uploaded image so the Storage bucket doesn't accumulate
 * orphans. External image references (`http…`, stored when the capturing device
 * was signed out) are left alone — they aren't ours to delete. Mirrors the
 * extension's delete path. The caller triggers a sync afterwards.
 */
export async function deleteSnippet(
  supabase: SupabaseClient | null,
  id: string,
): Promise<void> {
  const existing = (await getDb().snippets.get(id)) as Snippet | undefined;
  const tombstone = await localDelete(getStore(), 'snippets', id);
  if (!tombstone) return;
  if (
    supabase &&
    existing &&
    (existing.type === 'image' || existing.type === 'screenshot') &&
    existing.imagePath &&
    !existing.imagePath.startsWith('http')
  ) {
    void supabase.storage.from(IMAGE_BUCKET).remove([existing.imagePath]);
  }
}
