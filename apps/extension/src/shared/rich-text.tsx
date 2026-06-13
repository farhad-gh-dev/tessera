import { useEffect, useMemo, useState } from 'react';
import { applyInlineImageUrls, inlineImagePaths } from '@tessera/core';
import type { Snippet } from '@tessera/core';
import { supabase } from '../lib/supabase';

const SIGN_TTL_SECONDS = 3600;

/**
 * Resolve a passage's inline-image Storage paths to signed URLs and fold them
 * into the html. State-driven on purpose: the resolved `src` ends up in the
 * React-owned markup, so it survives re-renders (e.g. the panel re-reading on
 * focus) instead of being wiped like an imperatively-set property.
 */
function useResolvedHtml(html: string): string {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const client = supabase;
    if (!html || !client) return;
    const paths = inlineImagePaths(html);
    if (paths.length === 0) return;
    let active = true;
    void Promise.all(
      paths.map(async (path) => {
        const { data } = await client.storage
          .from('snippet-images')
          .createSignedUrl(path, SIGN_TTL_SECONDS);
        return [path, data?.signedUrl ?? null] as const;
      }),
    ).then((entries) => {
      if (!active) return;
      setUrls((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const [path, signed] of entries) {
          if (signed && next.get(path) !== signed) {
            next.set(path, signed);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => {
      active = false;
    };
  }, [html]);

  return useMemo(() => (html ? applyInlineImageUrls(html, urls) : html), [html, urls]);
}

/**
 * Render a captured passage with its structure intact. When the snippet carries
 * sanitized structural `html` (headings, paragraphs, lists, emphasis, line
 * breaks, and inline images) we render that; otherwise we fall back to the plain
 * `text` with line breaks preserved (older or structure-free captures, and
 * hand-edited text).
 *
 * SECURITY: `html` is written only by `serializeSelection` in `@tessera/core`, an
 * allowlist serializer that emits a fixed tag set and copies no page attributes
 * except a link's `href` — and only after it is scheme-allowlisted
 * (http/https/mailto/tel, never javascript:/data:) and HTML-escaped, with
 * `rel="noopener noreferrer nofollow"` added. So the injected markup carries no
 * scripts, handlers, unsafe-scheme links, or styles. Inline-image tokens resolve
 * to app-minted, HTML-escaped Storage signed URLs (`applyInlineImageUrls`); no
 * page-supplied image URL ever reaches the sink.
 */
export function RichText({
  snippet,
  className = '',
}: {
  snippet: Pick<Snippet, 'html' | 'text'>;
  className?: string;
}) {
  const html = snippet.html && snippet.html.trim() ? snippet.html : '';
  const resolved = useResolvedHtml(html);

  if (html) {
    return (
      <div className={`tsr-rich ${className}`} dangerouslySetInnerHTML={{ __html: resolved }} />
    );
  }
  return <p className={`whitespace-pre-wrap break-words ${className}`}>{snippet.text}</p>;
}
