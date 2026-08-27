-- Enables real (Supabase-backed) likes/matches/messages, wired up in the app for the first
-- time in this migration's companion code change. Two things needed beyond the existing
-- 001_schema.sql tables:

-- 1) Dedup guard: two users' clients can both detect a mutual like at nearly the same moment
--    and both try to insert a match row. The existing unique(user_a, user_b) constraint only
--    catches an exact-order duplicate -- (me, them) and (them, me) are different keys to it,
--    so a race could still create two match rows for the same pair. A generated "pair_key"
--    column collapses both orderings to the same value, so the unique index actually catches it
--    regardless of which side inserts in which order.
alter table public.matches
  add column if not exists pair_key text
  generated always as (least(user_a::text, user_b::text) || '_' || greatest(user_a::text, user_b::text)) stored;

create unique index if not exists matches_pair_key_unique on public.matches(pair_key);

-- 2) Realtime: the app subscribes to postgres_changes on matches/messages so a match or message
--    from the other side shows up live without a refresh. Supabase projects created recently
--    usually have this on by default for all tables, but it's not guaranteed -- this makes it
--    explicit. Safe to re-run; ignore a "relation is already member of publication" notice.
do $$
begin
  execute 'alter publication supabase_realtime add table public.matches';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.messages';
exception when duplicate_object then null;
end $$;
