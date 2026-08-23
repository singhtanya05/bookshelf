-- ============================================================================
-- Shelf: private library schema
--
-- Access model:
--   anon    -> may read the SHELF VISUALS only (title, author, cover, colour)
--              via the public_catalogue view. Never sees storage_key.
--   member  -> may read book rows incl. storage_key, read ALL members'
--              progress + annotations, but write only their own.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- members ---
-- The circle. A row here is what makes an auth user a member; signing up is
-- not enough. Seed it manually with the two of you.
create table if not exists members (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text not null,
  -- per-person annotation colour, so you can tell whose highlight is whose
  color        text not null default '#E88D56',
  created_at   timestamptz not null default now()
);

create or replace function is_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from members where user_id = auth.uid());
$$;

-- ------------------------------------------------------------------ books ---
create table if not exists books (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  author       text not null default 'Unknown Author',
  category     text not null default 'Uncategorized',
  format       text not null check (format in ('epub','pdf','mobi','azw3','cbz','txt')),
  spine_color  text not null default '#2B3B4C',
  cover_path   text,                       -- PUBLIC bucket: low-res thumbnail
  storage_key  text not null,              -- PRIVATE R2 key: members only
  file_size    bigint,
  is_public    boolean not null default false,  -- true only for demo.epub
  added_by     uuid references auth.users on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists books_category_idx on books (category);

-- ------------------------------------------------------- reading_progress ---
create table if not exists reading_progress (
  user_id    uuid not null references auth.users on delete cascade,
  book_id    uuid not null references books on delete cascade,
  location   text,                    -- EPUB CFI, or PDF page number as text
  percentage real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- ------------------------------------------------------------ annotations ---
create table if not exists annotations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  book_id       uuid not null references books on delete cascade,
  type          text not null check (type in ('highlight','note','bookmark')),
  cfi_range     text not null,        -- epub.js CFI range, or "pdf:<page>:<rects>"
  selected_text text,
  note          text,
  color         text not null default '#FFD54F',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists annotations_book_idx on annotations (book_id);

-- =============================================================== POLICIES ===
alter table members          enable row level security;
alter table books            enable row level security;
alter table reading_progress enable row level security;
alter table annotations      enable row level security;

-- members: the circle can see who is in the circle. Nobody self-enrols.
drop policy if exists members_read on members;
create policy members_read on members
  for select using (is_member());

-- books: full rows (incl. storage_key) are members-only.
drop policy if exists books_read on books;
create policy books_read on books
  for select using (is_member());

drop policy if exists books_insert on books;
create policy books_insert on books
  for insert with check (is_member() and added_by = auth.uid());

drop policy if exists books_update on books;
create policy books_update on books
  for update using (is_member()) with check (is_member());

drop policy if exists books_delete on books;
create policy books_delete on books
  for delete using (is_member());

-- progress: everyone in the circle SEES everyone's position (that is the
-- feature), but writes only their own row.
drop policy if exists progress_read on reading_progress;
create policy progress_read on reading_progress
  for select using (is_member());

drop policy if exists progress_write on reading_progress;
create policy progress_write on reading_progress
  for insert with check (is_member() and user_id = auth.uid());

drop policy if exists progress_update on reading_progress;
create policy progress_update on reading_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- annotations: same shape — read all, write own.
drop policy if exists ann_read on annotations;
create policy ann_read on annotations
  for select using (is_member());

drop policy if exists ann_insert on annotations;
create policy ann_insert on annotations
  for insert with check (is_member() and user_id = auth.uid());

drop policy if exists ann_update on annotations;
create policy ann_update on annotations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ann_delete on annotations;
create policy ann_delete on annotations
  for delete using (user_id = auth.uid());

-- ======================================================= PUBLIC CATALOGUE ===
-- The ONLY thing an anonymous visitor can read. Deliberately omits
-- storage_key and file_size: there is no path here to follow.
-- SECURITY DEFINER (security_invoker off) so it bypasses the members-only
-- policy above while still exposing just these columns.
create or replace view public_catalogue
with (security_invoker = off) as
  select id, title, author, category, format, spine_color, cover_path, is_public
  from books;

revoke all on public_catalogue from anon, authenticated;
grant select on public_catalogue to anon, authenticated;

-- Realtime: friend's highlights and position appear live.
alter publication supabase_realtime add table annotations;
alter publication supabase_realtime add table reading_progress;
