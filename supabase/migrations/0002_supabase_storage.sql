-- ============================================================================
-- Storage on Supabase rather than R2.
--
-- Book bytes live in a PRIVATE bucket named `books`; covers live in a PUBLIC
-- bucket named `covers`. Access is governed by policies on storage.objects,
-- the same is_member() gate used everywhere else — so there is one definition
-- of "may read the library", not two that can drift apart.
-- ============================================================================

-- Public-domain books are served from the site itself, so they need no
-- session and no signed URL. Only ever set for is_public rows.
alter table books add column if not exists public_path text;

-- Rebuild the public view to carry it. Still no storage_key: an anonymous
-- visitor gets the shelf art and nothing that locates a private file.
create or replace view public_catalogue
with (security_invoker = off) as
  select id, title, author, category, format, spine_color, cover_path,
         is_public, public_path, created_at
  from books;

revoke all on public_catalogue from anon, authenticated;
grant select on public_catalogue to anon, authenticated;

-- ============================================================ storage RLS ===
-- Supabase enables RLS on storage.objects by default; without policies,
-- nothing is readable, which is the correct starting point.

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

-- Covers: the bucket is public so reads need no policy. Writes still don't.
drop policy if exists "members write covers" on storage.objects;
create policy "members write covers" on storage.objects
  for insert with check (bucket_id = 'covers' and is_member());

drop policy if exists "members update covers" on storage.objects;
create policy "members update covers" on storage.objects
  for update using (bucket_id = 'covers' and is_member())
  with check (bucket_id = 'covers' and is_member());

-- ------------------------------------------------------------------ demo ---
-- The bundled Gutenberg volume, readable by anyone, served from the site.
insert into books (id, title, author, category, format, spine_color,
                   storage_key, is_public, public_path)
values ('00000000-0000-4000-8000-000000000001',
        'Alice''s Adventures in Wonderland', 'Lewis Carroll',
        'Public Domain', 'epub', '#5F4B3C',
        'site:demo', true, 'books/demo.epub')
on conflict (id) do update
  set is_public   = true,
      public_path = excluded.public_path,
      title       = excluded.title,
      author      = excluded.author;
