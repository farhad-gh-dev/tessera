import { domainOf, inlineImagePaths, newId } from '@tessera/core';
import type { Snippet, SnippetType } from '@tessera/core';
import {
  DexieLocalStore,
  SupabaseRemoteAdapter,
  SyncEngine,
  TesseraDexie,
  localDelete,
  localUpsert,
} from '@tessera/db';
import { supabase } from '../lib/supabase';
import {
  removeSnippetImage,
  removeSnippetImages,
  uploadInlineImage,
  uploadSnippetImage,
} from '../lib/storage';

/**
 * Tessera background service worker (M1 — local store + cloud sync + auth).
 *
 * Owns the extension's Dexie store, the Supabase session (email/password auth,
 * persisted in chrome.storage), and the SyncEngine. It also performs image and
 * screenshot capture: right-clicked images and cropped screenshot regions are
 * uploaded to the `snippet-images` Storage bucket here, where the authenticated
 * client lives. The content script and popup talk to it over messaging.
 */

const db = new TesseraDexie();
const store = new DexieLocalStore(db);
const engine = supabase
  ? new SyncEngine({
      local: store,
      remote: new SupabaseRemoteAdapter(supabase),
      tables: ['snippets'],
    })
  : null;

let currentUserId: string | null = null;

/* ---- lifecycle ---------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tessera-save',
    title: 'Save to Tessera',
    contexts: ['selection', 'image'],
  });
  chrome.alarms.create('tessera-sync', { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tessera-sync') void sync();
});

void initSession();

async function initSession(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  currentUserId = data.session?.user.id ?? null;
  if (currentUserId) void sync();
}

async function sync(): Promise<void> {
  if (!engine || !currentUserId) return;
  try {
    await engine.syncOnce();
    // A pull may have written rows; nudge any open pages to re-read (DATA-2).
    notifyChanged();
  } catch (error) {
    console.error('[Tessera] sync failed', error);
  }
}

/**
 * Tell the extension's *pages* (popup / side panel) that the local store
 * changed, so their live reads re-query even if a Dexie change doesn't propagate
 * across the service-worker↔page boundary — the §12.3 fallback for DATA-2.
 * Best-effort: `sendMessage` rejects when no page is listening, which is normal.
 */
function notifyChanged(): void {
  void chrome.runtime.sendMessage({ type: 'tessera:changed' }).catch(() => {});
}

/** Tell pages auth changed (sign-in/out, possibly in another surface) — DATA-1. */
function notifyAuthChanged(): void {
  void chrome.runtime.sendMessage({ type: 'tessera:auth-changed' }).catch(() => {});
}

/* ---- messaging ---------------------------------------------------------- */

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'tessera-save') return;
  if (info.mediaType === 'image' && info.srcUrl) {
    void captureImage(info, tab);
  } else if (tab?.id != null) {
    // Text selection: the content script holds the live Range, so it builds the
    // anchor and saves (same path as the floating button).
    void Promise.resolve(
      chrome.tabs.sendMessage(tab.id, { type: 'tessera:save-from-menu' }),
    ).catch(() => {});
  }
});

// Keyboard command (Alt+Shift+H): tell the active tab's content script to save
// the current selection — same path as the floating toolbar / context menu.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'save-selection') return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id != null) {
      void chrome.tabs.sendMessage(tab.id, { type: 'tessera:save-from-menu' }).catch(() => {});
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({ error: String(error) }));
  return true; // keep the channel open for the async response
});

interface ScreenshotPayload {
  rect: { x: number; y: number; width: number; height: number };
  dpr: number;
  url: string;
  domain: string;
  pageTitle: string;
}

interface Message {
  type?: string;
  snippet?: Partial<Snippet>;
  /** Resolved inline-image sources, in token order (`null` = drop) — IMG-3/4. */
  images?: (string | null)[];
  patch?: Partial<Snippet>;
  id?: string;
  url?: string;
  email?: string;
  password?: string;
  payload?: ScreenshotPayload;
}

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'tessera:capture':
      return { id: await capture(message.snippet ?? {}, message.images) };
    case 'tessera:get-snippets':
      return {
        snippets: await liveSnippetsForUrl(message.url ?? ''),
        total: await libraryCount(),
      };
    case 'tessera:screenshot':
      return captureScreenshot(message.payload);
    case 'tessera:delete':
      await deleteSnippet(message.id ?? '');
      return { ok: true };
    case 'tessera:update':
      return updateSnippet(message.id ?? '', message.patch ?? {});
    case 'auth:get-state':
      return authState();
    case 'auth:sign-in':
      return signIn(message.email ?? '', message.password ?? '');
    case 'auth:sign-up':
      return signUp(message.email ?? '', message.password ?? '');
    case 'auth:sign-out':
      return signOut();
    default:
      return {};
  }
}

