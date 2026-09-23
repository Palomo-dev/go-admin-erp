-- =============================================================================
-- ROLLBACK de 20260923200000_zona_horaria_por_sucursal
--
-- Deja la base exactamente como estaba antes de la fase A1:
--   - `fn_today_for_org(integer)` vuelve a su cuerpo plpgsql original
--     (20260911120000 + fallback de organization_settings), con su ACL previa
--     (EXECUTE para PUBLIC, anon, authenticated, service_role);
--   - se eliminan `fn_today_for`, `fn_timezone_for`, el trigger de validación
--     y su función;
--   - se elimina `branches.timezone`.
--
-- El DROP de la columna es seguro **solo si nadie la ha poblado todavía**:
-- borrarla destruye las zonas por sucursal que se hayan configurado. Por eso
-- el bloque de comprobación de abajo aborta si hay alguna fila con valor. Si de
-- verdad se quiere revertir con datos dentro, hay que guardarlos antes:
--   create table branches_timezone_respaldo as
--     select id, organization_id, timezone from branches where timezone is not null;
--
-- `fn_today_system()` no se tocó en la migración, así que tampoco aquí.
-- =============================================================================

begin;

-- Guarda: no borrar zonas por sucursal ya configuradas sin querer.
do $do$
declare
  v_con_zona integer;
begin
  select count(*) into v_con_zona from public.branches where timezone is not null;
  if v_con_zona > 0 then
    raise exception 'Hay % sucursales con zona horaria propia. Respáldalas antes de revertir.', v_con_zona
      using errcode = 'P0001',
            hint = 'create table branches_timezone_respaldo as select id, organization_id, timezone from branches where timezone is not null;';
  end if;
end
$do$;

-- 1. fn_today_for_org vuelve a su definición original (plpgsql, no definer).
create or replace function public.fn_today_for_org(p_org_id integer)
returns date
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_timezone text;
  v_today date;
BEGIN
  -- 1. Fuente canonica: organizations.timezone
  SELECT o.timezone INTO v_timezone
  FROM organizations o
  WHERE o.id = p_org_id;

  -- 2. Fallback legacy: organization_settings clave 'calendar'
  IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
    SELECT (os.settings->>'timezone')::text INTO v_timezone
    FROM organization_settings os
    WHERE os.organization_id = p_org_id
      AND os.key = 'calendar'
      AND os.settings ? 'timezone'
      AND btrim(os.settings->>'timezone') != ''
    LIMIT 1;
  END IF;

  -- 3. Fallback final
  IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
    v_timezone := 'America/Bogota';
  END IF;

  -- 4. Validar que sea un timezone IANA real.
  --    Si no lo es, caer al default en vez de lanzar excepcion (no romper INSERTs).
  BEGIN
    v_today := (now() AT TIME ZONE v_timezone)::date;
  EXCEPTION WHEN others THEN
    v_today := (now() AT TIME ZONE 'America/Bogota')::date;
  END;

  RETURN v_today;
END;
$function$;

-- ACL previa de fn_today_for_org: EXECUTE para PUBLIC (y por tanto anon).
grant execute on function public.fn_today_for_org(integer) to public;
grant execute on function public.fn_today_for_org(integer) to anon, authenticated, service_role;

-- 2. Fuera lo nuevo. fn_today_for se borra antes que fn_timezone_for (depende de ella).
drop function if exists public.fn_today_for(integer, integer);
drop function if exists public.fn_timezone_for(integer, integer);

drop trigger if exists trg_validate_branch_timezone on public.branches;
drop function if exists public.fn_validate_branch_timezone();

-- 3. Fuera la columna.
alter table public.branches drop column if exists timezone;

commit;

-- -----------------------------------------------------------------------------
-- Verificación:
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='branches' and column_name='timezone'; -- 0
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in ('fn_timezone_for','fn_today_for',
--          'fn_validate_branch_timezone');                                            -- 0
--   select prosecdef, prolang::regtype is not null from pg_proc
--    where proname='fn_today_for_org';                                  -- false (plpgsql)
--   select fn_today_for_org(id) from organizations limit 5;             -- sigue respondiendo
-- -----------------------------------------------------------------------------
