import type { Snippet, SnippetType } from '@tessera/core';

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
      if (s.pageTitle && existing.pageTitle === existing.url) existing.pageTitle = s.pageTitle;
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

export type SnippetSort = 'newest' | 'oldest';

export interface SnippetFilters {
  query: string;
  types: SnippetType[];
  colors: string[];
  /** Inclusive ISO date bounds (yyyy-mm-dd), or empty. */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: SnippetFilters = {
  query: '',
  types: [],
  colors: [],
  from: '',
  to: '',
};

export function hasActiveFilters(f: SnippetFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.types.length > 0 ||
    f.colors.length > 0 ||
    f.from !== '' ||
    f.to !== ''
  );
}

/** Full-text-ish match across the fields a user would search by (LIB-3). */
export function matchesQuery(s: Snippet, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [s.text, s.note, s.pageTitle, s.url, s.domain]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function filterSnippets(snippets: Snippet[], f: SnippetFilters): Snippet[] {
  const typeSet = new Set(f.types);
  const colorSet = new Set(f.colors);
  // `to` is inclusive of the whole day.
  const toBound = f.to ? `${f.to}T23:59:59.999Z` : '';
  return snippets.filter((s) => {
    if (typeSet.size > 0 && !typeSet.has(s.type)) return false;
    if (colorSet.size > 0 && !(s.color && colorSet.has(s.color))) return false;
    if (f.from && s.createdAt < f.from) return false;
    if (toBound && s.createdAt > toBound) return false;
    if (!matchesQuery(s, f.query)) return false;
    return true;
  });
}

export function sortSnippets(snippets: Snippet[], sort: SnippetSort): Snippet[] {
  const copy = [...snippets];
  copy.sort((a, b) =>
    sort === 'newest'
      ? b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt),
  );
  return copy;
}

/** Distinct highlight colors present in a set, for building the color filter. */
export function distinctColors(snippets: Snippet[]): string[] {
  const seen = new Set<string>();
  for (const s of snippets) if (s.color) seen.add(s.color);
  return [...seen];
}

/* -------------------------------------------------------------------------- */
/* Open source: native text-fragment deep link (LIB-6)                        */
/* -------------------------------------------------------------------------- */

/**
 * Build a deep link back to a snippet's source. For text snippets we append a
 * native `#:~:text=` Text Fragment built from the saved anchor quote, so the
 * browser scrolls to and highlights the passage on its own — and the extension
 * re-highlights on top if it's installed. Falls back to the bare URL.
 */
export function buildSourceUrl(s: Snippet): string {
  const exact = s.anchor?.quote?.exact?.trim();
  if (!exact) return s.url;
  try {
    const base = new URL(s.url);
    base.hash = '';
    return `${base.href}#:~:text=${encodeTextFragment(exact)}`;
  } catch {
    return s.url;
  }
}

function encodeTextFragment(exact: string): string {
  // Hyphens delimit prefix-/-suffix in the spec, and commas delimit
  // textStart,textEnd — percent-encode both so they're treated literally.
  const enc = (part: string) =>
    encodeURIComponent(part).replace(/-/g, '%2D').replace(/,/g, '%2C');
  const words = exact.split(/\s+/);
  // Long quotes become a textStart,textEnd range to keep the URL sane and robust.
  if (exact.length <= 100 || words.length <= 6) return enc(exact);
  const start = words.slice(0, 5).join(' ');
  const end = words.slice(-5).join(' ');
  return `${enc(start)},${enc(end)}`;
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
