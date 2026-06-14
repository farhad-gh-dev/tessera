'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Snippet, Tag } from '@tessera/core';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui';
import { Favicon, SnippetImage } from '@/components/library/media';
import { RichText } from '@/components/library/rich-text';
import { AddToDocumentDialog } from '@/components/documents/add-to-document-dialog';
import { buildSourceUrl, relativeTime, typeLabel } from '@/lib/snippets';
import { useSnippetSelection } from '@/components/library/selection-context';

interface SnippetCardProps {
  snippet: Snippet;
  /** Attached tags (passed from the library so each card doesn't re-query). */
  tags?: Tag[];
  /** How many documents reference this snippet (DOC-8). */
  refCount?: number;
  /** Hide the source domain (e.g. inside a single-site drill-down). */
  showSource?: boolean;
}

/**
 * A snippet as a grid tile (CARD-1/2). Content leads; the source, date, tags,
 * "has note", and "in N documents" indicators recede below it; inline actions
 * (open source · add to document — CARD-3) sit above an overlay link that opens
 * the detail view, so the whole tile is clickable without nesting anchors.
 */
export function SnippetCard({ snippet, tags, refCount, showSource = true }: SnippetCardProps) {
  const isText = snippet.type === 'text';
  const tagList = tags ?? [];
  const sel = useSnippetSelection(snippet.id);
  return (
    <Card
      className={cn(
        'group relative flex h-full flex-col overflow-hidden transition-colors hover:border-indigo-300',
        sel?.selected && 'ring-2 ring-indigo-500',
      )}
    >
      <Link
        href={`/snippet/${snippet.id}`}
        aria-label="Open snippet"
        className="absolute inset-0"
      />
      {sel && (
        <div className="absolute right-2 top-2 z-10">
          <SelectCheckbox selected={sel.selected} active={sel.active} onToggle={sel.toggle} />
        </div>
      )}

      {isText ? (
        <div className="flex flex-1 gap-2.5 p-4">
          <span
            className="mt-0.5 w-1 shrink-0 rounded-full bg-indigo-400"
            style={snippet.color ? { backgroundColor: snippet.color } : undefined}
            aria-hidden="true"
          />
          <RichText
            snippet={snippet}
            className="line-clamp-6 text-sm leading-relaxed text-slate-700"
            emptyLabel="(no text)"
          />
        </div>
      ) : (
        <div className="relative aspect-video w-full bg-slate-50">
          <SnippetImage snippet={snippet} className="h-full w-full" />
          <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {typeLabel(snippet.type)}
          </span>
        </div>
      )}

      {tagList.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pt-2">
          <TagChips tags={tagList} />
        </div>
      )}

      <div className="mt-auto flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
        {showSource && (
          <>
            <Favicon
              src={snippet.faviconUrl}
              domain={snippet.domain}
              className="h-3.5 w-3.5 text-[8px]"
            />
            <span className="truncate">{snippet.domain.replace(/^www\./, '')}</span>
          </>
        )}
        <span className="shrink-0">
          {showSource ? '· ' : ''}
          {relativeTime(snippet.createdAt)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <MetaIndicators snippet={snippet} refCount={refCount} />
          <InlineActions
            snippet={snippet}
            className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
          />
        </div>
      </div>
    </Card>
  );
}

/**
 * A snippet as a dense list row (CARD-5) — the default "list" density (D5). Same
 * content + indicators + actions as the card, optimized for scanning many at once.
 */
