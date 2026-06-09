'use client';

import { RequireAuth } from '@/components/library/require-auth';
import { AppShell } from '@/components/library/app-shell';
import { DocumentEditor } from '@/components/documents/document-editor';

export default function DocumentPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <AppShell>
        <DocumentEditor id={params.id} />
      </AppShell>
    </RequireAuth>
  );
}
