'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/providers';
import { Button, Card, Input } from '@/components/ui';
import { downloadAccountExport, deleteAccount } from '@/lib/account';

/**
 * Account settings (PRD §8.3): take your data with you, or erase it entirely.
 * Two privacy guarantees made concrete — a one-click JSON export of everything
 * you've saved, and an irreversible account deletion gated behind a typed
 * confirmation.
 */
export function AccountView() {
  const { user, supabase, syncNow } = useSession();
  const router = useRouter();

  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!user) return null;

  async function handleExport() {
    setExporting(true);
    setExportNote(null);
    try {
      // Pull the freshest remote data into the local mirror first (best-effort —
      // syncNow swallows its own errors, so an offline export still proceeds).
      await syncNow();
      const payload = await downloadAccountExport(user!.id);
      const total = Object.values(payload.counts).reduce((a, b) => a + b, 0);
      setExportNote(
        total === 0
          ? 'Nothing saved yet — exported an empty archive.'
          : `Downloaded ${total} record${total === 1 ? '' : 's'} ` +
              `(${payload.counts.snippets} snippets, ${payload.counts.documents} documents).`,
      );
    } catch {
      setExportNote('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!supabase || confirm !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(supabase);
      router.push('/');
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : 'Deletion failed. Please try again.',
      );
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Account</h1>
        <p className="text-sm text-slate-500">{user.email}</p>
      </div>

      {/* Export ----------------------------------------------------------- */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Export your data</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Download everything you’ve saved — snippets, tags, and documents — as a single
          JSON file. It’s yours to keep, back up, or move elsewhere.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? 'Preparing…' : 'Export data (JSON)'}
          </Button>
          {exportNote && <span className="text-xs text-slate-500">{exportNote}</span>}
        </div>
      </Card>

      {/* Danger zone ------------------------------------------------------ */}
      <Card className="border-red-200 p-5">
        <h2 className="text-base font-semibold text-red-700">Delete account</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Permanently delete your account and <strong>all</strong> of your data — every
          snippet, document, note, tag, and saved image, on every device. This cannot be
          undone. Consider exporting your data first.
        </p>
        <div className="mt-4 max-w-sm">
          <label
            htmlFor="confirm-delete"
            className="mb-1 block text-xs font-medium text-slate-500"
          >
            Type <span className="font-mono font-semibold text-slate-700">DELETE</span> to
            confirm
          </label>
          <Input
            id="confirm-delete"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            aria-describedby={deleteError ? 'delete-error' : undefined}
          />
        </div>
        {deleteError && (
          <p id="delete-error" className="mt-2 text-xs text-red-600">
            {deleteError}
          </p>
        )}
        <Button
          variant="danger"
          className="mt-4"
          onClick={() => void handleDelete()}
          disabled={confirm !== 'DELETE' || deleting}
        >
          {deleting ? 'Deleting…' : 'Delete my account'}
        </Button>
      </Card>
    </div>
  );
}
