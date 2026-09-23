-- =============================================================================
-- zona_horaria_por_sucursal
-- Fase A1 de la misión multi-país (ver docs/PROGRESO-zonas-horarias.md y
-- docs/adr/ADR-001-timezone-por-sucursal.md).
--
-- Contexto: hoy la zona horaria vive solo en `organizations.timezone`
-- (text NOT NULL DEFAULT 'America/Bogota'; 85 filas, todas en Bogotá). Las 90
-- sucursales no tienen zona propia, así que una organización con sedes en dos
-- husos no puede representarse. Decisión D1 del dueño: la zona va por
-- organización **y** por sucursal.
--
-- Qué hace esta migración (aditiva; no toca un solo dato histórico):
--
--   1. `branches.timezone text NULL`. NULL significa «hereda de la
--      organización»: no se puebla nada, las 90 sucursales quedan en NULL y
--      siguen resolviendo exactamente a lo que resolvían.
--
--   2. Trigger `trg_validate_branch_timezone`: una zona IANA inválida se
--      rechaza **al escribir la columna**, no al leerla (errcode 22023), y una
--      escrita con otras mayúsculas se canoniza ('america/bogota' ->
--      'America/Bogota'). Vacío o espacios -> NULL (heredar). Es el mismo
--      patrón que `trg_validate_org_timezone` (migración 20260915235500); se
--      usa trigger y no CHECK porque `pg_timezone_names` es un catálogo y una
--      CHECK no admite funciones que no sean IMMUTABLE.
--
--   3. `fn_timezone_for(p_organization_id, p_branch_id default null)`: la
--      ÚNICA función de resolución. Cascada sucursal -> organización ->
--      (fallback legado `organization_settings.key='calendar'`, que ya tenía
--      `fn_today_for_org` y se conserva para no cambiar el resultado de
--      ninguna fila) -> 'America/Bogota'.
--
--      Es a prueba de fallos por diseño: si la zona guardada no la reconoce
--      Postgres, o si la consulta falla, devuelve el default y **nunca lanza**.
--      Se llama desde triggers BEFORE INSERT (`fn_set_task_date_tz`,
--      `fn_set_quotation_issue_date_tz`, `fn_set_manifest_date_tz`,
--      `fn_set_valid_from_tz`, `calculate_days_overdue`), y un `timezone` mal
--      escrito no puede tumbar el INSERT de una cotización o de una tarea.
--
--      `SECURITY DEFINER` porque esos triggers corren con el rol de quien
--      escribe (`authenticated`) y la lectura de `organizations`/`branches`
--      pasaría por RLS: hoy, cuando RLS oculta la fila, `fn_today_for_org`
--      devuelve el default en silencio. Invisible mientras todos estén en
--      Bogotá; un error de un día en cuanto no lo estén. Lo único que expone
--      es el nombre de una zona horaria.
--
--   4. `fn_today_for_org(p_org_id)` pasa a ser un caso particular de
--      `fn_timezone_for`: misma firma (integer -> date), mismo resultado
--      (verificado fila a fila sobre las 85 organizaciones, 0 diferencias), sin
--      sobrecargas nuevas. Por eso NO hace falta ningún DROP: `CREATE OR
--      REPLACE` conserva la firma y el nombre del parámetro.
--      Se añade `fn_today_for(p_organization_id, p_branch_id default null)`
--      para el caso con sucursal.
--
--   5. Permisos: `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated,
--      service_role`, el mismo criterio de la tanda de `fn_reporte_*`
--      (20260922233000). `fn_today_for_org` hoy tiene EXECUTE para `anon`; se
--      le retira. Radio de impacto comprobado: ninguna columna usa
--      `fn_today_for_org` en su DEFAULT, y las nueve tablas cuyos triggers la
--      llaman (dispatch_manifests, housekeeping_tasks, quotations,
--      route_schedules, shipping_rates, transport_fares,
--      vendor_commission_rates, accounts_receivable, parking_passes) son de
--      trastienda, con RLS que exige pertenencia vía auth.uid(): `anon` no
--      tiene camino de escritura a ninguna.
--      `fn_today_system()` NO se toca: es el DEFAULT de
--      `currency_rates.rate_date` y de `provider_pricing.valid_from`, y un
--      DEFAULT sí se comprueba contra el rol que inserta. Su ACL queda para la
--      tanda de seguridad.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + DROP TRIGGER IF
-- EXISTS. No hay UPDATE de datos.
-- Rollback: supabase/rollbacks/20260923200000_zona_horaria_por_sucursal_rollback.sql
-- Aplicada por MCP el 2026-09-23; quedó registrada en
-- `supabase_migrations.schema_migrations` con la versión `20260923134601`
-- (el MCP sella con su propio reloj, como el resto de migraciones de esta
-- tanda). El nombre del archivo mantiene el orden cronológico del repositorio.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. La columna. NULL = heredar.
-- -----------------------------------------------------------------------------
alter table public.branches
  add column if not exists timezone text;

comment on column public.branches.timezone is
  'Zona horaria IANA propia de la sucursal. NULL = hereda la de la organización. Nunca se lee directamente: se resuelve con public.fn_timezone_for(organization_id, id).';

-- -----------------------------------------------------------------------------
-- 2. Validación AL ESCRIBIR. Una zona inválida no llega a la columna.
-- -----------------------------------------------------------------------------
create or replace function public.fn_validate_branch_timezone()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_canonical text;
begin
  -- Vacío o solo espacios: se normaliza a NULL, que es «hereda».
  if NEW.timezone is null or btrim(NEW.timezone) = '' then
    NEW.timezone := null;
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
            hint = 'Usa un nombre IANA presente en pg_timezone_names (p. ej. America/Bogota, America/Mexico_City, Europe/Madrid), o deja NULL para heredar la de la organización.';
  end if;

  NEW.timezone := v_canonical;
  return NEW;
