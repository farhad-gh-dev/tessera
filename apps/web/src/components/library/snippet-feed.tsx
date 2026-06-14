'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Snippet, Tag } from '@tessera/core';
import { Button } from '@/components/ui';
import { SnippetCard, SnippetRow } from '@/components/library/snippet-card';

export type Density = 'list' | 'grid';

interface FeedProps {
  snippets: Snippet[];
  tagsBySnippet?: Map<string, Tag[]>;
  refCounts?: Map<string, number>;
  density: Density;
  /** Stable key (the current view) for persisting feed state across navigation. */
  storageKey: string;
}

/**
 * Renders the flat snippet feed at scale (SCALE-1/2). The default **list** density
 * is window-virtualized — only the rows in view (plus a small overscan) are in the
 * DOM, so 1000+ snippets stay smooth. The **grid** density renders a capped page
 * with an explicit "Show more" (no bare infinite scroll, SCALE-2); responsive
 * variable-height grid virtualization (masonry) stays a future COULD.
 */
export function SnippetFeed({
  snippets,
  tagsBySnippet,
  refCounts,
  density,
  storageKey,
}: FeedProps) {
  return density === 'grid' ? (
    <GridFeed
      snippets={snippets}
      tagsBySnippet={tagsBySnippet}
      refCounts={refCounts}
      storageKey={storageKey}
    />
  ) : (
    <ListFeed snippets={snippets} tagsBySnippet={tagsBySnippet} refCounts={refCounts} />
  );
}

type FeedInner = Omit<FeedProps, 'density' | 'storageKey'>;

function ListFeed({ snippets, tagsBySnippet, refCounts }: FeedInner) {
  const listRef = useRef<HTMLDivElement>(null);
  // The list's distance from the top of the document — kept current (body resize +
  // window resize) so the window virtualizer positions rows correctly even as the
  // filter tray above it expands/collapses.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setScrollMargin(listRef.current?.offsetTop ?? 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: snippets.length,
    estimateSize: () => 88,
    overscan: 8,
    scrollMargin,
    getItemKey: (index) => snippets[index]?.id ?? index,
  });

  return (
    <div ref={listRef} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div
        role="list"
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const snippet = snippets[item.index];
          if (!snippet) return null;
          return (
            <div
              key={item.key}
              role="listitem"
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
            >
              <SnippetRow
                snippet={snippet}
                tags={tagsBySnippet?.get(snippet.id)}
                refCount={refCounts?.get(snippet.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const GRID_INITIAL = 48;
const GRID_STEP = 48;

/** Restore a grid's "Show more" count for this view (so Back lands where you were). */
function readGridLimit(key: string): number {
  if (typeof window === 'undefined') return GRID_INITIAL;
  try {
    const raw = window.sessionStorage.getItem(`tsr:gridlimit:${key}`);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? GRID_INITIAL : Math.max(GRID_INITIAL, n);
  } catch {
    return GRID_INITIAL;
  }
}

function GridFeed({
  snippets,
  tagsBySnippet,
  refCounts,
  storageKey,
}: FeedInner & { storageKey: string }) {
  const [limit, setLimit] = useState(() => readGridLimit(storageKey));
  useEffect(() => {
    try {
      sessionStorage.setItem(`tsr:gridlimit:${storageKey}`, String(limit));
    } catch {
      /* sessionStorage unavailable — non-fatal */
    }
  }, [limit, storageKey]);
  const shown = snippets.slice(0, limit);
  const remaining = snippets.length - shown.length;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((snippet) => (
          <SnippetCard
            key={snippet.id}
            snippet={snippet}
            tags={tagsBySnippet?.get(snippet.id)}
            refCount={refCounts?.get(snippet.id)}
          />
        ))}
      </div>
      {remaining > 0 && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => setLimit((l) => l + GRID_STEP)}>
            Show more ({remaining} more)
          </Button>
        </div>
      )}
    </>
  );
}
