'use client';

import type { Snippet } from '@tessera/core';
import {
  DexieLocalStore,
  SupabaseRemoteAdapter,
  SyncEngine,
  TesseraDexie,
  localDelete,
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

/** Build a sync engine over the given authenticated client. M2 syncs snippets. */
export function createEngine(supabase: SupabaseClient): SyncEngine {
  return new SyncEngine({
    local: getStore(),
    remote: new SupabaseRemoteAdapter(supabase),
    tables: ['snippets'],
  });
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
