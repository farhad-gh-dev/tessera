'use client';

import { RequireAuth } from '@/components/library/require-auth';
import { AppShell } from '@/components/library/app-shell';
import { SiteView } from '@/components/library/site-view';

export default function SitePage({ params }: { params: { domain: string } }) {
  const domain = decodeURIComponent(params.domain);
  return (
    <RequireAuth>
      <AppShell>
        <SiteView domain={domain} />
      </AppShell>
    </RequireAuth>
  );
}
