import { useMemo, useState } from 'react';
import {
  buildTextFragmentUrl,
  highlightColorOf,
  matchesQuery,
  typeLabel,
  type Snippet,
  type SnippetType,
} from '@tessera/core';
import { AuthScreen, useAuthState } from '../shared/auth';
import { Wordmark } from '../shared/brand';
import {
  deleteSnippet as requestDelete,
  recolorSnippet as requestRecolor,
  refreshTabHighlights,
  signOut as requestSignOut,
} from '../shared/messages';
import {
  useActiveTab,
  useChangePing,
  useLiveSnippets,
  useResolvedCount,
  useSnippetTagNames,
} from './hooks';
import { SnippetCard } from './SnippetCard';

const env = import.meta.env as Record<string, string | undefined>;
const PLATFORM_URL = env.VITE_WEB_URL ?? 'http://localhost:3001';

type Scope = 'recent' | 'page';

const TYPES: SnippetType[] = ['text', 'image', 'screenshot'];

export function App() {
  const { loading, configured, user, setUser } = useAuthState();
  const tick = useChangePing();
  const active = useActiveTab();
  const snippets = useLiveSnippets(user?.id, tick);
  const tagNames = useSnippetTagNames(user?.id, tick);

  const [scope, setScope] = useState<Scope>('page');
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilters, setTypeFilters] = useState<SnippetType[]>([]);
  const [colorFilters, setColorFilters] = useState<string[]>([]);

  // Single-open-at-a-time per-row UI, plus optimistic overlays so actions
  // repaint before the background write round-trips (SP-5).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [recolorId, setRecolorId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});

  const allLive = useMemo(
    () => (snippets ?? []).filter((s) => !deletedIds.has(s.id)),
    [snippets, deletedIds],
  );

  // Colors actually present, for the color filter (LIB-4 at panel scale, SP-6).
  const presentColors = useMemo(() => {
    const seen = new Set<string>();
    for (const s of allLive) if (s.color) seen.add(s.color);
    return [...seen];
  }, [allLive]);

  const visible = useMemo(() => {
    const typeSet = new Set(typeFilters);
    const colorSet = new Set(colorFilters);
    return allLive.filter((s) => {
      if (scope === 'page' && (!active.url || s.url !== active.url)) return false;
      if (typeSet.size > 0 && !typeSet.has(s.type)) return false;
      if (colorSet.size > 0 && !(s.color && colorSet.has(s.color))) return false;
      return matchesQuery(s, query, tagNames.get(s.id) ?? []);
    });
  }, [allLive, scope, active.url, typeFilters, colorFilters, query, tagNames]);

  // This-page unresolved hint (ANC-4): captures on this page that the content
  // script couldn't re-locate. Only meaningful in the This-page view.
  const pageCount = useMemo(
    () => (active.url ? allLive.filter((s) => s.url === active.url).length : 0),
    [allLive, active.url],
  );
  // Only probe the page's content script in the This-page view (where the hint shows).
  const resolved = useResolvedCount(
    scope === 'page' ? active.tabId : undefined,
    `${active.url}|${pageCount}|${tick}`,
  );
  const unresolved = resolved != null ? Math.max(0, pageCount - resolved) : 0;

  function withOverrides(s: Snippet): Snippet {
    const color = colorOverrides[s.id];
    return color ? { ...s, color } : s;
  }

  function openSource(s: Snippet) {
    void chrome.tabs.create({ url: buildTextFragmentUrl(s.url, s.anchor) });
  }
  function openWeb(s: Snippet) {
    void chrome.tabs.create({ url: `${PLATFORM_URL}/snippet/${s.id}` });
  }
  async function doDelete(id: string) {
    setConfirmId(null);
    setDeletedIds((prev) => new Set(prev).add(id));
    await requestDelete(id);
    if (active.tabId != null) refreshTabHighlights(active.tabId);
  }
  async function doRecolor(id: string, hex: string) {
    setRecolorId(null);
    setColorOverrides((m) => ({ ...m, [id]: hex }));
    await requestRecolor(id, hex);
    if (active.tabId != null) refreshTabHighlights(active.tabId);
  }
  async function handleSignOut() {
    await requestSignOut();
    setUser(null);
  }

  const filtersActive = typeFilters.length > 0 || colorFilters.length > 0;

  return (
    <div className="flex h-screen flex-col bg-slate-50 font-sans text-slate-800">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
        <Wordmark />
        <div className="flex items-center gap-2">
          {/* SP-10 (M5 seam): an "Ask AI about these captures" action belongs in
              this header slot. Reserved intentionally; not built this pass. */}
          {user && snippets && (
            <span
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
              title="Items in your library"
            >
              {snippets.length}
            </span>
          )}
          {user && (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <p className="p-4 text-sm text-slate-400">Loading…</p>
      ) : !configured ? (
        <p className="p-4 text-sm text-slate-500">
          Cloud sync isn’t configured — set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, then rebuild.
        </p>
      ) : !user ? (
        <div className="p-4">
          <AuthScreen onSignedIn={setUser} />
        </div>
      ) : (
        <>
          <div className="space-y-2 border-b border-slate-200 bg-white px-3 py-2">
            <SearchInput value={query} onChange={setQuery} />
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-slate-200 p-0.5 text-xs font-medium">
                <SegBtn active={scope === 'page'} onClick={() => setScope('page')}>
                  This page
                </SegBtn>
                <SegBtn active={scope === 'recent'} onClick={() => setScope('recent')}>
                  Recent
                </SegBtn>
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-pressed={showFilters}
                className={`ml-auto rounded-md border px-2 py-1 text-xs font-medium ${
                  filtersActive || showFilters
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                Filters{filtersActive ? ` · ${typeFilters.length + colorFilters.length}` : ''}
              </button>
            </div>

            {showFilters && (
              <FilterPanel
                typeFilters={typeFilters}
                colorFilters={colorFilters}
                presentColors={presentColors}
                onToggleType={(t) =>
                  setTypeFilters((prev) =>
                    prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                  )
                }
                onToggleColor={(c) =>
                  setColorFilters((prev) =>
                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                  )
                }
                onClear={() => {
                  setTypeFilters([]);
                  setColorFilters([]);
                }}
              />
            )}

            {scope === 'page' && unresolved > 0 && (
              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                {unresolved} {unresolved === 1 ? 'highlight' : 'highlights'} saved here couldn’t be
                re-located on this page.
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            {snippets == null ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : snippets.length === 0 ? (
              <PanelEmpty platformUrl={PLATFORM_URL} />
            ) : visible.length === 0 ? (
              <NoResults scope={scope} hasQueryOrFilter={query.trim() !== '' || filtersActive} />
            ) : (
              <ul className="space-y-2">
                {visible.map((s) => (
                  <SnippetCard
                    key={s.id}
                    snippet={withOverrides(s)}
                    expanded={scope === 'page'}
                    confirming={confirmId === s.id}
                    recoloring={recolorId === s.id}
                    onOpenSource={() => openSource(s)}
                    onOpenWeb={() => openWeb(s)}
                    onToggleRecolor={() => setRecolorId((id) => (id === s.id ? null : s.id))}
                    onRecolor={(hex) => void doRecolor(s.id, hex)}
                    onAskDelete={() => setConfirmId(s.id)}
                    onCancelDelete={() => setConfirmId(null)}
                    onConfirmDelete={() => void doDelete(s.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <footer className="border-t border-slate-200 bg-white px-3 py-2">
            {/* SP-11: the organize path this pass — the web app owns documents,
                add-to-document, export, and (M5) AI. The panel browses. */}
            <button
              type="button"
              onClick={() => void chrome.tabs.create({ url: `${PLATFORM_URL}/documents` })}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Open full library ↗
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
      <input
        type="search"
        aria-label="Search your captures"
        placeholder="Search text, notes, titles…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-2 text-sm placeholder:text-slate-400"
      />
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2.5 py-1 ${
        active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

interface FilterPanelProps {
  typeFilters: SnippetType[];
  colorFilters: string[];
  presentColors: string[];
  onToggleType: (t: SnippetType) => void;
  onToggleColor: (c: string) => void;
  onClear: () => void;
}

function FilterPanel(props: FilterPanelProps) {
  const anyActive = props.typeFilters.length > 0 || props.colorFilters.length > 0;
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs font-medium text-slate-400">Type</span>
        {TYPES.map((t) => {
          const on = props.typeFilters.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => props.onToggleType(t)}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                on
                  ? 'bg-indigo-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {typeLabel(t)}
            </button>
          );
        })}
      </div>
      {props.presentColors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs font-medium text-slate-400">Color</span>
          {props.presentColors.map((c) => {
            const on = props.colorFilters.includes(c);
            const known = highlightColorOf(c);
            return (
              <button
                key={c}
                type="button"
                aria-label={`${known?.label ?? c} highlights`}
                aria-pressed={on}
                title={known?.label ?? c}
                onClick={() => props.onToggleColor(c)}
                className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10"
                style={{
                  background: known?.hex ?? c,
                  outline: on ? '2px solid #4f46e5' : undefined,
                  outlineOffset: 1,
                }}
              />
            );
          })}
        </div>
      )}
      {anyActive && (
        <button
          type="button"
          onClick={props.onClear}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/** SP-12: nothing captured yet — teach what the panel is for, point to the web app. */
function PanelEmpty({ platformUrl }: { platformUrl: string }) {
  return (
    <div className="space-y-3 px-1 py-6 text-center">
      <p className="text-sm font-medium text-slate-700">Your captures will show up here</p>
      <p className="text-xs text-slate-500">
        Highlight text on any page and click <span className="font-medium">Save to Tessera</span>,
        right-click an image, or capture a screenshot region from the toolbar popup. This panel
        stays open while you read so your library is always one glance away.
      </p>
      <p className="text-xs text-slate-400">
        Ready to organize captures into documents?{' '}
        <button
          type="button"
          onClick={() => void chrome.tabs.create({ url: `${platformUrl}/documents` })}
          className="font-medium text-indigo-600 hover:underline"
        >
          Open the web app ↗
        </button>
      </p>
    </div>
  );
}

function NoResults({ scope, hasQueryOrFilter }: { scope: Scope; hasQueryOrFilter: boolean }) {
  if (hasQueryOrFilter) {
    return <p className="px-1 py-6 text-center text-sm text-slate-400">No captures match.</p>;
  }
  return (
    <p className="px-1 py-6 text-center text-sm text-slate-400">
      {scope === 'page'
        ? 'Nothing saved on this page yet.'
        : 'Nothing here yet.'}
    </p>
  );
}
