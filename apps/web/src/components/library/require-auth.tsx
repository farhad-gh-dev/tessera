'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/components/providers';
import { AuthLanding } from '@/components/auth-landing';
import { FullPageLoader } from '@/components/ui';

/** Gate a page on an authenticated session; renders the landing/auth when out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'signed-out') return <AuthLanding />;
  return <>{children}</>;
}
