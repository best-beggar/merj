-- Adds: photo review status, affiliate referral tracking, and ad impression logging.
-- Run after 001 and 002.

alter table public.profiles add column if not exists photo_review_status text default 'pending'; -- 'pending' | 'approved' | 'rejected'
alter table public.profiles add column if not exists referred_by text;

-- ============================================================================
-- AD IMPRESSIONS -- logged every time the existing rewarded-ad flow completes
-- (swipe refill, blind-date filter unlock). Real tracking of a simulated ad,
-- same code path a real ad SDK's "reward earned" callback would report through.
-- ============================================================================
create table if not exists public.ad_impressions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id),
  context text not null,             -- 'swipe_refill' | 'blind_date_filters'
  estimated_revenue numeric(10,4) default 0.0200,
  created_at timestamptz default now()
);
alter table public.ad_impressions enable row level security;
create policy "ad_impressions_insert_anyone" on public.ad_impressions for insert
  with check ( true );  -- guests/demo sessions have no Supabase auth session; low-stakes analytics only
create policy "ad_impressions_select_admin" on public.ad_impressions for select
  using ( public.is_admin(auth.uid()) );

-- ============================================================================
-- AFFILIATES -- admin-created referral codes. The site reads ?ref=CODE on
-- landing, remembers it locally, and attributes it to profiles.referred_by
-- at signup. No self-serve affiliate portal/API yet -- that's a later phase.
-- ============================================================================
create table if not exists public.affiliates (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  revenue_share_percent numeric(5,2) default 20.00,
  created_at timestamptz default now()
);
alter table public.affiliates enable row level security;
create policy "affiliates_admin_all_select" on public.affiliates for select
  using ( public.is_admin(auth.uid()) );
create policy "affiliates_admin_insert" on public.affiliates for insert
  with check ( public.is_admin(auth.uid()) );
create policy "affiliates_admin_update" on public.affiliates for update
  using ( public.is_admin(auth.uid()) );
