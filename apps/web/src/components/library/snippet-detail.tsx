'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HIGHLIGHT_COLORS, type Snippet, type Tag } from '@tessera/core';
import { useSession } from '@/components/providers';
import { Badge, Button, Card, Input, Spinner, Textarea } from '@/components/ui';
import { Favicon, SnippetImage } from '@/components/library/media';
import { RichText } from '@/components/library/rich-text';
import { AddToDocumentDialog } from '@/components/documents/add-to-document-dialog';
import { useDocumentsForSnippet, useSnippet, useSnippetTags } from '@/lib/hooks';
import { deleteSnippet, updateSnippet } from '@/lib/db';
import { addTagToSnippet, removeTagFromSnippet } from '@/lib/tags';
import { buildSourceUrl, formatDate, typeLabel } from '@/lib/snippets';

/** Full snippet view (LIB-5) with deep link (LIB-6), editing (NOTE-1..3) and documents. */
export function SnippetDetail({ id }: { id: string }) {
  const snippet = useSnippet(id);
  const { supabase, syncNow } = useSession();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingToDoc, setAddingToDoc] = useState(false);

  if (snippet === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (snippet === null) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-slate-500">This snippet doesn’t exist or was deleted.</p>
        <Link href="/" className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline">
          Back to library
        </Link>
      </div>
    );
  }

  const label = snippet.domain.replace(/^www\./, '');
  const sync = () => void syncNow();
  // Return to wherever the user came from (the flat library, a search result, or a
  // site drill-down) rather than always forcing the site view; fall back to the
  // library when there's no in-app history (e.g. a deep-linked snippet).
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/');
  };

  async function handleDelete() {
    setDeleting(true);
    await deleteSnippet(supabase, id);
    sync();
    goBack();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <span aria-hidden="true">←</span> Back
      </button>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Favicon src={snippet.faviconUrl} domain={snippet.domain} className="h-4 w-4 text-[9px]" />
          <span className="truncate text-sm text-slate-600" title={snippet.pageTitle}>
            {snippet.pageTitle || label}
          </span>
        </div>

        <div className="p-5">
          {snippet.type === 'text' ? (
            <TextBody snippet={snippet} onSync={sync} />
          ) : (
            <SnippetImage snippet={snippet} className="max-h-[70vh] w-full rounded-md border border-slate-200" />
          )}

          <NoteEditor snippet={snippet} onSync={sync} />
          <TagEditor snippet={snippet} onSync={sync} />

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <Badge>{typeLabel(snippet.type)}</Badge>
            {snippet.edited && <Badge className="bg-amber-100 text-amber-700">edited</Badge>}
            <ColorPicker snippet={snippet} onSync={sync} />
            <span>Saved {formatDate(snippet.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <a href={buildSourceUrl(snippet)} target="_blank" rel="noreferrer noopener">
            <Button size="sm" variant="secondary">
              Open source ↗
            </Button>
          </a>
          <Button size="sm" variant="secondary" onClick={() => setAddingToDoc(true)}>
            Add to document
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-xs text-slate-500">Delete this snippet?</span>
                <Button size="sm" variant="danger" disabled={deleting} onClick={() => void handleDelete()}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
                <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      <WhereUsed snippetId={id} />

      <AddToDocumentDialog
        open={addingToDoc}
        onClose={() => setAddingToDoc(false)}
        snippetId={id}
      />
    </div>
  );
}

/** Captured text with light in-place editing (NOTE-3); sets the "edited" flag. */
function TextBody({ snippet, onSync }: { snippet: Snippet; onSync: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(snippet.text ?? '');

  async function save() {
    // Clear the captured structural html so the hand-edited plain text becomes
    // the source of truth (re-display falls back to `text`); sets `edited`.
    await updateSnippet(snippet, { text: value, html: '' });
    onSync();
    setEditing(false);
  }

  if (editing) {
    return (
      <div>
        <Textarea
          autoFocus
          rows={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Edit captured text"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={() => void save()}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(snippet.text ?? '');
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <span className="text-xs text-slate-400">Fixes capture artifacts; the source link is kept.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <blockquote
        className="border-l-2 pl-4 text-[15px] leading-relaxed text-slate-800"
        style={{ borderColor: snippet.color || '#a5b4fc' }}
      >
        <RichText snippet={snippet} emptyLabel="(no text captured)" />
      </blockquote>
      <button
        type="button"
        onClick={() => {
          setValue(snippet.text ?? '');
          setEditing(true);
        }}
        className="mt-2 text-xs font-medium text-indigo-600 opacity-0 transition-opacity hover:underline focus:opacity-100 group-hover:opacity-100"
      >
        Edit text
      </button>
    </div>
  );
}

/** Per-snippet note that travels with the snippet everywhere (NOTE-1). */
function NoteEditor({ snippet, onSync }: { snippet: Snippet; onSync: () => void }) {
  const [value, setValue] = useState(snippet.note ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(snippet.note ?? '');
  }, [snippet.note]);

  async function save() {
    if ((snippet.note ?? '') === value) return;
    await updateSnippet(snippet, { note: value.trim() || undefined });
    onSync();
  }

  return (
    <div className="mt-4">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        Note
      </label>
      <Textarea
        ref={ref}
        rows={2}
        value={value}
        placeholder="Add a personal note… it travels with this snippet everywhere."
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        className="bg-amber-50/40"
      />
    </div>
  );
}

/** Tag chips + add input (NOTE-2). Powers the library tag filter (LIB-4). */
function TagEditor({ snippet, onSync }: { snippet: Snippet; onSync: () => void }) {
  const { user } = useSession();
  const tags = useSnippetTags(snippet.id);
  const [value, setValue] = useState('');

  async function add(name: string) {
    if (!user || !name.trim()) return;
    setValue('');
    await addTagToSnippet(user.id, snippet.id, name);
    onSync();
  }
  async function remove(tag: Tag) {
    await removeTagFromSnippet(snippet.id, tag.id);
    onSync();
  }

  return (
    <div className="mt-4">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        Tags
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {(tags ?? []).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-slate-600"
          >
            {tag.name}
            <button
              type="button"
              aria-label={`Remove tag ${tag.name}`}
              onClick={() => void remove(tag)}
              className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              ×
            </button>
          </span>
        ))}
        <Input
          value={value}
          placeholder={tags && tags.length ? 'Add tag…' : 'Add a tag…'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              void add(value);
            }
          }}
          onBlur={() => void add(value)}
          aria-label="Add tag"
          className="h-7 w-32 px-2 py-0 text-xs"
        />
      </div>
    </div>
  );
}

