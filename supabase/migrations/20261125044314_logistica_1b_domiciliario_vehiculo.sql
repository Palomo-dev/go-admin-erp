-- Logística Fase 1b: el domiciliario y el vehículo (2026-11-24, decisiones aprobadas por el dueño).
--
-- Especificación: «GO Admin: el domiciliario y el vehículo» v2 (secciones 4, 5 y 9). Diseño aprobado
-- en Figma «21 Logística» › «Logística 1b — domiciliario y vehículo — 2026-11-24».
--
-- Idea base: el vehículo POR DEFECTO vive en la persona (`driver_credentials.default_vehicle_id`);
-- el vehículo REAL queda congelado en cada envío (`shipments.vehicle_id` + espejo en metadata).
-- Sin turnos (`vehicle_assignments` queda para después).
--
-- Aditiva. Todo lo que no existía nace con un valor que NO cambia la operación de hoy:
--   - El bloqueo por documentos se enciende POR ORGANIZACIÓN (`organization_settings.logistica`
--     › `bloqueoDocumentosAsignacion`), apagado por defecto: solo avisa. Y aunque esté encendido,
--     mientras ningún autorizador tenga PIN de Recursos humanos, solo avisa (decisión 6).
--   - `usage` nace en 'both' para las filas existentes (hoy 0 vehículos y 0 personas) y para
--     cualquier camino viejo que no lo mande; las pantallas mandan el del módulo (decisión 9.6).
--   - El POS nunca se frena: si la asignación no pasa, el envío queda «Por despachar» sin asignar.
--
-- Piezas:
--   1. vehicles: ownership, owner_driver_id, usage; tipo 'bicycle'; placa opcional en bici y en
--      vehículo de un tercero (UNIQUE (organization_id, plate) admite varios NULL).
--   2. driver_credentials: default_vehicle_id (único: un vehículo no es el «por defecto» de dos
--      personas, decisión 5) y usage. Guarda de organización y espejo `vehicles.current_driver_id`.
--   3. Permiso `logistica.asignacion.excepcion` para el cargo existente «Supervisor de despacho»
--      (TRA-SUPERVISOR). No se crean cargos.
--   4. Bitácora `shipment_assignment_log` (bloqueos, PIN rechazados con quién lo pidió, excepciones).
--   5. Revisión común de documentos (vehículo + persona) que usan Transporte y Logística;
--      `fn_transporte_cumplimiento_interno` la llama sin cambiar su resultado.
--   6. Asignar v3 (`logistica_asignar_domiciliario`): preselección, obligatoriedad según el tipo,
--      cumplimiento, excepción con PIN del supervisor (5 intentos en 15 min sobre SU PIN) y aviso de
--      capacidad. El POS y el alta manual pasan por la misma RPC.
--   7. `fn_logistica_liberar_vehiculo` deja de borrar el conductor.
--   8. Alta: `logistica_vincular_vehiculo` (elegir o crear el vehículo por defecto en un paso).

-- ── 1. vehicles ─────────────────────────────────────────────────────────────

alter table public.vehicles add column if not exists ownership text not null default 'company';
alter table public.vehicles add column if not exists owner_driver_id uuid references public.driver_credentials(id) on delete set null;
alter table public.vehicles add column if not exists usage text not null default 'both';

alter table public.vehicles drop constraint if exists vehicles_ownership_check;
alter table public.vehicles add constraint vehicles_ownership_check check (ownership in ('company', 'driver', 'third_party'));
alter table public.vehicles drop constraint if exists vehicles_usage_check;
alter table public.vehicles add constraint vehicles_usage_check check (usage in ('logistics', 'transport', 'both'));

-- Bicicleta en la flota (registrarla es opcional y sin placa).
alter table public.vehicles drop constraint if exists vehicles_vehicle_type_check;
alter table public.vehicles add constraint vehicles_vehicle_type_check check (vehicle_type = any (array[
  'motorcycle', 'car', 'van', 'truck', 'bus', 'minibus', 'trailer', 'other', 'boat', 'yacht', 'bicycle']));

-- Placa obligatoria salvo en bici y en vehículo de un tercero. El UNIQUE (organization_id, plate)
-- sigue igual: en Postgres admite varios NULL.
alter table public.vehicles alter column plate drop not null;
alter table public.vehicles drop constraint if exists vehicles_placa_check;
alter table public.vehicles add constraint vehicles_placa_check
  check (nullif(btrim(coalesce(plate, '')), '') is not null or vehicle_type = 'bicycle' or ownership = 'third_party');

create index if not exists idx_vehicles_owner_driver on public.vehicles (owner_driver_id) where owner_driver_id is not null;
create index if not exists idx_vehicles_org_usage on public.vehicles (organization_id, usage);

comment on column public.vehicles.ownership is 'Dueño: company (de la empresa), driver (del domiciliario o conductor, owner_driver_id) o third_party (aliado o agregador; placa opcional y sin documentos exigidos).';
comment on column public.vehicles.owner_driver_id is 'Persona dueña del vehículo (driver_credentials) cuando ownership = driver.';
comment on column public.vehicles.usage is 'Módulo donde aparece como opción: logistics, transport o both. Nace en el módulo de alta; se puede pasar a both.';
comment on column public.vehicles.current_driver_id is 'Espejo (auth.users) del conductor por defecto. La fuente de verdad es driver_credentials.default_vehicle_id.';

-- ── 2. driver_credentials ───────────────────────────────────────────────────

alter table public.driver_credentials add column if not exists default_vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.driver_credentials add column if not exists usage text not null default 'both';
alter table public.driver_credentials drop constraint if exists driver_credentials_usage_check;
alter table public.driver_credentials add constraint driver_credentials_usage_check check (usage in ('logistics', 'transport', 'both'));

-- Decisión 5: un vehículo no es el «por defecto» de dos personas (hasta que existan turnos).
create unique index if not exists uq_driver_credentials_default_vehicle
  on public.driver_credentials (default_vehicle_id) where default_vehicle_id is not null;

comment on column public.driver_credentials.default_vehicle_id is 'Vehículo por defecto de la persona. Al asignar un envío se preselecciona; el real queda en shipments.vehicle_id. Null: a pie, bici sin registrar o sin asignar.';
comment on column public.driver_credentials.usage is 'Módulo donde aparece como opción: logistics, transport o both. Nace en el módulo de alta; se puede pasar a both.';

-- Guardas: el vehículo por defecto y el dueño son de la MISMA organización; placa vacía → NULL.
create or replace function public.fn_flota_guardar_vehiculo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.plate := nullif(btrim(coalesce(new.plate, '')), '');
  if new.owner_driver_id is not null and not exists (
       select 1 from public.driver_credentials dc where dc.id = new.owner_driver_id and dc.organization_id = new.organization_id) then
    raise exception 'DUENO_DE_OTRA_ORGANIZACION' using errcode = '22023';
  end if;
  -- Del domiciliario exige quién. Si la persona dueña se borra (FK set null), no se impide.
  if new.ownership = 'driver' and new.owner_driver_id is null
     and (tg_op = 'INSERT' or old.owner_driver_id is null) then
    raise exception 'DUENO_REQUERIDO' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flota_guardar_vehiculo on public.vehicles;
create trigger trg_flota_guardar_vehiculo
  before insert or update of plate, ownership, owner_driver_id, organization_id on public.vehicles
  for each row execute function public.fn_flota_guardar_vehiculo();

