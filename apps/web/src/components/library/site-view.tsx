'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Spinner } from '@/components/ui';
import { Favicon } from '@/components/library/media';
import { SnippetCard } from '@/components/library/snippet-card';
import { useSnippets } from '@/lib/hooks';
import { groupByPage } from '@/lib/snippets';

/**
 * One website's snippets, drilled down and sub-grouped by page (LIB-2). Each page
 * heading links out to the source URL; snippets show in capture order.
 */
export function SiteView({ domain }: { domain: string }) {
  const snippets = useSnippets();
  const forDomain = useMemo(
    () => (snippets ? snippets.filter((s) => s.domain === domain) : []),
    [snippets, domain],
  );
  const pages = useMemo(() => groupByPage(forDomain), [forDomain]);

  if (snippets === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const label = domain.replace(/^www\./, '');

  return (
    <div>
      <Link
        href="/?lens=site"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <span aria-hidden="true">←</span> All websites
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <Favicon src={forDomain[0]?.faviconUrl} domain={domain} className="h-8 w-8 text-sm" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{label}</h1>
          <p className="text-xs text-slate-400">
            {forDomain.length} {forDomain.length === 1 ? 'snippet' : 'snippets'} ·{' '}
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </p>
        </div>
      </div>

      {forDomain.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">
          Nothing saved from this website yet.
        </p>
      ) : (
        <div className="space-y-8">
          {pages.map((page) => (
            <section key={page.url}>
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mb-3 block truncate text-sm font-medium text-slate-700 hover:text-indigo-600 hover:underline"
                title={page.url}
              >
                {page.pageTitle}
              </a>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {page.snippets.map((snippet) => (
                  <SnippetCard key={snippet.id} snippet={snippet} showSource={false} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
