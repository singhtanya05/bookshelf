-- ============================================================================
-- Tagging a member on an annotation, and a library-wide view of every note.
--
-- The tag lives as a plain column on the existing annotations row — same
-- table, same RLS as everything else. There is no separate client-only
-- "tagged" state to lose; it is a fact in Postgres from the moment it is
-- saved, exactly like the note text itself.
-- ============================================================================

alter table annotations add column if not exists tagged_user_id uuid references auth.users on delete set null;

create index if not exists annotations_tagged_idx on annotations (tagged_user_id) where tagged_user_id is not null;

-- Library-wide notes view: every annotation, joined with the book it
-- belongs to, so "all my notes across every book" is one query instead of
-- one query per book. RLS on the underlying tables still applies — a
-- non-member gets nothing from this view either.
create or replace view annotations_with_book
with (security_invoker = on) as
  select
    a.id, a.user_id, a.book_id, a.type, a.cfi_range, a.selected_text,
    a.note, a.color, a.tagged_user_id, a.created_at, a.updated_at,
    b.title as book_title, b.author as book_author
  from annotations a
  join books b on b.id = a.book_id;

grant select on annotations_with_book to authenticated;

-- Verify:
select 'tagged_user_id exists' as check,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'annotations'
  and column_name = 'tagged_user_id';
