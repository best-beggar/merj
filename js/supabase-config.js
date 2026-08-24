/* Merj — Supabase connection config.
   The publishable (anon) key is meant to be public — it's safe to ship in client code.
   Real access control lives in Postgres Row Level Security policies (see sql/001_schema.sql),
   not in keeping this key secret. Never put a secret/service_role key here. */
window.MERJ_SUPABASE_URL = "https://omxokfqlorsrhihlqgbt.supabase.co";
window.MERJ_SUPABASE_KEY = "sb_publishable_x5xpKx7rnzFilW6Kn6m1mQ_sEAdm4Sj";
