'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/components/providers';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/snippets';

/** App chrome for signed-in pages: brand, sync status, account, and a container. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useSession();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-indigo-600" />
              <span className="text-lg font-semibold tracking-tight text-slate-900">
                Tessera
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/" label="Library" matchExact />
              <NavLink href="/documents" label="Documents" />
              <NavLink href="/account" label="Account" />
            </nav>
          </div>
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

function NavLink({
  href,
  label,
  matchExact = false,
}: {
  href: string;
  label: string;
  matchExact?: boolean;
}) {
  const pathname = usePathname();
  const active = matchExact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-2.5 py-1 font-medium transition-colors',
        active
          ? 'bg-slate-100 text-slate-900'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
      )}
    >
      {label}
    </Link>
  );
}

function SyncStatus() {
  const { syncing, lastSyncedAt, lastSyncError, pendingCount, syncNow } = useSession();
  const hasIssue = !syncing && (pendingCount > 0 || lastSyncError != null);

  const label = syncing
    ? 'Syncing…'
    : pendingCount > 0
      ? `${pendingCount} unsynced`
      : lastSyncError
        ? 'Sync issue'
        : lastSyncedAt
          ? `Synced ${relativeTime(new Date(lastSyncedAt).toISOString())}`
          : 'Synced';

  const title = lastSyncError
    ? `${lastSyncError} — click to retry`
    : pendingCount > 0
      ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync — click to retry`
      : 'Sync now';

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      disabled={syncing}
      title={title}
      className={cn(
        'flex items-center gap-1.5 text-xs hover:text-slate-600 disabled:cursor-default',
        hasIssue ? 'text-amber-600' : 'text-slate-400',
      )}
    >
      {syncing ? (
        <>
          <Spinner className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Syncing…</span>
        </>
      ) : (
        <>
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              hasIssue ? 'bg-amber-400' : 'bg-emerald-400',
            )}
          />
          <span className="hidden sm:inline">{label}</span>
        </>
      )}
    </button>
  );
}
