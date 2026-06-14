'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { FiltersBar } from '@/components/library/filters-bar';
import { SiteCard } from '@/components/library/site-card';
import { SnippetFeed, type Density } from '@/components/library/snippet-feed';
import { LibraryEmpty, NoResults } from '@/components/library/empty-state';
import {
  OnboardingChecklist,
  useOnboardingDismissed,
} from '@/components/library/onboarding-checklist';
import {
  useDocuments,
  useSnippetDocumentMap,
  useSnippetRefCounts,
  useSnippets,
  useSnippetTagMap,
  useTags,
} from '@/lib/hooks';
import { onboardingProgress } from '@/lib/onboarding';
import {
  EMPTY_FILTERS,
  computeFacetCounts,
  distinctColors,
  filterSnippets,
  groupByDomain,
  hasActiveFilters,
  sortSnippets,
} from '@/lib/snippets';
import {
  DEFAULT_SORT,
  type Lens,
  type LibraryView,
  libraryViewToQueryString,
  parseLibraryView,
} from '@/lib/library-url';
import { SMART_VIEWS, activeSmartViewId, type SmartView } from '@/lib/smart-views';
import { useScrollRestoration } from '@/lib/use-scroll-restoration';
import { SelectionProvider } from '@/components/library/selection-context';
import { SelectionBar } from '@/components/library/selection-bar';
import { DocumentLens } from '@/components/library/document-lens';
import { ResurfaceStrip } from '@/components/library/resurface-strip';
import { useResurface } from '@/lib/use-resurface';

/**
 * The library home. Defaults to a flat, newest-first feed of **every** snippet
 * (VIEW-1) — the snippet is the unit of value, no longer buried behind a forced
 * website→page drill. A lens toggle re-groups the same set **By website** (VIEW-3).
 * Lens + search + filters + sort all live in the URL, so a view is shareable and
 * survives refresh / back-navigation (A11Y-3).
 */
