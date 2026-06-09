'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Document, DocumentItem, Snippet, SnippetTag, Tag } from '@tessera/core';
import { getDb } from '@/lib/db';
import { useSession } from '@/components/providers';

/**
 * Live list of the signed-in user's non-deleted snippets, straight from the local
 * IndexedDB mirror. `useLiveQuery` re-runs whenever the store changes — including
 * when the sync engine writes pulled rows — so the library updates itself without
 * any manual refresh. Returns `undefined` while the first query is in flight.
 */
export function useSnippets(): Snippet[] | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    if (!userId) return [];
    const rows = (await getDb().snippets.toArray()) as Snippet[];
    return rows.filter((s) => s.deletedAt == null && s.userId === userId);
  }, [userId]);
}

/**
 * Live single snippet. `undefined` = loading; `null` = not found / deleted;
 * otherwise the snippet.
 */
export function useSnippet(id: string | undefined): Snippet | null | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    if (!id) return null;
    const s = (await getDb().snippets.get(id)) as Snippet | undefined;
    if (!s || s.deletedAt != null) return null;
    if (userId && s.userId !== userId) return null;
    return s;
  }, [id, userId]);
}

/* -------------------------------------------------------------------------- */
/* Documents + tags (M3)                                                      */
/* -------------------------------------------------------------------------- */

/** Live list of the user's documents, most-recently-updated first (DOC-1). */
export function useDocuments(): Document[] | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    if (!userId) return [];
    const rows = (await getDb().documents.toArray()) as Document[];
    return rows
      .filter((d) => d.deletedAt == null && d.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [userId]);
}

/** Live single document. `undefined` = loading; `null` = missing/deleted. */
export function useDocument(id: string | undefined): Document | null | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    if (!id) return null;
    const d = (await getDb().documents.get(id)) as Document | undefined;
    if (!d || d.deletedAt != null) return null;
    if (userId && d.userId !== userId) return null;
    return d;
  }, [id, userId]);
}

/** Live, position-ordered items of a document (snippet refs + authored blocks). */
export function useDocumentItems(documentId: string | undefined): DocumentItem[] | undefined {
  return useLiveQuery(async () => {
    if (!documentId) return [];
    const rows = (await getDb()
      .document_items.where('documentId')
      .equals(documentId)
      .toArray()) as DocumentItem[];
    return rows
      .filter((i) => i.deletedAt == null)
      .sort((a, b) => a.position.localeCompare(b.position));
  }, [documentId]);
}

/** Map of documentId → live item count, for the documents list. */
export function useDocumentItemCounts(): Map<string, number> | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    const counts = new Map<string, number>();
    if (!userId) return counts;
    const items = (await getDb().document_items.toArray()) as DocumentItem[];
    for (const i of items) {
      if (i.deletedAt == null && i.userId === userId) {
        counts.set(i.documentId, (counts.get(i.documentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [userId]);
}

/** Documents that reference a given snippet — the "where used" list (DOC-8). */
export function useDocumentsForSnippet(snippetId: string | undefined): Document[] | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    if (!snippetId || !userId) return [];
    const items = (await getDb()
      .document_items.where('snippetId')
      .equals(snippetId)
      .toArray()) as DocumentItem[];
    const docIds = [
      ...new Set(
        items
          .filter((i) => i.deletedAt == null && i.kind === 'snippet_ref')
          .map((i) => i.documentId),
      ),
    ];
    const docs = (await Promise.all(docIds.map((id) => getDb().documents.get(id)))) as (
      | Document
      | undefined
    )[];
    return docs
      .filter((d): d is Document => !!d && d.deletedAt == null && d.userId === userId)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [snippetId, userId]);
}

/** Map of snippetId → how many documents reference it (most-referenced sort, LIB-7). */
export function useSnippetRefCounts(): Map<string, number> | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    const counts = new Map<string, number>();
    if (!userId) return counts;
    const items = (await getDb().document_items.toArray()) as DocumentItem[];
    for (const i of items) {
      if (i.deletedAt == null && i.kind === 'snippet_ref' && i.snippetId && i.userId === userId) {
        counts.set(i.snippetId, (counts.get(i.snippetId) ?? 0) + 1);
      }
    }
    return counts;
  }, [userId]);
}

/** All of the user's tags (for the tag filter and pickers). */
export function useTags(): Tag[] | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    if (!userId) return [];
    const rows = (await getDb().tags.toArray()) as Tag[];
    return rows
      .filter((t) => t.deletedAt == null && t.userId === userId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [userId]);
}

/** Live tags attached to one snippet (NOTE-2 editor + detail display). */
export function useSnippetTags(snippetId: string | undefined): Tag[] | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    if (!snippetId) return [];
    const joins = (await getDb()
      .snippet_tags.where('snippetId')
      .equals(snippetId)
      .toArray()) as SnippetTag[];
    const live = joins.filter((j) => j.deletedAt == null);
    const tags = (await Promise.all(live.map((j) => getDb().tags.get(j.tagId)))) as (
      | Tag
      | undefined
    )[];
    return tags
      .filter((t): t is Tag => !!t && t.deletedAt == null && (!userId || t.userId === userId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [snippetId, userId]);
}

/** Map of snippetId → its tags, for tag-filtering the whole library (LIB-4). */
export function useSnippetTagMap(): Map<string, Tag[]> | undefined {
  const { user } = useSession();
  const userId = user?.id;
  return useLiveQuery(async () => {
    const map = new Map<string, Tag[]>();
    if (!userId) return map;
    const [joins, tags] = await Promise.all([
      getDb().snippet_tags.toArray() as Promise<SnippetTag[]>,
      getDb().tags.toArray() as Promise<Tag[]>,
    ]);
    const tagById = new Map(
      tags.filter((t) => t.deletedAt == null && t.userId === userId).map((t) => [t.id, t]),
    );
    for (const j of joins) {
      if (j.deletedAt != null || j.userId !== userId) continue;
      const tag = tagById.get(j.tagId);
      if (!tag) continue;
      const arr = map.get(j.snippetId);
      if (arr) arr.push(tag);
      else map.set(j.snippetId, [tag]);
    }
    return map;
  }, [userId]);
}

// Short-lived signed-URL cache so re-renders and revisits don't re-sign.
const signedUrlCache = new Map<string, { url: string; expires: number }>();
const SIGN_TTL_SECONDS = 3600;

/**
 * Resolve a snippet's image to a displayable URL. External references
 * (`http…`, saved when the capturing device was signed out) are used as-is;
 * uploaded objects in the private `snippet-images` bucket get a short-lived
 * signed URL. Returns `null` until resolved (or if it can't be resolved).
 */
export function useSignedImageUrl(imagePath: string | undefined): string | null {
  const { supabase } = useSession();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) {
      setUrl(null);
      return;
    }
    if (imagePath.startsWith('http')) {
      setUrl(imagePath);
      return;
    }
    const cached = signedUrlCache.get(imagePath);
    if (cached && cached.expires > Date.now()) {
      setUrl(cached.url);
      return;
    }
    if (!supabase) {
      setUrl(null);
      return;
    }
    let active = true;
    void supabase.storage
      .from('snippet-images')
      .createSignedUrl(imagePath, SIGN_TTL_SECONDS)
      .then(({ data }) => {
        if (!active || !data?.signedUrl) return;
        signedUrlCache.set(imagePath, {
          url: data.signedUrl,
          // Refresh a minute before the token actually expires.
          expires: Date.now() + (SIGN_TTL_SECONDS - 60) * 1000,
        });
        setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [imagePath, supabase]);

  return url;
}
