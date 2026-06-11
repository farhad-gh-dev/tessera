import { useEffect, useRef } from 'react';
import { hydrateInlineImages } from '@tessera/core';
import type { Snippet } from '@tessera/core';
import { supabase } from '../lib/supabase';

const SIGN_TTL_SECONDS = 3600;

/** Sign a `snippet-images` object for display (null if unavailable). */
function signInlineImage(path: string): Promise<string | null> {
  if (!supabase) return Promise.resolve(null);
  return supabase.storage
    .from('snippet-images')
    .createSignedUrl(path, SIGN_TTL_SECONDS)
    .then(({ data }) => data?.signedUrl ?? null);
}

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
}: {
  snippet: Pick<Snippet, 'html' | 'text'>;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const html = snippet.html && snippet.html.trim() ? snippet.html : '';

  useEffect(() => {
    const el = ref.current;
    if (!el || !html) return;
    return hydrateInlineImages(el, signInlineImage);
  }, [html]);

  if (html) {
    return (
      <div
        ref={ref}
        className={`tsr-rich ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <p className={`whitespace-pre-wrap break-words ${className}`}>{snippet.text}</p>;
}
