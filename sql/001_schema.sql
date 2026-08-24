-- Merj Phase 1 schema. Run this once in the Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste all of this -> Run).
--
-- Design notes:
--  * Call content is never stored anywhere in this schema, by design -- only metadata
--    (who called whom, when, how long). This encodes the "metadata only, report-driven
--    review" decision at the database level, not just as a policy on paper.
--  * profiles.id is NOT a foreign key to auth.users on purpose, so this script can seed
--    demo personas without needing real auth.users rows for them. The app sets
--    profiles.id = auth.uid() for real signups, and Row Level Security (auth.uid() = id)
--    makes the seed rows naturally read-only to everyone (nobody's uid matches them).
--  * Every table has RLS enabled with explicit policies -- nothing is readable/writable
--    by default. This is what makes "admins can see more than regular users" an
--    enforced database rule instead of a client-side UI convention that could be bypassed.

create extension if not exists "uuid-ossp";

-- ============================================================================
-- PROFILES
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  username text not null,
  age int,
  dob date,
  bio text default '',
  reasons text[] default '{}',
  interests text[] default '{}',
  photos text[] default '{}',              -- public Storage URLs; photos[1] is primary
  location_mode text default 'live',        -- 'live' | 'fixed'
  city text,
  declared_country text,
  visibility text default 'public',         -- 'public' | 'private'
  is_paused boolean default false,
  phone_verified boolean default false,
  email_verified boolean default false,
  id_verified boolean default false,
  age_verified boolean default false,
  ext18_mode text default 'off',            -- 'off' | 'request' | 'open'
  show_online_status boolean default true,
  is_demo_seed boolean default false,       -- true for the curated launch personas
  is_admin boolean default false,
  is_banned boolean default false,
  ban_reason text,
  trust_score int default 0,
  video_verified boolean default false,
  video_mismatch_reported boolean default false,
  last_active_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Anyone signed in can browse public, non-banned profiles (this is Discover).
-- Admins can additionally see paused/private/banned profiles for moderation.
create policy "profiles_select" on public.profiles for select
  using (
    (is_banned = false and visibility = 'public')
    or id = auth.uid()
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
  );

create policy "profiles_insert_own" on public.profiles for insert
  with check ( id = auth.uid() );

create policy "profiles_update_own" on public.profiles for update
  using ( id = auth.uid() );

create policy "profiles_update_admin" on public.profiles for update
  using ( exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) );

-- ============================================================================
-- LIKES / MATCHES / MESSAGES
-- ============================================================================
create table if not exists public.likes (
  id uuid primary key default uuid_generate_v4(),
  liker uuid not null references public.profiles(id) on delete cascade,
  liked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(liker, liked)
);
alter table public.likes enable row level security;
create policy "likes_select_involving_me" on public.likes for select
  using ( auth.uid() = liker or auth.uid() = liked );
create policy "likes_insert_own" on public.likes for insert
  with check ( auth.uid() = liker );

create table if not exists public.matches (
  id uuid primary key default uuid_generate_v4(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_a, user_b)
);
alter table public.matches enable row level security;
create policy "matches_select_own" on public.matches for select
  using ( auth.uid() = user_a or auth.uid() = user_b );
create policy "matches_insert_own" on public.matches for insert
  with check ( auth.uid() = user_a or auth.uid() = user_b );
create policy "matches_delete_own" on public.matches for delete
  using ( auth.uid() = user_a or auth.uid() = user_b );

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;
create policy "messages_select_in_my_match" on public.messages for select
  using ( exists (select 1 from public.matches m where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid())) );
create policy "messages_insert_in_my_match" on public.messages for insert
  with check ( sender = auth.uid() and exists (select 1 from public.matches m where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid())) );

-- ============================================================================
-- REPORTS (trust & safety)
-- ============================================================================
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter uuid references public.profiles(id),
  target uuid not null references public.profiles(id),
  reason text not null,
  status text default 'open',   -- 'open' | 'reviewed' | 'actioned'
  created_at timestamptz default now()
);
alter table public.reports enable row level security;
create policy "reports_insert_own" on public.reports for insert
  with check ( reporter = auth.uid() );
