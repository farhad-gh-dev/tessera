'use client';

import Link from 'next/link';
import type { Snippet } from '@tessera/core';
import { Card } from '@/components/ui';
import { Favicon, SnippetImage } from '@/components/library/media';
import { RichText } from '@/components/library/rich-text';
import { relativeTime, typeLabel } from '@/lib/snippets';

/**
 * A single snippet in a grid (library results and per-page lists). Text shows its
 * highlight color as a left accent; images/screenshots show a thumbnail. The whole
 * card links to the snippet detail view.
 */
export function SnippetCard({ snippet, showSource = true }: { snippet: Snippet; showSource?: boolean }) {
  const isText = snippet.type === 'text';
  return (
    <Link href={`/snippet/${snippet.id}`} className="block">
      <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-indigo-300">
        {isText ? (
          <div className="flex flex-1 gap-2.5 p-4">
            <span
              className="mt-0.5 w-1 shrink-0 rounded-full bg-indigo-400"
              style={snippet.color ? { backgroundColor: snippet.color } : undefined}
              aria-hidden="true"
            />
            <RichText
              snippet={snippet}
              className="line-clamp-5 text-sm leading-relaxed text-slate-700"
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

        {showSource && (
          <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            <Favicon src={snippet.faviconUrl} domain={snippet.domain} className="h-3.5 w-3.5 text-[8px]" />
            <span className="truncate">{snippet.domain.replace(/^www\./, '')}</span>
            <span className="shrink-0">· {relativeTime(snippet.createdAt)}</span>
          </div>
        )}
      </Card>
    </Link>
  );
}