export function SnippetRow({ snippet, tags, refCount }: SnippetCardProps) {
  const isText = snippet.type === 'text';
  const sel = useSnippetSelection(snippet.id);
  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50/70',
        sel?.selected && 'bg-indigo-50/60',
      )}
    >
      <Link
        href={`/snippet/${snippet.id}`}
        aria-label="Open snippet"
        className="absolute inset-0"
      />

      {sel && (
        <SelectCheckbox
          selected={sel.selected}
          active={sel.active}
          onToggle={sel.toggle}
          className="mt-0.5"
        />
      )}

      {isText ? (
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: snippet.color ?? '#a5b4fc' }}
          aria-hidden="true"
        />
      ) : (
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-slate-50">
          <SnippetImage snippet={snippet} className="h-full w-full" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {isText ? (
          <RichText
            snippet={snippet}
            className="line-clamp-2 text-sm text-slate-700"
            emptyLabel="(no text)"
          />
        ) : (
          <p className="text-sm text-slate-700">{typeLabel(snippet.type)} snippet</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Favicon
              src={snippet.faviconUrl}
              domain={snippet.domain}
              className="h-3.5 w-3.5 text-[8px]"
            />
            <span className="truncate">{snippet.domain.replace(/^www\./, '')}</span>
          </span>
          <span className="shrink-0">· {relativeTime(snippet.createdAt)}</span>
          <TagChips tags={tags ?? []} />
          <MetaIndicators snippet={snippet} refCount={refCount} />
        </div>
      </div>

      <InlineActions snippet={snippet} className="shrink-0" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared: indicators + inline actions                                        */
/* -------------------------------------------------------------------------- */

function TagChips({ tags, max = 3 }: { tags: Tag[]; max?: number }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const more = tags.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <span
          key={t.id}
          className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500"
        >
          #{t.name}
        </span>
      ))}
      {more > 0 && <span className="text-[11px] text-slate-400">+{more}</span>}
    </span>
  );
}

/** "Has note" + "in N documents" indicators, drawn from data already on the snippet. */
function MetaIndicators({ snippet, refCount }: { snippet: Snippet; refCount?: number }) {
  const hasNote = !!(snippet.note && snippet.note.trim() !== '');
  const refs = refCount ?? 0;
  if (!hasNote && refs === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-slate-400">
      {hasNote && (
        <span title="Has a note" aria-label="Has a note" className="inline-flex">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 4h9M3.5 7h9M3.5 10h5.5" />
          </svg>
        </span>
      )}
      {refs > 0 && (
        <span
          title={`In ${refs} document${refs === 1 ? '' : 's'}`}
          aria-label={`In ${refs} document${refs === 1 ? '' : 's'}`}
          className="inline-flex items-center gap-0.5 tabular-nums"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 2.5h4l3 3v8h-7zM8.5 2.5v3h3" />
          </svg>
          {refs}
        </span>
      )}
    </span>
  );
}

/**
 * Inline actions (CARD-3): open source (the `#:~:text=` deep-link) and add to a
 * document. Sits in a `z-10` layer above the card's overlay link so the buttons
 * win the click; the add dialog is only mounted while open so closed cards don't
 * each run its live queries.
 */
function InlineActions({ snippet, className }: { snippet: Snippet; className?: string }) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <>
      <div className={cn('relative z-10 flex items-center gap-0.5', className)}>
        <a
          href={buildSourceUrl(snippet)}
          target="_blank"
          rel="noreferrer"
          title="Open source page"
          aria-label="Open source page"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 3.5h3.5V7M12.5 3.5 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5"
            />
          </svg>
        </a>
        <button
          type="button"
          title="Add to document"
          aria-label="Add to document"
          onClick={(e) => {
            e.stopPropagation();
            setAddOpen(true);
          }}
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 3.5v9M3.5 8h9" />
          </svg>
        </button>
      </div>
      {addOpen && (
        <AddToDocumentDialog open onClose={() => setAddOpen(false)} snippetId={snippet.id} />
      )}
    </>
  );
}

/** A select checkbox shown on hover, or always while a selection is active (BULK-1). */
function SelectCheckbox({
  selected,
  active,
  onToggle,
  className,
}: {
  selected: boolean;
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={selected ? 'Deselect snippet' : 'Select snippet'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded border bg-white shadow-sm transition',
        selected
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-slate-300 hover:border-slate-400',
        !selected && !active && 'opacity-0 group-hover:opacity-100 focus:opacity-100',
        className,
      )}
    >
      {selected && (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="m3.5 8.5 3 3 6-7" />
        </svg>
      )}
    </button>
  );
}
