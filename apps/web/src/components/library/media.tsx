'use client';

import { useState } from 'react';
import type { Snippet } from '@tessera/core';
import { cn } from '@/lib/cn';
import { useSignedImageUrl } from '@/lib/hooks';

/** A site favicon with a tinted-initial fallback when it's missing or broken. */
export function Favicon({
  src,
  domain,
  className,
}: {
  src?: string;
  domain: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const initial = domain.replace(/^www\./, '').charAt(0).toUpperCase() || '?';

  if (!src || broken) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded bg-indigo-100 text-[10px] font-semibold text-indigo-700',
          className,
        )}
        aria-hidden="true"
      >
        {initial}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={cn('shrink-0 rounded object-contain', className)}
      onError={() => setBroken(true)}
    />
  );
}

/**
 * Render an image/screenshot snippet. Resolves the private bucket object to a
 * signed URL (or uses an external reference as-is); shows a skeleton until ready.
 */
export function SnippetImage({
  snippet,
  className,
}: {
  snippet: Snippet;
  className?: string;
}) {
  const url = useSignedImageUrl(snippet.imagePath);
  if (!url) {
    return <div className={cn('animate-pulse bg-slate-100', className)} aria-hidden="true" />;
  }
  return (
    <img
      src={url}
      alt={snippet.pageTitle || 'Saved image'}
      loading="lazy"
      className={cn('object-cover', className)}
    />
  );
}
