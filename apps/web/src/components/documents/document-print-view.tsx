'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { DocumentItem, Snippet } from '@tessera/core';
import { Button, Spinner } from '@/components/ui';
import { Favicon, SnippetImage } from '@/components/library/media';
import { useDocument, useDocumentItems, useSnippets } from '@/lib/hooks';
import { buildSourceUrl, formatDate } from '@/lib/snippets';

/**
 * The print / "Save as PDF" view for a document (EXP-2). A deliberately
 * chrome-free, single-column layout (no app shell) tuned for paper: the user
 * picks "Save as PDF" in the browser print dialog. Every snippet shows its
 * source link, domain, and capture date so the print carries full provenance
 * (EXP-3). Built on the browser's own renderer — no PDF dependency — so images
 * and the clean layout come for free.
 */
export function DocumentPrintView({ id }: { id: string }) {
  const doc = useDocument(id);
  const items = useDocumentItems(id);
  const snippets = useSnippets();

  const snippetsById = useMemo(() => {
    const map = new Map<string, Snippet>();
    for (const s of snippets ?? []) map.set(s.id, s);
    return map;
  }, [snippets]);

  if (doc === undefined || items === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-slate-500">
          This document doesn’t exist or was deleted.
        </p>
        <Link
          href="/documents"
          className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          Back to documents
        </Link>
      </div>
    );
  }

  const exportedOn = formatDate(new Date().toISOString());

  return (
    <div className="min-h-screen bg-white">
      {/* Toolbar — on screen only; never printed. */}
      <div className="print:hidden sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <Link
            href={`/documents/${id}`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <span aria-hidden="true">←</span> Back to document
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-400 sm:inline">
              Choose “Save as PDF” as the destination
            </span>
            <Button size="sm" onClick={() => window.print()}>
              Save as PDF / Print
            </Button>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-6 py-10 text-slate-800 print:max-w-none print:px-0 print:py-0">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {doc.title || 'Untitled'}
          </h1>
          {doc.description && (
            <p className="mt-2 text-base leading-relaxed text-slate-600">
              {doc.description}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-400">
            {items.length} {items.length === 1 ? 'item' : 'items'} · exported {exportedOn}{' '}
            · Tessera
          </p>
        </header>

        {items.length === 0 ? (
          <p className="text-sm text-slate-400">This document is empty.</p>
        ) : (
          <div className="space-y-6">
            {items.map((item) => (
              <PrintItem
                key={item.id}
                item={item}
                snippet={item.snippetId ? snippetsById.get(item.snippetId) : undefined}
              />
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

function PrintItem({ item, snippet }: { item: DocumentItem; snippet?: Snippet }) {
  if (item.kind === 'heading') {
    const content = (item.content ?? '').trim();
    if (!content) return null;
    return (
      <h2 className="break-after-avoid pt-2 text-xl font-semibold text-slate-900">
        {content}
      </h2>
    );
  }

  if (item.kind === 'text_block') {
    const content = (item.content ?? '').trim();
    if (!content) return null;
    return (
      <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{content}</p>
    );
  }

  // snippet_ref
  if (!snippet) {
    return (
      <p className="text-sm italic text-slate-400">
        This snippet is no longer available.
      </p>
    );
  }
  return <PrintSnippet snippet={snippet} />;
}

/** A referenced snippet rendered for paper, with full provenance (EXP-3). */
function PrintSnippet({ snippet }: { snippet: Snippet }) {
  const isText = snippet.type === 'text';
  return (
    <figure className="break-inside-avoid">
      {isText ? (
        <blockquote
          className="border-l-[3px] pl-4 text-[15px] leading-relaxed text-slate-800"
          style={{ borderColor: snippet.color || '#818cf8' }}
        >
          <p className="whitespace-pre-wrap">
            {snippet.text || (
              <span className="italic text-slate-400">(no text captured)</span>
            )}
          </p>
        </blockquote>
      ) : (
        <div className="overflow-hidden rounded-md border border-slate-200">
          <SnippetImage
            snippet={snippet}
            className="max-h-[60vh] w-full print:max-h-none"
          />
        </div>
      )}

      {snippet.note && (
        <p className="mt-2 text-sm text-amber-800">
          <span className="font-medium">Note:</span> {snippet.note}
        </p>
      )}

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
        <Favicon
          src={snippet.faviconUrl}
          domain={snippet.domain}
          className="h-3.5 w-3.5 text-[8px]"
        />
        <a
          href={buildSourceUrl(snippet)}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-indigo-700 hover:underline"
        >
          {snippet.pageTitle || snippet.domain}
        </a>
        <span aria-hidden="true">·</span>
        <span className="break-all text-slate-400">{snippet.url}</span>
        <span aria-hidden="true">·</span>
        <span className="text-slate-400">saved {formatDate(snippet.createdAt)}</span>
      </figcaption>
    </figure>
  );
}
