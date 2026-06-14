'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Document, Snippet, Tag } from '@tessera/core';
import { cn } from '@/lib/cn';
import { SnippetCard, SnippetRow } from '@/components/library/snippet-card';
import type { Density } from '@/components/library/snippet-feed';

interface DocumentLensProps {
  snippets: Snippet[];
  snippetDocs?: Map<string, Document[]>;
  density: Density;
  tagsBySnippet?: Map<string, Tag[]>;
  refCounts?: Map<string, number>;
}

/**
 * The By-document lens (VIEW-4): the same filtered snippets, grouped under the
 * document(s) that reference them — a snippet in several documents appears under
 * each — plus an "Unfiled" group for snippets in no document. Surfaces the
 * reference model (DOC-2/3/8) as a browse axis. Selection works via the same
 * context that wraps the flat feed.
 */
export function DocumentLens({
  snippets,
  snippetDocs,
  density,
  tagsBySnippet,
  refCounts,
}: DocumentLensProps) {
  const { groups, unfiled } = useMemo(() => {
    const byDoc = new Map<string, { doc: Document; items: Snippet[] }>();
    const loose: Snippet[] = [];
    for (const s of snippets) {
      const docs = snippetDocs?.get(s.id);
      if (docs && docs.length > 0) {
        for (const d of docs) {
          const entry = byDoc.get(d.id);
          if (entry) entry.items.push(s);
          else byDoc.set(d.id, { doc: d, items: [s] });
        }
      } else {
        loose.push(s);
      }
    }
    const ordered = [...byDoc.values()].sort((a, b) =>
      b.doc.updatedAt.localeCompare(a.doc.updatedAt),
    );
    return { groups: ordered, unfiled: loose };
  }, [snippets, snippetDocs]);

  return (
    <div className="space-y-8">
      {groups.map(({ doc, items }) => (
        <Group
          key={doc.id}
          title={doc.title || 'Untitled'}
          href={`/documents/${doc.id}`}
          count={items.length}
          snippets={items}
          density={density}
          tagsBySnippet={tagsBySnippet}
          refCounts={refCounts}
        />
      ))}
      {unfiled.length > 0 && (
        <Group
          title="Unfiled"
          count={unfiled.length}
          snippets={unfiled}
          density={density}
          tagsBySnippet={tagsBySnippet}
          refCounts={refCounts}
          muted
        />
      )}
    </div>
  );
}

function Group({
  title,
  href,
  count,
  snippets,
  density,
  tagsBySnippet,
  refCounts,
  muted,
}: {
  title: string;
  href?: string;
  count: number;
  snippets: Snippet[];
  density: Density;
  tagsBySnippet?: Map<string, Tag[]>;
  refCounts?: Map<string, number>;
  muted?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {href ? (
          <Link
            href={href}
            className="text-sm font-semibold text-slate-800 hover:text-indigo-600 hover:underline"
          >
            {title}
          </Link>
        ) : (
          <span className={cn('text-sm font-semibold', muted ? 'text-slate-400' : 'text-slate-800')}>
            {title}
          </span>
        )}
        <span className="text-xs text-slate-400">{count}</span>
      </div>

      {density === 'list' ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {snippets.map((s) => (
            <SnippetRow
              key={s.id}
              snippet={s}
              tags={tagsBySnippet?.get(s.id)}
              refCount={refCounts?.get(s.id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snippets.map((s) => (
            <SnippetCard
              key={s.id}
              snippet={s}
              tags={tagsBySnippet?.get(s.id)}
              refCount={refCounts?.get(s.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
