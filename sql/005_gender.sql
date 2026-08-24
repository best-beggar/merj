-- Adds gender + who-you're-looking-for to profiles, and backfills the seeded demo personas.
-- Run after 001-004.

alter table public.profiles add column if not exists gender text;              -- 'woman' | 'man' | 'nonbinary' | 'other'
alter table public.profiles add column if not exists looking_for text[] default '{}'; -- any of the above, multi-select

update public.profiles set gender = 'woman', looking_for = array['man'] where id = '00000000-0000-0000-0000-000000000001'; -- Aoife
update public.profiles set gender = 'man',   looking_for = array['woman'] where id = '00000000-0000-0000-0000-000000000004'; -- Jordan
update public.profiles set gender = 'woman', looking_for = array['man','woman'] where id = '00000000-0000-0000-0000-000000000005'; -- Maeve
update public.profiles set gender = 'woman', looking_for = array['man'] where id = '00000000-0000-0000-0000-000000000007'; -- Beth
update public.profiles set gender = 'man',   looking_for = array['woman'] where id = '00000000-0000-0000-0000-000000000008'; -- Rio
