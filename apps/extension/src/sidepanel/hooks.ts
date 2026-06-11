import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Snippet } from '@tessera/core';
import { getDb } from '../shared/db';

/* -------------------------------------------------------------------------- */
/* Live reads from the shared extension-origin Dexie (DATA-2, §12.3)          */
/* -------------------------------------------------------------------------- */

/**
 * Live, newest-first list of the signed-in user's non-deleted snippets across
 * every page (SP-2). `useLiveQuery` re-runs whenever the local store changes;
 * `tick` (from {@link useChangePing}) is folded into the deps as a belt-and-
 * suspenders re-query in case a background write doesn't propagate its Dexie
 * change across the SW↔page boundary (the §12.3 fallback). `undefined` while the
 * first read is in flight.
 */
export function useLiveSnippets(
  userId: string | undefined,
  tick: number,
): Snippet[] | undefined {
  return useLiveQuery(async () => {
    if (!userId) return [];
    const rows = (await getDb().snippets.toArray()) as Snippet[];
    return rows
      .filter((s) => s.deletedAt == null && s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [userId, tick]);
}

/**
 * Map of snippetId → attached tag names, for folding tags into search (SP-3).
 * Reads the local `tags` / `snippet_tags` tables, which exist in the Dexie
 * schema but stay **empty in the extension this pass**: scope A keeps the
 * SyncEngine at `['snippets']` (DATA-5), so no tags sync down yet. This is
 * therefore dormant today and lights up for free once the organize pass widens
 * sync (§11) — no panel change needed then.
 */
export function useSnippetTagNames(
  userId: string | undefined,
  tick: number,
): Map<string, string[]> {
  const map = useLiveQuery(async () => {
    const result = new Map<string, string[]>();
    if (!userId) return result;
    const [joins, tags] = await Promise.all([
      getDb().snippet_tags.toArray(),
      getDb().tags.toArray(),
    ]);
    const nameById = new Map(
      tags.filter((t) => t.deletedAt == null && t.userId === userId).map((t) => [t.id, t.name]),
    );
    for (const j of joins) {
      if (j.deletedAt != null || j.userId !== userId) continue;
      const name = nameById.get(j.tagId);
      if (!name) continue;
      const arr = result.get(j.snippetId);
      if (arr) arr.push(name);
      else result.set(j.snippetId, [name]);
    }
    return result;
  }, [userId, tick]);
  return map ?? new Map<string, string[]>();
}

/* -------------------------------------------------------------------------- */
/* Reactive re-query trigger (the §12.3 broadcast fallback)                   */
/* -------------------------------------------------------------------------- */

/**
 * Increments on each `tessera:changed` broadcast from the background (a capture,
 * delete, recolor, or a sync pull that wrote rows). Bursts are debounced into a
 * single bump so a multi-row pull doesn't thrash re-queries (NFR §8).
 */
export function useChangePing(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onMessage(message: { type?: string }) {
      if (message?.type !== 'tessera:changed') return;
      clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), 120);
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, []);
  return tick;
}

/* -------------------------------------------------------------------------- */
/* Active tab (for the This-page view, SP-4)                                  */
/* -------------------------------------------------------------------------- */

export interface ActiveTab {
  tabId?: number;
  url?: string;
  title?: string;
  faviconUrl?: string;
}

/**
 * The active tab *in the panel's own window*. Because the panel is global (one
 * per window, opened by `windowId`, OPN-2), "the page you're reading" is the
 * active tab of this window — which changes as the user switches tabs or
 * navigates. Re-reads on `onActivated` (this window) and on the active tab's
 * url/load updates, so the This-page view re-scopes live (SP-4).
 */
export function useActiveTab(): ActiveTab {
  const [tab, setTab] = useState<ActiveTab>({});
  const tabIdRef = useRef<number | undefined>(undefined);
  const windowIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function readActive() {
      try {
        const [t] = await chrome.tabs.query({ active: true, windowId: windowIdRef.current });
        if (cancelled) return;
        tabIdRef.current = t?.id;
        setTab(
          t ? { tabId: t.id, url: t.url, title: t.title, faviconUrl: t.favIconUrl } : {},
        );
      } catch {
        /* tab gone / not queryable — leave last known */
      }
    }

    function onActivated(info: chrome.tabs.OnActivatedInfo) {
      if (windowIdRef.current == null || info.windowId === windowIdRef.current) void readActive();
    }
    function onUpdated(tabId: number, change: chrome.tabs.OnUpdatedInfo) {
      if (tabId === tabIdRef.current && (change.url || change.status === 'complete')) {
        void readActive();
      }
    }

    void chrome.windows
      .getCurrent()
      .then((w) => {
        windowIdRef.current = w.id;
        void readActive();
      })
      .catch(() => void readActive());

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return tab;
}

/**
 * How many of this page's saved highlights the content script actually
 * re-located, asked live (ANC-4 parity with the popup). `null` when there's no
 * content script on the tab (e.g. a `chrome://` page, or one opened before
 * install) — the caller then simply shows no hint. Re-runs when the tab or the
 * data changes.
 */
export function useResolvedCount(tabId: number | undefined, dep: unknown): number | null {
  const [resolved, setResolved] = useState<number | null>(null);
  useEffect(() => {
    if (tabId == null) {
      setResolved(null);
      return;
    }
    let active = true;
    void chrome.tabs
      .sendMessage(tabId, { type: 'tessera:get-status' })
      .then((r: { resolved?: number } | undefined) => {
        if (active) setResolved(typeof r?.resolved === 'number' ? r.resolved : null);
      })
      .catch(() => {
        if (active) setResolved(null);
      });
    return () => {
      active = false;
    };
  }, [tabId, dep]);
  return resolved;
}
