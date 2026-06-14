import {
  buildTextFragmentUrl,
  type Snippet,
  type SnippetType,
  type Tag,
} from '@tessera/core';

/* -------------------------------------------------------------------------- */
/* Grouping (derived "websites" and "pages" — PRD §5, LIB-1/LIB-2)            */
/* -------------------------------------------------------------------------- */

/** A by-website grouping computed from snippets (the default library view). */
export interface SiteGroup {
  domain: string;
  faviconUrl?: string;
  count: number;
  /** Most recent capture in the group (ISO), for "last saved" + sorting. */
  latestAt: string;
}

/** A by-page grouping within one website. */
export interface PageGroup {
  url: string;
  pageTitle: string;
  faviconUrl?: string;
  count: number;
  latestAt: string;
  snippets: Snippet[];
}

/** Group snippets by source domain, most-recently-active site first. */
export function groupByDomain(snippets: Snippet[]): SiteGroup[] {
  const groups = new Map<string, SiteGroup>();
  for (const s of snippets) {
    const existing = groups.get(s.domain);
    if (!existing) {
      groups.set(s.domain, {
        domain: s.domain,
        faviconUrl: s.faviconUrl,
        count: 1,
        latestAt: s.createdAt,
      });
    } else {
      existing.count += 1;
      if (!existing.faviconUrl && s.faviconUrl) existing.faviconUrl = s.faviconUrl;
      if (s.createdAt > existing.latestAt) existing.latestAt = s.createdAt;
    }
  }
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

/** Group one site's snippets by page (URL), most-recently-active page first. */
export function groupByPage(snippets: Snippet[]): PageGroup[] {
  const groups = new Map<string, PageGroup>();
  for (const s of snippets) {
    const existing = groups.get(s.url);
    if (!existing) {
      groups.set(s.url, {
        url: s.url,
        pageTitle: s.pageTitle || s.url,
        faviconUrl: s.faviconUrl,
        count: 1,
        latestAt: s.createdAt,
        snippets: [s],
      });
    } else {
      existing.count += 1;
      existing.snippets.push(s);
      if (!existing.faviconUrl && s.faviconUrl) existing.faviconUrl = s.faviconUrl;
      if (s.pageTitle && existing.pageTitle === existing.url)
        existing.pageTitle = s.pageTitle;
      if (s.createdAt > existing.latestAt) existing.latestAt = s.createdAt;
    }
  }
  // Within a page, oldest-first approximates capture/reading order (LIB-2).
  for (const g of groups.values()) {
    g.snippets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

/* -------------------------------------------------------------------------- */
/* Search, filter, sort (LIB-3 / LIB-4 / LIB-7)                               */
/* -------------------------------------------------------------------------- */

export type SnippetSort = 'newest' | 'oldest' | 'most_referenced';

export interface SnippetFilters {
  query: string;
  types: SnippetType[];
  colors: string[];
  /** Selected tag ids (LIB-4). A snippet matches if it carries any of them. */
  tags: string[];
  /** Inclusive ISO date bounds (yyyy-mm-dd), or empty. */
  from: string;
  to: string;
  /** Smart-view predicates (FIND-6): only snippets with a note / with no tags. */
  hasNote?: boolean;
  untagged?: boolean;
}

export const EMPTY_FILTERS: SnippetFilters = {
  query: '',
  types: [],
  colors: [],
  tags: [],
  from: '',
  to: '',
  hasNote: false,
  untagged: false,
};

export function hasActiveFilters(f: SnippetFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.types.length > 0 ||
    f.colors.length > 0 ||
    f.tags.length > 0 ||
    f.from !== '' ||
    f.to !== '' ||
    f.hasNote === true ||
    f.untagged === true
  );
}

/**
 * Full-text-ish match across the fields a user searches by (LIB-3): the snippet's
 * text, note, page title, URL, and domain — plus any `extra` strings the caller
 * folds in. The library passes a snippet's attached **tag names** here so a search
 * like "biology" also hits its tagged snippets (FIND-1; previously tags were
 * promised but never searched). An empty / whitespace-only query matches everything.
 */
export function matchesQuery(
  s: Snippet,
  query: string,
  extra: readonly string[] = [],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [s.text, s.note, s.pageTitle, s.url, s.domain, ...extra]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function filterSnippets(
  snippets: Snippet[],
  f: SnippetFilters,
  tagsBySnippet?: Map<string, Tag[]>,
): Snippet[] {
  const typeSet = new Set(f.types);
  const colorSet = new Set(f.colors);
  const tagSet = new Set(f.tags);
  const hasQuery = f.query.trim() !== '';
  const needTags = tagSet.size > 0 || hasQuery || f.untagged === true;
  // `to` is inclusive of the whole day.
  const toBound = f.to ? `${f.to}T23:59:59.999Z` : '';
  return snippets.filter((s) => {
    if (typeSet.size > 0 && !typeSet.has(s.type)) return false;
    if (colorSet.size > 0 && !(s.color && colorSet.has(s.color))) return false;
    if (f.hasNote && !(s.note && s.note.trim() !== '')) return false;
    // Tags power the tag filter, tag-name search (FIND-1), and the untagged view.
    const snipTags = needTags ? tagsBySnippet?.get(s.id) : undefined;
    if (tagSet.size > 0) {
      if (!snipTags || !snipTags.some((t) => tagSet.has(t.id))) return false;
    }
    if (f.untagged && snipTags && snipTags.length > 0) return false;
    if (f.from && s.createdAt < f.from) return false;
    if (toBound && s.createdAt > toBound) return false;
    if (hasQuery && !matchesQuery(s, f.query, snipTags?.map((t) => t.name))) return false;
    return true;
  });
}

export function sortSnippets(
  snippets: Snippet[],
  sort: SnippetSort,
  refCounts?: Map<string, number>,
): Snippet[] {
  const copy = [...snippets];
  copy.sort((a, b) => {
    if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
    if (sort === 'most_referenced') {
      const diff = (refCounts?.get(b.id) ?? 0) - (refCounts?.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      return b.createdAt.localeCompare(a.createdAt);
    }
    return b.createdAt.localeCompare(a.createdAt); // newest
  });
  return copy;
}

/** Distinct highlight colors present in a set, for building the color filter. */
export function distinctColors(snippets: Snippet[]): string[] {
  const seen = new Set<string>();
  for (const s of snippets) if (s.color) seen.add(s.color);
  return [...seen];
}

/** Per-facet result counts for the filter tray (FIND-3). */
export interface FacetCounts {
  types: Map<SnippetType, number>;
  colors: Map<string, number>;
  tags: Map<string, number>;
}

/**
 * Count how many snippets each facet value would match (FIND-3). Each dimension
 * is counted over the set filtered by every *other* active facet — standard
 * faceted-search semantics, so a count reads as "how many you'd get if you also
 * picked this", and toggling within one facet (OR) doesn't zero out its siblings.
 */
export function computeFacetCounts(
  snippets: Snippet[],
  f: SnippetFilters,
  tagsBySnippet?: Map<string, Tag[]>,
): FacetCounts {
  const types = new Map<SnippetType, number>();
  for (const s of filterSnippets(snippets, { ...f, types: [] }, tagsBySnippet)) {
    types.set(s.type, (types.get(s.type) ?? 0) + 1);
  }

  const colors = new Map<string, number>();
  for (const s of filterSnippets(snippets, { ...f, colors: [] }, tagsBySnippet)) {
    if (s.color) colors.set(s.color, (colors.get(s.color) ?? 0) + 1);
  }

  const tags = new Map<string, number>();
  for (const s of filterSnippets(snippets, { ...f, tags: [] }, tagsBySnippet)) {
    const ts = tagsBySnippet?.get(s.id);
    if (ts) for (const t of ts) tags.set(t.id, (tags.get(t.id) ?? 0) + 1);
  }

  return { types, colors, tags };
}

/* -------------------------------------------------------------------------- */
/* Open source: native text-fragment deep link (LIB-6)                        */
/* -------------------------------------------------------------------------- */

/**
 * Build a deep link back to a snippet's source — a native `#:~:text=` Text
 * Fragment from the saved anchor quote so the browser scrolls to and highlights
 * the passage on its own (the extension re-highlights on top if installed).
 * Thin wrapper over {@link buildTextFragmentUrl} in `@tessera/core`, shared with
 * Markdown export (EXP-3) so "open source" and exported citations stay in sync.
 */
export function buildSourceUrl(s: Snippet): string {
  return buildTextFragmentUrl(s.url, s.anchor);
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

/** Compact relative time ("just now", "3h ago", "2d ago", or a date). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.round((now - then) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function typeLabel(type: SnippetType): string {
  return type === 'screenshot' ? 'Screenshot' : type === 'image' ? 'Image' : 'Text';
}