create or replace function public.fn_flota_guardar_defecto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.default_vehicle_id is not null and not exists (
       select 1 from public.vehicles v where v.id = new.default_vehicle_id and v.organization_id = new.organization_id) then
    raise exception 'VEHICULO_DE_OTRA_ORGANIZACION' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flota_guardar_defecto on public.driver_credentials;
create trigger trg_flota_guardar_defecto
  before insert or update of default_vehicle_id, organization_id on public.driver_credentials
  for each row execute function public.fn_flota_guardar_defecto();

-- Espejo: `vehicles.current_driver_id` (auth.users, lo leen las pantallas de Transporte) sigue al
-- conductor por defecto. Una persona sin cuenta deja el espejo en NULL.
create or replace function public.fn_flota_espejo_conductor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.default_vehicle_id is not null
     and old.default_vehicle_id is distinct from new.default_vehicle_id then
    update public.vehicles set current_driver_id = null, updated_at = now()
     where id = old.default_vehicle_id and current_driver_id is not distinct from old.user_id and old.user_id is not null;
  end if;
  if new.default_vehicle_id is not null
     and (tg_op = 'INSERT' or old.default_vehicle_id is distinct from new.default_vehicle_id or old.user_id is distinct from new.user_id) then
    update public.vehicles set current_driver_id = new.user_id, updated_at = now()
     where id = new.default_vehicle_id and current_driver_id is distinct from new.user_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_flota_espejo_conductor on public.driver_credentials;
create trigger trg_flota_espejo_conductor
  after insert or update of default_vehicle_id, user_id on public.driver_credentials
  for each row execute function public.fn_flota_espejo_conductor();

revoke all on function public.fn_flota_guardar_vehiculo() from public, anon, authenticated;
revoke all on function public.fn_flota_guardar_defecto() from public, anon, authenticated;
revoke all on function public.fn_flota_espejo_conductor() from public, anon, authenticated;

-- ── 3. Permiso de excepción y ajuste por organización ──────────────────────

insert into public.permissions (code, name, description, module, category)
values ('logistica.asignacion.excepcion', 'Autorizar excepción de asignación',
        'Autoriza con su PIN de Recursos humanos asignar un domicilio con SOAT, tecnomecánica o licencia vencidos', 'logistica', 'logistica')
on conflict (code) do nothing;

-- Al cargo existente «Supervisor de despacho» (TRA-SUPERVISOR) de cada organización. No se crean cargos.
insert into public.job_position_permissions (job_position_id, permission_id, allowed)
select jp.id, p.id, true
  from public.job_positions jp
  join public.permissions p on p.code = 'logistica.asignacion.excepcion'
 where jp.code = 'TRA-SUPERVISOR'
on conflict (job_position_id, permission_id) do nothing;

-- Y a los que se creen al activar Transporte (mismo cuerpo, más el permiso nuevo).
create or replace function public.fn_transporte_crear_cargos(p_org integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid;
  v_despachador uuid;
  v_supervisor uuid;
begin
  if p_org is null then
    return;
  end if;

  select d.id into v_dept
    from public.departments d
   where d.organization_id = p_org and d.code = 'OPE'
   order by d.created_at
   limit 1;

  insert into public.job_positions (organization_id, department_id, code, name, description, level, is_active)
  values
    (p_org, v_dept, 'TRA-DESPACHO', 'Despachador de transporte', 'Da salida a los viajes del día e imprime la planilla de despacho', 'junior', true),
    (p_org, v_dept, 'TRA-SUPERVISOR', 'Supervisor de despacho', 'Programa la operación y autoriza excepciones de despacho con su PIN', 'mid', true)
  on conflict (organization_id, code) do nothing;

  select id into v_despachador from public.job_positions where organization_id = p_org and code = 'TRA-DESPACHO';
  select id into v_supervisor from public.job_positions where organization_id = p_org and code = 'TRA-SUPERVISOR';

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_despachador, p.id, true from public.permissions p
   where v_despachador is not null and p.code in ('transporte.view', 'transporte.despachar', 'transporte.vender')
  on conflict (job_position_id, permission_id) do nothing;

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_supervisor, p.id, true from public.permissions p
   where v_supervisor is not null
     and p.code in ('transporte.view', 'transporte.manage', 'transporte.despachar', 'transporte.despacho.excepcion', 'transporte.vender',
                    'logistica.asignacion.excepcion')
  on conflict (job_position_id, permission_id) do nothing;
end;
$$;

-- Decisión 6: el bloqueo se enciende por organización (Configuración › Logística); apagado = solo avisos.
create or replace function public.fn_logistica_bloqueo_documentos(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select (s.settings ->> 'bloqueoDocumentosAsignacion') = 'true'
       from public.organization_settings s
      where s.organization_id = p_org and s.key = 'logistica'
      limit 1),
    false);
$$;

revoke all on function public.fn_logistica_bloqueo_documentos(integer) from public, anon, authenticated;
grant execute on function public.fn_logistica_bloqueo_documentos(integer) to service_role;

-- Quién puede autorizar la excepción (con si tiene PIN). Lo pide quien despacha.
create or replace function public.fn_logistica_autorizadores(p_org integer)
returns table (user_id uuid, nombre text, tiene_pin boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_logistica_ve_todo(p_org) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  return query
    select om.user_id,
           coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email, '—')::text,
           public.fn_transporte_tiene_pin(p_org, om.user_id)
      from public.organization_members om
      left join public.profiles p on p.id = om.user_id
     where om.organization_id = p_org and om.is_active
       and public.fn_transporte_puede_actor(om.user_id, p_org, 'logistica.asignacion.excepcion')
     order by 2;
end;
$$;

revoke all on function public.fn_logistica_autorizadores(integer) from public, anon;
grant execute on function public.fn_logistica_autorizadores(integer) to authenticated, service_role;

-- ¿Hay al menos un autorizador con PIN? Sin él, el bloqueo solo avisa (decisión 6).
create or replace function public.fn_logistica_hay_autorizador_con_pin(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members om
     where om.organization_id = p_org and om.is_active
       and public.fn_transporte_tiene_pin(p_org, om.user_id)
       and public.fn_transporte_puede_actor(om.user_id, p_org, 'logistica.asignacion.excepcion'));
$$;

revoke all on function public.fn_logistica_hay_autorizador_con_pin(integer) from public, anon, authenticated;
grant execute on function public.fn_logistica_hay_autorizador_con_pin(integer) to service_role;

-- ── 4. Bitácora de la asignación ────────────────────────────────────────────

create table if not exists public.shipment_assignment_log (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  shipment_id uuid references public.shipments(id) on delete cascade,
  driver_id uuid references public.driver_credentials(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  event text not null check (event in ('bloqueado', 'pin_rechazado', 'excepcion', 'asignado_con_avisos')),
  causes jsonb not null default '[]'::jsonb,
  reason text,
  actor uuid,
  supervisor uuid,
  authorized_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.shipment_assignment_log is 'Logística 1b: bloqueos, PIN rechazados (actor = quién pidió, supervisor = de quién era el PIN), excepciones autorizadas y asignaciones con documentos vencidos sin bloqueo. Solo la escribe logistica_asignar_domiciliario.';

create index if not exists idx_shipment_assignment_log_pin
  on public.shipment_assignment_log (organization_id, supervisor, created_at desc) where event = 'pin_rechazado';
create index if not exists idx_shipment_assignment_log_envio on public.shipment_assignment_log (shipment_id, created_at desc);

alter table public.shipment_assignment_log enable row level security;
drop policy if exists shipment_assignment_log_select on public.shipment_assignment_log;
create policy shipment_assignment_log_select on public.shipment_assignment_log
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active
                                and public.fn_logistica_ve_todo(om.organization_id)));
