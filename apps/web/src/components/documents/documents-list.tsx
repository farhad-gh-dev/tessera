'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/providers';
import { Button, Card, Dialog, Input, Spinner, Textarea } from '@/components/ui';
import { useDocumentItemCounts, useDocuments } from '@/lib/hooks';
import { createDocument } from '@/lib/documents';
import { relativeTime } from '@/lib/snippets';

/**
 * The documents index (DOC-1): every study document the user has assembled, with
 * a "New document" action. Empty until the user curates one — documents are the
 * optional, hand-made layer over the auto-grouped library.
 */
export function DocumentsList() {
  const documents = useDocuments();
  const counts = useDocumentItemCounts();
  const [creating, setCreating] = useState(false);

  if (documents === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Documents</h1>
          <p className="text-xs text-slate-400">
            {documents.length} {documents.length === 1 ? 'document' : 'documents'}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New document</Button>
      </div>

      {documents.length === 0 ? (
        <DocumentsEmpty onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const count = counts?.get(doc.id) ?? 0;
            return (
              <Link key={doc.id} href={`/documents/${doc.id}`} className="block">
                <Card className="flex h-full flex-col p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40">
                  <p className="font-medium text-slate-900">{doc.title || 'Untitled'}</p>
                  {doc.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{doc.description}</p>
                  )}
                  <p className="mt-3 text-xs text-slate-400">
                    {count} {count === 1 ? 'item' : 'items'} · updated {relativeTime(doc.updatedAt)}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <NewDocumentDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function DocumentsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8m0-16H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2m0-16v16" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-slate-900">No documents yet</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
        A document pulls snippets from any number of websites into one study set — add your own
        headings and notes between them, reorder freely, and jump back to every source.
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
        Create one here, then add snippets from the library’s “Add to document” action.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        New document
      </Button>
    </Card>
  );
}

/** Create a document, then open its editor (DOC-1). */
export function NewDocumentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, syncNow } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!user) return;
    setSaving(true);
    const doc = await createDocument(user.id, title, description);
    void syncNow();
    onClose();
    setTitle('');
    setDescription('');
    setSaving(false);
    router.push(`/documents/${doc.id}`);
  }

  return (
    <Dialog open={open} onClose={onClose} title="New document">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="doc-title">
            Title
          </label>
          <Input
            id="doc-title"
            autoFocus
            placeholder="e.g. Cell Biology — Midterm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="doc-desc">
            Description <span className="text-slate-400">(optional)</span>
          </label>
          <Textarea
            id="doc-desc"
            rows={2}
            placeholder="What is this study set about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
