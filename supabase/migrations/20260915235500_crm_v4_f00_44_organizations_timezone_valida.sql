-- =============================================================================
-- crm_v4_f00_44_organizations_timezone_valida
-- F0-REG ronda 3 (QA r2, medio 2: zona horaria a prueba de catálogo).
--
-- `organizations.timezone` (text NOT NULL DEFAULT 'America/Bogota') se escribe
-- desde el navegador con cliente de sesión (`useCalendarSettings`) y PostgREST
-- acepta cualquier texto. Una zona que Intl (ICU) reconoce pero Postgres no
-- (`pg_timezone_names`) hacía fallar con `22023` toda expresión
-- `at time zone` que la use: `fn_ai_usage_month`, `fn_today_for_org`, los
-- rangos de reportes… Hoy las 84 organizaciones están en el catálogo
-- (0 fuera, verificado por MCP 2026-09-15); esto evita que deje de ser así.
--
-- Trigger BEFORE INSERT OR UPDATE OF timezone:
--   - vacío/NULL → se restaura el default de la columna ('America/Bogota',
--     regla 6 de fechas: solo como fallback);
--   - nombre exacto en pg_timezone_names → pasa;
--   - coincide sin distinguir mayúsculas → se canoniza al nombre del catálogo
--     ('america/bogota' → 'America/Bogota');
--   - cualquier otra cosa → EXCEPTION 22023 con hint. La app (Node) valida
--     antes con Intl.supportedValuesOf y muestra el error de la BD si llega.
--
-- La función del trigger no es SECURITY DEFINER (no eleva nada;
-- pg_timezone_names es legible por cualquier rol) y no necesita EXECUTE
-- explícito: la ejecuta el trigger como owner de la tabla. Coste: una lectura
-- del catálogo (~1 200 filas) por cada escritura de `timezone`, que es rara.
--
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS. No toca datos.
-- Rollback: supabase/rollbacks/20260915235500_crm_v4_f00_44_organizations_timezone_valida_rollback.sql
-- =============================================================================

begin;

create or replace function public.fn_validate_org_timezone()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_canonical text;
begin
  if NEW.timezone is null or btrim(NEW.timezone) = '' then
    NEW.timezone := 'America/Bogota'; -- default de la columna; solo fallback
    return NEW;
  end if;

  select n.name into v_canonical
    from pg_timezone_names n
   where lower(n.name) = lower(btrim(NEW.timezone))
   order by (n.name = btrim(NEW.timezone)) desc
   limit 1;

  if v_canonical is null then
    raise exception 'Zona horaria no reconocida por Postgres: %', NEW.timezone
      using errcode = '22023',
            hint = 'Usa un nombre IANA presente en pg_timezone_names (p. ej. America/Bogota, America/Mexico_City, UTC).';
  end if;

  NEW.timezone := v_canonical;
  return NEW;
end;
$function$;

comment on function public.fn_validate_org_timezone() is
  'Trigger: organizations.timezone debe existir en pg_timezone_names (se canoniza mayúsculas); vacío → America/Bogota; desconocida → 22023.';

drop trigger if exists trg_validate_org_timezone on public.organizations;
create trigger trg_validate_org_timezone
  before insert or update of timezone on public.organizations
  for each row execute function public.fn_validate_org_timezone();

commit;

-- -----------------------------------------------------------------------------
-- Verificación (SELECT/MCP; las escrituras dentro de begin; … rollback;):
--   select tgname, tgenabled from pg_trigger where tgrelid = 'public.organizations'::regclass
--      and tgname = 'trg_validate_org_timezone';                       -- 1 fila, 'O'
--   select count(*) from organizations where timezone not in (select name from pg_timezone_names); -- 0
--   begin;
--     update organizations set timezone = 'america/bogota' where id = <org>;
--     select timezone from organizations where id = <org>;             -- 'America/Bogota'
--     update organizations set timezone = 'Marte/Fobos' where id = <org>;
--       -- ERROR 22023 Zona horaria no reconocida por Postgres: Marte/Fobos
--   rollback;
-- -----------------------------------------------------------------------------
