-- Reversión de 20261104053000_funciones_nuevas_nacen_cerradas_a_anon.sql.
-- Vuelve a los defaults de Supabase: las funciones nuevas de public nacen ejecutables por anon
-- y por PUBLIC. No toca las funciones que ya existen.

alter default privileges for role postgres in schema public grant execute on functions to anon;
alter default privileges for role postgres grant execute on functions to public;
