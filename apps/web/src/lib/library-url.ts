import type { SnippetType } from '@tessera/core';
import { EMPTY_FILTERS, type SnippetFilters, type SnippetSort } from '@/lib/snippets';

/**
 * URL ⇄ Library view-state serialization (A11Y-3). Lifting the home's lens,
 * filters, and sort into the URL makes a view **shareable**, **restorable on
 * refresh**, and **survivable across back-navigation** from a snippet — replacing
 * the old ephemeral `useState`. Pure and free of Next types so it stays trivially
 * testable.
 *
 * Param schema (every part optional; defaults are omitted so a pristine home is "/"):
 *   lens=site · q=<text> · type=text,image,screenshot · color=fde68a,a7f3d0
 *   tag=<id>,<id> · from=YYYY-MM-DD · to=YYYY-MM-DD · sort=oldest|most_referenced
 * The default lens (flat) and sort (newest) are never written.
 */

/**
 * Home grouping lens: `flat` = one feed of all snippets; `site` = grouped by
 * website; `document` = grouped by the documents that reference each snippet.
 */
export type Lens = 'flat' | 'site' | 'document';

export interface LibraryView {
  lens: Lens;
  filters: SnippetFilters;
  sort: SnippetSort;
}

export const DEFAULT_LENS: Lens = 'flat';
export const DEFAULT_SORT: SnippetSort = 'newest';

export const DEFAULT_VIEW: LibraryView = {
  lens: DEFAULT_LENS,
  filters: EMPTY_FILTERS,
  sort: DEFAULT_SORT,
};

const LENSES: readonly Lens[] = ['flat', 'site', 'document'];
const SORTS: readonly SnippetSort[] = ['newest', 'oldest', 'most_referenced'];
const TYPES: readonly SnippetType[] = ['text', 'image', 'screenshot'];

const csv = (v: string | null): string[] => (v ? v.split(',').filter(Boolean) : []);
// Colors persist as `#rrggbb`; drop the `#` for a tidy URL and restore it on read.
const encodeColor = (c: string): string => c.replace(/^#/, '');
const decodeColor = (c: string): string => (/^[0-9a-fA-F]{6}$/.test(c) ? `#${c}` : c);

/** Read a Library view from URL params, falling back to defaults for anything absent/invalid. */
export function parseLibraryView(params: URLSearchParams): LibraryView {
  const lensRaw = params.get('lens');
  const lens: Lens = LENSES.includes(lensRaw as Lens) ? (lensRaw as Lens) : DEFAULT_LENS;

  const sortRaw = params.get('sort');
  const sort: SnippetSort = SORTS.includes(sortRaw as SnippetSort)
    ? (sortRaw as SnippetSort)
    : DEFAULT_SORT;

  const types = csv(params.get('type')).filter((t): t is SnippetType =>
    TYPES.includes(t as SnippetType),
  );

  return {
    lens,
    sort,
    filters: {
      query: params.get('q') ?? '',
      types,
      colors: csv(params.get('color')).map(decodeColor),
      tags: csv(params.get('tag')),
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      hasNote: params.get('note') === '1',
      untagged: params.get('untagged') === '1',
    },
  };
}

/** Serialize a Library view to URL params, omitting defaults so a pristine home stays "/". */
export function libraryViewToSearchParams(view: LibraryView): URLSearchParams {
  const p = new URLSearchParams();
  const { lens, sort, filters: f } = view;
  if (lens !== DEFAULT_LENS) p.set('lens', lens);
  if (f.query.trim() !== '') p.set('q', f.query);
  if (f.types.length > 0) p.set('type', f.types.join(','));
  if (f.colors.length > 0) p.set('color', f.colors.map(encodeColor).join(','));
  if (f.tags.length > 0) p.set('tag', f.tags.join(','));
  if (f.from !== '') p.set('from', f.from);
  if (f.to !== '') p.set('to', f.to);
  if (f.hasNote) p.set('note', '1');
  if (f.untagged) p.set('untagged', '1');
  if (sort !== DEFAULT_SORT) p.set('sort', sort);
  return p;
}

/** Convenience: the query string for {@link libraryViewToSearchParams} (no leading "?"). */
export function libraryViewToQueryString(view: LibraryView): string {
  return libraryViewToSearchParams(view).toString();
}
