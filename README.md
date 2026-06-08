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
  extension/   # Chrome MV3 extension (Vite+React) — capture + deep-link anchor  [M1, in progress]
  web/         # (M2) Next.js platform — library, documents, notes, export, AI
supabase/
  migrations/  # Postgres schema as versioned migrations (RLS + pgvector + sync_push + Storage)
```

## Status — M0 complete · M1 in progress

- [x] Monorepo + shared `@tessera/core` (domain model + deep-link anchoring)
- [x] Dev tooling (ESLint, Prettier, Vitest) + CI (`.github/workflows/ci.yml`)
- [x] Postgres schema (RLS + `sync_push`) as `db push`-able migrations (`supabase/migrations/`)
- [x] `@tessera/db` local-first store + sync engine — LWW + tombstones, verified in-memory **and end-to-end** against local Supabase
- [x] **M1 (in progress):** Chrome MV3 extension (`apps/extension`) — capture → deep-link anchor → persist (Dexie) → re-highlight on revisit; cloud sync + auth next

See the PRD §11 for the full M0–M5 roadmap, and [`packages/db/README.md`](./packages/db/README.md) for the sync design.

## Tech

- **Language:** TypeScript end-to-end
- **Extension:** React + Vite + Tailwind (Manifest V3)
- **Web:** Next.js (App Router) + Tailwind + shadcn/ui
- **Backend:** Supabase (Postgres + pgvector, Auth, Storage, Realtime, RLS)
- **Local-first:** IndexedDB (Dexie) mirror + sync engine (last-write-wins + tombstones)
- **AI:** provider-agnostic (Claude / GPT / Gemini, user-selectable); bring-your-own-key in v1

## Getting started

```bash
npm install              # install workspace deps
npm run build            # build all packages (@tessera/core, @tessera/db)
npm test                 # run the sync-engine test suite (@tessera/db)
npm run lint             # ESLint across the monorepo
```

For the backend, develop fully offline with Supabase running locally in Docker:

```bash
npx supabase start       # run Postgres + Auth + Storage locally; prints your URL + keys
npx supabase db reset    # apply supabase/migrations/
```

See [`supabase/README.md`](./supabase/README.md) for local + hosted setup and the
end-to-end sync check. Apps are added in M1 (extension) and M2 (web); until then
the `core` and `db` packages plus the schema are the foundation.
