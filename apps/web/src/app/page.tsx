'use client';

import { RequireAuth } from '@/components/library/require-auth';
import { AppShell } from '@/components/library/app-shell';
import { LibraryHome } from '@/components/library/library-home';

export default function HomePage() {
  return (
    <RequireAuth>
      <AppShell>
        <LibraryHome />
      </AppShell>
    </RequireAuth>
  );
}
