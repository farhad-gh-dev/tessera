'use client';

import {
  keyAfter,
  keyBetween,
  newId,
  type Document,
  type DocumentItem,
  type DocumentItemKind,
} from '@tessera/core';
import { localDelete, localUpsert } from '@tessera/db';
import { getDb, getStore } from '@/lib/db';

/**
 * Document + item write operations for the reference model (PRD §5, DOC-1..6).
 * Each is a thin local-first mutation — stamp + enqueue via `@tessera/db` — that
 * the caller follows with a `syncNow()`. Ordering uses fractional indices
 * (`@tessera/core` `keyBetween`) so a reorder rewrites only the row that moved.
 */

function nowIso(): string {
  return new Date().toISOString();
}

/** Live (non-deleted) items of a document, in position order. */
async function liveItems(documentId: string): Promise<DocumentItem[]> {
  const rows = (await getDb()
    .document_items.where('documentId')
    .equals(documentId)
    .toArray()) as DocumentItem[];
  return rows
    .filter((i) => i.deletedAt == null)
    .sort((a, b) => a.position.localeCompare(b.position));
}

/* -------------------------------------------------------------------------- */
/* Documents (DOC-1)                                                          */
/* -------------------------------------------------------------------------- */

export async function createDocument(
  userId: string,
  title = 'Untitled',
  description?: string,
): Promise<Document> {
  const now = nowIso();
  const doc: Document = {
    id: newId(),
    userId,
    title: title.trim() || 'Untitled',
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  return localUpsert(getStore(), 'documents', doc);
}

/** Patch a document's title/description (DOC-1). */
export async function updateDocument(
  doc: Document,
  patch: Partial<Pick<Document, 'title' | 'description'>>,
): Promise<void> {
  await localUpsert(getStore(), 'documents', { ...doc, ...patch });
}

/**
 * Soft-delete a document and all of its items (DOC-1). Items are tombstoned too
 * so they stop counting toward any snippet's "where used" on every device.
 */
export async function deleteDocument(id: string): Promise<void> {
  for (const item of await liveItems(id)) {
    await localDelete(getStore(), 'document_items', item.id);
  }
  await localDelete(getStore(), 'documents', id);
}

/* -------------------------------------------------------------------------- */
/* Items: snippet references + authored blocks (DOC-2..6, NOTE-4)             */
/* -------------------------------------------------------------------------- */

/**
 * Append a snippet to a document by reference (DOC-2/DOC-3). Returns `null` if
 * the snippet is already in this document — a snippet can live in many documents
 * but only once per document.
 */
export async function addSnippetToDocument(
  userId: string,
  documentId: string,
  snippetId: string,
): Promise<DocumentItem | null> {
  const items = await liveItems(documentId);
  if (items.some((i) => i.kind === 'snippet_ref' && i.snippetId === snippetId)) {
    return null;
  }
  const last = items[items.length - 1];
  const now = nowIso();
  const item: DocumentItem = {
    id: newId(),
    userId,
    documentId,
    position: keyAfter(last?.position ?? null),
    kind: 'snippet_ref',
    snippetId,
    createdAt: now,
    updatedAt: now,
  };
  return localUpsert(getStore(), 'document_items', item);
}

/** Append an authored heading or free-text block (DOC-5, NOTE-4). */
export async function addBlock(
  userId: string,
  documentId: string,
  kind: Exclude<DocumentItemKind, 'snippet_ref'>,
  content = '',
): Promise<DocumentItem> {
  const items = await liveItems(documentId);
  const last = items[items.length - 1];
  const now = nowIso();
  const item: DocumentItem = {
    id: newId(),
    userId,
    documentId,
    position: keyAfter(last?.position ?? null),
    kind,
    content,
    createdAt: now,
    updatedAt: now,
  };
  return localUpsert(getStore(), 'document_items', item);
}

/** Edit a heading/text block's content (NOTE-4). */
export async function updateItemContent(item: DocumentItem, content: string): Promise<void> {
  await localUpsert(getStore(), 'document_items', { ...item, content });
}

/** Remove an item from a document — never deletes the underlying snippet (DOC-6). */
export async function removeItem(id: string): Promise<void> {
  await localDelete(getStore(), 'document_items', id);
}

/** Remove a snippet's reference from a document by (documentId, snippetId) (DOC-6). */
export async function removeSnippetFromDocument(
  documentId: string,
  snippetId: string,
): Promise<void> {
  for (const item of await liveItems(documentId)) {
    if (item.kind === 'snippet_ref' && item.snippetId === snippetId) {
      await localDelete(getStore(), 'document_items', item.id);
    }
  }
}

/**
 * Move the item at `from` so it ends up at index `to` in the ordered list
 * (DOC-4). Only the moved row is rewritten — its new fractional position is the
 * midpoint of its destination neighbours.
 */
export async function reorderItem(
  items: DocumentItem[],
  from: number,
  to: number,
): Promise<void> {
  if (from === to || from < 0 || from >= items.length) return;
  const moved = items[from]!;
  const rest = items.filter((_, i) => i !== from);
  const clamped = Math.max(0, Math.min(to, rest.length));
  const left = clamped > 0 ? rest[clamped - 1] : null;
  const right = clamped < rest.length ? rest[clamped] : null;
  const position = keyBetween(left?.position ?? null, right?.position ?? null);
  if (position === moved.position) return;
  await localUpsert(getStore(), 'document_items', { ...moved, position });
}
