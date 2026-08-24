-- Fixes a real gap: the profiles_update_own policy from 001_schema.sql lets a user update
-- their OWN row -- which is correct for username/bio/photos -- but Row Level Security only
-- controls which ROWS you can touch, not which COLUMNS. As written, nothing stopped a signed-in
-- user from calling the same update endpoint on themselves with { is_admin: true }, or
-- un-banning themselves, or inflating their own trust_score.
--
-- Fix: a trigger that reverts privileged columns to their previous value on any update that
-- isn't coming from an admin. This still allows the one-time SQL Editor bootstrap step from
-- 001_schema.sql, because auth.uid() is null in that context (direct DB access, not a REST
-- call with a user's JWT) -- the trigger only clamps updates that arrive with a real,
-- non-admin user's identity attached.

create or replace function public.protect_privileged_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.is_admin := old.is_admin;
    new.is_banned := old.is_banned;
    new.ban_reason := old.ban_reason;
    new.trust_score := old.trust_score;
    new.phone_verified := old.phone_verified;
    new.id_verified := old.id_verified;
    new.age_verified := old.age_verified;
    new.photo_review_status := old.photo_review_status;
    new.video_verified := old.video_verified;
    new.video_mismatch_reported := old.video_mismatch_reported;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_privileged_profile_fields_trigger on public.profiles;
create trigger protect_privileged_profile_fields_trigger
  before update on public.profiles
  for each row execute function public.protect_privileged_profile_fields();
