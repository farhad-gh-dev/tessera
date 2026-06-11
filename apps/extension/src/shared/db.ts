import { TesseraDexie } from '@tessera/db';

/**
 * Singleton Dexie handle for an extension *page* (popup / side panel).
 *
 * These pages run on the extension origin, so this opens the very same
 * IndexedDB the background service worker writes to — which is what lets the
 * side panel live-read captures via `useLiveQuery` without standing up a second
 * sync engine (DATA-1/DATA-2, §9). The background stays the only writer and
 * sync owner; pages only read here (and mutate via {@link ./messages}).
 *
 * (A content script could *not* do this — it sees the page's IndexedDB, not the
 * extension's. That's why the store has always lived in the background.)
 */
let db: TesseraDexie | null = null;

export function getDb(): TesseraDexie {
  return (db ??= new TesseraDexie());
}
