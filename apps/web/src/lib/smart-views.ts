import { EMPTY_FILTERS, type SnippetFilters, type SnippetSort } from '@/lib/snippets';

/**
 * Prebuilt **smart views** (FIND-6): one-click dynamic filter+sort presets — the
 * research's "saved/smart views beat a static filter row" pattern. Each builds a
 * fresh view when applied, so date-relative ones (e.g. "This week") stay current.
 * User-pinned saved views (D3) layer on top of this list in a follow-up.
 */
export interface SmartView {
  id: string;
  label: string;
  build: () => { filters: SnippetFilters; sort: SnippetSort };
}

/** `yyyy-mm-dd` for `n` days before today (local) — for date-relative views. */
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const SMART_VIEWS: readonly SmartView[] = [
  {
    id: 'recent',
    label: 'This week',
    build: () => ({ filters: { ...EMPTY_FILTERS, from: daysAgoIso(7) }, sort: 'newest' }),
  },
  {
    id: 'untagged',
    label: 'Untagged',
    build: () => ({ filters: { ...EMPTY_FILTERS, untagged: true }, sort: 'newest' }),
  },
  {
    id: 'noted',
    label: 'Has note',
    build: () => ({ filters: { ...EMPTY_FILTERS, hasNote: true }, sort: 'newest' }),
  },
  {
    id: 'images',
    label: 'Images',
    build: () => ({
      filters: { ...EMPTY_FILTERS, types: ['image', 'screenshot'] },
      sort: 'newest',
    }),
  },
  {
    id: 'most-referenced',
    label: 'Most referenced',
    build: () => ({ filters: EMPTY_FILTERS, sort: 'most_referenced' }),
  },
];

/** Canonical key for a filters+sort pair, for detecting which smart view is active. */
function viewKey(filters: SnippetFilters, sort: SnippetSort): string {
  return JSON.stringify({
    q: filters.query.trim(),
    types: [...filters.types].sort(),
    colors: [...filters.colors].sort(),
    tags: [...filters.tags].sort(),
    from: filters.from,
    to: filters.to,
    note: !!filters.hasNote,
    untagged: !!filters.untagged,
    sort,
  });
}

/** Which smart view (if any) the current filters+sort exactly match. */
export function activeSmartViewId(filters: SnippetFilters, sort: SnippetSort): string | null {
  const key = viewKey(filters, sort);
  for (const v of SMART_VIEWS) {
    const built = v.build();
    if (viewKey(built.filters, built.sort) === key) return v.id;
  }
  return null;
}
