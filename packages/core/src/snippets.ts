import type { Snippet, SnippetType } from './types.js';

/**
 * Cross-surface snippet search & formatting primitives — shared by the web
 * library and the extension side panel so search semantics and "saved N ago"
 * labels never drift between surfaces. (Grouping / filter / sort stay in the web
 * app's `lib/snippets.ts`; these are the small pieces both surfaces actually
 * share.) Pure and browser-agnostic so they unit-test without a DOM.
 */

/**
 * Case-insensitive substring match across the fields a user searches by — the
 * snippet's text, note, page title, URL, and domain — plus any `extra` strings
 * the caller folds in (e.g. attached tag names in the side panel, SP-3). An
 * empty / whitespace-only query matches everything.
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

/** Human label for a snippet type ("Text" / "Image" / "Screenshot"). */
export function typeLabel(type: SnippetType): string {
  return type === 'screenshot' ? 'Screenshot' : type === 'image' ? 'Image' : 'Text';
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** ISO-8601 → localized short date ("Jun 7, 2026"); `''` for an unparseable value. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

/**
 * Compact relative time: "just now", "30m ago", "5h ago", "2d ago", else a
 * formatted date once past a week. `now` is injectable so it's deterministic
 * under test.
 */
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