revoke insert, update, delete on public.shipment_assignment_log from anon, authenticated;

-- ── 5. Revisión común de documentos (vehículo + persona) ────────────────────

-- Devuelve {vehiculo_bloqueos, vehiculo_avisos, conductor_bloqueos, conductor_avisos} en el orden de
-- siempre (las fechas de la fila primero, después `vehicle_documents` que bloquean). Bloquea lo que
-- vence ANTES de la fecha; avisa lo que vence dentro de `p_dias_aviso`. Sin fecha: nada.
create or replace function public.fn_flota_revisar_documentos(
  p_org integer,
  p_vehicle uuid,
  p_driver uuid,
  p_fecha date,
  p_docs_vehiculo text[],
  p_docs_bloqueantes boolean,
  p_docs_conductor text[],
  p_dias_aviso integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v public.vehicles;
  d public.driver_credentials;
  v_doc record;
  vb jsonb := '[]'::jsonb;
  va jsonb := '[]'::jsonb;
  cb jsonb := '[]'::jsonb;
  ca jsonb := '[]'::jsonb;
begin
  if p_vehicle is not null then
    select * into v from public.vehicles where id = p_vehicle and organization_id = p_org;
    for v_doc in
      select x.causa, x.vence from (values ('soat', v.soat_expiry), ('tecnomecanica', v.techno_expiry), ('poliza', v.insurance_expiry), ('tarjeta_operacion', v.operating_card_expiry)) x(causa, vence)
       where x.causa = any (coalesce(p_docs_vehiculo, array[]::text[]))
      union all
      select vd.doc_type, vd.expires_on from public.vehicle_documents vd
       where p_docs_bloqueantes and vd.vehicle_id = p_vehicle and vd.is_active and vd.blocks_dispatch
         and vd.doc_type in ('matricula', 'navegabilidad', 'otro') and vd.expires_on is not null
    loop
      if v_doc.vence is not null and v_doc.vence < p_fecha then
        vb := vb || jsonb_build_object('causa', v_doc.causa, 'grupo', 'vehiculo', 'vence', v_doc.vence);
      elsif v_doc.vence is not null and v_doc.vence <= p_fecha + p_dias_aviso then
        va := va || jsonb_build_object('causa', v_doc.causa, 'grupo', 'vehiculo', 'vence', v_doc.vence, 'dias', v_doc.vence - p_fecha);
      end if;
    end loop;
  end if;

  if p_driver is not null then
    select * into d from public.driver_credentials where id = p_driver and organization_id = p_org;
    for v_doc in
      select x.causa, x.vence from (values ('licencia', d.license_expiry), ('examen_medico', d.medical_certificate_expiry)) x(causa, vence)
       where x.causa = any (coalesce(p_docs_conductor, array[]::text[]))
      union all
      select vd.doc_type, vd.expires_on from public.vehicle_documents vd
       where p_docs_bloqueantes and vd.driver_credential_id = p_driver and vd.is_active and vd.blocks_dispatch
         and vd.doc_type = 'otro' and vd.expires_on is not null
    loop
      if v_doc.vence is not null and v_doc.vence < p_fecha then
        cb := cb || jsonb_build_object('causa', v_doc.causa, 'grupo', 'conductor', 'vence', v_doc.vence);
      elsif v_doc.vence is not null and v_doc.vence <= p_fecha + p_dias_aviso then
        ca := ca || jsonb_build_object('causa', v_doc.causa, 'grupo', 'conductor', 'vence', v_doc.vence, 'dias', v_doc.vence - p_fecha);
      end if;
    end loop;
  end if;

  return jsonb_build_object('vehiculo_bloqueos', vb, 'vehiculo_avisos', va, 'conductor_bloqueos', cb, 'conductor_avisos', ca);
end;
$$;

revoke all on function public.fn_flota_revisar_documentos(integer, uuid, uuid, date, text[], boolean, text[], integer) from public, anon, authenticated;
grant execute on function public.fn_flota_revisar_documentos(integer, uuid, uuid, date, text[], boolean, text[], integer) to service_role;

-- Transporte: mismo resultado que antes (mismas causas, mismo orden, mismas banderas de excepción).
create or replace function public.fn_transporte_cumplimiento_interno(p_trip uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t public.trips;
  d public.driver_credentials;
  r jsonb;
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_exc_vehiculo boolean;
  v_exc_conductor boolean;
begin
  select * into t from public.trips where id = p_trip;
  if t.id is null then
    return null;
  end if;
  v_exc_vehiculo := public.fn_transporte_ajuste_excepcion(t.organization_id, 'documentosVehiculo');
  v_exc_conductor := public.fn_transporte_ajuste_excepcion(t.organization_id, 'documentosConductor');

  if t.vehicle_id is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_vehiculo', 'grupo', 'asignacion', 'excepcion', false);
  else
    r := public.fn_flota_revisar_documentos(t.organization_id, t.vehicle_id, null, t.trip_date,
           array['soat', 'tecnomecanica', 'poliza', 'tarjeta_operacion'], true, array[]::text[], 30);
    v_bloqueos := v_bloqueos || coalesce((select jsonb_agg(e || jsonb_build_object('excepcion', v_exc_vehiculo) order by i)
                                            from jsonb_array_elements(r -> 'vehiculo_bloqueos') with ordinality x(e, i)), '[]'::jsonb);
    v_avisos := v_avisos || (r -> 'vehiculo_avisos');
  end if;

  if t.driver_id is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_conductor', 'grupo', 'asignacion', 'excepcion', false);
  else
    select * into d from public.driver_credentials
     where user_id = t.driver_id and organization_id = t.organization_id and coalesce(is_active, true)
     order by updated_at desc nulls last
     limit 1;
    if d.id is null then
      v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_credencial', 'grupo', 'conductor', 'excepcion', v_exc_conductor);
    else
      r := public.fn_flota_revisar_documentos(t.organization_id, null, d.id, t.trip_date,
             array[]::text[], true, array['licencia', 'examen_medico'], 30);
      v_bloqueos := v_bloqueos || coalesce((select jsonb_agg(e || jsonb_build_object('excepcion', v_exc_conductor) order by i)
                                              from jsonb_array_elements(r -> 'conductor_bloqueos') with ordinality x(e, i)), '[]'::jsonb);
      v_avisos := v_avisos || (r -> 'conductor_avisos');
    end if;
  end if;

  return jsonb_build_object(
    'trip_id', t.id,
    'fecha', t.trip_date,
    'bloqueos', v_bloqueos,
    'avisos', v_avisos,
    'admite_excepcion', jsonb_array_length(v_bloqueos) > 0
      and not exists (select 1 from jsonb_array_elements(v_bloqueos) b where (b ->> 'excepcion')::boolean is not true),
    'pide_pin', public.fn_transporte_ajuste_excepcion(t.organization_id, 'pedirPin')
  );
end;
$$;

-- ── 6. Asignación del envío propio ──────────────────────────────────────────

-- Categorías de licencia (Colombia) por tipo de vehículo: la misma tabla que CATEGORIAS_POR_TIPO
-- (src/lib/transporte/formulariosCatalogo.ts). NULL: el tipo no pide licencia (bici, lancha, otro).
create or replace function public.fn_flota_categorias_licencia(p_tipo text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_tipo
    when 'motorcycle' then array['A1', 'A2']
    when 'car' then array['B1', 'B2', 'B3', 'C1', 'C2', 'C3']
    when 'van' then array['B1', 'B2', 'B3', 'C1', 'C2', 'C3']
    when 'minibus' then array['C1', 'C2', 'C3']
    when 'bus' then array['C2', 'C3']
    when 'truck' then array['B2', 'B3', 'C2', 'C3']
    when 'trailer' then array['B3', 'C3']
    else null
  end;
$$;

-- Vehículo sugerido (regla 4.5): el que ya tenía el envío con esa misma persona > el por defecto
-- de la persona (si se puede usar) > «a pie» / «bici sin vehículo» explícito según su tipo.
create or replace function public.fn_logistica_vehiculo_sugerido(
  p_org integer, p_driver uuid, p_vehiculo_envio uuid, p_driver_envio uuid, p_excluir uuid[] default null)
returns table (vehicle_id uuid, sin_vehiculo text, origen text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d public.driver_credentials;
  v_ok boolean;
begin
  select * into d from public.driver_credentials where id = p_driver and organization_id = p_org;
  if p_vehiculo_envio is not null and p_driver_envio is not distinct from p_driver then
    return query select p_vehiculo_envio, null::text, 'envio'::text;
    return;
  end if;
  if d.default_vehicle_id is not null then
    select exists (
      select 1 from public.vehicles v
       where v.id = d.default_vehicle_id and v.organization_id = p_org and coalesce(v.is_active, true)
         and v.status in ('available', 'in_use') and v.usage in ('logistics', 'both')
         and not exists (select 1 from public.shipments s
                          where s.vehicle_id = v.id and s.driver_id is distinct from p_driver
                            and not (s.id = any (coalesce(p_excluir, array[]::uuid[])))
                            and s.status in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt')))
      into v_ok;
    if v_ok then
      return query select d.default_vehicle_id, null::text, 'defecto'::text;
      return;
    end if;
  end if;
  if d.vehicle_type in ('on_foot', 'bicycle') then
    return query select null::uuid, d.vehicle_type, 'tipo'::text;
    return;
  end if;
  return query select null::uuid, null::text, 'ninguno'::text;
end;
$$;

revoke all on function public.fn_logistica_vehiculo_sugerido(integer, uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_logistica_vehiculo_sugerido(integer, uuid, uuid, uuid, uuid[]) to service_role;

-- Cumplimiento de una asignación (persona + vehículo o «sin vehículo»). Solo describe; no decide si
-- se asigna (eso lo hace la RPC con el ajuste de la organización).
create or replace function public.fn_logistica_cumplimiento_asignacion(
  p_org integer, p_driver uuid, p_vehicle uuid, p_sin_vehiculo text, p_fecha date, p_peso numeric, p_volumen numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d public.driver_credentials;
  v public.vehicles;
  r jsonb;
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_requiere boolean;
  v_categorias text[];
  v_activo boolean;
  v_con_pin boolean;
begin
  select * into d from public.driver_credentials where id = p_driver and organization_id = p_org;
  v_requiere := coalesce(d.vehicle_type, '') in ('motorcycle', 'car', 'van');

  if p_vehicle is null then
    if v_requiere then
      v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'vehiculo_requerido', 'grupo', 'asignacion', 'excepcion', false);
    end if;
  else
    select * into v from public.vehicles where id = p_vehicle and organization_id = p_org;
    v_categorias := public.fn_flota_categorias_licencia(v.vehicle_type);
    -- Documentos y licencia: moto, carro, camioneta, camión… de la empresa o del domiciliario.
    -- La bici, «otro» y el vehículo de un tercero no se revisan (decisión 3 y regla 5.3).
    if v_categorias is not null and v.ownership <> 'third_party' then
      r := public.fn_flota_revisar_documentos(p_org, v.id, d.id, p_fecha, array['soat', 'tecnomecanica'], false, array['licencia'], 30);
      v_bloqueos := v_bloqueos || (r -> 'vehiculo_bloqueos');
      v_avisos := v_avisos || (r -> 'vehiculo_avisos');
      if d.license_category is null or d.license_expiry is null then
        v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_licencia', 'grupo', 'conductor', 'requeridas', to_jsonb(v_categorias));
      else
        v_bloqueos := v_bloqueos || (r -> 'conductor_bloqueos');
        v_avisos := v_avisos || (r -> 'conductor_avisos');
        if not (d.license_category = any (v_categorias)) then
          v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'categoria_licencia', 'grupo', 'conductor',
                                                         'categoria', d.license_category, 'requeridas', to_jsonb(v_categorias));
        end if;
      end if;
      -- Los bloqueos de documentos y licencia admiten excepción del supervisor.
      v_bloqueos := (select coalesce(jsonb_agg(case when e ? 'excepcion' then e else e || '{"excepcion": true}'::jsonb end order by i), '[]'::jsonb)
                       from jsonb_array_elements(v_bloqueos) with ordinality x(e, i));
    end if;
    -- Capacidad: solo avisa (decisión 4).
    if v.capacity_kg is not null and coalesce(p_peso, 0) > v.capacity_kg then
      v_avisos := v_avisos || jsonb_build_object('causa', 'capacidad_kg', 'grupo', 'capacidad', 'valor', p_peso, 'capacidad', v.capacity_kg);
    end if;
    if v.capacity_m3 is not null and coalesce(p_volumen, 0) > v.capacity_m3 then
      v_avisos := v_avisos || jsonb_build_object('causa', 'capacidad_m3', 'grupo', 'capacidad', 'valor', p_volumen, 'capacidad', v.capacity_m3);
    end if;
  end if;

  v_activo := public.fn_logistica_bloqueo_documentos(p_org);
  v_con_pin := public.fn_logistica_hay_autorizador_con_pin(p_org);

  return jsonb_build_object(
    'fecha', p_fecha,
    'tipo_persona', d.vehicle_type,
    'requiere_vehiculo', v_requiere,
    'sin_vehiculo', case when p_vehicle is null then p_sin_vehiculo end,
    'vehiculo', case when v.id is null then null else jsonb_build_object(
      'id', v.id, 'placa', v.plate, 'tipo', v.vehicle_type, 'dueno', v.ownership, 'owner_driver_id', v.owner_driver_id,
      'capacity_kg', v.capacity_kg, 'capacity_m3', v.capacity_m3) end,
    'peso', p_peso,
    'volumen', p_volumen,
    'bloqueos', v_bloqueos,
    'avisos', v_avisos,
    'bloqueo_activo', v_activo,
    'hay_autorizador_con_pin', v_con_pin,
    -- Bloquea de verdad solo con el ajuste encendido Y al menos un autorizador con PIN.
    'bloquea', v_activo and v_con_pin and jsonb_array_length(v_bloqueos) > 0,
    'admite_excepcion', jsonb_array_length(v_bloqueos) > 0
      and not exists (select 1 from jsonb_array_elements(v_bloqueos) b where (b ->> 'excepcion')::boolean is not true)
  );
end;
$$;

revoke all on function public.fn_logistica_cumplimiento_asignacion(integer, uuid, uuid, text, date, numeric, numeric) from public, anon, authenticated;
grant execute on function public.fn_logistica_cumplimiento_asignacion(integer, uuid, uuid, text, date, numeric, numeric) to service_role;

-- Peso y volumen que llevaría el vehículo: los envíos abiertos con ese vehículo y esa persona, más
-- los que se están asignando.
create or replace function public.fn_logistica_carga_vehiculo(p_vehicle uuid, p_driver uuid, p_envios uuid[])
returns table (peso numeric, volumen numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sum(s.weight_kg), sum(s.volume_m3)
    from public.shipments s
   where s.id = any (coalesce(p_envios, array[]::uuid[]))
      or (p_vehicle is not null and s.vehicle_id = p_vehicle and s.driver_id = p_driver
          and s.status in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt'));
$$;

revoke all on function public.fn_logistica_carga_vehiculo(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_logistica_carga_vehiculo(uuid, uuid, uuid[]) to service_role;

-- La firma cambia (parámetros nuevos con default): se reemplaza la de 4 parámetros para que
-- PostgREST no vea dos candidatas. Las llamadas viejas (4 argumentos) siguen funcionando.
drop function if exists public.logistica_asignar_domiciliario(uuid, uuid, uuid, date);

create or replace function public.logistica_asignar_domiciliario(
  p_shipment_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null,
  p_fecha_estimada date default null,
  p_sin_vehiculo text default null,
  p_motivo text default null,
  p_pin text default null,
  p_supervisor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.shipments;
  v_dc public.driver_credentials;
  v_v public.vehicles;
  v_ahora timestamptz := now();
  v_actor uuid := auth.uid();
  v_vehiculo_anterior uuid;
  v_vehicle uuid;
  v_sin text;
  v_peso numeric;
  v_volumen numeric;
  v_c jsonb;
  v_bloqueos jsonb;
  v_excepcion boolean := false;
  v_autoriza uuid;
  v_cred public.hr_credentials;
  v_emp public.employments;
  v_fallos integer;
  v_hasta timestamptz;
  v_tz text;
  v_estado text;
  v_espejo jsonb;
begin
  v_s := public.fn_logistica_envio_bloquear(p_shipment_id);
  -- Asignar es de quien despacha: un domiciliario sin permiso no se asigna ni reasigna envíos.
  if v_actor is not null and not public.fn_logistica_ve_todo(v_s.organization_id) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if v_s.status not in ('draft', 'pending', 'ready', 'ready_for_pickup', 'assigned', 'failed_attempt') then
    raise exception 'ESTADO_NO_ASIGNABLE' using errcode = '22023', detail = v_s.status;
  end if;
  select * into v_dc from public.driver_credentials
   where id = p_driver_id and organization_id = v_s.organization_id and coalesce(is_active, true)
     and usage in ('logistics', 'both');
  if not found then
    raise exception 'DOMICILIARIO_INVALIDO' using errcode = '22023';
  end if;
  -- «¿Cobra contraentrega?» del domiciliario (metadata.cobra_contraentrega; sin dato = sí).
  if coalesce(v_s.cod_amount, 0) > 0 and coalesce(v_dc.metadata ->> 'cobra_contraentrega', 'true') = 'false' then
    raise exception 'DOMICILIARIO_NO_COBRA' using errcode = '22023';
  end if;

  -- Vehículo: el elegido, «a pie / bici sin vehículo» explícito o, sin nada, el sugerido (4.5).
  if p_sin_vehiculo is not null then
    if p_sin_vehiculo not in ('on_foot', 'bicycle') then
      raise exception 'SIN_VEHICULO_INVALIDO' using errcode = '22023';
    end if;
    v_sin := p_sin_vehiculo;
  elsif p_vehicle_id is not null then
    v_vehicle := p_vehicle_id;
  else
    select g.vehicle_id, g.sin_vehiculo into v_vehicle, v_sin
      from public.fn_logistica_vehiculo_sugerido(v_s.organization_id, p_driver_id, v_s.vehicle_id, v_s.driver_id, array[v_s.id]) g;
  end if;

  if v_vehicle is not null then
    select * into v_v from public.vehicles
     where id = v_vehicle and organization_id = v_s.organization_id and coalesce(is_active, true)
       and status in ('available', 'in_use') and usage in ('logistics', 'both');
    if not found then
      raise exception 'VEHICULO_INVALIDO' using errcode = '22023';
    end if;
    -- Una placa con envíos abiertos de OTRA persona no se le da a nadie más (criterio 6).
    if exists (select 1 from public.shipments s
                where s.vehicle_id = v_vehicle and s.id <> v_s.id and s.driver_id is distinct from p_driver_id
                  and s.status in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt')) then
      raise exception 'VEHICULO_OCUPADO' using errcode = '22023';
    end if;
  end if;

  select c.peso, c.volumen into v_peso, v_volumen from public.fn_logistica_carga_vehiculo(v_vehicle, p_driver_id, array[v_s.id]) c;
  v_tz := coalesce((select o.timezone from public.organizations o where o.id = v_s.organization_id), 'America/Bogota');
  v_c := public.fn_logistica_cumplimiento_asignacion(v_s.organization_id, p_driver_id, v_vehicle, v_sin,
                                                     (v_ahora at time zone v_tz)::date, v_peso, v_volumen);
  v_bloqueos := v_c -> 'bloqueos';

  if coalesce((v_c ->> 'bloquea')::boolean, false) then
    if not coalesce((v_c ->> 'admite_excepcion')::boolean, false) then
      insert into public.shipment_assignment_log (organization_id, shipment_id, driver_id, vehicle_id, event, causes, actor)
      values (v_s.organization_id, v_s.id, p_driver_id, v_vehicle, 'bloqueado', v_bloqueos, v_actor);
      return jsonb_build_object('ok', false, 'estado', 'no_admite_excepcion', 'cumplimiento', v_c);
    end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      insert into public.shipment_assignment_log (organization_id, shipment_id, driver_id, vehicle_id, event, causes, actor)
      values (v_s.organization_id, v_s.id, p_driver_id, v_vehicle, 'bloqueado', v_bloqueos, v_actor);
      return jsonb_build_object('ok', false, 'estado', 'bloqueado', 'cumplimiento', v_c);
    end if;
    if length(btrim(p_motivo)) < 10 or length(p_motivo) > 500 then
      return jsonb_build_object('ok', false, 'estado', 'motivo_invalido', 'cumplimiento', v_c);
    end if;
    if p_supervisor is null then
      return jsonb_build_object('ok', false, 'estado', 'falta_supervisor', 'cumplimiento', v_c);
    end if;
    if not public.fn_transporte_puede_actor(p_supervisor, v_s.organization_id, 'logistica.asignacion.excepcion') then
      return jsonb_build_object('ok', false, 'estado', 'sin_permiso_excepcion', 'cumplimiento', v_c);
    end if;
    if not public.fn_transporte_tiene_pin(v_s.organization_id, p_supervisor) then
      return jsonb_build_object('ok', false, 'estado', 'supervisor_sin_pin', 'cumplimiento', v_c);
    end if;
    -- Decisión 2: los 5 intentos en 15 minutos se cuentan sobre el PIN del SUPERVISOR.
    select count(*) into v_fallos from public.shipment_assignment_log l
     where l.organization_id = v_s.organization_id and l.supervisor = p_supervisor and l.event = 'pin_rechazado'
       and l.created_at > v_ahora - interval '15 minutes';
    if v_fallos >= 5 then
      select l.created_at + interval '15 minutes' into v_hasta from public.shipment_assignment_log l
       where l.organization_id = v_s.organization_id and l.supervisor = p_supervisor and l.event = 'pin_rechazado'
         and l.created_at > v_ahora - interval '15 minutes'
       order by l.created_at desc offset 4 limit 1;
      return jsonb_build_object('ok', false, 'estado', 'pin_bloqueado', 'hasta', v_hasta, 'cumplimiento', v_c);
    end if;
    -- El PIN se valida aquí, nunca en el navegador (mismo motor que Transporte).
    if coalesce(p_pin, '') ~ '^[0-9]{6}$' then
      select * into v_cred from public.hr_credentials k
       where k.organization_id = v_s.organization_id and k.kind = 'pin' and k.revoked_at is null
         and k.lookup_hash = public.fn_hr_credencial_lookup(public.fn_hr_marcacion_pepper(v_s.organization_id), 'pin', p_pin);
      if v_cred.id is not null and v_cred.secret_hash = extensions.crypt(p_pin, v_cred.secret_hash)
         and (v_cred.locked_until is null or v_cred.locked_until <= v_ahora) then
        select * into v_emp from public.employments e where e.id = v_cred.employment_id and e.status = 'active';
        if v_emp.id is not null then
          v_autoriza := public.fn_hr_usuario_del_vinculo(v_emp.id);
        end if;
      end if;
    end if;
    if v_autoriza is null or v_autoriza <> p_supervisor then
      insert into public.shipment_assignment_log (organization_id, shipment_id, driver_id, vehicle_id, event, causes, actor, supervisor)
      values (v_s.organization_id, v_s.id, p_driver_id, v_vehicle, 'pin_rechazado', v_bloqueos, v_actor, p_supervisor);
      return jsonb_build_object('ok', false, 'estado', 'pin_rechazado', 'intentos_restantes', greatest(0, 4 - v_fallos), 'cumplimiento', v_c);
    end if;
    v_excepcion := true;
  end if;

  v_vehiculo_anterior := v_s.vehicle_id;
  -- Espejo mínimo (4.4): un cambio posterior de la ficha del vehículo no reescribe la historia.
  v_espejo := case when v_v.id is not null then jsonb_build_object(
                'id', v_v.id, 'placa', v_v.plate, 'tipo', v_v.vehicle_type, 'dueno', v_v.ownership,
                'owner_driver_id', v_v.owner_driver_id) end;

  update public.shipments set
    driver_id = p_driver_id,
    vehicle_id = v_vehicle,
    assigned_at = v_ahora,
    status = 'assigned',
    expected_delivery_date = coalesce(p_fecha_estimada, expected_delivery_date),
    metadata = (coalesce(metadata, '{}'::jsonb) - 'vehiculo' - 'sin_vehiculo' - 'excepcion_asignacion' - 'avisos_asignacion')
      || jsonb_strip_nulls(jsonb_build_object(
           'driver_id', p_driver_id, 'vehicle_id', v_vehicle, 'assigned_at', v_ahora,
           'vehiculo', v_espejo,
           'sin_vehiculo', case when v_vehicle is null then v_sin end,
           'avisos_asignacion', case when jsonb_array_length(v_c -> 'avisos') > 0
                                          or (jsonb_array_length(v_bloqueos) > 0 and not v_excepcion)
                                     then (v_c -> 'avisos') || case when v_excepcion then '[]'::jsonb else v_bloqueos end end,
           'excepcion_asignacion', case when v_excepcion then jsonb_build_object(
             'causas', v_bloqueos, 'motivo', btrim(p_motivo), 'pidio', v_actor, 'autorizo', v_autoriza, 'at', v_ahora) end))
      || case when v_vehicle is null then jsonb_build_object('vehicle_id', null) else '{}'::jsonb end,
    updated_at = v_ahora
   where id = v_s.id
  returning * into v_s;

  -- «En uso» sin tocar el conductor por defecto (current_driver_id es su espejo, no el del envío).
  if v_vehicle is not null then
    update public.vehicles set status = 'in_use', updated_at = v_ahora where id = v_vehicle and status <> 'in_use';
  end if;
  if v_vehiculo_anterior is not null and v_vehiculo_anterior is distinct from v_vehicle then
    perform public.fn_logistica_liberar_vehiculo(v_vehiculo_anterior, v_s.id);
  end if;

  if v_excepcion then
    insert into public.shipment_assignment_log (organization_id, shipment_id, driver_id, vehicle_id, event, causes, reason, actor, supervisor, authorized_by)
    values (v_s.organization_id, v_s.id, p_driver_id, v_vehicle, 'excepcion', v_bloqueos, btrim(p_motivo), v_actor, p_supervisor, v_autoriza);
    v_estado := 'asignado_con_excepcion';
  elsif jsonb_array_length(v_bloqueos) > 0 then
    insert into public.shipment_assignment_log (organization_id, shipment_id, driver_id, vehicle_id, event, causes, actor)
    values (v_s.organization_id, v_s.id, p_driver_id, v_vehicle, 'asignado_con_avisos', v_bloqueos, v_actor);
    v_estado := 'asignado_con_avisos';
  else
    v_estado := 'asignado';
  end if;

  perform public.fn_logistica_registrar_evento(
    v_s, 'assigned', 'assigned',
    'Domiciliario asignado' || case when v_v.id is not null then ' con vehículo ' || coalesce(v_v.plate, v_v.vehicle_type)
                                    when v_sin = 'on_foot' then ' a pie'
                                    when v_sin = 'bicycle' then ' en bici sin vehículo registrado'
                                    else '' end
      || case when v_excepcion then ' (excepción autorizada)' else '' end,
    null, null, null,
    jsonb_strip_nulls(jsonb_build_object('driver_id', p_driver_id, 'vehicle_id', v_vehicle, 'sin_vehiculo', v_sin,
                                         'excepcion', case when v_excepcion then true end)));

  return jsonb_build_object('ok', true, 'estado', v_estado, 'shipment_id', v_s.id, 'status', v_s.status,
                            'driver_id', v_s.driver_id, 'vehicle_id', v_s.vehicle_id, 'sin_vehiculo', v_sin,
                            'assigned_at', v_s.assigned_at, 'avisos', v_c -> 'avisos',
                            'bloqueos_sin_aplicar', case when v_excepcion then '[]'::jsonb else v_bloqueos end);
end;
$$;

revoke all on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date, text, text, text, uuid) from public, anon;
grant execute on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date, text, text, text, uuid) to authenticated, service_role;

comment on function public.logistica_asignar_domiciliario(uuid, uuid, uuid, date, text, text, text, uuid) is
  'Logística 1b: asigna domiciliario y vehículo (preselección envío > por defecto > a pie/bici). Revisa documentos y licencia; con el bloqueo de la organización encendido y un autorizador con PIN, bloquea salvo excepción (motivo + PIN del supervisor, 5 intentos en 15 min sobre su PIN). Capacidad solo avisa. Devuelve ok=false (sin lanzar) en bloqueos para que la bitácora quede.';

-- Revisión previa para la hoja «Asignar» (solo lee: no escribe bitácora).
create or replace function public.logistica_revisar_asignacion(
  p_shipment_ids uuid[], p_driver_id uuid, p_vehicle_id uuid default null, p_sin_vehiculo text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_s public.shipments;
  v_vehicle uuid;
  v_sin text;
  v_origen text := 'elegido';
  v_peso numeric;
  v_volumen numeric;
  v_tz text;
  v_ocupado boolean := false;
begin
  if coalesce(array_length(p_shipment_ids, 1), 0) = 0 then
    raise exception 'ENVIO_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  select * into v_s from public.shipments where id = p_shipment_ids[1];
  if v_s.id is null then
    raise exception 'ENVIO_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  v_org := v_s.organization_id;
  if not public.fn_logistica_ve_todo(v_org) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if exists (select 1 from public.shipments s where s.id = any (p_shipment_ids) and s.organization_id <> v_org) then
    raise exception 'ENVIO_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.driver_credentials dc where dc.id = p_driver_id and dc.organization_id = v_org) then
    raise exception 'DOMICILIARIO_INVALIDO' using errcode = '22023';
  end if;

  if p_sin_vehiculo is not null then
    v_sin := case when p_sin_vehiculo in ('on_foot', 'bicycle') then p_sin_vehiculo end;
  elsif p_vehicle_id is not null then
    v_vehicle := p_vehicle_id;
  else
    select g.vehicle_id, g.sin_vehiculo, g.origen into v_vehicle, v_sin, v_origen
      from public.fn_logistica_vehiculo_sugerido(v_org, p_driver_id,
             case when array_length(p_shipment_ids, 1) = 1 then v_s.vehicle_id end,
             case when array_length(p_shipment_ids, 1) = 1 then v_s.driver_id end, p_shipment_ids) g;
  end if;
  if v_vehicle is not null then
    if not exists (select 1 from public.vehicles v where v.id = v_vehicle and v.organization_id = v_org) then
      raise exception 'VEHICULO_INVALIDO' using errcode = '22023';
    end if;
    v_ocupado := exists (select 1 from public.shipments s
                          where s.vehicle_id = v_vehicle and not (s.id = any (p_shipment_ids)) and s.driver_id is distinct from p_driver_id
                            and s.status in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt'));
  end if;

  select c.peso, c.volumen into v_peso, v_volumen from public.fn_logistica_carga_vehiculo(v_vehicle, p_driver_id, p_shipment_ids) c;
  v_tz := coalesce((select o.timezone from public.organizations o where o.id = v_org), 'America/Bogota');
  return public.fn_logistica_cumplimiento_asignacion(v_org, p_driver_id, v_vehicle, v_sin, (now() at time zone v_tz)::date, v_peso, v_volumen)
    || jsonb_build_object('vehiculo_id', v_vehicle, 'origen', v_origen, 'vehiculo_ocupado', v_ocupado);
end;
$$;

revoke all on function public.logistica_revisar_asignacion(uuid[], uuid, uuid, text) from public, anon;
grant execute on function public.logistica_revisar_asignacion(uuid[], uuid, uuid, text) to authenticated, service_role;

-- ── 7. Liberar el vehículo SIN quitarle el conductor por defecto (5.5) ─────

create or replace function public.fn_logistica_liberar_vehiculo(p_vehicle_id uuid, p_salvo_envio uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_vehicle_id is null then
    return;
  end if;
  if not exists (select 1 from public.shipments s
                  where s.vehicle_id = p_vehicle_id and s.id <> p_salvo_envio
                    and s.status in ('assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit',
                                     'out_for_delivery', 'failed_attempt')) then
    -- Solo vuelve a «Disponible»: current_driver_id es el espejo del conductor por defecto.
    update public.vehicles set status = 'available', updated_at = now()
     where id = p_vehicle_id and status = 'in_use';
  end if;
end;
$$;

-- ── POS: la venta nunca se frena ────────────────────────────────────────────

create or replace function public.logistica_crear_envio_venta_pos(p_sale_id uuid, p_entrega jsonb, p_driver_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sale public.sales;
  v_e jsonb := coalesce(p_entrega, '{}'::jsonb);
  v_existente uuid;
  v_id uuid;
  v_cot jsonb;
  v_flete numeric;
  v_fuente text;
  v_zona uuid;
  v_cod numeric;
  v_contacto text;
  v_telefono text;
  v_numero text;
  v_items integer;
  v_org_nombre text;
  v_s public.shipments;
  v_asignacion text;
  v_r jsonb;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'VENTA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_sale.organization_id);
  if auth.uid() is not null and not public.app_branch_access(v_sale.branch_id) then
    raise exception 'SIN_ACCESO_SEDE' using errcode = '42501';
  end if;
  if v_sale.status in ('cancelled', 'voided', 'void', 'refunded') then
    raise exception 'VENTA_ANULADA' using errcode = '22023';
  end if;

  select s.id into v_existente from public.shipments s where s.source_type = 'sale' and s.source_id = v_sale.id;
  if v_existente is not null then
    select * into v_s from public.shipments where id = v_existente;
    return jsonb_build_object('ok', true, 'ya_existia', true, 'shipment_id', v_s.id,
                              'shipment_number', v_s.shipment_number, 'cod_amount', v_s.cod_amount,
                              'shipping_fee', v_s.shipping_fee);
  end if;
  if nullif(btrim(coalesce(v_e ->> 'direccion', '')), '') is null then
    raise exception 'DIRECCION_REQUERIDA' using errcode = '22023';
  end if;

  -- Flete: la cotización del servidor manda cuando hay datos para ubicar la dirección.
  if coalesce(v_e ->> 'municipio_dane', v_e ->> 'barrio', v_e ->> 'codigo_postal', v_e ->> 'lat') is not null then
    v_cot := public.logistica_cotizar_envio(v_sale.organization_id, v_sale.branch_id, v_e, 'pos',
                                            coalesce(v_sale.subtotal, v_sale.total, 0), '{}'::jsonb);
    v_flete := nullif(v_cot ->> 'precio', '')::numeric;
    v_zona := nullif(v_cot -> 'zona' ->> 'id', '')::uuid;
    v_fuente := 'cotizacion';
  end if;
  if v_flete is null then
    begin
      v_flete := greatest(coalesce(nullif(v_e ->> 'costo_envio', '')::numeric, 0), 0);
    exception when others then
      v_flete := 0;
    end;
    v_fuente := 'pos_cliente';
  end if;

  v_cod := greatest(coalesce(v_sale.balance, 0), 0);

  select coalesce(nullif(btrim(v_e ->> 'contacto_nombre'), ''), c.full_name),
         coalesce(nullif(btrim(v_e ->> 'contacto_telefono'), ''), c.phone)
    into v_contacto, v_telefono
    from (select 1) x
    left join public.customers c on c.id = v_sale.customer_id;

  select o.name into v_org_nombre from public.organizations o where o.id = v_sale.organization_id;
  select count(*) into v_items from public.sale_items si where si.sale_id = v_sale.id;

  v_numero := 'POS-' || upper(right(replace(v_sale.id::text, '-', ''), 8));
  if exists (select 1 from public.shipments where organization_id = v_sale.organization_id and shipment_number = v_numero) then
    v_numero := v_numero || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
  end if;

  insert into public.shipments (organization_id, branch_id, source_type, source_id, shipment_number, tracking_number,
                                customer_id, delivery_address, delivery_city, delivery_postal_code, delivery_latitude,
                                delivery_longitude, delivery_contact_name, delivery_contact_phone, delivery_instructions,
                                package_count, declared_value, shipping_fee, total_cost, currency, status, payment_status,
                                fulfillment_mode, cod_amount, cod_status, shipping_zone_id, notes, created_by, metadata)
  values (v_sale.organization_id, v_sale.branch_id, 'sale', v_sale.id, v_numero,
          'TRK' || upper(substr(md5(gen_random_uuid()::text), 1, 10)),
          v_sale.customer_id, btrim(v_e ->> 'direccion'), nullif(btrim(coalesce(v_e ->> 'ciudad', '')), ''),
          nullif(btrim(coalesce(v_e ->> 'codigo_postal', '')), ''),
          case when (v_e ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_e ->> 'lat')::numeric end,
          case when (v_e ->> 'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_e ->> 'lng')::numeric end,
          v_contacto, v_telefono, nullif(btrim(coalesce(v_e ->> 'instrucciones', '')), ''),
          greatest(v_items, 1), v_sale.total, v_flete, coalesce(v_sale.total, 0) + v_flete, null, 'pending',
          case when v_cod > 0 then 'cod' when v_sale.payment_status = 'paid' then 'paid' else 'pending' end,
          'own', v_cod, case when v_cod > 0 then 'pending' end, v_zona,
          'Venta POS ' || v_numero, auth.uid(),
          jsonb_build_object('pos_sale_id', v_sale.id, 'pos_total', v_sale.total, 'shipping_fee', v_flete,
                             'shipping_fee_source', v_fuente, 'shipping_rate_id', nullif(v_e ->> 'tarifa_id', ''),
                             'barrio', nullif(v_e ->> 'barrio', ''), 'municipio_dane', nullif(v_e ->> 'municipio_dane', ''),
                             'sender_name', v_org_nombre, 'items_count', v_items))
  returning id into v_id;

  insert into public.shipment_items (shipment_id, product_id, sale_item_id, description, sku, qty, unit_value, total_value)
  select v_id, si.product_id, si.id, coalesce(p.name, 'Producto'), p.sku, si.quantity, si.unit_price, si.total
    from public.sale_items si
    left join public.products p on p.id = si.product_id
   where si.sale_id = v_sale.id;

  select * into v_s from public.shipments where id = v_id;
  perform public.fn_logistica_registrar_evento(v_s, 'created', 'created', 'Envío creado desde la venta POS ' || v_numero,
                                               null, null, null, '{}'::jsonb);

  if p_driver_id is not null then
    if v_cod > 0 and exists (select 1 from public.driver_credentials dc
                              where dc.id = p_driver_id and dc.organization_id = v_sale.organization_id
                                and coalesce(dc.metadata ->> 'cobra_contraentrega', 'true') = 'false') then
      v_asignacion := 'DOMICILIARIO_NO_COBRA';
    else
      -- Logística 1b (decisión 4): la misma RPC de asignar, con el vehículo por defecto. Si la moto o
      -- el domiciliario quedan bloqueados, la venta NO se frena: el envío queda «Por despachar».
      begin
        v_r := public.logistica_asignar_domiciliario(v_id, p_driver_id, null, null);
        v_asignacion := case when coalesce((v_r ->> 'ok')::boolean, false) then 'asignado'
                             else coalesce(v_r ->> 'estado', 'no_asignado') end;
      exception when others then
        v_asignacion := left(coalesce(nullif(sqlerrm, ''), 'ERROR'), 80);
      end;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'ya_existia', false, 'shipment_id', v_id, 'shipment_number', v_numero,
                            'cod_amount', v_cod, 'shipping_fee', v_flete, 'shipping_fee_source', v_fuente,
                            'cotizacion', v_cot, 'asignacion', v_asignacion);
end;
$function$;

-- ── 8. Alta: elegir o crear el vehículo por defecto ─────────────────────────

-- `p_nuevo`: {placa, tipo, dueno ('company'|'driver'|'third_party'), soat, tecnomecanica, kg, m3, uso}.
-- Crea el vehículo (uso Logística salvo que diga otra cosa) y lo deja como el por defecto de la
-- persona, en una sola transacción. Con `p_vehicle_id` solo lo vincula. Con los dos NULL lo quita.
create or replace function public.logistica_vincular_vehiculo(p_driver_id uuid, p_vehicle_id uuid default null, p_nuevo jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.driver_credentials;
  v_id uuid;
  v_tipo text;
  v_dueno text;
  v_uso text;
begin
  select * into d from public.driver_credentials where id = p_driver_id;
  if d.id is null then
    raise exception 'DOMICILIARIO_INVALIDO' using errcode = 'P0002';
  end if;
  if not public.fn_logistica_gestiona(d.organization_id) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  if p_nuevo is not null then
    v_tipo := coalesce(nullif(p_nuevo ->> 'tipo', ''), d.vehicle_type);
    v_dueno := coalesce(nullif(p_nuevo ->> 'dueno', ''), 'company');
    v_uso := coalesce(nullif(p_nuevo ->> 'uso', ''), 'logistics');
    if v_tipo is null or v_tipo not in ('motorcycle', 'car', 'van', 'bicycle', 'other', 'truck') then
      raise exception 'TIPO_INVALIDO' using errcode = '22023';
    end if;
    begin
      insert into public.vehicles (organization_id, branch_id, plate, vehicle_type, ownership, owner_driver_id, usage,
                                   soat_expiry, techno_expiry, capacity_kg, capacity_m3, status, is_active, metadata)
      values (d.organization_id, d.branch_id, upper(regexp_replace(btrim(coalesce(p_nuevo ->> 'placa', '')), '\s+', ' ', 'g')),
              v_tipo, v_dueno, case when v_dueno = 'driver' then d.id end, v_uso,
              nullif(p_nuevo ->> 'soat', '')::date, nullif(p_nuevo ->> 'tecnomecanica', '')::date,
              nullif(p_nuevo ->> 'kg', '')::numeric, nullif(p_nuevo ->> 'm3', '')::numeric,
              'available', true, jsonb_build_object('origen_alta', 'logistica_domiciliario'))
      returning id into v_id;
    exception
      when unique_violation then raise exception 'PLACA_DUPLICADA' using errcode = '23505';
      when check_violation then raise exception 'PLACA_REQUERIDA' using errcode = '23514';
    end;
  elsif p_vehicle_id is not null then
    select v.id into v_id from public.vehicles v
     where v.id = p_vehicle_id and v.organization_id = d.organization_id and coalesce(v.is_active, true)
       and v.usage in ('logistics', 'both');
    if v_id is null then
      raise exception 'VEHICULO_INVALIDO' using errcode = '22023';
    end if;
  end if;

  if v_id is not null and exists (select 1 from public.driver_credentials x where x.default_vehicle_id = v_id and x.id <> d.id) then
    raise exception 'VEHICULO_DE_OTRO' using errcode = '23505';
  end if;

  update public.driver_credentials
     set default_vehicle_id = v_id,
         vehicle_type = coalesce((select case when v.vehicle_type in ('motorcycle', 'bicycle', 'car', 'van', 'other') then v.vehicle_type end
                                    from public.vehicles v where v.id = v_id), vehicle_type),
         updated_at = now()
   where id = d.id;

  return jsonb_build_object('ok', true, 'driver_id', d.id, 'vehicle_id', v_id);
end;
$$;

revoke all on function public.logistica_vincular_vehiculo(uuid, uuid, jsonb) from public, anon;
grant execute on function public.logistica_vincular_vehiculo(uuid, uuid, jsonb) to authenticated, service_role;