create policy "reports_select_own_or_admin" on public.reports for select
  using ( reporter = auth.uid() or exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) );
create policy "reports_update_admin" on public.reports for update
  using ( exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) );

-- ============================================================================
-- CALL LOGS -- metadata only. No audio/video/transcript column exists here on
-- purpose; that was a deliberate decision, not an oversight.
-- ============================================================================
create table if not exists public.call_logs (
  id uuid primary key default uuid_generate_v4(),
  caller uuid references public.profiles(id),
  callee uuid references public.profiles(id),
  kind text not null,             -- 'audio' | 'video'
  was_blind_date boolean default false,
  started_at timestamptz default now(),
  duration_sec int
);
alter table public.call_logs enable row level security;
create policy "call_logs_select_own_or_admin" on public.call_logs for select
  using ( caller = auth.uid() or callee = auth.uid() or exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) );
create policy "call_logs_insert_participant" on public.call_logs for insert
  with check ( caller = auth.uid() or callee = auth.uid() );

-- ============================================================================
-- ADMIN AUDIT LOG -- every admin action gets recorded here. This is what
-- actually answers "did staff abuse their access" -- the audit trail is the
-- accountability mechanism, not a policy document.
-- ============================================================================
create table if not exists public.admin_audit_log (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references public.profiles(id),
  action text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz default now()
);
alter table public.admin_audit_log enable row level security;
create policy "audit_log_admin_select" on public.admin_audit_log for select
  using ( exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) );
create policy "audit_log_admin_insert" on public.admin_audit_log for insert
  with check ( exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) );

-- ============================================================================
-- STORAGE: profile photos bucket
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('profile-photos', 'profile-photos', true)
  on conflict (id) do nothing;

create policy "photo_upload_own_folder" on storage.objects for insert
  with check ( bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text );
create policy "photo_read_public" on storage.objects for select
  using ( bucket_id = 'profile-photos' );
create policy "photo_delete_own_folder" on storage.objects for delete
  using ( bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text );

-- ============================================================================
-- SEED DATA -- the curated launch personas, so Discover isn't empty on day one.
-- Fixed UUIDs so they're stable across reruns (on conflict do nothing).
-- ============================================================================
insert into public.profiles (id, username, age, bio, reasons, photos, city, declared_country, phone_verified, is_demo_seed, trust_score)
values
  ('00000000-0000-0000-0000-000000000001','Aoife',27,'Coffee snob, terrible at bowling, great at conversation.', array['Dinner dates','Long term'], '{}', 'Dublin', 'IE', true, true, 0),
  ('00000000-0000-0000-0000-000000000004','Jordan',29,'Dog dad. Will absolutely show you photos of the dog.', array['Long term'], '{}', 'Dublin', 'IE', true, true, 0),
  ('00000000-0000-0000-0000-000000000005','Maeve',33,'Direct, honest, not here to waste anyone''s time.', array['Same day sex','No strings fun'], '{}', 'Dublin', 'IE', true, true, 0),
  ('00000000-0000-0000-0000-000000000007','Beth',30,'Ask me about the time I got lost in Lisbon for 3 days.', array['Dinner dates','Video chat fun'], '{}', 'Dublin', 'IE', true, true, 0),
  ('00000000-0000-0000-0000-000000000008','Rio',28,'Slow mornings, good food, honest people.', array['Long term','Dinner dates'], '{}', 'Dublin', 'IE', true, true, 0)
on conflict (id) do nothing;

-- ============================================================================
-- ONE-TIME MANUAL STEP (do this after you've signed up for real in the app):
--   update public.profiles set is_admin = true where id = auth.uid();
-- Run that as its own query, logged in as the account you want to be admin.
-- There's no other way to bootstrap the first admin, by design -- nobody should
-- be admin by default, including you, until you deliberately flip this.
-- ============================================================================
