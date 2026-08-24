-- Run this if reading a private book fails with "Object not found".
--
-- That message is what Supabase Storage returns both when a file is
-- genuinely missing AND when RLS blocks the read — it deliberately can't
-- be told apart, so no one can probe what exists by trying paths. Given the
-- last two migration issues were both "some statements silently didn't run",
-- the most likely cause is that the storage.objects policies from
-- 0002_supabase_storage.sql never actually got created. This re-creates
-- them directly. Safe to run regardless of current state.

drop policy if exists "members read books" on storage.objects;
create policy "members read books" on storage.objects
  for select using (bucket_id = 'books' and is_member());

drop policy if exists "members upload books" on storage.objects;
create policy "members upload books" on storage.objects
  for insert with check (bucket_id = 'books' and is_member());

drop policy if exists "members update books" on storage.objects;
create policy "members update books" on storage.objects
  for update using (bucket_id = 'books' and is_member())
  with check (bucket_id = 'books' and is_member());

drop policy if exists "members delete books" on storage.objects;
create policy "members delete books" on storage.objects
  for delete using (bucket_id = 'books' and is_member());

drop policy if exists "members write covers" on storage.objects;
create policy "members write covers" on storage.objects
  for insert with check (bucket_id = 'covers' and is_member());

drop policy if exists "members update covers" on storage.objects;
create policy "members update covers" on storage.objects
  for update using (bucket_id = 'covers' and is_member())
  with check (bucket_id = 'covers' and is_member());

-- Verify: should be 6 rows, all referencing is_member() and the right buckets.
select policyname, cmd, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
