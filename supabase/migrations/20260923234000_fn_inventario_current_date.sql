-- fn_inventario_current_date: el inventario de la fase D, consultable desde CI.
--
-- Por que existe. La fase D dejo escrito (docs/PROGRESO-zonas-horarias.md,
-- addendum del 2026-09-23) que la consulta
--
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosrc ~* '\mCURRENT_DATE\M';
--
-- tiene que correr en CI y no una sola vez. El motivo es concreto: un test que
-- lee los `.sql` del repositorio NO ve una funcion que otra sesion aplica por
-- MCP. Asi se colo `fn_emitir_acciones`, creada mientras la fase corria.
--
-- Por que una RPC y no una conexion directa a Postgres. Ver
-- docs/adr/ADR-005-inventario-de-current-date-contra-la-base-viva.md. En corto:
-- el repositorio ya depende de `@supabase/supabase-js` y no de `pg`, la RPC
-- viaja por HTTPS (sin abrir el puerto 5432 al runner) y el secreto que necesita
-- CI es el mismo que ya se usa en otros sitios, no la contrasena de la base.
--
-- SECURITY INVOKER a proposito: `pg_proc` y `pg_namespace` son catalogos
-- legibles por cualquier rol, asi que no hace falta elevar privilegios. No se
-- anade una funcion SECURITY DEFINER mas al inventario que ya hay que revisar.
--
-- Permisos: solo `service_role`. `anon` y `authenticated` no la ejecutan. No
-- devuelve datos de ningun inquilino —solo nombres de funciones del esquema
-- `public`— pero tampoco hay razon para publicar la forma interna del esquema.

CREATE OR REPLACE FUNCTION public.fn_inventario_current_date()
 RETURNS TABLE(firma text, proname text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select p.oid::regprocedure::text as firma,
         p.proname::text           as proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~* '\mCURRENT_DATE\M'
   order by 1;
$function$;

comment on function public.fn_inventario_current_date() is
  'Funciones de public cuyo cuerpo decide un dia con CURRENT_DATE. La lista blanca esperada esta en docs/adr/ADR-004-dia-utc-en-el-catalogo-global-de-tasas.md y en scripts/lista-blanca-current-date.json; la comprueba scripts/verificar-current-date-en-postgres.mjs desde CI.';

revoke all on function public.fn_inventario_current_date() from public;
revoke all on function public.fn_inventario_current_date() from anon;
revoke all on function public.fn_inventario_current_date() from authenticated;
grant execute on function public.fn_inventario_current_date() to service_role;
