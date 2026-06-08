'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Snippet } from '@tessera/core';
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
