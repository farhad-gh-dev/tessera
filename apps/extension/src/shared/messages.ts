/**
 * Typed wrappers over the background service worker's message protocol, shared
 * by the popup and the side panel. Every surface talks to the one background
 * owner (DATA-1/DATA-3): it holds the Supabase session and the single SyncEngine,
 * and is the only writer. Scope A adds no new handlers — deletes and recolors
 * reuse the existing `tessera:delete` / `tessera:update` (DATA-3).
 */

export interface User {
  id: string;
  email?: string;
}

export interface AuthState {
  configured: boolean;
  user: User | null;
}

export interface AuthResult {
  user?: User | null;
  error?: string;
  needsConfirmation?: boolean;
}

export function getAuthState(): Promise<AuthState> {
  return chrome.runtime.sendMessage({ type: 'auth:get-state' }) as Promise<AuthState>;
}

export function authenticate(
  type: 'auth:sign-in' | 'auth:sign-up',
  email: string,
  password: string,
): Promise<AuthResult> {
  return chrome.runtime.sendMessage({ type, email, password }) as Promise<AuthResult>;
}

export function signOut(): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: 'auth:sign-out' });
}

export function deleteSnippet(id: string): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: 'tessera:delete', id });
}

export function recolorSnippet(id: string, color: string): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: 'tessera:update', id, patch: { color } });
}

/** Best-effort: tell a tab's content script to repaint after a delete/recolor. */
export function refreshTabHighlights(tabId: number): void {
  void chrome.tabs.sendMessage(tabId, { type: 'tessera:refresh-highlights' }).catch(() => {});
}
