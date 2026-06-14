'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snippet } from '@tessera/core';
import { pickResurface } from '@/lib/resurface';

const RESURFACE_MIN = 10; // not worth a "revisit" strip on a tiny library
const RESURFACE_COUNT = 6;
const SHOWN_KEY = 'tessera:resurface-shown';
const SHOWN_TTL_DAYS = 30; // forget very old "shown" marks so the map stays small

function readShown(): Map<string, number> {
  const map = new Map<string, number>();
  if (typeof window === 'undefined') return map;
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY);
    if (!raw) return map;
    const obj = JSON.parse(raw) as Record<string, number>;
    const cutoff = Date.now() - SHOWN_TTL_DAYS * 86_400_000;
    for (const [id, ts] of Object.entries(obj)) {
      if (typeof ts === 'number' && ts > cutoff) map.set(id, ts);
    }
  } catch {
    /* ignore */
  }
  return map;
}

function writeShown(map: Map<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SHOWN_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    /* ignore */
  }
}

/**
 * Compute a resurface set once when snippets are ready (DISC-1), record the shown
 * ids so they decay (rarely repeat soon), and expose a per-item dismiss. Frozen
 * for the mount, so filtering/selecting doesn't reshuffle it; a fresh visit
 * (remount) re-picks, rotating the set.
 */
export function useResurface(snippets: Snippet[] | undefined, refCounts?: Map<string, number>) {
  const [picks, setPicks] = useState<Snippet[]>([]);
  const computed = useRef(false);

  useEffect(() => {
    if (computed.current || !snippets || snippets.length < RESURFACE_MIN) return;
    computed.current = true;
    const shown = readShown();
    const chosen = pickResurface(snippets, {
      count: RESURFACE_COUNT,
      now: Date.now(),
      lastShown: shown,
      refCounts,
    });
    if (chosen.length === 0) return;
    setPicks(chosen);
    const now = Date.now();
    for (const s of chosen) shown.set(s.id, now);
    writeShown(shown);
  }, [snippets, refCounts]);

  const dismiss = useCallback((id: string) => {
    setPicks((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { picks, dismiss };
}
