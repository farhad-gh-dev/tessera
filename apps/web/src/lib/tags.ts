'use client';

import { newId, type SnippetTag, type Tag } from '@tessera/core';
import { localDelete, localUpsert } from '@tessera/db';
import { getDb, getStore } from '@/lib/db';

/**
 * Tag operations (NOTE-2). Tags are per-user and de-duplicated by name
 * (case-insensitively); `snippet_tags` is the join that powers the library tag
 * filter (LIB-4). Each write is local-first; the caller follows with `syncNow()`.
 */

function nowIso(): string {
  return new Date().toISOString();
}

/** Find a user's live tag by name (case-insensitive), or create it. */
async function ensureTag(userId: string, name: string): Promise<Tag> {
  const clean = name.trim();
  const lower = clean.toLowerCase();
  const existing = ((await getDb().tags.toArray()) as Tag[]).find(
    (t) => t.deletedAt == null && t.userId === userId && t.name.toLowerCase() === lower,
  );
  if (existing) return existing;
  const now = nowIso();
  const tag: Tag = {
    id: newId(),
    userId,
    name: clean,
    createdAt: now,
    updatedAt: now,
  };
  return localUpsert(getStore(), 'tags', tag);
}

/**
 * Attach a tag (by name) to a snippet, creating the tag if new. Returns `null`
 * if the name is blank or the snippet already carries that tag.
 */
export async function addTagToSnippet(
  userId: string,
  snippetId: string,
  name: string,
): Promise<Tag | null> {
  if (!name.trim()) return null;
  const tag = await ensureTag(userId, name);
  const joins = (await getDb()
    .snippet_tags.where('snippetId')
    .equals(snippetId)
    .toArray()) as SnippetTag[];
  if (joins.some((j) => j.deletedAt == null && j.tagId === tag.id)) return tag;
  const now = nowIso();
  const join: SnippetTag = {
    id: newId(),
    userId,
    snippetId,
    tagId: tag.id,
    createdAt: now,
    updatedAt: now,
  };
  await localUpsert(getStore(), 'snippet_tags', join);
  return tag;
}

/** Detach a tag from a snippet by tombstoning the join row. */
export async function removeTagFromSnippet(snippetId: string, tagId: string): Promise<void> {
  const joins = (await getDb()
    .snippet_tags.where('snippetId')
    .equals(snippetId)
    .toArray()) as SnippetTag[];
  for (const j of joins) {
    if (j.deletedAt == null && j.tagId === tagId) {
      await localDelete(getStore(), 'snippet_tags', j.id);
    }
  }
}
