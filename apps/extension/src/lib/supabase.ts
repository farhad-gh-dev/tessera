import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The extension's shared Supabase client.
 *
 * The session is persisted in `chrome.storage.local` rather than `localStorage`,
 * because a service worker has no `localStorage` — this lets the background
 * worker keep its session across restarts. Built from the `VITE_SUPABASE_*` env
 * baked in at build time; `null` if those aren't set (cloud sync then disabled).
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const chromeStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: chromeStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
