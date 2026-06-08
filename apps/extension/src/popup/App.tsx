import { useCallback, useEffect, useState } from 'react';
import type { Snippet } from '@tessera/core';

interface User {
  id: string;
  email?: string;
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [total, setTotal] = useState(0);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const loadSnippets = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = (await chrome.runtime.sendMessage({
      type: 'tessera:get-snippets',
      url: tab?.url ?? '',
    })) as { snippets?: Snippet[]; total?: number } | undefined;
    setSnippets(response?.snippets ?? []);
    setTotal(response?.total ?? 0);
  }, []);

  const refresh = useCallback(async () => {
    const state = (await chrome.runtime.sendMessage({ type: 'auth:get-state' })) as {
      configured: boolean;
      user: User | null;
    };
    setConfigured(state.configured);
    setUser(state.user);
    if (state.user) await loadSnippets();
    setLoading(false);
  }, [loadSnippets]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function authenticate(type: 'auth:sign-in' | 'auth:sign-up') {
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = (await chrome.runtime.sendMessage({ type, email, password })) as {
      user?: User | null;
      error?: string;
      needsConfirmation?: boolean;
    };
    setBusy(false);
    if (response.error) {
      setError(response.error);
    } else if (response.needsConfirmation) {
      setNotice('Check your email to confirm, then sign in.');
    } else if (response.user) {
      setUser(response.user);
      setPassword('');
      await loadSnippets();
    }
  }

  async function signOut() {
    await chrome.runtime.sendMessage({ type: 'auth:sign-out' });
    setUser(null);
    setSnippets([]);
    setTotal(0);
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
    await chrome.runtime.sendMessage({ type: 'tessera:delete', id });
    // Best-effort: tell the page to re-paint so a deleted highlight disappears.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      void chrome.tabs
        .sendMessage(tab.id, { type: 'tessera:refresh-highlights' })
        .catch(() => {});
    }
  }

  return (
    <div className="w-80 p-4 font-sans text-slate-800">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-indigo-600" />
          <h1 className="text-lg font-semibold">Tessera</h1>
        </div>
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
        <>
          <WelcomeIntro />
          <SignInForm
            email={email}
            password={password}
            busy={busy}
            error={error}
            notice={notice}
            onEmail={setEmail}
            onPassword={setPassword}
            onSignIn={() => void authenticate('auth:sign-in')}
            onSignUp={() => void authenticate('auth:sign-up')}
          />
        </>
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
          <button
            type="button"
            onClick={() => void startScreenshot()}
            className="mb-3 w-full rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Capture screenshot region
          </button>
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

interface SignInFormProps {
  email: string;
  password: string;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSignIn: () => void;
  onSignUp: () => void;
}

function SignInForm(props: SignInFormProps) {
  const canSubmit = props.email.trim() !== '' && props.password !== '' && !props.busy;
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) props.onSignIn();
      }}
    >
      <input
        type="email"
        placeholder="Email"
        autoComplete="email"
        value={props.email}
        onChange={(event) => props.onEmail(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        value={props.password}
        onChange={(event) => props.onPassword(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      {props.error && <p className="text-sm text-red-600">{props.error}</p>}
      {props.notice && <p className="text-sm text-emerald-600">{props.notice}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Sign in
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={props.onSignUp}
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Create account
        </button>
      </div>
      <p className="pt-0.5 text-xs text-slate-400">
        New here? Pick a password and choose{' '}
        <span className="font-medium">Create account</span>.
      </p>
    </form>
  );
}

/** One-line value prop above the sign-in box so the first screen isn't a cold login. */
function WelcomeIntro() {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-800">
        Save anything worth remembering
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Highlight text, images, and screenshots from any page into one private, synced
        library.
      </p>
    </div>
  );
}

/** First-run guide (PRD ON-2): shown when the library is completely empty. */
function GettingStarted() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Welcome to Tessera. Capture anything worth remembering — it lands in your
        synced library, grouped by site.
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
            Hit <span className="font-medium">Capture screenshot region</span> above to
            clip part of the page.
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
        Highlight text and click <span className="font-medium">Save to Tessera</span>,
        right-click an image, or capture a screenshot region above.
      </p>
      <p className="text-xs text-slate-400">
        {total} {total === 1 ? 'item' : 'items'} in your library.
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
          <p className="line-clamp-3">{snippet.text}</p>
        ) : (
          <p className="italic text-slate-500">
            {snippet.type === 'screenshot' ? 'Screenshot' : 'Image'}
          </p>
        )}
      </div>
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
