-- Tessera — Storage: the private bucket that holds saved images and screenshot
-- clips (PRD §8.4 content durability). Objects are namespaced by owner under a
-- `{user_id}/...` path prefix, and row-level security on storage.objects keeps
-- each user to their own folder — the same per-user isolation as the data tables.

insert into storage.buckets (id, name, public)
values ('snippet-images', 'snippet-images', false)
on conflict (id) do nothing;

-- Helper: the first path segment must be the caller's user id.
-- e.g. object name "a1b2.../diagram.png" -> owner folder "a1b2...".

drop policy if exists "snippet_images_select_own" on storage.objects;
create policy "snippet_images_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'snippet-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "snippet_images_insert_own" on storage.objects;
create policy "snippet_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'snippet-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "snippet_images_update_own" on storage.objects;
create policy "snippet_images_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'snippet-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'snippet-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "snippet_images_delete_own" on storage.objects;
create policy "snippet_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'snippet-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
