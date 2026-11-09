-- SCRUM-123: table permissions for signed-in staff, written down instead of relying
-- on Supabase's defaults. A new hosted project didn't give `authenticated` any
-- SELECT/INSERT/UPDATE/DELETE, so every signed-in request was refused before RLS ran.
--
-- The grant says signed-in staff may use the tables at all; RLS (enabled on every
-- table) still decides which rows. TRUNCATE, TRIGGER and REFERENCES aren't needed
-- by the app, and TRUNCATE would skip RLS, so they're taken away.

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- The same for tables added by later migrations
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated;
