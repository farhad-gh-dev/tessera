'use client';

import { useEffect, useMemo, useState } from 'react';
import { applyInlineImageUrls, inlineImagePaths } from '@tessera/core';
import type { Snippet } from '@tessera/core';
import { useSession } from '@/components/providers';

const SIGN_TTL_SECONDS = 3600;

/**
 * Resolve a passage's inline-image Storage paths to signed URLs and fold them
 * into the html. State-driven on purpose: the resolved `src` ends up in the
 * React-owned markup, so it survives re-renders (no imperative DOM that a
 * re-render would wipe), and we re-sign when the session becomes ready — keyed on
 * `user?.id` so a fresh tab that paints before auth restores still resolves once
 * it does.
 */
function useResolvedHtml(html: string): string {
  const { supabase, user } = useSession();
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
  }, [html, supabase, user?.id]);

  return useMemo(() => (html ? applyInlineImageUrls(html, urls) : html), [html, urls]);
}

/**
 * Render a captured passage with its structure intact. When the snippet carries
 * sanitized structural `html` (headings, paragraphs, lists, emphasis, line
 * breaks, and inline images) we render that; otherwise we fall back to the plain
 * `text` (older or structure-free captures, and hand-edited text).
 *
 * SECURITY: `html` is written only by `serializeSelection` in `@tessera/core`, an
 * allowlist serializer that emits a fixed tag set and copies **no** page
 * attributes — so the injected markup carries no scripts, handlers, page URLs, or
 * styles. Inline-image tokens resolve to app-minted, HTML-escaped Storage signed
 * URLs (`applyInlineImageUrls`); no page-supplied URL ever reaches the sink.
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
  const html = snippet.html && snippet.html.trim() ? snippet.html : '';
  const resolved = useResolvedHtml(html);

  if (html) {
    return (
      <div className={`tsr-rich ${className}`} dangerouslySetInnerHTML={{ __html: resolved }} />
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
