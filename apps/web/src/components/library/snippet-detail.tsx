'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/providers';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { Favicon, SnippetImage } from '@/components/library/media';
import { useSnippet } from '@/lib/hooks';
import { deleteSnippet } from '@/lib/db';
import { buildSourceUrl, formatDate, typeLabel } from '@/lib/snippets';

/** Full snippet view (LIB-5) with the open-source deep link (LIB-6) and delete. */
export function SnippetDetail({ id }: { id: string }) {
  const snippet = useSnippet(id);
  const { supabase, syncNow } = useSession();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (snippet === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (snippet === null) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-slate-500">This snippet doesn’t exist or was deleted.</p>
        <Link href="/" className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline">
          Back to library
        </Link>
      </div>
    );
  }

  const label = snippet.domain.replace(/^www\./, '');

  async function handleDelete() {
    setDeleting(true);
    await deleteSnippet(supabase, id);
    void syncNow();
    router.push(`/site/${encodeURIComponent(snippet!.domain)}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/site/${encodeURIComponent(snippet.domain)}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <span aria-hidden="true">←</span> {label}
      </Link>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <Favicon src={snippet.faviconUrl} domain={snippet.domain} className="h-4 w-4 text-[9px]" />
          <span className="truncate text-sm text-slate-600" title={snippet.pageTitle}>
            {snippet.pageTitle || label}
          </span>
        </div>

        <div className="p-5">
          {snippet.type === 'text' ? (
            <blockquote
              className="border-l-2 pl-4 text-[15px] leading-relaxed text-slate-800"
              style={{ borderColor: snippet.color || '#a5b4fc' }}
            >
              <p className="whitespace-pre-wrap">
                {snippet.text || <span className="italic text-slate-400">(no text captured)</span>}
              </p>
            </blockquote>
          ) : (
            <SnippetImage snippet={snippet} className="max-h-[70vh] w-full rounded-md border border-slate-200" />
          )}

          {snippet.note && (
            <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Note</p>
              <p className="whitespace-pre-wrap">{snippet.note}</p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge>{typeLabel(snippet.type)}</Badge>
            {snippet.color && (
              <span className="inline-flex items-center gap-1">
                <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: snippet.color }} />
              </span>
            )}
            <span>Saved {formatDate(snippet.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <a href={buildSourceUrl(snippet)} target="_blank" rel="noreferrer noopener">
            <Button size="sm" variant="secondary">
              Open source ↗
            </Button>
          </a>
          <div className="ml-auto flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-xs text-slate-500">Delete this snippet?</span>
                <Button size="sm" variant="danger" disabled={deleting} onClick={() => void handleDelete()}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
                <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
