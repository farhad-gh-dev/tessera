# Supabase

The synced backend for Tessera: Postgres (+ pgvector), Auth, Storage, and
Realtime. Per-user isolation is enforced by row-level security.

## Layout

```
supabase/
  config.toml                    # local-dev config for `supabase start`
  migrations/
    20260607000000_init.sql      # tables, RLS, pgvector, FTS, sync_push, updated_at trigger
    20260607000100_storage.sql   # snippet-images private bucket + per-user RLS
```

## Run it locally (Docker) — recommended for development

No cloud account needed. Requires Docker Desktop running + the Supabase CLI.

```bash
npx supabase start       # boots Postgres, Auth, Storage, Realtime, Studio in Docker
npx supabase db reset    # applies everything in migrations/ (re-run anytime to reset)
```

`supabase start` prints your local **API URL** plus two keys — the
**publishable** key (`sb_publishable_…`, the new name for the anon key) and the
**secret** key (`sb_secret_…`, the new service-role key). Copy them into
`../.env`. Handy local URLs:

| Service                               | URL                                                   |
| ------------------------------------- | ----------------------------------------------------- |
| API / PostgREST                       | http://127.0.0.1:54321                                |
| Studio (dashboard)                    | http://127.0.0.1:54323                                |
| Mailpit (magic-link / signup emails) | http://127.0.0.1:54324                                |
| Postgres                              | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`config.toml` keeps the local stack light (analytics off) and points auth
redirects at the web app's dev origin. Stop everything with `npx supabase stop`.

## Deploy to hosted (supabase.com) — for the beta

```bash
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push     # applies migrations/ to the linked cloud project
```

Grab the project's URL + anon/service-role keys from Settings → API and put them
in `../.env`. _Prefer the dashboard?_ Paste each file in `migrations/` (in
filename order) into the SQL Editor — the SQL is idempotent.

## Verify the sync path end-to-end

Create a test user (Studio → Authentication → Users → Add user — same locally or
hosted), put its email/password in `../.env`, then from the repo root:

```bash
npm run build
node --env-file=.env packages/db/scripts/sync-smoke.mjs
```

It signs in and runs two in-memory "devices" through whichever Supabase your
`.env` points at, asserting create / edit (last-write-wins) / delete-tombstone
convergence via `sync_push` under row-level security. Without the env vars it
skips cleanly.

## What's modeled

See PRD §10. Tables: `user_settings`, `provider_keys`, `snippets`, `tags`,
`snippet_tags`, `documents`, `document_items`, `snippet_embeddings`,
`ai_artifacts`, `flashcards`. Every synced row carries `updated_at` and a
`deleted_at` tombstone for last-write-wins sync.

- **`sync_push(_table, _rows)`** — the conditional last-write-wins upsert the
  sync engine pushes through (`packages/db`). Generic over the syncable tables;
  runs under the caller's RLS so a user can only write their own rows.
- **`set_updated_at` trigger** — honors a client-supplied `updated_at`, so
  conflict resolution is "last edit wins" (see `packages/db/README.md`).
- **`provider_keys.key_ciphertext`** stores **encrypted** BYO API keys; never
  expose plaintext to the client.
- **`snippet_embeddings.embedding`** is `vector(1536)` — match this to the chosen
  fixed embedding model before beta.
- **`snippet-images`** is a private Storage bucket; objects live under a
  `{user_id}/...` prefix enforced by RLS.
