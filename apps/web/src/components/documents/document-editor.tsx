'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DocumentItem, Snippet } from '@tessera/core';
import { useSession } from '@/components/providers';
import { Button, Spinner } from '@/components/ui';
import { DocumentItemRow } from '@/components/documents/document-item-row';
import { SnippetPickerDialog } from '@/components/documents/snippet-picker-dialog';
import { useDocument, useDocumentItems, useSnippets } from '@/lib/hooks';
import {
  addBlock,
  deleteDocument,
  removeItem,
  reorderItem,
  updateDocument,
  updateItemContent,
} from '@/lib/documents';

/**
 * The document editor (DOC-1, DOC-4..7, NOTE-4) — the core organizing surface.
 * An ordered list of referenced snippets interleaved with the user's own
 * headings and notes, reorderable by drag or the up/down controls. Every edit is
 * local-first and synced.
 */
export function DocumentEditor({ id }: { id: string }) {
  const doc = useDocument(id);
  const items = useDocumentItems(id);
  const snippets = useSnippets();
  const { user, syncNow } = useSession();
  const router = useRouter();

  const [picking, setPicking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Drag-and-drop state (native HTML5 DnD; up/down buttons cover keyboard/touch).
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const snippetsById = useMemo(() => {
    const map = new Map<string, Snippet>();
    for (const s of snippets ?? []) map.set(s.id, s);
    return map;
  }, [snippets]);

  const existingSnippetIds = useMemo(() => {
    const set = new Set<string>();
    for (const i of items ?? []) if (i.kind === 'snippet_ref' && i.snippetId) set.add(i.snippetId);
    return set;
  }, [items]);

  if (doc === undefined || items === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-slate-500">This document doesn’t exist or was deleted.</p>
        <Link href="/documents" className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline">
          Back to documents
        </Link>
      </div>
    );
  }

  const sync = () => void syncNow();

  async function handleMove(from: number, to: number) {
    await reorderItem(items!, from, to);
    sync();
  }
  async function handleDrop(targetIndex: number) {
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from == null || from === targetIndex) return;
    await reorderItem(items!, from, targetIndex);
    sync();
  }
  async function handleRemove(item: DocumentItem) {
    await removeItem(item.id);
    sync();
  }
  async function handleEditContent(item: DocumentItem, content: string) {
    await updateItemContent(item, content);
    sync();
  }
  async function handleAddBlock(kind: 'heading' | 'text_block') {
    if (!user) return;
    await addBlock(user.id, id, kind);
    sync();
  }
  async function handleDeleteDocument() {
    await deleteDocument(id);
    sync();
    router.push('/documents');
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/documents"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <span aria-hidden="true">←</span> Documents
      </Link>

      <DocumentHeader doc={doc} onSave={(patch) => void updateDocument(doc, patch).then(sync)} />

      <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-slate-100 py-3">
        <Button size="sm" variant="primary" onClick={() => setPicking(true)}>
          + Add snippets
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void handleAddBlock('heading')}>
          + Heading
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void handleAddBlock('text_block')}>
          + Note
        </Button>
        <span className="ml-auto text-xs text-slate-400">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-500">This document is empty.</p>
          <p className="mt-1 text-sm text-slate-400">
            Add snippets from your library, or start with a heading or note.
          </p>
          <Button className="mt-4" onClick={() => setPicking(true)}>
            Add snippets
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item, index) => (
            <DocumentItemRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              snippet={item.snippetId ? snippetsById.get(item.snippetId) : undefined}
              isDragging={dragIndex === index}
              isDragOver={overIndex === index}
              onMove={(from, to) => void handleMove(from, to)}
              onRemove={(it) => void handleRemove(it)}
              onEditContent={(it, content) => void handleEditContent(it, content)}
              onDragStart={setDragIndex}
              onDragEnterRow={setOverIndex}
              onDrop={(target) => void handleDrop(target)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
            />
          ))}
        </div>
      )}

      <div className="mt-10 border-t border-slate-100 pt-4">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Delete this document? Snippets are kept.</span>
            <Button size="sm" variant="danger" onClick={() => void handleDeleteDocument()}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-sm text-slate-400 hover:text-red-600"
          >
            Delete document
          </button>
        )}
      </div>

      <SnippetPickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        documentId={id}
        existingSnippetIds={existingSnippetIds}
      />
    </div>
  );
}

/** Inline-editable title + description (DOC-1). Saves on blur when changed. */
function DocumentHeader({
  doc,
  onSave,
}: {
  doc: { title: string; description?: string };
  onSave: (patch: { title?: string; description?: string }) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? '');
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(doc.title);
  }, [doc.title]);
  useEffect(() => {
    if (document.activeElement !== descRef.current) setDescription(doc.description ?? '');
  }, [doc.description]);
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  return (
    <div>
      <input
        ref={titleRef}
        value={title}
        placeholder="Untitled"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const next = title.trim() || 'Untitled';
          if (next !== doc.title) onSave({ title: next });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleRef.current?.blur();
        }}
        aria-label="Document title"
        className="w-full rounded bg-transparent text-2xl font-bold tracking-tight text-slate-900 placeholder:text-slate-300 focus:bg-slate-50 focus:outline-none"
      />
      <textarea
        ref={descRef}
        rows={1}
        value={description}
        placeholder="Add a description…"
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => {
          const next = description.trim();
          if (next !== (doc.description ?? '')) onSave({ description: next });
        }}
        aria-label="Document description"
        className="mt-1 w-full resize-none rounded bg-transparent text-sm text-slate-500 placeholder:text-slate-300 focus:bg-slate-50 focus:outline-none"
      />
    </div>
  );
}