/* ---- text capture + query ----------------------------------------------- */

async function capture(input: Partial<Snippet>, images?: (string | null)[]): Promise<string> {
  const now = new Date().toISOString();
  const signedIn = Boolean(supabase && currentUserId);
  // Inline images must be copied into cloud Storage (IMG-4, §10.2-A). Signed out
  // we can't, so strip the tokens rather than persist unresolved placeholders.
  let html = input.html;
  if (html && hasInlineTokens(html) && !signedIn) {
    html = stripImageTokens(html) || undefined;
  }
  const snippet: Snippet = {
    id: newId(),
    userId: currentUserId ?? 'local',
    type: input.type ?? 'text',
    text: input.text,
    html,
    imagePath: input.imagePath,
    url: input.url ?? '',
    domain: input.domain ?? '',
    pageTitle: input.pageTitle ?? '',
    faviconUrl: input.faviconUrl,
    anchor: input.anchor,
    color: input.color,
    note: input.note,
    createdAt: now,
    updatedAt: now,
  };
  await localUpsert(store, 'snippets', snippet);
  void sync(); // push right away if signed in
  notifyChanged();
  // Fetch + upload inline images in the background, then patch the html (IMG-6) —
  // the optimistic snippet above is already saved, so the save never blocks on I/O.
  if (signedIn && images?.length && snippet.html && hasInlineTokens(snippet.html)) {
    void attachInlineImages(snippet.id, images);
  }
  return snippet.id;
}

const INLINE_TOKEN_RE = /<img data-tsr-img="(\d+)">/g;

function hasInlineTokens(html: string): boolean {
  return /<img data-tsr-img="\d+">/.test(html);
}

function stripImageTokens(html: string): string {
  return html.replace(INLINE_TOKEN_RE, '');
}

function rewriteImageTokens(html: string, paths: (string | null)[]): string {
  return html.replace(INLINE_TOKEN_RE, (_match, n: string) => {
    const path = paths[Number(n)];
    return path ? `<img data-tsr-img="${path}">` : '';
  });
}

/**
 * Background image pipeline (IMG-4/6/7): fetch each kept source, upload it to the
 * snippet's `snippet-images` folder, then rewrite the html tokens to the stored
 * paths — dropping any that were filtered out, failed, or weren't images. Only
 * the service worker can do this: it holds the Supabase session and, unlike the
 * content script, isn't bound by the page's CORS policy.
 */
async function attachInlineImages(snippetId: string, images: (string | null)[]): Promise<void> {
  const client = supabase;
  if (!client || !currentUserId) return;
  const userId = currentUserId;
  const paths = await Promise.all(
    images.map(async (src, index) => {
      if (!src) return null;
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) return null;
        return await uploadInlineImage(client, userId, snippetId, index, blob);
      } catch (error) {
        console.error('[Tessera] inline image skipped', src, error);
        return null;
      }
    }),
  );
  const existing = await db.snippets.get(snippetId);
  if (!existing?.html) return;
  const rewritten = rewriteImageTokens(existing.html, paths);
  await localUpsert(store, 'snippets', {
    ...existing,
    html: rewritten || undefined,
    updatedAt: new Date().toISOString(),
  });
  void sync();
  notifyChanged();
}

function liveSnippetsForUrl(url: string): Promise<Snippet[]> {
  if (!url) return Promise.resolve([]);
  return db.snippets
    .where('url')
    .equals(url)
    .filter((snippet) => snippet.deletedAt == null)
    .toArray();
}

/** Count of non-deleted snippets across the whole library (drives empty-state copy). */
function libraryCount(): Promise<number> {
  return db.snippets.filter((snippet) => snippet.deletedAt == null).count();
}

/**
 * Soft-delete a snippet (writes a tombstone that syncs via LWW) and, for an
 * uploaded image/screenshot, best-effort removes its Storage object so the bucket
 * doesn't accumulate orphans. External image references (`http…` srcUrl, stored
 * when signed out) are left alone — they aren't ours to delete.
 */
async function deleteSnippet(id: string): Promise<void> {
  if (!id) return;
  const existing = await db.snippets.get(id);
  const tombstone = await localDelete(store, 'snippets', id);
  if (!tombstone) return; // nothing was there
  void sync();
  notifyChanged();
  if (!existing || !supabase || !currentUserId) return;
  // A lone uploaded image/screenshot object.
  if (
    (existing.type === 'image' || existing.type === 'screenshot') &&
    existing.imagePath &&
    !existing.imagePath.startsWith('http')
  ) {
    void removeSnippetImage(supabase, existing.imagePath).catch((error: unknown) =>
      console.error('[Tessera] failed to remove stored image', error),
    );
  }
  // Inline images of a text passage — their paths live in the saved html (IMG-8).
  const inline = inlineImagePaths(existing.html);
  if (inline.length > 0) {
    void removeSnippetImages(supabase, inline).catch((error: unknown) =>
      console.error('[Tessera] failed to remove inline images', error),
    );
  }
}

