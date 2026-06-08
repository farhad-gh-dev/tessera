'use client';

import Link from 'next/link';
import { Card } from '@/components/ui';
import { Favicon } from '@/components/library/media';
import { relativeTime, type SiteGroup } from '@/lib/snippets';

/** One website grouping on the library home (LIB-1). Links to the site drill-down. */
export function SiteCard({ group }: { group: SiteGroup }) {
  const label = group.domain.replace(/^www\./, '');
  return (
    <Link href={`/site/${encodeURIComponent(group.domain)}`} className="block">
      <Card className="flex h-full items-center gap-3 p-4 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40">
        <Favicon src={group.faviconUrl} domain={group.domain} className="h-8 w-8 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-400">last saved {relativeTime(group.latestAt)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {group.count}
        </span>
      </Card>
    </Link>
  );
}
