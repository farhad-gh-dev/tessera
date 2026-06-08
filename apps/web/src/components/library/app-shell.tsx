'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSession } from '@/components/providers';
import { Button, Spinner } from '@/components/ui';
import { relativeTime } from '@/lib/snippets';

/** App chrome for signed-in pages: brand, sync status, account, and a container. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useSession();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-indigo-600" />
            <span className="text-lg font-semibold tracking-tight text-slate-900">Tessera</span>
          </Link>
          <div className="flex items-center gap-3">
            <SyncStatus />
            {user?.email && (
              <span className="hidden max-w-[16ch] truncate text-sm text-slate-500 sm:inline">
                {user.email}
              </span>
            )}
            <Button size="sm" variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

function SyncStatus() {
  const { syncing, lastSyncedAt, syncNow } = useSession();
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      disabled={syncing}
      title="Sync now"
      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:cursor-default"
    >
      {syncing ? (
        <>
          <Spinner className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Syncing…</span>
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="hidden sm:inline">
            {lastSyncedAt ? `Synced ${relativeTime(new Date(lastSyncedAt).toISOString())}` : 'Synced'}
          </span>
        </>
      )}
    </button>
  );
}
