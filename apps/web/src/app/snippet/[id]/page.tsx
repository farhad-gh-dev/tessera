'use client';

import { RequireAuth } from '@/components/library/require-auth';
import { AppShell } from '@/components/library/app-shell';
import { SnippetDetail } from '@/components/library/snippet-detail';

export default function SnippetPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <AppShell>
        <SnippetDetail id={params.id} />
      </AppShell>
    </RequireAuth>
  );
}
