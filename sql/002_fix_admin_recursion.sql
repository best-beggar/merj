-- Fixes: "infinite recursion detected in policy for relation profiles"
--
-- Why it happened: the profiles_select / profiles_update_admin policies (in 001_schema.sql)
-- check admin status with `exists (select 1 from public.profiles me where ...)` -- a policy
-- on public.profiles that queries public.profiles triggers the same policy again to evaluate
-- that inner query, which triggers it again, forever.
--
-- Fix: a SECURITY DEFINER helper function. It runs with the privileges of its owner (not the
-- calling user), which bypasses RLS for this one internal lookup -- this is the standard
-- Supabase-recommended pattern for exactly this problem.
--
-- Run this once in the SQL Editor, after 001_schema.sql.

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (
    (is_banned = false and visibility = 'public')
    or id = auth.uid()
    or public.is_admin(auth.uid())
  );

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update
  using ( public.is_admin(auth.uid()) );

-- reports
drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin" on public.reports for select
  using ( reporter = auth.uid() or public.is_admin(auth.uid()) );

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin" on public.reports for update
  using ( public.is_admin(auth.uid()) );

-- call_logs
drop policy if exists "call_logs_select_own_or_admin" on public.call_logs;
create policy "call_logs_select_own_or_admin" on public.call_logs for select
  using ( caller = auth.uid() or callee = auth.uid() or public.is_admin(auth.uid()) );

-- admin_audit_log
drop policy if exists "audit_log_admin_select" on public.admin_audit_log;
create policy "audit_log_admin_select" on public.admin_audit_log for select
  using ( public.is_admin(auth.uid()) );

drop policy if exists "audit_log_admin_insert" on public.admin_audit_log;
create policy "audit_log_admin_insert" on public.admin_audit_log for insert
  with check ( public.is_admin(auth.uid()) );
