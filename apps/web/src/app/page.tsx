'use client';

import { Suspense } from 'react';
import { RequireAuth } from '@/components/library/require-auth';
import { AppShell } from '@/components/library/app-shell';
import { LibraryHome } from '@/components/library/library-home';
import { FullPageLoader } from '@/components/ui';

export default function HomePage() {
  return (
    <RequireAuth>
      <AppShell>
        {/* Suspense boundary: LibraryHome reads useSearchParams (URL-synced view state). */}
        <Suspense fallback={<FullPageLoader />}>
          <LibraryHome />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
