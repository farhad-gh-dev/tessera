# Tessera

Capture web highlights into a synced, AI-assisted study platform.

Highlight any passage (text, image, or screenshot region) on any web page and
save it — with a deep-link anchor back to the exact spot. Everything lands in a
cloud-synced library, auto-grouped by source website, and can be curated into
custom **documents** that mix material from many sites. AI study tools
(summaries, grounded Q&A, flashcards, quizzes) run over your own saved material.

> **Spec:** see the PRD at [`./docs/Tessera-PRD-v0.1.md`](./docs/Tessera-PRD-v0.1.md).
> Tessera is a standalone project. A separate earlier project of the founder's lives at `../luminote`.

## Monorepo layout

```
packages/
  core/        # Shared TypeScript domain types, ids, anchor utils (used by every surface)
  db/          # Local-first store + sync engine (IndexedDB ⇄ Supabase, LWW + tombstones)
apps/
  extension/   # Chrome MV3 extension (Vite+React) — capture, deep-link anchor, sync  [M1 ✓]
  web/         # Next.js platform — synced library + documents/notes  [M2–M3 ✓; export + AI to come]
supabase/
  migrations/  # Postgres schema as versioned migrations (RLS + pgvector + sync_push + Storage)
```

## Status — M0–M3 complete · M4 (export + beta hardening) next

- [x] **M0 — Foundations.** Monorepo + shared `@tessera/core` (domain model + deep-link anchoring), Postgres schema (RLS + `sync_push` + pgvector + Storage) as `db push`-able migrations, dev tooling (ESLint, Prettier, Vitest) + CI, and the `@tessera/db` local-first sync engine — LWW + tombstones, verified in-memory **and end-to-end** against local Supabase
- [x] **M1 — Capture + sync.** Chrome MV3 extension (`apps/extension`): text / image / screenshot-region capture → deep-link anchor → persist (Dexie) → re-highlight on revisit; email-password auth + push/pull cloud sync; per-page popup, first-run guide + teaching empty states
- [x] **M2 — Platform library.** Next.js web app (`apps/web`): magic-link + email-password auth, browse-by-website, page drill-down, full-text search, filter by type / color / date, snippet detail, and "open source" native `#:~:text=` deep links
- [x] **M3 — Documents + notes.** Custom documents that reference snippets from any site (multi-source), drag-reorder (+ keyboard up/down), interleaved headings/notes, "where used"; per-snippet note / tag / color / light-text editing; tag filter + most-referenced sort. Sync engine hardened for cross-table foreign keys (parent-first push order + per-table error isolation)
- [ ] **M4 — Export + beta hardening** — Markdown / PDF export, onboarding polish, account delete/export
- [ ] **M5 — AI study tools** — summaries, grounded Q&A with citations, flashcards, quizzes (BYOK)

See the PRD §11 for the full M0–M5 roadmap, and [`packages/db/README.md`](./packages/db/README.md) for the sync design.

## Tech

- **Language:** TypeScript end-to-end
- **Extension:** React + Vite + Tailwind (Manifest V3)
- **Web:** Next.js (App Router) + Tailwind + lean shadcn-style UI primitives
- **Backend:** Supabase (Postgres + pgvector, Auth, Storage, Realtime, RLS)
- **Local-first:** IndexedDB (Dexie) mirror + sync engine (last-write-wins + tombstones)
- **AI:** provider-agnostic (Claude / GPT / Gemini, user-selectable); bring-your-own-key in v1

## Getting started

```bash
npm install              # install workspace deps
npm run build            # build all workspaces (core, db, extension, web)
npm test                 # run the sync-engine test suite (@tessera/db)
npm run lint             # ESLint across the monorepo
npm run typecheck        # type-check every workspace
```

For the backend, develop fully offline with Supabase running locally in Docker:

```bash
npx supabase start       # run Postgres + Auth + Storage locally; prints your URL + keys
npx supabase db reset    # apply supabase/migrations/
```

Run the web platform (after copying the printed Supabase URL + anon key into the
repo-root `.env`):

```bash
npm run dev -w @tessera/web   # Next.js dev server on http://localhost:3001
```

> **Tip:** while the web dev server is running, build only the shared packages —
> `npm run build -w @tessera/core -w @tessera/db`. The workspace-wide `npm run build`
> also runs `next build`, which overwrites the dev server's `.next` cache and breaks
> it (recover by deleting `apps/web/.next` and restarting).

See [`supabase/README.md`](./supabase/README.md) for local + hosted setup and the
end-to-end sync check, and [`packages/db/README.md`](./packages/db/README.md) for the
local-first sync design.
