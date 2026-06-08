# @tessera/extension

Tessera's capture surface — a Chrome MV3 extension (Vite + React + Tailwind, built
with [@crxjs/vite-plugin](https://crxjs.dev)). Highlight text on any page and save
it with a deep-link anchor back to the exact passage.

## Status — M1 (capture · persist · re-highlight · sync)

- [x] MV3 scaffold (manifest, Vite + crxjs build, React popup, Tailwind)
- [x] Content script: text selection → floating **Save to Tessera** → deep-link
      anchor (`@tessera/core`) → posts the snippet to the background
- [x] Background service worker: owns the extension's **Dexie local store**
      (`@tessera/db`), persists captures, serves snippets-by-url; right-click menu
- [x] Re-highlight saved passages on revisit (CSS Custom Highlight API)
- [x] **Email/password auth + cloud sync** (Supabase; session in `chrome.storage`,
      `SyncEngine` in the background)
- [x] Per-page popup list of saved snippets, with **per-snippet delete** (inline
      confirm → tombstone syncs + removes the Storage object)
- [x] First-run **Getting started** guide + teaching empty states (PRD ON-2/ON-3)
- [x] **Image capture** (right-click → Save) + **screenshot-region capture**,
      copied to the `snippet-images` Storage bucket (PRD §8.4 durability)
- [ ] Magic-link auth (deferred to the web app, M2)

## Develop

```bash
npm run dev --workspace @tessera/extension     # Vite dev server + HMR
npm run build --workspace @tessera/extension   # production build → dist/
```

## Load it in Chrome

1. `npm run build --workspace @tessera/extension` (or `npm run build` from the root).
2. Open `chrome://extensions` and enable **Developer mode**.
3. **Load unpacked** → select `apps/extension/dist`.
4. Select text on any page → click **Save to Tessera**.
5. **Reload the page** — the saved passage is re-highlighted in place (indigo).
   Captures persist in the extension's IndexedDB.

## Cloud sync

Captures persist locally even when signed out. To sync to Supabase:

1. Build with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set (the root `.env`
   already points at your local Supabase). Make sure `supabase start` is running.
2. Open the popup → **sign in**, or **Create account** (with local Supabase, email
   confirmation is off, so it signs you in immediately).
3. On sign-in the background claims your existing local captures, pushes them, and
   pulls remote changes (`SyncEngine` + `SupabaseRemoteAdapter`; re-syncs every
   5 min and after each capture). Verify in Studio → Table Editor → `snippets`.

Auth is **email/password** in the extension — the session lives in `chrome.storage`
because a service worker has no `localStorage`. Magic-link is deferred to the web
app (M2), where the redirect lands naturally.

## Capturing images & screenshots

- **Image:** right-click any image → **Save to Tessera**. Signed in, the image is
  fetched and copied into the `snippet-images` bucket (durable); signed out, the
  source URL is stored as a reference.
- **Screenshot:** open the popup (signed in) → **Capture screenshot region** →
  drag a rectangle. The background captures the visible tab, crops it on an
  `OffscreenCanvas`, and uploads it. Screenshots require sign-in (they need Storage).

The deep-link anchoring algorithm lives in `@tessera/core` (`anchor.ts`), shared
with the rest of the platform. See PRD §7.1 (capture) and §9 (architecture).
