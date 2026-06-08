# @tessera/web

The Tessera **platform** — the synced study library web app (PRD M2). Next.js
App Router + Tailwind, sharing the exact same local-first data layer as the
extension (`@tessera/core` types, `@tessera/db` engine).

## What it does (M2 — Platform Library)

- **Browse by website** (LIB-1): the home groups every snippet by its source
  domain. Drill into a site (`/site/[domain]`) to see its pages and snippets in
  capture order (LIB-2).
- **Search & filter** (LIB-3/LIB-4): full-text search across text/notes/titles
  plus filters by type, highlight color, and date range; sort newest/oldest
  (LIB-7). Any active query/filter switches the home into a flat result list.
- **Snippet detail** (LIB-5): full text or image, the source page, per-snippet
  note, metadata, and delete.
- **Open source** (LIB-6): a native `#:~:text=` Text Fragment deep link scrolls
  the original page to the saved passage — and the extension re-highlights on top
  if installed.

## How it's wired

- **Local-first SPA.** The Supabase session lives in the browser; reads come from
  IndexedDB via Dexie (`useLiveQuery`), so the UI never blocks on the network and
  updates itself the instant the sync engine writes pulled rows.
- **Sync.** On sign-in the app builds a `SyncEngine` (`@tessera/db`) over
  `['snippets']` and syncs on load, on an interval, and on focus/reconnect.
- **Auth.** Magic-link with an email/password fallback (PRD §15.1), all
  client-side (`detectSessionInUrl` + PKCE).
- **Images.** The private `snippet-images` bucket is read via short-lived signed
  URLs; external `http…` references are used as-is.

`src/lib` holds the wiring (`supabase.ts`, `db.ts`), pure logic
(`snippets.ts` — grouping/filter/sort/deep-link/format), and React hooks
(`hooks.ts`). `src/components` is the UI; `src/app` is the routes.

## Develop

Env comes from the **repo-root `.env`** (`NEXT_PUBLIC_SUPABASE_*`), loaded by
`next.config.mjs` — no separate web `.env` needed. Build the shared packages
first (the workspace build order handles this), then run the dev server:

```bash
npm run build -w @tessera/core -w @tessera/db   # ensure dist/ exists
npm run dev   -w @tessera/web                    # http://localhost:3000
```

For real data, run the backend (`npx supabase start`) and sign in; captures from
the extension sync straight into the library.

## Not yet (later milestones)

Documents / "add to document" / "where used" and note+tag editing are **M3**; tag
**filtering** waits on tags being captured (M3). Most-referenced sort and AI tools
are later. Large-library list virtualization (PRD §8.1, 1000+) is a fast-follow.
