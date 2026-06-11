'use client';

import { useEffect, useRef } from 'react';
import { hydrateInlineImages } from '@tessera/core';
import type { Snippet } from '@tessera/core';
import { useSession } from '@/components/providers';

const SIGN_TTL_SECONDS = 3600;

/**
 * Render a captured passage with its structure intact. When the snippet carries
 * sanitized structural `html` (headings, paragraphs, lists, emphasis, line
 * breaks, and inline images) we render that; otherwise we fall back to the plain
 * `text` with line breaks preserved (older or structure-free captures, and
 * hand-edited text).
 *
 * SECURITY: `html` is written only by `serializeSelection` in `@tessera/core`, an
 * allowlist serializer that emits a fixed tag set and copies **no** page
 * attributes — so the injected markup carries no scripts, handlers, URLs, or
 * styles. Inline images are attribute-free tokens; we resolve them to short-lived
 * signed URLs and set `src` as a DOM property after injection (never a page URL).
 */
export function RichText({
  snippet,
  className = '',
  emptyLabel,
}: {
  snippet: Pick<Snippet, 'html' | 'text'>;
  className?: string;
  emptyLabel?: string;
}) {
  const { supabase } = useSession();
  const ref = useRef<HTMLDivElement>(null);
  const html = snippet.html && snippet.html.trim() ? snippet.html : '';

  useEffect(() => {
    const el = ref.current;
    if (!el || !html || !supabase) return;
    return hydrateInlineImages(el, (path) =>
      supabase.storage
        .from('snippet-images')
        .createSignedUrl(path, SIGN_TTL_SECONDS)
        .then(({ data }) => data?.signedUrl ?? null),
    );
  }, [html, supabase]);

  if (html) {
    return (
      <div
        ref={ref}
        className={`tsr-rich ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (snippet.text && snippet.text.trim()) {
    return <p className={`whitespace-pre-wrap break-words ${className}`}>{snippet.text}</p>;
  }
  return emptyLabel ? (
    <p className={className}>
      <span className="italic text-slate-400">{emptyLabel}</span>
    </p>
  ) : null;
}
