-- Tessera — account deletion (PRD §8.3: "Account deletion purges all user data
-- (snippets, documents, images, embeddings, AI artifacts)").
--
-- One RPC the signed-in user calls to erase themselves. Every public table FKs
-- `user_id` to `auth.users(id) ON DELETE CASCADE` (see 0001_init), so deleting
-- the auth user purges user_settings, provider_keys, snippets, tags,
-- snippet_tags, documents, document_items, snippet_embeddings, ai_artifacts, and
-- flashcards in a single cascade.
--
-- Saved images in the private `snippet-images` bucket are removed client-side via
-- the Storage API *before* this runs (`deleteAccount` in apps/web): Supabase
-- blocks direct SQL deletes from `storage.objects` so the underlying files are
-- actually reclaimed, so storage cleanup can't live in this function.
--
-- SECURITY DEFINER because deleting from the `auth` schema needs elevated rights
-- the `authenticated` role lacks. The body is strictly scoped to `auth.uid()`, so
-- a caller can only ever delete *itself*, and `set search_path = ''` forces every
-- reference to be schema-qualified (no search-path hijacking of an unqualified name).

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'delete_account: not authenticated';
  end if;

  -- Delete the auth user; every public.* table cascades from its user_id FK.
  delete from auth.users where id = uid;
end;
$$;

-- Only an authenticated session may erase its own account — never anon/public.
revoke all on function public.delete_account() from public;
revoke all on function public.delete_account() from anon;
grant execute on function public.delete_account() to authenticated;
