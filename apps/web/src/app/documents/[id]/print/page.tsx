'use client';

import { RequireAuth } from '@/components/library/require-auth';
import { DocumentPrintView } from '@/components/documents/document-print-view';

/**
 * Print / "Save as PDF" route for a document (EXP-2). Intentionally rendered
 * without the app shell so the page is clean for paper; gated on auth like every
 * other document route.
 */
export default function DocumentPrintPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <DocumentPrintView id={params.id} />
    </RequireAuth>
  );
}
