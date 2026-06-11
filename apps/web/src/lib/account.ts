import type { SupabaseClient } from '@supabase/supabase-js';
import { inlineImagePaths } from '@tessera/core';
import type { Document, DocumentItem, Snippet, SnippetTag, Tag } from '@tessera/core';
import { clearLocalData, getDb } from '@/lib/db';

/**
 * Account-level data export + deletion (PRD §8.3 — "make data export/delete
 * easy"; "account deletion purges all user data"). The privacy-first posture:
 * a user can take everything with them, and erase everything, in one click.
 */

/** A portable snapshot of everything a user has saved (the synced tables). */
export interface AccountExport {
  app: 'tessera';
  version: 1;
  exportedAt: string;
  userId: string;
  counts: Record<string, number>;
  data: {
    snippets: Snippet[];
    tags: Tag[];
    snippet_tags: SnippetTag[];
    documents: Document[];
    document_items: DocumentItem[];
  };
}

interface Owned {
  userId: string;
  deletedAt?: string | null;
}

/** Gather the user's live rows from the local mirror into one portable object. */
export async function buildAccountExport(userId: string): Promise<AccountExport> {
  const db = getDb();
  const live = <T extends Owned>(rows: T[]): T[] =>
    rows.filter((r) => r.deletedAt == null && r.userId === userId);

  const [snippets, tags, snippet_tags, documents, document_items] = await Promise.all([
    db.snippets.toArray() as Promise<Snippet[]>,
    db.tags.toArray() as Promise<Tag[]>,
    db.snippet_tags.toArray() as Promise<SnippetTag[]>,
    db.documents.toArray() as Promise<Document[]>,
    db.document_items.toArray() as Promise<DocumentItem[]>,
  ]);

  const data = {
    snippets: live(snippets),
    tags: live(tags),
    snippet_tags: live(snippet_tags),
    documents: live(documents),
    document_items: live(document_items),
  };
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return {
    app: 'tessera',
    version: 1,
    exportedAt: new Date().toISOString(),
    userId,
    counts,
    data,
  };
}

/** Build the export and download it as a timestamped JSON file. Returns the payload. */
export async function downloadAccountExport(userId: string): Promise<AccountExport> {
  const payload = await buildAccountExport(userId);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tessera-export-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return payload;
}

/**
 * Permanently delete the account. We first remove the user's uploaded images via
 * the Storage API (Supabase blocks direct SQL deletes from `storage.objects`, so
 * this can't live in the RPC), then call `delete_account` — which deletes the
 * auth user and cascades a purge across every table — and finally wipe the local
 * mirror and end the session. There is no undo.
 */
export async function deleteAccount(supabase: SupabaseClient): Promise<void> {
  await removeOwnedImages(supabase);
  const { error } = await supabase.rpc('delete_account');
  if (error) throw new Error(error.message);
  await clearLocalData();
  // The account is already gone server-side; a failed sign-out (its session was
  // just deleted) must not surface as a deletion error.
  await supabase.auth.signOut().catch(() => {});
}

/**
 * Best-effort removal of the user's uploaded images/screenshots from the private
 * bucket. Paths come straight from the local mirror's snippets; external `http…`
 * references (saved when signed out) aren't ours to delete. Non-fatal — account
 * deletion proceeds even if this fails.
 */
async function removeOwnedImages(supabase: SupabaseClient): Promise<void> {
  try {
    const snippets = (await getDb().snippets.toArray()) as Snippet[];
    const single = snippets
      .map((s) => s.imagePath)
      .filter((p): p is string => !!p && !p.startsWith('http'));
    // Inline images of text passages (IMG-8) — paths are recorded in each html.
    const inline = snippets.flatMap((s) => inlineImagePaths(s.html));
    const paths = [...single, ...inline];
    if (paths.length > 0) await supabase.storage.from('snippet-images').remove(paths);
  } catch {
    // Ignore — the data purge below is what matters.
  }
}
