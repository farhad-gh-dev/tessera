import { useEffect, useState } from 'react';
import { authenticate, getAuthState, type User } from './messages';

/**
 * Auth UI + state shared by the popup and the side panel, so the panel's
 * signed-out screen matches the popup exactly (§9) and "one identity" reads the
 * same everywhere (DATA-1). The background owns the session; these just call it.
 */

/** One-line value prop above the sign-in box so the first screen isn't a cold login. */
export function WelcomeIntro() {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-800">Save anything worth remembering</h2>
      <p className="mt-1 text-xs text-slate-500">
        Highlight text, images, and screenshots from any page into one private, synced library.
      </p>
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

export function SignInForm(props: SignInFormProps) {
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
        New here? Pick a password and choose <span className="font-medium">Create account</span>.
      </p>
    </form>
  );
}

/**
 * The shared signed-out screen: value-prop intro + sign-in form, wired to the
 * background auth handlers. Calls `onSignedIn` once a session exists.
 */
export function AuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(type: 'auth:sign-in' | 'auth:sign-up') {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await authenticate(type, email, password);
    setBusy(false);
    if (res.error) setError(res.error);
    else if (res.needsConfirmation) setNotice('Check your email to confirm, then sign in.');
    else if (res.user) {
      setPassword('');
      onSignedIn(res.user);
    }
  }

  return (
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
        onSignIn={() => void run('auth:sign-in')}
        onSignUp={() => void run('auth:sign-up')}
      />
    </>
  );
}

interface AuthStateValue {
  loading: boolean;
  configured: boolean;
  user: User | null;
  setUser: (user: User | null) => void;
}

/**
 * Live auth state for a surface. Fetches once on mount, and re-checks when the
 * background broadcasts `tessera:auth-changed` (sign-in/out in another surface)
 * or the window regains focus — so "sign-in/out in any surface is reflected in
 * the others" holds without a second session (DATA-1).
 */
export function useAuthState(): AuthStateValue {
  const [state, setState] = useState<{ loading: boolean; configured: boolean; user: User | null }>(
    { loading: true, configured: true, user: null },
  );

  useEffect(() => {
    let active = true;
    const refetch = () =>
      void getAuthState().then((s) => {
        if (active) setState({ loading: false, configured: s.configured, user: s.user });
      });
    refetch();

    function onMessage(message: { type?: string }) {
      if (message?.type === 'tessera:auth-changed') refetch();
    }
    function onFocus() {
      refetch();
    }
    chrome.runtime.onMessage.addListener(onMessage);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(onMessage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return {
    ...state,
    setUser: (user) => setState((s) => ({ ...s, user })),
  };
}
