'use client';

import { useMemo, useState } from 'react';
import type { Tag } from '@tessera/core';
import { useSession } from '@/components/providers';
import { Button, Dialog, Input } from '@/components/ui';
import { useSnippetTagMap, useTags } from '@/lib/hooks';
import { addTagToSnippet, removeTagFromSnippet } from '@/lib/tags';

/**
 * Add or remove tags across a multi-selection (BULK-3). Both helpers are
 * idempotent, so adding a tag some already carry — or removing one not all have —
 * is safe. Tags already on the selection show an `n/total` badge when only some
 * of the selected snippets carry them.
 */
export function BulkTagDialog({
  snippetIds,
  open,
  onClose,
}: {
  snippetIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const { user, syncNow } = useSession();
  const allTags = useTags();
  const tagMap = useSnippetTagMap();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const count = snippetIds.length;

  // Tags present on the selection (union), with how many of the selected carry each.
  const present = useMemo(() => {
    const m = new Map<string, { tag: Tag; n: number }>();
    for (const id of snippetIds) {
      for (const t of tagMap?.get(id) ?? []) {
        const entry = m.get(t.id);
        if (entry) entry.n += 1;
        else m.set(t.id, { tag: t, n: 1 });
      }
    }
    return [...m.values()].sort((a, b) => a.tag.name.localeCompare(b.tag.name));
  }, [snippetIds, tagMap]);

  const presentIds = useMemo(() => new Set(present.map((p) => p.tag.id)), [present]);
  const suggestions = (allTags ?? []).filter((t) => !presentIds.has(t.id));

  async function add(name: string) {
    const clean = name.trim();
    if (!user || !clean || busy) return;
    setBusy(true);
    await Promise.all(snippetIds.map((id) => addTagToSnippet(user.id, id, clean)));
    void syncNow();
    setInput('');
    setBusy(false);
  }

  async function remove(tagId: string) {
    if (busy) return;
    setBusy(true);
    await Promise.all(snippetIds.map((id) => removeTagFromSnippet(id, tagId)));
    void syncNow();
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Tag ${count} snippet${count === 1 ? '' : 's'}`}>
      <div className="flex gap-2">
        <Input
          placeholder="Add a tag…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add(input);
          }}
          aria-label="Add a tag to the selection"
        />
        <Button onClick={() => void add(input)} disabled={!input.trim() || busy}>
          Add
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-slate-400">Add existing</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void add(t.name)}
                disabled={busy}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                #{t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-slate-400">On the selection</p>
        {present.length === 0 ? (
          <p className="text-sm text-slate-400">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {present.map(({ tag, n }) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700"
              >
                #{tag.name}
                {n < count && (
                  <span className="text-indigo-400">
                    {n}/{count}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void remove(tag.id)}
                  disabled={busy}
                  aria-label={`Remove ${tag.name} from the selection`}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700 disabled:opacity-50"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