end;
$function$;

comment on function public.fn_validate_branch_timezone() is
  'Trigger: branches.timezone debe existir en pg_timezone_names (se canoniza); vacío → NULL (hereda de la organización); desconocida → 22023 al escribir.';

drop trigger if exists trg_validate_branch_timezone on public.branches;
create trigger trg_validate_branch_timezone
  before insert or update of timezone on public.branches
  for each row execute function public.fn_validate_branch_timezone();

-- -----------------------------------------------------------------------------
-- 3. La única función de resolución.
-- -----------------------------------------------------------------------------
create or replace function public.fn_timezone_for(
  p_organization_id integer,
  p_branch_id integer default null
)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tz     text;
  v_prueba date;
begin
  -- 1) La sucursal manda, si tiene zona propia y pertenece a la organización
  --    que se pide (una sucursal de otro inquilino se ignora).
  if p_branch_id is not null then
    begin
      select b.timezone into v_tz
        from public.branches b
       where b.id = p_branch_id
         and (p_organization_id is null or b.organization_id = p_organization_id);
    exception when others then
      v_tz := null;
    end;
  end if;

  -- 2) Si no, la organización.
  if v_tz is null or btrim(v_tz) = '' then
    begin
      select o.timezone into v_tz
        from public.organizations o
       where o.id = p_organization_id;
    exception when others then
      v_tz := null;
    end;
  end if;

  -- 2 bis) Fallback legado que ya tenía fn_today_for_org: organization_settings
  --        con key='calendar'. Se conserva para no cambiar ni una fila.
  if v_tz is null or btrim(v_tz) = '' then
    begin
      select (os.settings->>'timezone')::text into v_tz
        from public.organization_settings os
       where os.organization_id = p_organization_id
         and os.key = 'calendar'
         and os.settings ? 'timezone'
         and btrim(os.settings->>'timezone') <> ''
       limit 1;
    exception when others then
      v_tz := null;
    end;
  end if;

  -- 3) Default del sistema. Regla 6 de docs/reglas-fechas-timezone.md:
  --    America/Bogota solo como fallback.
  if v_tz is null or btrim(v_tz) = '' then
    return 'America/Bogota';
  end if;

  v_tz := btrim(v_tz);

  -- 4) A prueba de fallos: si la zona guardada no la reconoce Postgres,
  --    se devuelve el default. Nunca se lanza: esta función se llama desde
  --    triggers BEFORE INSERT y no puede tumbar una escritura.
  begin
    v_prueba := (now() at time zone v_tz)::date;
  exception when others then
    return 'America/Bogota';
  end;

  return v_tz;
end;
$function$;

comment on function public.fn_timezone_for(integer, integer) is
  'Única resolución de zona horaria: sucursal → organización → (legado organization_settings.calendar) → America/Bogota. STABLE, SECURITY DEFINER, nunca lanza: una zona inválida devuelve el default.';

-- -----------------------------------------------------------------------------
-- 4. «Hoy» como caso particular de la resolución. Misma firma que antes.
-- -----------------------------------------------------------------------------
create or replace function public.fn_today_for_org(p_org_id integer)
returns date
language sql
stable
set search_path to 'public'
as $function$
  select (now() at time zone public.fn_timezone_for(p_org_id, null))::date;
$function$;

comment on function public.fn_today_for_org(integer) is
  'Día calendario de hoy en la zona de la organización. Caso particular de fn_timezone_for(org, NULL).';

create or replace function public.fn_today_for(
  p_organization_id integer,
  p_branch_id integer default null
)
returns date
language sql
stable
set search_path to 'public'
as $function$
  select (now() at time zone public.fn_timezone_for(p_organization_id, p_branch_id))::date;
$function$;

comment on function public.fn_today_for(integer, integer) is
  'Día calendario de hoy en la zona de la sucursal, o de la organización si la sucursal no tiene zona propia.';

-- -----------------------------------------------------------------------------
-- 5. Permisos.
-- -----------------------------------------------------------------------------
revoke execute on function public.fn_timezone_for(integer, integer) from public, anon;
grant  execute on function public.fn_timezone_for(integer, integer) to authenticated, service_role;

revoke execute on function public.fn_today_for(integer, integer) from public, anon;
grant  execute on function public.fn_today_for(integer, integer) to authenticated, service_role;

revoke execute on function public.fn_today_for_org(integer) from public, anon;
grant  execute on function public.fn_today_for_org(integer) to authenticated, service_role;

commit;

-- -----------------------------------------------------------------------------
-- Verificación (solo lectura; las escrituras, dentro de begin; … rollback;):
--   select column_name, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='branches' and column_name='timezone';
--   select count(*) from branches where timezone is not null;            -- 0
--   select count(*) from organizations o
--    where fn_today_for_org(o.id) is distinct from fn_today_for(o.id, null);  -- 0
--   select count(*) from branches b
--    where fn_timezone_for(b.organization_id, b.id) <> 'America/Bogota'; -- 0
--   select fn_timezone_for(-1), fn_timezone_for(null);                   -- America/Bogota
--   select p.oid::regprocedure::text, p.prosecdef, p.proacl
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in
--          ('fn_timezone_for','fn_today_for','fn_today_for_org');
--   begin;
--     update branches set timezone='Marte/Fobos' where id=<id>;
--       -- ERROR 22023 Zona horaria no reconocida por Postgres: Marte/Fobos
--   rollback;
-- -----------------------------------------------------------------------------
