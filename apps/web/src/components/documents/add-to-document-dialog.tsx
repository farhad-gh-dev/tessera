'use client';

import { useMemo, useState } from 'react';
import { useSession } from '@/components/providers';
import { Button, Dialog, Input, Spinner } from '@/components/ui';
import { useDocuments, useDocumentsForSnippet } from '@/lib/hooks';
import {
  addSnippetToDocument,
  createDocument,
  removeSnippetFromDocument,
} from '@/lib/documents';

/**
 * Add (or remove) a snippet to one or more documents by reference (DOC-2/DOC-3,
 * the LIB-5 "add to document" action). A snippet can live in many documents at
 * once; toggling here updates each document's reference, never the snippet.
 */
export function AddToDocumentDialog({
  open,
  onClose,
  snippetId,
}: {
  open: boolean;
  onClose: () => void;
  snippetId: string;
}) {
  const { user, syncNow } = useSession();
  const documents = useDocuments();
  const inDocs = useDocumentsForSnippet(snippetId);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const inDocIds = useMemo(() => new Set((inDocs ?? []).map((d) => d.id)), [inDocs]);

  async function toggle(documentId: string, isIn: boolean) {
    if (!user || busy) return;
    setBusy(true);
    if (isIn) await removeSnippetFromDocument(documentId, snippetId);
    else await addSnippetToDocument(user.id, documentId, snippetId);
    void syncNow();
    setBusy(false);
  }

  async function createAndAdd() {
    if (!user || !newTitle.trim() || busy) return;
    setBusy(true);
    const doc = await createDocument(user.id, newTitle);
    await addSnippetToDocument(user.id, doc.id, snippetId);
    void syncNow();
    setNewTitle('');
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add to document">
      <div className="flex gap-2">
        <Input
          placeholder="New document title…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void createAndAdd();
          }}
          aria-label="New document title"
        />
        <Button onClick={() => void createAndAdd()} disabled={!newTitle.trim() || busy}>
          Create
        </Button>
      </div>

      <div className="mt-4 max-h-[50vh] overflow-y-auto">
        {documents === undefined ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : documents.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No documents yet — create one above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((doc) => {
              const isIn = inDocIds.has(doc.id);
              return (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => void toggle(doc.id, isIn)}
                    disabled={busy}
                    className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-60"
                  >
                    <span
                      className={
                        isIn
                          ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-indigo-600 bg-indigo-600 text-white'
                          : 'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300'
                      }
                      aria-hidden="true"
                    >
                      {isIn && (
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m3.5 8.5 3 3 6-7" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {doc.title || 'Untitled'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
