'use client';

import { RequireAuth } from '@/components/library/require-auth';
import { AppShell } from '@/components/library/app-shell';
import { DocumentsList } from '@/components/documents/documents-list';

export default function DocumentsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <DocumentsList />
      </AppShell>
    </RequireAuth>
  );
}
