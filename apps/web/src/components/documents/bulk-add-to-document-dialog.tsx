'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { Button, Dialog, Input, Spinner } from '@/components/ui';
import { useDocuments } from '@/lib/hooks';
import { addSnippetToDocument, createDocument } from '@/lib/documents';

/**
 * Add many selected snippets to one document at once (BULK-1, on top of DOC-2/3).
 * `addSnippetToDocument` is idempotent (a snippet already in the doc is skipped),
 * so re-adding a mixed selection never creates duplicate references.
 */
export function BulkAddToDocumentDialog({
  snippetIds,
  open,
  onClose,
}: {
  snippetIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const { user, syncNow } = useSession();
  const documents = useDocuments();
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(null);

  const count = snippetIds.length;

  async function addAllTo(documentId: string) {
    if (!user || busy) return;
    setBusy(true);
    await Promise.all(snippetIds.map((id) => addSnippetToDocument(user.id, documentId, id)));
    void syncNow();
    setBusy(false);
    setAddedTo(documentId);
  }

  async function createAndAdd() {
    if (!user || !newTitle.trim() || busy) return;
    setBusy(true);
    const doc = await createDocument(user.id, newTitle);
    await Promise.all(snippetIds.map((id) => addSnippetToDocument(user.id, doc.id, id)));
    void syncNow();
    setNewTitle('');
    setBusy(false);
    setAddedTo(doc.id);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Add ${count} snippet${count === 1 ? '' : 's'} to a document`}
    >
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
            {documents.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => void addAllTo(doc.id)}
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {doc.title || 'Untitled'}
                  </span>
                  {addedTo === doc.id ? (
                    <span className="shrink-0 text-xs font-medium text-emerald-600">Added ✓</span>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-indigo-600">Add</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
