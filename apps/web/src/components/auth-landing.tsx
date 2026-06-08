'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { Button, Card, Input } from '@/components/ui';

/**
 * Signed-out landing + sign-in (PRD ON-1, web half). Auth is magic-link with an
 * email/password fallback (founder decision, PRD §15.1). The provider's
 * `onAuthStateChange` listener handles the transition into the library on
 * success, so this component only drives the form and surfaces errors/notices.
 */
export function AuthLanding() {
  const { supabase, configured } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = email.trim() !== '' && password !== '' && !busy;

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (!supabase) return;
    await withBusy(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    });
  }

  async function signUp() {
    if (!supabase) return;
    await withBusy(async () => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (!data.session) setNotice('Check your email to confirm, then sign in.');
    });
  }

  async function magicLink() {
    if (!supabase || email.trim() === '') {
      setError('Enter your email first.');
      return;
    }
    await withBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else setNotice('Check your email for a one-click sign-in link.');
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-indigo-600" />
        <span className="text-2xl font-semibold tracking-tight text-slate-900">Tessera</span>
      </div>

      <h1 className="text-xl font-semibold text-slate-900">
        Your synced study library
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
        Everything you highlight on the web — text, images, and screenshots — in one
        private place, auto-organized by source. Sign in to see it all.
      </p>

      <Card className="mt-6 p-5">
        {!configured ? (
          <p className="text-sm text-slate-500">
            Cloud sync isn’t configured — set <code className="text-slate-700">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
            and <code className="text-slate-700">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{' '}
            <code className="text-slate-700">.env</code>, then restart.
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) void signIn();
            }}
          >
            <Input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}
            {notice && <p className="text-sm text-emerald-600">{notice}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={!canSubmit} className="flex-1">
                Sign in
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!canSubmit}
                onClick={() => void signUp()}
                className="flex-1"
              >
                Create account
              </Button>
            </div>

            <div className="relative py-1 text-center">
              <span className="bg-white px-2 text-xs text-slate-400">or</span>
              <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-slate-200" />
            </div>

            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void magicLink()}
              className="w-full"
            >
              Email me a sign-in link
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-slate-400">
        Capture highlights with the Tessera browser extension.
      </p>
    </main>
  );
}
