'use client';

import { useEffect, useRef } from 'react';

/**
 * Save & restore window scroll across SPA navigation (e.g. snippet → Back),
 * keyed by view so each filtered view restores independently (SCALE-2).
 *
 * Two things make this fiddly, and both are handled here:
 *  - **Don't let a scroll-to-top clobber the saved offset.** Next resets scroll to
 *    0 on navigation, which fires a `scroll` event; saving that 0 would wipe the
 *    real position before Back can read it. So we never persist `scrollY <= 0`.
 *  - **The data loads async (local-first), and Next resets scroll on arrival.** So
 *    we re-assert the saved offset for a few frames until the (async, virtualized)
 *    content is tall enough and the scroll sticks.
 *
 * Restores at most once per mount, so changing a filter later never yanks scroll.
 */
export function useScrollRestoration(key: string, ready: boolean) {
  const restored = useRef(false);

  useEffect(() => {
    const save = () => {
      const y = window.scrollY;
      if (y <= 0) return; // a programmatic scroll-to-top must not clobber a real offset
      try {
        sessionStorage.setItem(`tsr:scroll:${key}`, String(y));
      } catch {
        /* sessionStorage unavailable (private mode / quota) — non-fatal */
      }
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [key]);

  useEffect(() => {
    if (restored.current || !ready) return;
    restored.current = true;

    let target: number;
    try {
      const raw = sessionStorage.getItem(`tsr:scroll:${key}`);
      if (raw == null) return;
      target = Number.parseInt(raw, 10);
    } catch {
      return;
    }
    if (Number.isNaN(target) || target <= 0) return;

    let cancelled = false;
    let frames = 0;
    let stable = 0;
    const tick = () => {
      if (cancelled) return;
      if (Math.abs(window.scrollY - target) > 2) {
        window.scrollTo(0, target); // keep re-asserting as content grows / over Next's reset
        stable = 0;
      } else {
        stable += 1;
      }
      frames += 1;
      // Stop once the offset has held for a few frames, or after ~0.75s.
      if (stable < 4 && frames < 45) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [ready, key]);
}