export function LibraryHome() {
  const snippets = useSnippets();
  const documents = useDocuments();
  const tags = useTags();
  const tagsBySnippet = useSnippetTagMap();
  const refCounts = useSnippetRefCounts();
  const snippetDocs = useSnippetDocumentMap();
  const [dismissed, dismiss] = useOnboardingDismissed();
  const [density, setDensity] = useDensity();

  // Multi-select (BULK-1): selected snippet ids + a floating action bar.
  const [selectedIds, setSelectedIds] = useState(() => new Set<string>());
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set<string>()), []);
  const selectionActive = selectedIds.size > 0;
  const selectionValue = useMemo(
    () => ({ selectedIds, active: selectionActive, toggle: toggleSelect }),
    [selectedIds, selectionActive, toggleSelect],
  );

  // Rediscovery (DISC-1): a "Revisit" set picked once when snippets are ready.
  const { picks: resurfacePicks, dismiss: dismissResurface } = useResurface(snippets, refCounts);

  // View state (lens + filters + sort) is seeded from the URL and mirrored back to it.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<LibraryView>(() =>
    parseLibraryView(new URLSearchParams(searchParams.toString())),
  );

  // Mirror the view into the URL (debounced so typing in search doesn't thrash it).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const qs = libraryViewToQueryString(view);
    const handle = setTimeout(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
  }, [view, pathname, router]);

  const setLens = (lens: Lens) => {
    setSelectedIds(new Set<string>());
    setView((v) => ({ ...v, lens }));
  };
  const setFilters = (filters: LibraryView['filters']) =>
    setView((v) => ({ ...v, filters }));
  const setSort = (sort: LibraryView['sort']) => setView((v) => ({ ...v, sort }));
  const clearFilters = () => setView((v) => ({ ...v, filters: EMPTY_FILTERS }));
  const applySmartView = (sv: SmartView) =>
    setView((v) =>
      activeSmartViewId(v.filters, v.sort) === sv.id
        ? { ...v, filters: EMPTY_FILTERS, sort: DEFAULT_SORT }
        : { ...v, ...sv.build() },
    );

  const colors = useMemo(() => distinctColors(snippets ?? []), [snippets]);
  const filtering = hasActiveFilters(view.filters);

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

  // The filtered + sorted snippet set underlies every lens.
  const results = useMemo(
    () =>
      snippets
        ? sortSnippets(filterSnippets(snippets, view.filters, tagsBySnippet), view.sort, refCounts)
        : [],
    [snippets, view.filters, view.sort, tagsBySnippet, refCounts],
  );
  // The By-website lens groups the same (filtered) set.
  const sites = useMemo(() => groupByDomain(results), [results]);
  // Per-facet counts for the filter tray (FIND-3), recomputed as filters change.
  const facetCounts = useMemo(
    () => computeFacetCounts(snippets ?? [], view.filters, tagsBySnippet),
    [snippets, view.filters, tagsBySnippet],
  );
  const activeViewId = activeSmartViewId(view.filters, view.sort);
  const selectedSnippets = useMemo(
    () => (snippets ?? []).filter((s) => selectedIds.has(s.id)),
    [snippets, selectedIds],
  );

  // Restore scroll (and the grid's "Show more") on Back, per view (SCALE-2).
  const restoreKey = libraryViewToQueryString(view) || 'default';
  useScrollRestoration(restoreKey, snippets !== undefined);

  // Esc clears a selection (BULK-2).
  useEffect(() => {
    if (!selectionActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionActive, clearSelection]);

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
        {showOnboarding && <OnboardingChecklist progress={progress} onDismiss={dismiss} />}
        {showOnboarding ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Nothing captured yet — your saved highlights will appear here.
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

      <div className="mb-4 flex items-center justify-between gap-3">
        <LensToggle lens={view.lens} onChange={setLens} />
        {view.lens !== 'site' && <DensityToggle density={density} onChange={setDensity} />}
      </div>

      <FiltersBar
        filters={view.filters}
        onChange={setFilters}
        sort={view.sort}
        onSortChange={setSort}
        availableColors={colors}
        availableTags={tags ?? []}
        counts={facetCounts}
        onClear={clearFilters}
      />

      <SmartViewsBar activeId={activeViewId} onApply={applySmartView} />

      {view.lens === 'flat' && !filtering && !selectionActive && (
        <ResurfaceStrip picks={resurfacePicks} onDismissItem={dismissResurface} />
      )}

      {results.length === 0 ? (
        <NoResults onClear={clearFilters} />
      ) : view.lens === 'site' ? (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {sites.length} {sites.length === 1 ? 'website' : 'websites'} ·{' '}
            {results.length} {results.length === 1 ? 'snippet' : 'snippets'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((group) => (
              <SiteCard key={group.domain} group={group} />
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {results.length}{' '}
            {filtering
              ? results.length === 1
                ? 'result'
                : 'results'
              : results.length === 1
                ? 'snippet'
                : 'snippets'}
          </p>
          <SelectionProvider value={selectionValue}>
            {view.lens === 'document' ? (
              <DocumentLens
                snippets={results}
                snippetDocs={snippetDocs}
                density={density}
                tagsBySnippet={tagsBySnippet}
                refCounts={refCounts}
              />
            ) : (
              <SnippetFeed
                density={density}
                snippets={results}
                tagsBySnippet={tagsBySnippet}
                refCounts={refCounts}
                storageKey={restoreKey}
              />
            )}
          </SelectionProvider>
        </>
      )}

      {view.lens !== 'site' && selectionActive && (
        <SelectionBar snippets={selectedSnippets} onClear={clearSelection} />
      )}
    </div>
  );
}

const LENS_OPTIONS: { value: Lens; label: string }[] = [
  { value: 'flat', label: 'All snippets' },
  { value: 'site', label: 'By website' },
  { value: 'document', label: 'By document' },
];

/** Segmented control switching the home between the flat feed and by-website grouping. */
function LensToggle({ lens, onChange }: { lens: Lens; onChange: (lens: Lens) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Library view"
      className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm"
    >
      {LENS_OPTIONS.map((opt) => {
        const active = lens === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-md px-3 py-1 font-medium transition-colors',
              active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** One-click prebuilt smart views (FIND-6) — dynamic filter+sort presets. */
function SmartViewsBar({
  activeId,
  onApply,
}: {
  activeId: string | null;
  onApply: (sv: SmartView) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-400">Views</span>
      {SMART_VIEWS.map((sv) => {
        const active = activeId === sv.id;
        return (
          <button
            key={sv.id}
            type="button"
            onClick={() => onApply(sv)}
            aria-pressed={active}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {sv.label}
          </button>
        );
      })}
    </div>
  );
}

const DENSITY_KEY = 'tessera:density';

/** Persisted list/grid density preference (VIEW-5; D5 default = list). */
function useDensity(): [Density, (d: Density) => void] {
  // Read synchronously on mount so the feed renders in the right density from the
  // first frame — no list→grid flip on Back that would race the grid's restore.
  const [density, setDensity] = useState<Density>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem(DENSITY_KEY);
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  });
  const update = (d: Density) => {
    setDensity(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {
      // localStorage may be unavailable (private mode / quota) — non-fatal.
    }
  };
  return [density, update];
}

/** List ↔ grid density toggle (VIEW-5). */
function DensityToggle({
  density,
  onChange,
}: {
  density: Density;
  onChange: (d: Density) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Layout density"
      className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5"
    >
      <DensityButton active={density === 'list'} onClick={() => onChange('list')} label="List view">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
          <path strokeLinecap="round" d="M5.5 4h7M5.5 8h7M5.5 12h7M2.75 4h.01M2.75 8h.01M2.75 12h.01" />
        </svg>
      </DensityButton>
      <DensityButton active={density === 'grid'} onClick={() => onChange('grid')} label="Grid view">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
          <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
          <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
        </svg>
      </DensityButton>
    </div>
  );
}

function DensityButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}
