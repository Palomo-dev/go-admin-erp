-- Las funciones nuevas de public nacen SIN EXECUTE para anon ni PUBLIC.
-- Aplicada por MCP el 2026-11-04.
--
-- Por qué: Supabase trae un default privilege que da EXECUTE a anon sobre toda función que
-- postgres cree en public, y Postgres además se lo da a PUBLIC (del que anon hereda). Así se
-- reabrieron 125 funciones SECURITY DEFINER tras la restauración del 2026-11-03 (ver
-- 20261104031500 y 202611040330..33): un DROP + CREATE devolvía el permiso a la clave pública.
--
-- Qué cambia (solo para funciones que se creen desde ahora; las existentes no se tocan):
--   · postgres, schema public: fuera anon del default (quedan postgres, authenticated, service_role).
--   · postgres, global: fuera PUBLIC del default. Es la única forma de quitar el EXECUTE implícito
--     de PUBLIC; los defaults por schema solo suman. Storage y los demás schemas conservan sus
--     propios defaults (storage sigue dando EXECUTE a anon y authenticated).
--   · CREATE OR REPLACE de una función existente conserva su ACL: no la abre ni la cierra.
--
-- CONSECUENCIA para quien escriba funciones que llame anon (tiendas públicas, widget, carta QR,
-- políticas RLS «to public»): el GRANT a anon va explícito en la misma migración:
--   grant execute on function public.mi_funcion(...) to anon;
-- Sin él, la tienda recibe 42501 (permission denied for function). Ver docs/POLITICA-MIGRACIONES.md.
--
-- No se pudo cambiar el default de supabase_admin (lo usan solo procesos internos de Supabase).
--
-- Rollback: supabase/rollbacks/20261104053000_funciones_nuevas_nacen_cerradas_a_anon_rollback.sql

alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

do $verificar$
declare v_acl text;
begin
  select d.defaclacl::text into v_acl
  from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
  where d.defaclrole = 'postgres'::regrole and n.nspname = 'public' and d.defaclobjtype = 'f';
  if v_acl like '%anon=%' then
    raise exception 'el default de public sigue dando EXECUTE a anon: %', v_acl;
  end if;
  if v_acl not like '%authenticated=X%' or v_acl not like '%service_role=X%' then
    raise exception 'el default de public perdió authenticated o service_role: %', v_acl;
  end if;
  if not exists (select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f') then
    raise exception 'falta el default global de postgres sin PUBLIC';
  end if;
end
$verificar$;
