-- Members seed — TEMPLATE (safe to commit; contains no real identifiers).
--
-- Copy to supabase/seed.members.sql, fill in the two UUIDs, and run it in the
-- Supabase SQL Editor. The real file is gitignored: this repo is public, and
-- account identifiers do not belong in it.
--
-- Get the UUIDs from Supabase → Authentication → Users, after you create the
-- two accounts. Membership is deliberately not self-serve: signing up gives a
-- session, but only a row here grants access to any book.

insert into members (user_id, display_name, color) values
  ('00000000-0000-0000-0000-000000000000', 'Tee', '#E88D56'),  -- warm orange
  ('00000000-0000-0000-0000-000000000000', 'Vee', '#2659A5')   -- deep blue
on conflict (user_id) do update
  set display_name = excluded.display_name,
      color        = excluded.color;

-- The colours are load-bearing: every highlight and note is drawn in its
-- author's colour, so you can tell your marks from Vee's at a glance.

-- Verify:
--   select display_name, color from members;
