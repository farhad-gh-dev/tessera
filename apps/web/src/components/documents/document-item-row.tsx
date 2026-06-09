'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { DocumentItem, Snippet } from '@tessera/core';
import { cn } from '@/lib/cn';
import { Favicon, SnippetImage } from '@/components/library/media';
import { buildSourceUrl } from '@/lib/snippets';

export interface DocumentItemRowProps {
  item: DocumentItem;
  index: number;
  total: number;
  /** Resolved snippet for a `snippet_ref` item (absent if deleted/not synced). */
  snippet?: Snippet;
  isDragging: boolean;
  isDragOver: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (item: DocumentItem) => void;
  onEditContent: (item: DocumentItem, content: string) => void;
  onDragStart: (index: number) => void;
  onDragEnterRow: (index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
}

/**
 * One row in the document editor: a referenced snippet (DOC-7) or an authored
 * heading / text block (DOC-5, NOTE-4). Carries the reorder affordances —
 * a drag handle plus up/down buttons for keyboard and touch (DOC-4).
 */
export function DocumentItemRow(props: DocumentItemRowProps) {
  const { item, index, total, snippet, isDragging, isDragOver } = props;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        props.onDragEnterRow(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop(index);
      }}
      className={cn(
        'group relative flex gap-2 rounded-lg border bg-white p-2 transition-colors',
        isDragging ? 'opacity-40' : 'border-slate-200',
        isDragOver && !isDragging ? 'border-indigo-400 ring-2 ring-indigo-100' : '',
      )}
    >
      {/* Drag handle — only the handle is draggable so inline text stays selectable. */}
      <button
        type="button"
        aria-label="Drag to reorder"
        draggable
        onDragStart={() => props.onDragStart(index)}
        onDragEnd={props.onDragEnd}
        className="mt-1 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        {item.kind === 'snippet_ref' ? (
          <SnippetRef snippet={snippet} />
        ) : (
          <BlockEditor item={item} onEditContent={props.onEditContent} />
        )}
      </div>

      {/* Reorder + remove controls. */}
      <div className="flex shrink-0 flex-col items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton
          label="Move up"
          disabled={index === 0}
          onClick={() => props.onMove(index, index - 1)}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 14 6-6 6 6" />
        </IconButton>
        <IconButton
          label="Move down"
          disabled={index === total - 1}
          onClick={() => props.onMove(index, index + 1)}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 10 6 6 6-6" />
        </IconButton>
        <IconButton label="Remove from document" onClick={() => props.onRemove(item)} danger>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-1 0v12H10V7" />
        </IconButton>
      </div>
    </div>
  );
}

/** A referenced snippet, with a visible link back to its source (DOC-7). */
function SnippetRef({ snippet }: { snippet?: Snippet }) {
  if (!snippet) {
    return (
      <p className="px-2 py-3 text-sm italic text-slate-400">
        This snippet is no longer available.
      </p>
    );
  }
  const isText = snippet.type === 'text';
  const label = snippet.domain.replace(/^www\./, '');
  return (
    <div className="flex gap-3 p-1">
      {isText ? (
        <span
          className="mt-0.5 w-1 shrink-0 rounded-full bg-indigo-400"
          style={snippet.color ? { backgroundColor: snippet.color } : undefined}
          aria-hidden="true"
        />
      ) : (
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-50">
          <SnippetImage snippet={snippet} className="h-full w-full" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {isText && (
          <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {snippet.text || <span className="italic text-slate-400">(no text)</span>}
          </p>
        )}
        {snippet.note && (
          <p className="mt-1 line-clamp-2 text-xs text-amber-800">Note: {snippet.note}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
          <Favicon src={snippet.faviconUrl} domain={snippet.domain} className="h-3.5 w-3.5 text-[8px]" />
          <span className="truncate">{label}</span>
          <a
            href={buildSourceUrl(snippet)}
            target="_blank"
            rel="noreferrer noopener"
            className="text-indigo-600 hover:underline"
          >
            open source ↗
          </a>
          <Link href={`/snippet/${snippet.id}`} className="text-slate-500 hover:underline">
            details
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Inline editor for a heading or free-text block (NOTE-4). Saves on blur. */
function BlockEditor({
  item,
  onEditContent,
}: {
  item: DocumentItem;
  onEditContent: (item: DocumentItem, content: string) => void;
}) {
  const isHeading = item.kind === 'heading';
  const [value, setValue] = useState(item.content ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Resync when an external (synced) edit lands and we're not actively editing.
  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(item.content ?? '');
  }, [item.content]);

  // Auto-grow to fit content.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const save = () => {
    if ((item.content ?? '') !== value) onEditContent(item, value);
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={isHeading ? 'Heading' : 'Write a note…'}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      className={cn(
        'w-full resize-none rounded bg-transparent px-2 py-1.5 text-slate-800 placeholder:text-slate-300 focus:bg-slate-50 focus:outline-none',
        isHeading ? 'text-base font-semibold' : 'text-sm leading-relaxed',
      )}
    />
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30',
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:text-slate-700',
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        {children}
      </svg>
    </button>
  );
}
