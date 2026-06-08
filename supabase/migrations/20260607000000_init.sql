-- Tessera — Postgres schema (v0.1)
-- See PRD §10 (data model) and §8.3 (security). Apply via the Supabase SQL
-- editor or `supabase db push`. Every table is private to its owning user via
-- row-level security (user_id = auth.uid()).

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";     -- pgvector for embeddings

-- Keep updated_at fresh on UPDATE, but honor a client-supplied value. The
-- local-first sync engine (packages/db) authors `updated_at` at edit time so
-- conflict resolution is "last edit wins"; if the writer didn't change it (a
-- plain server-side edit), bump to now(). See packages/db/README.md.
create or replace function set_updated_at() returns trigger as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- user_settings (per-user prefs incl. the user-selected default AI model)
-- ---------------------------------------------------------------------------
create table if not exists user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  default_provider text,
  default_model    text,
  prefs            jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- provider_keys (BYOK; ciphertext only, never returned to the client raw)
-- ---------------------------------------------------------------------------
create table if not exists provider_keys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  provider       text not null,
  key_ciphertext text not null,
  label          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- snippets (the atomic saved item)
-- ---------------------------------------------------------------------------
create table if not exists snippets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('text','image','screenshot')),
  text        text,
  html        text,
  image_path  text,
  url         text not null,
  domain      text not null,
  page_title  text not null default '',
  favicon_url text,
  anchor      jsonb,
  color       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists snippets_user_domain_idx  on snippets (user_id, domain);
create index if not exists snippets_user_updated_idx on snippets (user_id, updated_at desc);
create index if not exists snippets_fts_idx on snippets using gin (
  to_tsvector('english',
    coalesce(text,'') || ' ' || coalesce(note,'') || ' ' || coalesce(page_title,''))
);

-- ---------------------------------------------------------------------------
-- tags + snippet_tags
-- ---------------------------------------------------------------------------
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, name)
);

create table if not exists snippet_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  snippet_id uuid not null references snippets(id) on delete cascade,
  tag_id     uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (snippet_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- documents + document_items (reference model)
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Untitled',
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists document_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  position    text not null,                              -- fractional index
  kind        text not null check (kind in ('snippet_ref','heading','text_block')),
  snippet_id  uuid references snippets(id) on delete cascade,
  content     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists document_items_doc_idx on document_items (document_id, position);

-- ---------------------------------------------------------------------------
-- snippet_embeddings (single fixed embedding model — see PRD AI-9)
-- ---------------------------------------------------------------------------
create table if not exists snippet_embeddings (
  snippet_id uuid primary key references snippets(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  embedding  vector(1536),
  model      text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ai_artifacts (cached summaries / flashcards / quizzes)
-- ---------------------------------------------------------------------------
create table if not exists ai_artifacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  scope      text not null check (scope in ('document','website')),
  scope_ref  text not null,
  type       text not null check (type in ('summary','flashcards','quiz')),
  content    jsonb not null,
  model      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- flashcards (reviewable, with spaced-repetition state)
-- ---------------------------------------------------------------------------
create table if not exists flashcards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  document_id       uuid references documents(id) on delete cascade,
  front             text not null,
  back              text not null,
  source_snippet_id uuid references snippets(id) on delete set null,
  srs_state         jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'provider_keys','snippets','tags','snippet_tags',
    'documents','document_items','ai_artifacts','flashcards'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on %I;', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on %I '
      'for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security: each row is private to its owner.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','provider_keys','snippets','tags','snippet_tags',
    'documents','document_items','snippet_embeddings','ai_artifacts','flashcards'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || '_owner', t);
    execute format(
      'create policy %I on %I using (user_id = auth.uid()) '
      'with check (user_id = auth.uid());', t || '_owner', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- sync_push: the conditional last-write-wins upsert used by the local-first
-- sync engine (packages/db). It is generic over the syncable tables and resolves
-- the column list from the catalog, so it keeps working as tables gain columns.
-- `security invoker` means row-level security still applies — a user can only
-- write their own rows. The `where excluded.updated_at >= t.updated_at` guard
-- ensures a stale device can never overwrite newer server data. Rows that lose
-- the comparison are simply not returned (the client ignores echoes anyway).
-- ---------------------------------------------------------------------------
create or replace function sync_push(_table text, _rows jsonb)
returns setof jsonb
language plpgsql
security invoker
as $$
declare
  _allowed text[] := array[
    'snippets','tags','snippet_tags','documents','document_items',
    'provider_keys','ai_artifacts','flashcards'
  ];
  _cols text;
  _set  text;
begin
  if not (_table = any(_allowed)) then
    raise exception 'sync_push: table % is not syncable', _table;
  end if;

  select
    string_agg(quote_ident(column_name), ', ' order by ordinal_position),
    string_agg(format('%1$I = excluded.%1$I', column_name), ', '
               order by ordinal_position)
    into _cols, _set
  from information_schema.columns
  where table_schema = 'public' and table_name = _table;

  return query execute format(
    'insert into %1$I as t (%2$s) '
    'select %2$s from jsonb_populate_recordset(null::%1$I, $1) '
    'on conflict (id) do update set %3$s '
    'where excluded.updated_at >= t.updated_at '
    'returning to_jsonb(t)',
    _table, _cols, _set)
  using _rows;
end;
$$;
