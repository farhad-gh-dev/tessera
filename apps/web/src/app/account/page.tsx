'use client';

import { RequireAuth } from '@/components/library/require-auth';
import { AppShell } from '@/components/library/app-shell';
import { AccountView } from '@/components/account/account-view';

/** Account settings — data export + account deletion (PRD §8.3). */
export default function AccountPage() {
  return (
    <RequireAuth>
      <AppShell>
        <AccountView />
      </AppShell>
    </RequireAuth>
  );
}
