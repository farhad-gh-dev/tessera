import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Snippet } from '@tessera/core';
import { AuthScreen } from '../shared/auth';
import { Wordmark } from '../shared/brand';
import { RichText } from '../shared/rich-text';
import {
  deleteSnippet as requestDelete,
  getAuthState,
  signOut as requestSignOut,
  type User,
} from '../shared/messages';

const env = import.meta.env as Record<string, string | undefined>;
const PLATFORM_URL = env.VITE_WEB_URL ?? 'http://localhost:3001';

// The side panel needs Chrome 116+ (`sidePanel.open`); hide the doorway otherwise (OPN-4).
const sidePanelSupported =
  typeof chrome !== 'undefined' && typeof chrome.sidePanel?.open === 'function';
const HINT_KEY = 'tessera:panel-hint-dismissed';

export function App() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [total, setTotal] = useState(0);
  const [unresolved, setUnresolved] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Cache the window id on load so opening the panel stays inside the click
  // gesture — calling sidePanel.open() after an await would drop it (OPN-2, §9).
  const [windowId, setWindowId] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);

  const loadSnippets = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = (await chrome.runtime.sendMessage({
      type: 'tessera:get-snippets',
      url: tab?.url ?? '',
    })) as { snippets?: Snippet[]; total?: number } | undefined;
    const list = response?.snippets ?? [];
    setSnippets(list);
    setTotal(response?.total ?? 0);
    // Best-effort: ask the page's content script how many of these re-located (ANC-4).
    let missing = 0;
    if (tab?.id != null && list.length > 0) {
      try {
        const status = (await chrome.tabs.sendMessage(tab.id, {
          type: 'tessera:get-status',
        })) as { resolved?: number } | undefined;
        if (typeof status?.resolved === 'number') {
          missing = Math.max(0, list.length - status.resolved);
        }
      } catch {
        // no content script on this page (e.g. opened before install); skip the hint
      }
    }
    setUnresolved(missing);
  }, []);

  const refresh = useCallback(async () => {
    const state = await getAuthState();
    setConfigured(state.configured);
    setUser(state.user);
    if (state.user) await loadSnippets();
    setLoading(false);
  }, [loadSnippets]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pre-fetch the window id and the "introduce the panel" hint state (NAV-4).
  useEffect(() => {
    if (!sidePanelSupported) return;
    void chrome.windows.getCurrent().then((w) => setWindowId(w.id ?? null));
    void chrome.storage.local.get(HINT_KEY).then((r) => setShowHint(!r[HINT_KEY]));
  }, []);

  function dismissHint() {
    setShowHint(false);
    void chrome.storage.local.set({ [HINT_KEY]: true });
  }

  function openSidePanel() {
    dismissHint();
    if (windowId != null) {
      // Synchronous within the gesture — no await before this call (OPN-2).
      void chrome.sidePanel.open({ windowId });
      window.close(); // the popup closes on blur anyway
    } else {
      // Window id not cached yet (rare) — fall back to the web app rather than
      // risk an await that would drop the user gesture (OPN-4 spirit).
      void chrome.tabs.create({ url: PLATFORM_URL });
    }
  }

  async function signOut() {
    await requestSignOut();
    setUser(null);
    setSnippets([]);
    setTotal(0);
    setUnresolved(0);
  }

  async function startScreenshot() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    try {
      // Inject the overlay on demand so it works even when the content script
      // isn't running in this tab (e.g. a page opened before the extension).
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: screenshotOverlay,
      });
      window.close();
    } catch (error) {
      console.error('[Tessera] screenshot is unavailable on this page', error);
    }
  }

  async function deleteSnippet(id: string) {
    setConfirmId(null);
    // Optimistic: drop it from the list immediately, then persist + sync.
    setSnippets((prev) => prev.filter((snippet) => snippet.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    await requestDelete(id);
    // Best-effort: tell the page to re-paint so a deleted highlight disappears.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      void chrome.tabs.sendMessage(tab.id, { type: 'tessera:refresh-highlights' }).catch(() => {});
    }
  }

  return (
    <div className="w-96 p-4 font-sans text-slate-800">
      {/* Zone A — account / header */}
      <header className="mb-3 flex items-center justify-between">
        <Wordmark />
        {user && total > 0 && (
          <span
            className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
            title="Items in your library"
          >
            {total}
          </span>
        )}
      </header>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !configured ? (
        <p className="text-sm text-slate-500">
          Cloud sync isn’t configured — set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, then rebuild.
        </p>
      ) : !user ? (
        <AuthScreen
          onSignedIn={(u) => {
            setUser(u);
            void loadSnippets();
          }}
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="truncate text-slate-500">{user.email}</span>
            <button
              type="button"
              className="shrink-0 text-indigo-600 hover:underline"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>

          {/* Zone B — actions & doorways (POP-2/POP-3): one compact row; the
              side-panel doorway is promoted so it reads distinctly from the rest. */}
          <section aria-label="Actions" className="mb-3">
            <div className={`grid gap-2 ${sidePanelSupported ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <ActionTile
                onClick={() => void startScreenshot()}
                label="Screenshot"
                title="Capture a screenshot region"
                icon={<CaptureIcon />}
              />
              {sidePanelSupported && (
                <ActionTile
                  onClick={openSidePanel}
                  label="Side panel"
                  title="Open the side panel — browse your library while you read"
                  icon={<PanelIcon />}
                  primary
                />
              )}
              <ActionTile
                onClick={() => void chrome.tabs.create({ url: PLATFORM_URL })}
                label="Library"
                title="Open my library in a new tab"
                icon={<ExternalIcon />}
              />
            </div>
            {sidePanelSupported && showHint && (
              <div className="mt-2">
                <PanelHint onDismiss={dismissHint} />
              </div>
            )}
          </section>

          {/* Zone C — content (this page) */}
          {unresolved > 0 && (
            <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
              {unresolved} {unresolved === 1 ? 'highlight' : 'highlights'} saved here couldn’t be
              re-located on this page.
            </p>
          )}
          {snippets.length === 0 ? (
            total === 0 ? (
              <GettingStarted />
            ) : (
              <PageEmpty total={total} />
            )
          ) : (
            <ul className="space-y-2">
              {snippets.map((snippet) => (
                <SnippetRow
                  key={snippet.id}
                  snippet={snippet}
                  confirming={confirmId === snippet.id}
                  onAskDelete={() => setConfirmId(snippet.id)}
                  onCancelDelete={() => setConfirmId(null)}
                  onConfirmDelete={() => void deleteSnippet(snippet.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** NAV-4: introduce the side panel once — it's easy to miss. Dismissal persists. */
function PanelHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-indigo-50 px-2.5 py-2 text-xs text-indigo-700">
      <p className="flex-1">
        New: browse your whole library here while you read — it stays open as you switch tabs.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

interface ActionTileProps {
  onClick: () => void;
  label: string;
  title: string;
  icon: ReactNode;
  primary?: boolean;
}

/** One tile in the popup's action row: an icon over a short label (POP-2/3). */
function ActionTile({ onClick, label, title, icon, primary }: ActionTileProps) {
  const tone = primary
    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
    : 'border border-slate-200 text-slate-600 hover:bg-slate-50';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-md px-1 py-2.5 text-xs font-medium ${tone}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function CaptureIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3 7V5.5A2.5 2.5 0 0 1 5.5 3H7M13 3h1.5A2.5 2.5 0 0 1 17 5.5V7M17 13v1.5a2.5 2.5 0 0 1-2.5 2.5H13M7 17H5.5A2.5 2.5 0 0 1 3 14.5V13" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 3.5v13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
    </svg>
  );
}

/** First-run guide (PRD ON-2): shown when the library is completely empty. */
function GettingStarted() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Welcome to Tessera. Capture anything worth remembering — it lands in your synced library,
        grouped by site.
      </p>
      <ol className="space-y-2 text-sm text-slate-700">
        <li className="flex gap-2">
          <StepBadge n={1} />
          <span>
            <span className="font-medium">Highlight text</span> on the page, then click{' '}
            <span className="font-medium">Save to Tessera</span>.
          </span>
        </li>
        <li className="flex gap-2">
          <StepBadge n={2} />
          <span>
            <span className="font-medium">Right-click an image</span> →{' '}
            <span className="font-medium">Save to Tessera</span>.
          </span>
        </li>
        <li className="flex gap-2">
          <StepBadge n={3} />
          <span>
            Hit <span className="font-medium">Capture screenshot region</span> above to clip part of
            the page.
          </span>
        </li>
      </ol>
      <p className="text-xs text-slate-400">
        Saved items sync privately to your account and re-highlight when you come back.
      </p>
    </div>
  );
}

/** Per-page empty state (PRD ON-3): a library exists, but nothing on this page yet. */
function PageEmpty({ total }: { total: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">Nothing saved on this page yet.</p>
      <p className="text-xs text-slate-500">
        Highlight text and click <span className="font-medium">Save to Tessera</span>, right-click
        an image, or capture a screenshot region above.
      </p>
      <p className="text-xs text-slate-400">
        {total} {total === 1 ? 'item' : 'items'} in your library — open the side panel to browse
        them all.
      </p>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
      {n}
    </span>
  );
}

interface SnippetRowProps {
  snippet: Snippet;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function SnippetRow(props: SnippetRowProps) {
  const { snippet } = props;
  return (
    <li className="group flex items-start gap-2 rounded-md border border-slate-200 p-2 text-sm text-slate-700">
      <div className="min-w-0 flex-1">
        {snippet.type === 'text' ? (
          <RichText snippet={snippet} className="line-clamp-3" />
        ) : (
          <p className="italic text-slate-500">
            {snippet.type === 'screenshot' ? 'Screenshot' : 'Image'}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Open in Tessera"
        title="Open in Tessera"
        onClick={() => void chrome.tabs.create({ url: `${PLATFORM_URL}/snippet/${snippet.id}` })}
        className="shrink-0 rounded p-0.5 text-slate-300 transition-colors hover:bg-indigo-50 hover:text-indigo-600 group-hover:text-slate-400"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
        </svg>
      </button>
      {props.confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={props.onConfirmDelete}
            className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={props.onCancelDelete}
            className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label="Delete snippet"
          title="Delete"
          onClick={props.onAskDelete}
          className="shrink-0 rounded p-0.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600 group-hover:text-slate-400"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.583.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482 41.03 41.03 0 0 0-2.365-.298V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </li>
  );
}

/**
 * Injected into the active tab to capture a screenshot region. Must be
 * self-contained (no imports or closures over module scope) so
 * `chrome.scripting.executeScript` can serialize it. On mouse-up it posts the
 * region to the background, which crops the captured tab and uploads it.
 */
function screenshotOverlay(): void {
  if (document.getElementById('tessera-screenshot-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'tessera-screenshot-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'rgba(15, 23, 42, 0.08)',
  });

  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    border: '2px solid #4f46e5',
    background: 'rgba(99, 102, 241, 0.15)',
    display: 'none',
    pointerEvents: 'none',
  });
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;

  function cleanup(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') cleanup();
  }
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('mousedown', (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    Object.assign(box.style, {
      left: `${startX}px`,
      top: `${startY}px`,
      width: '0px',
      height: '0px',
      display: 'block',
    });
  });

  overlay.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    Object.assign(box.style, {
      left: `${Math.min(startX, event.clientX)}px`,
      top: `${Math.min(startY, event.clientY)}px`,
      width: `${Math.abs(event.clientX - startX)}px`,
      height: `${Math.abs(event.clientY - startY)}px`,
    });
  });

  overlay.addEventListener('mouseup', (event) => {
    dragging = false;
    const rect = {
      x: Math.min(startX, event.clientX),
      y: Math.min(startY, event.clientY),
      width: Math.abs(event.clientX - startX),
      height: Math.abs(event.clientY - startY),
    };
    cleanup();
    if (rect.width < 5 || rect.height < 5) return;
    // Let the overlay removal paint before the background captures the tab.
    setTimeout(() => {
      void chrome.runtime.sendMessage({
        type: 'tessera:screenshot',
        payload: {
          rect,
          dpr: window.devicePixelRatio || 1,
          url: location.href,
          domain: new URL(location.href).hostname,
          pageTitle: document.title,
        },
      });
    }, 60);
  });
}
