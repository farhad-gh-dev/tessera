'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Snippet } from '@tessera/core';
import { Favicon, SnippetImage } from '@/components/library/media';
import { RichText } from '@/components/library/rich-text';
import { AddToDocumentDialog } from '@/components/documents/add-to-document-dialog';
import { buildSourceUrl, relativeTime } from '@/lib/snippets';

const HIDE_KEY = 'tessera:resurface-hidden';

/**
 * The "Revisit" strip (DISC-1/2): a dismissible row of snippets the library
 * brings back so it isn't a dead archive — the daily study hook. Entirely
 * optional: "Hide" collapses it for the session, each card's × drops one (it's
 * already marked shown so it decays). This is the seam the M5 active-recall /
 * spaced-repetition surface (DISC-3) can grow from. Rendered only on a clean home.
 */
export function ResurfaceStrip({
  picks,
  onDismissItem,
}: {
  picks: Snippet[];
  onDismissItem: (id: string) => void;
}) {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(HIDE_KEY) === '1';
  });

  if (hidden || picks.length === 0) return null;

  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revisit</h2>
        <button
          type="button"
          onClick={hide}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Hide
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {picks.map((s) => (
          <ResurfaceCard key={s.id} snippet={s} onDismiss={() => onDismissItem(s.id)} />
        ))}
      </div>
    </section>
  );
}

function ResurfaceCard({ snippet, onDismiss }: { snippet: Snippet; onDismiss: () => void }) {
  const [addOpen, setAddOpen] = useState(false);
  const isText = snippet.type === 'text';
  return (
    <div className="group relative flex w-60 shrink-0 flex-col rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-indigo-300">
      <Link href={`/snippet/${snippet.id}`} aria-label="Open snippet" className="absolute inset-0" />

      {isText ? (
        <RichText
          snippet={snippet}
          className="line-clamp-3 text-sm leading-relaxed text-slate-700"
          emptyLabel="(no text)"
        />
      ) : (
        <div className="relative aspect-video w-full overflow-hidden rounded bg-slate-50">
          <SnippetImage snippet={snippet} className="h-full w-full" />
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
        <Favicon src={snippet.faviconUrl} domain={snippet.domain} className="h-3.5 w-3.5 text-[8px]" />
        <span className="truncate">{snippet.domain.replace(/^www\./, '')}</span>
        <span className="shrink-0">· {relativeTime(snippet.createdAt)}</span>
      </div>

      <div className="relative z-10 mt-2 flex items-center gap-1">
        <a
          href={buildSourceUrl(snippet)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open source page"
          aria-label="Open source page"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon path="M9 3.5h3.5V7M12.5 3.5 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" />
        </a>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAddOpen(true);
          }}
          title="Add to document"
          aria-label="Add to document"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon path="M8 3.5v9M3.5 8h9" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          title="Dismiss from revisit"
          aria-label="Dismiss from revisit"
          className="ml-auto rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon path="M4 4l8 8M12 4l-8 8" />
        </button>
      </div>

      {addOpen && (
        <AddToDocumentDialog open onClose={() => setAddOpen(false)} snippetId={snippet.id} />
      )}
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}
