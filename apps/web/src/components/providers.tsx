'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { SyncEngine } from '@tessera/db';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { createEngine } from '@/lib/db';

type SessionStatus = 'loading' | 'signed-in' | 'signed-out';

interface SessionContextValue {
  status: SessionStatus;
  configured: boolean;
  user: User | null;
  supabase: SupabaseClient | null;
  /** True while a sync round-trip is in flight. */
  syncing: boolean;
  /** Epoch ms of the last successful sync, or null. */
  lastSyncedAt: number | null;
  /** Push local changes + pull remote deltas now. */
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within <Providers>');
  return value;
}

const PERIODIC_SYNC_MS = 60_000;

export function Providers({ children }: { children: ReactNode }) {
  // Same on server (null) and first client render ('loading' when configured),
  // so hydration matches; effects then resolve the real auth state.
  const [supabase] = useState<SupabaseClient | null>(() =>
    typeof window === 'undefined' ? null : getSupabase(),
  );
  const [status, setStatus] = useState<SessionStatus>(
    isSupabaseConfigured ? 'loading' : 'signed-out',
  );
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  const syncNow = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setSyncing(true);
    try {
      await engine.syncOnce();
      setLastSyncedAt(Date.now());
    } catch (error) {
      console.error('[Tessera] sync failed', error);
    } finally {
      setSyncing(false);
    }
  }, []);

  // Track the session and (re)build the engine when the user changes.
  useEffect(() => {
    if (!supabase) {
      setStatus('signed-out');
      return;
    }

    const applySession = (session: Session | null) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setStatus(nextUser ? 'signed-in' : 'signed-out');
      if (nextUser) {
        engineRef.current ??= createEngine(supabase);
        void syncNow();
      } else {
        engineRef.current = null;
      }
    };

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      // After a magic-link sign-in, drop the PKCE `?code=` from the address bar.
      if (
        session &&
        typeof window !== 'undefined' &&
        window.location.search.includes('code=')
      ) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, syncNow]);

  // Keep the library fresh: periodic sync + on tab focus / network reconnect.
  useEffect(() => {
    if (status !== 'signed-in') return;
    const interval = setInterval(() => void syncNow(), PERIODIC_SYNC_MS);
    const onWake = () => void syncNow();
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [status, syncNow]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, [supabase]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      configured: isSupabaseConfigured,
      user,
      supabase,
      syncing,
      lastSyncedAt,
      syncNow,
      signOut,
    }),
    [status, user, supabase, syncing, lastSyncedAt, syncNow, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
