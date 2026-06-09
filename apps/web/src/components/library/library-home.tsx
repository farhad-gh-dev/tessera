'use client';

import { useMemo, useState } from 'react';
import { Spinner } from '@/components/ui';
import { FiltersBar } from '@/components/library/filters-bar';
import { SiteCard } from '@/components/library/site-card';
import { SnippetCard } from '@/components/library/snippet-card';
import { LibraryEmpty, NoResults } from '@/components/library/empty-state';
import {
  OnboardingChecklist,
  useOnboardingDismissed,
} from '@/components/library/onboarding-checklist';
import {
  useDocuments,
  useSnippetRefCounts,
  useSnippets,
  useSnippetTagMap,
  useTags,
} from '@/lib/hooks';
import { onboardingProgress } from '@/lib/onboarding';
import {
  EMPTY_FILTERS,
  distinctColors,
  filterSnippets,
  groupByDomain,
  hasActiveFilters,
  sortSnippets,
  type SnippetFilters,
  type SnippetSort,
} from '@/lib/snippets';

/**
 * The library home (LIB-1). Default view groups everything by website; the moment
 * a search query or filter is active it switches to a flat, sorted result list.
 */
export function LibraryHome() {
  const snippets = useSnippets();
  const documents = useDocuments();
  const tags = useTags();
  const tagsBySnippet = useSnippetTagMap();
  const refCounts = useSnippetRefCounts();
  const [filters, setFilters] = useState<SnippetFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SnippetSort>('newest');
  const [dismissed, dismiss] = useOnboardingDismissed();

  const colors = useMemo(() => distinctColors(snippets ?? []), [snippets]);
  const filtering = hasActiveFilters(filters);

  const progress = useMemo(
    () =>
      onboardingProgress({
        snippetCount: snippets?.length ?? 0,
        documentCount: documents?.length ?? 0,
        referencedSnippetCount: refCounts?.size ?? 0,
      }),
    [snippets, documents, refCounts],
  );
  // Only judge onboarding once every input has loaded, so steps don't briefly
  // read as "not done" and flash the guide at a returning user.
  const onboardingReady =
    snippets !== undefined && documents !== undefined && refCounts !== undefined;
  const showOnboarding = onboardingReady && !progress.complete && !dismissed;

  const results = useMemo(
    () =>
      snippets
        ? sortSnippets(filterSnippets(snippets, filters, tagsBySnippet), sort, refCounts)
        : [],
    [snippets, filters, sort, tagsBySnippet, refCounts],
  );
  const sites = useMemo(() => (snippets ? groupByDomain(snippets) : []), [snippets]);

  if (snippets === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (snippets.length === 0) {
    return (
      <div>
        {showOnboarding && (
          <OnboardingChecklist progress={progress} onDismiss={dismiss} />
        )}
        {showOnboarding ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Nothing captured yet — your saved highlights will appear here, grouped by
            website.
          </p>
        ) : (
          <LibraryEmpty />
        )}
      </div>
    );
  }

  return (
    <div>
      {showOnboarding && <OnboardingChecklist progress={progress} onDismiss={dismiss} />}
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        availableColors={colors}
        availableTags={tags ?? []}
        onClear={() => setFilters(EMPTY_FILTERS)}
      />

      {filtering ? (
        results.length === 0 ? (
          <NoResults onClear={() => setFilters(EMPTY_FILTERS)} />
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500">
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((snippet) => (
                <SnippetCard key={snippet.id} snippet={snippet} />
              ))}
            </div>
          </>
        )
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {sites.length} {sites.length === 1 ? 'website' : 'websites'} ·{' '}
            {snippets.length} {snippets.length === 1 ? 'snippet' : 'snippets'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((group) => (
              <SiteCard key={group.domain} group={group} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
