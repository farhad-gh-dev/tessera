'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The web app's browser Supabase client (singleton).
 *
 * Tessera is local-first: the session lives in the browser (localStorage, the
 * supabase-js default) and powers cloud sync + signed image URLs directly from
 * the client — there is no authenticated server-rendering, so no cookie/SSR
 * ceremony is needed. `detectSessionInUrl` + the PKCE flow let a magic-link land
 * back on any page and complete sign-in automatically.
 *
 * Built from the public `NEXT_PUBLIC_SUPABASE_*` env (inlined at build time);
 * `null` when those aren't set, in which case cloud features are disabled.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null | undefined;

/**
 * Lazily create the client. Only call this in the browser (from effects/handlers)
 * — instantiation restores the persisted session from `localStorage`, which
 * doesn't exist during server rendering.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client =
    url && anonKey
      ? createClient(url, anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce',
          },
        })
      : null;
  return client;
}