/** Merge a patch into an existing snippet (recolor / note from in-page actions) and sync. */
async function updateSnippet(id: string, patch: Partial<Snippet>): Promise<{ ok: boolean }> {
  if (!id) return { ok: false };
  const existing = await db.snippets.get(id);
  if (!existing) return { ok: false };
  const merged: Snippet = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  await localUpsert(store, 'snippets', merged);
  void sync();
  notifyChanged();
  return { ok: true };
}

/* ---- image + screenshot capture ----------------------------------------- */

async function captureImage(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (!info.srcUrl) return;
  const pageUrl = info.pageUrl ?? tab?.url ?? '';
  const id = newId();
  let imagePath = info.srcUrl; // reference fallback (signed out, or upload failed)
  if (supabase && currentUserId) {
    try {
      const blob = await fetch(info.srcUrl).then((response) => response.blob());
      imagePath = await uploadSnippetImage(supabase, currentUserId, id, blob);
    } catch (error) {
      console.error('[Tessera] image upload failed; storing the source URL', error);
    }
  }
  await saveImageSnippet(id, 'image', imagePath, pageUrl, tab?.title ?? '');
}

async function captureScreenshot(
  payload?: ScreenshotPayload,
): Promise<{ id?: string; error?: string }> {
  if (!payload) return { error: 'No region selected.' };
  if (!supabase || !currentUserId) return { error: 'Sign in to save screenshots.' };
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
  const blob = await cropToBlob(dataUrl, payload);
  const id = newId();
  const imagePath = await uploadSnippetImage(supabase, currentUserId, id, blob);
  await saveImageSnippet(
    id,
    'screenshot',
    imagePath,
    payload.url,
    payload.pageTitle,
    payload.domain,
  );
  return { id };
}

async function cropToBlob(dataUrl: string, payload: ScreenshotPayload): Promise<Blob> {
  const source = await fetch(dataUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(source);
  const { rect, dpr } = payload;
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.max(1, Math.round(rect.width * dpr));
  const sh = Math.max(1, Math.round(rect.height * dpr));
  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.convertToBlob({ type: 'image/png' });
}

async function saveImageSnippet(
  id: string,
  type: Extract<SnippetType, 'image' | 'screenshot'>,
  imagePath: string,
  url: string,
  pageTitle: string,
  domain?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const snippet: Snippet = {
    id,
    userId: currentUserId ?? 'local',
    type,
    imagePath,
    url,
    domain: domain ?? domainOf(url),
    pageTitle,
    createdAt: now,
    updatedAt: now,
  };
  await localUpsert(store, 'snippets', snippet);
  void sync();
  notifyChanged();
  console.info(`[Tessera] saved ${type} snippet`, id);
}

/* ---- auth --------------------------------------------------------------- */

interface AuthState {
  configured: boolean;
  user: { id: string; email?: string } | null;
}

async function authState(): Promise<AuthState> {
  if (!supabase) return { configured: false, user: null };
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user ?? null;
  currentUserId = user?.id ?? null;
  return {
    configured: true,
    user: user ? { id: user.id, email: user.email } : null,
  };
}

async function signIn(email: string, password: string): Promise<unknown> {
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return onSignedIn(data.user?.id ?? null, data.user?.email);
}

async function signUp(email: string, password: string): Promise<unknown> {
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };
  if (!data.session) return { needsConfirmation: true };
  return onSignedIn(data.user?.id ?? null, data.user?.email);
}

async function onSignedIn(userId: string | null, email?: string): Promise<unknown> {
  currentUserId = userId;
  if (userId) {
    await claimLocalSnippets(userId);
    void sync();
    notifyChanged();
  }
  notifyAuthChanged();
  return { user: userId ? { id: userId, email } : null };
}

async function signOut(): Promise<unknown> {
  if (supabase) await supabase.auth.signOut();
  currentUserId = null;
  notifyAuthChanged();
  return { ok: true };
}

/**
 * Re-stamp snippets captured before sign-in (`userId: 'local'`, or a different
 * account) with the current user id, so they sync up under the right owner.
 */
async function claimLocalSnippets(userId: string): Promise<void> {
  const all = await db.snippets.toArray();
  for (const snippet of all) {
    if (snippet.userId !== userId) {
      await localUpsert(store, 'snippets', { ...snippet, userId });
    }
  }
}