/** Recolor a snippet (NOTE-2). */
function ColorPicker({ snippet, onSync }: { snippet: Snippet; onSync: () => void }) {
  async function set(color: string | undefined) {
    if (snippet.color === color) return;
    await updateSnippet(snippet, { color });
    onSync();
  }
  return (
    <span className="inline-flex items-center gap-1">
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c.token}
          type="button"
          aria-label={`Set color ${c.label}`}
          aria-pressed={snippet.color === c.hex}
          onClick={() => void set(c.hex)}
          className={
            snippet.color === c.hex
              ? 'h-4 w-4 rounded-full border border-slate-900 ring-2 ring-slate-300'
              : 'h-4 w-4 rounded-full border border-slate-200'
          }
          style={{ backgroundColor: c.hex }}
        />
      ))}
      {snippet.color && (
        <button
          type="button"
          onClick={() => void set(undefined)}
          className="ml-0.5 text-[11px] text-slate-400 hover:text-slate-600 hover:underline"
        >
          clear
        </button>
      )}
    </span>
  );
}

/** "Where is this used" — the documents that reference this snippet (DOC-8). */
function WhereUsed({ snippetId }: { snippetId: string }) {
  const docs = useDocumentsForSnippet(snippetId);
  if (!docs || docs.length === 0) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        In {docs.length} {docs.length === 1 ? 'document' : 'documents'}
      </h2>
      <div className="flex flex-wrap gap-2">
        {docs.map((doc) => (
          <Link
            key={doc.id}
            href={`/documents/${doc.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="h-3.5 w-3.5 rounded-sm bg-indigo-500" aria-hidden="true" />
            {doc.title || 'Untitled'}
          </Link>
        ))}
      </div>
    </div>
  );
}
