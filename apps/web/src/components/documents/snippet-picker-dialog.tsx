'use client';

import { useMemo, useState } from 'react';
import { useSession } from '@/components/providers';
import { Button, Dialog, Input, Spinner } from '@/components/ui';
import { Favicon } from '@/components/library/media';
import { useSnippets } from '@/lib/hooks';
import { addSnippetToDocument } from '@/lib/documents';
import { filterSnippets, EMPTY_FILTERS, typeLabel } from '@/lib/snippets';

/**
 * Pick snippets from anywhere in the library to add to a document (DOC-2/DOC-3).
 * A snippet already in the document is shown as "Added" and can't be added twice.
 */
export function SnippetPickerDialog({
  open,
  onClose,
  documentId,
  existingSnippetIds,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  existingSnippetIds: Set<string>;
}) {
  const { user, syncNow } = useSession();
  const snippets = useSnippets();
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());

  const results = useMemo(
    () => (snippets ? filterSnippets(snippets, { ...EMPTY_FILTERS, query }) : []),
    [snippets, query],
  );

  async function handleAdd(snippetId: string) {
    if (!user) return;
    setAdded((prev) => new Set(prev).add(snippetId));
    await addSnippetToDocument(user.id, documentId, snippetId);
    void syncNow();
  }

  const isIn = (id: string) => existingSnippetIds.has(id) || added.has(id);

  return (
    <Dialog open={open} onClose={onClose} title="Add snippets" className="max-w-lg">
      <Input
        type="search"
        autoFocus
        placeholder="Search your library…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search snippets to add"
      />

      <div className="mt-3 max-h-[55vh] overflow-y-auto">
        {snippets === undefined ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5" />
          </div>
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {query ? 'No snippets match your search.' : 'Your library is empty.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {results.map((s) => {
              const inDoc = isIn(s.id);
              return (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-700">
                      {s.type === 'text' ? s.text || '(no text)' : `${typeLabel(s.type)} snippet`}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                      <Favicon src={s.faviconUrl} domain={s.domain} className="h-3 w-3 text-[7px]" />
                      <span className="truncate">{s.domain.replace(/^www\./, '')}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={inDoc ? 'ghost' : 'secondary'}
                    disabled={inDoc}
                    onClick={() => void handleAdd(s.id)}
                  >
                    {inDoc ? 'Added' : 'Add'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
