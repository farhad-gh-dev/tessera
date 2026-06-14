'use client';

import { useState } from 'react';
import { HIGHLIGHT_COLORS, type Snippet } from '@tessera/core';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { deleteSnippet, updateSnippet } from '@/lib/db';
import { buildSourceUrl } from '@/lib/snippets';
import { BulkAddToDocumentDialog } from '@/components/documents/bulk-add-to-document-dialog';
import { BulkTagDialog } from '@/components/documents/bulk-tag-dialog';

/** Open-all is gesture-driven; cap the burst so we don't trip the popup blocker. */
const OPEN_ALL_CAP = 12;

/**
 * Floating action bar for a multi-selection (BULK-1/2): add the selected snippets
 * to a document, recolor them, open their sources, or delete them. Per BULK-2 the
 * selection **survives** add/recolor (so you can chain actions); delete clears it
 * since the snippets are gone.
 */
export function SelectionBar({ snippets, onClear }: { snippets: Snippet[]; onClear: () => void }) {
  const { supabase, syncNow } = useSession();
  const [addOpen, setAddOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blockedHint, setBlockedHint] = useState(false);
  const count = snippets.length;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      void syncNow();
    } finally {
      setBusy(false);
    }
  };

  const recolor = (color: string) =>
    void run(async () => {
      await Promise.all(snippets.map((s) => updateSnippet(s, { color })));
    });

  const remove = () =>
    void run(async () => {
      await Promise.all(snippets.map((s) => deleteSnippet(supabase, s.id)));
      setConfirmDelete(false);
      onClear();
    });

  const openAll = () => {
    for (const s of snippets.slice(0, OPEN_ALL_CAP)) {
      window.open(buildSourceUrl(s), '_blank', 'noopener,noreferrer');
    }
    // Browsers allow only ~one popup per click, so flag when more were requested.
    if (snippets.length > 1) {
      setBlockedHint(true);
      window.setTimeout(() => setBlockedHint(false), 6000);
    }
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center gap-2 px-4">
        {blockedHint && (
          <div className="pointer-events-auto max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-800 shadow">
            Your browser blocked the extra tabs — allow pop-ups for this site to open every source.
          </div>
        )}
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
          <span className="px-1 text-sm font-medium text-slate-700">{count} selected</span>
          <Divider />

          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)} disabled={busy}>
            Add to document
          </Button>

          <Button size="sm" variant="secondary" onClick={() => setTagOpen(true)} disabled={busy}>
            Tag
          </Button>

          <div className="flex items-center gap-1" role="group" aria-label="Recolor selection">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.token}
                type="button"
                onClick={() => recolor(c.hex)}
                disabled={busy}
                title={`Recolor ${c.label}`}
                aria-label={`Recolor ${c.label}`}
                className="h-5 w-5 rounded-full border border-black/10 transition hover:scale-110 disabled:opacity-50"
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>

          <Button size="sm" variant="secondary" onClick={openAll} disabled={busy}>
            Open all
          </Button>

          <Divider />

          {confirmDelete ? (
            <>
              <Button size="sm" variant="danger" onClick={remove} disabled={busy}>
                Delete {count}?
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="text-red-600 hover:bg-red-50"
            >
              Delete
            </Button>
          )}

          <Divider />

          <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
            Clear
          </Button>
        </div>
      </div>

      {addOpen && (
        <BulkAddToDocumentDialog
          snippetIds={snippets.map((s) => s.id)}
          open
          onClose={() => setAddOpen(false)}
        />
      )}
      {tagOpen && (
        <BulkTagDialog
          snippetIds={snippets.map((s) => s.id)}
          open
          onClose={() => setTagOpen(false)}
        />
      )}
    </>
  );
}

function Divider() {
  return <span className={cn('h-5 w-px shrink-0 bg-slate-200')} aria-hidden="true" />;
}
