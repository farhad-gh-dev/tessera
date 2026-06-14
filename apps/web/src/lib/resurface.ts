import type { Snippet } from '@tessera/core';

/**
 * Resurface ranking (DISC-1). A pure, deterministic pick of snippets to bring
 * back to the user, weighted toward recency and the sources/documents they've
 * invested in, and strongly suppressing anything shown in the last week
 * (decay-on-show) so the set rotates over time. No backend, no AI, no randomness —
 * deterministic given its inputs so it's easy to reason about and cleanly
 * swappable for an M5 spaced-repetition scheduler (DISC-3). Could move to
 * `@tessera/core` for unit tests + reuse later.
 */

export interface ResurfaceOptions {
  count: number;
  /** Epoch ms; injectable so the pick is deterministic. */
  now: number;
  /** snippetId → epoch ms it was last surfaced (decay-on-show). */
  lastShown?: Map<string, number>;
  /** snippetId → how many documents reference it (a curation signal). */
  refCounts?: Map<string, number>;
}

const DAY = 86_400_000;
const SHOWN_COOLDOWN_DAYS = 7;

export function pickResurface(snippets: Snippet[], opts: ResurfaceOptions): Snippet[] {
  const { count, now, lastShown, refCounts } = opts;
  if (count <= 0 || snippets.length === 0) return [];

  // Source density: snippets sharing a domain (a source you keep returning to).
  const domainCounts = new Map<string, number>();
  for (const s of snippets) domainCounts.set(s.domain, (domainCounts.get(s.domain) ?? 0) + 1);

  const scored = snippets.map((s) => {
    const ageDays = Math.max(0, (now - new Date(s.createdAt).getTime()) / DAY);
    const recency = Math.max(0, 1 - ageDays / 90); // 1 today → 0 after ~3 months
    const domainBoost = Math.min(1, (domainCounts.get(s.domain) ?? 1) / 10);
    const refBoost = (refCounts?.get(s.id) ?? 0) > 0 ? 0.6 : 0;

    const shown = lastShown?.get(s.id);
    const shownAgeDays = shown == null ? Infinity : Math.max(0, (now - shown) / DAY);
    // Big, decaying penalty for anything surfaced within the cooldown window, so
    // the strip rotates; it fades to 0 by the end of the window (never a hard wall,
    // so the strip still fills if the whole library was recently shown).
    const shownPenalty =
      shownAgeDays < SHOWN_COOLDOWN_DAYS ? 100 * (1 - shownAgeDays / SHOWN_COOLDOWN_DAYS) : 0;

    return { s, score: recency + 0.4 * domainBoost + refBoost - shownPenalty };
  });

  scored.sort((a, b) => b.score - a.score || b.s.createdAt.localeCompare(a.s.createdAt));
  return scored.slice(0, count).map((x) => x.s);
}
