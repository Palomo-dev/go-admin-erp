-- HRM fase 2 · paso 3: marcación validada en el servidor, consentimiento de ubicación,
-- trabajo remoto y consolidación del día con descansos y turnos nocturnos (ADR-002 §2).
-- attendance_events, timesheets y time_clocks tienen 0 filas.

-- 1. Consentimiento de ubicación: solo inserción; el vigente es el último ----------------
create table if not exists public.hr_geo_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  employment_id uuid not null references public.employments(id),
  user_id uuid not null references auth.users(id),
  granted boolean not null,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);
comment on table public.hr_geo_consents is
  'ADR-002 §2. Autorización del empleado para guardar su ubicación SOLO en el momento de marcar (Ley 1581; investigación §12-E 35). Solo inserción: otorgar y retirar son filas nuevas; rige la última.';
create index if not exists hr_geo_consents_vinculo_idx on public.hr_geo_consents (employment_id, created_at desc);
drop trigger if exists trg_hr_geo_consents_org on public.hr_geo_consents;
create trigger trg_hr_geo_consents_org before insert on public.hr_geo_consents
  for each row execute function public.fn_hr_org_del_vinculo();
drop trigger if exists trg_hr_geo_consents_inmutable on public.hr_geo_consents;
create trigger trg_hr_geo_consents_inmutable before update or delete on public.hr_geo_consents
  for each row execute function public.fn_hr_solo_insercion();
alter table public.hr_geo_consents enable row level security;
revoke all on public.hr_geo_consents from anon;
revoke insert, update, delete, truncate on public.hr_geo_consents from authenticated;
drop policy if exists hr_geo_consents_select on public.hr_geo_consents;
create policy hr_geo_consents_select on public.hr_geo_consents for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));

create or replace function public.fn_hr_ubicacion_autorizada(p_employment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select c.granted from public.hr_geo_consents c
                    where c.employment_id = p_employment
                    order by c.created_at desc, c.id desc limit 1), false);
$$;
revoke all on function public.fn_hr_ubicacion_autorizada(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_ubicacion_autorizada(uuid) to service_role;

-- 2. Marcaciones: día de trabajo y modalidad ---------------------------------------------
alter table public.attendance_events
  add column if not exists work_date date,
  add column if not exists work_mode text not null default 'presencial';
alter table public.attendance_events drop constraint if exists attendance_events_work_mode_chk;
alter table public.attendance_events add constraint attendance_events_work_mode_chk
  check (work_mode in ('presencial', 'remoto'));
comment on column public.attendance_events.work_date is
  'ADR-002 §2. Día de trabajo al que pertenece la marcación: la entrada toma el del turno que la contiene; la salida y los descansos, el de la entrada abierta. Así un turno de 22:00 a 06:00 es un solo día.';
create index if not exists attendance_events_vinculo_dia_idx on public.attendance_events (employment_id, work_date);
create index if not exists attendance_events_vinculo_hora_idx on public.attendance_events (employment_id, event_at desc);

-- 3. Timesheets: versión de los insumos, clasificación y «lista para nómina» ------------
alter table public.timesheets
  add column if not exists input_version integer not null default 0,
  add column if not exists classified_version integer,
  add column if not exists classified_at timestamptz,
  add column if not exists classification jsonb,
  add column if not exists classification_source text,
  add column if not exists payroll_ready_at timestamptz,
  add column if not exists payroll_ready_by uuid references auth.users(id);
alter table public.timesheets drop constraint if exists timesheets_classification_source_chk;
alter table public.timesheets add constraint timesheets_classification_source_chk
  check (classification_source is null or classification_source in ('marcaciones', 'turno'));
comment on column public.timesheets.input_version is
  'ADR-002 §3. Sube con cada cambio de las marcaciones del día. El día solo pasa a «lista para nómina» si classified_version = input_version.';
comment on column public.timesheets.status is
  'open → approved («lista para nómina», ADR-002 §4) → locked (la consumió la nómina). submitted y rejected se conservan por las pantallas viejas.';

-- 4. Validación de cada marcación ---------------------------------------------------------
create or replace function public.fn_hr_attendance_validar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_branch integer;
  v_tz text;
  v_wd date;
  v_ult public.attendance_events;
begin
  select e.organization_id, e.branch_id into v_org, v_branch from public.employments e where e.id = new.employment_id;
  if v_org is null then
    raise exception 'hr: el vínculo laboral no existe' using errcode = '23503';
  end if;
  if new.organization_id is distinct from v_org then
    raise exception 'hr: la marcación debe ser de la organización del vínculo' using errcode = '42501';
  end if;
  if new.branch_id is not null and not exists (
       select 1 from public.branches b where b.id = new.branch_id and b.organization_id = v_org) then
    raise exception 'hr: la sede es de otra organización' using errcode = '42501';
  end if;
  if new.time_clock_id is not null and not exists (
       select 1 from public.time_clocks c where c.id = new.time_clock_id and c.organization_id = v_org) then
    raise exception 'hr: el punto de marcación es de otra organización' using errcode = '42501';
  end if;
  -- Quien marca para sí (sin gestión de asistencia) marca con la hora del servidor.
  if auth.uid() is not null and not public.fn_hr_puede(v_org, 'hr.attendance.manage') then
    new.event_at := now();
    new.is_manual_entry := false;
    new.manual_reason := null;
    new.created_by := auth.uid();
  end if;
  -- La ubicación solo se guarda con autorización vigente del empleado.
  if new.geo is not null and not public.fn_hr_ubicacion_autorizada(new.employment_id) then
    new.geo := null;
    new.geo_validated := null;
  end if;
  new.work_mode := coalesce(new.work_mode, 'presencial');

  -- Día de trabajo (siempre lo calcula la base).
  v_wd := null;
  if new.event_type = 'check_in' then
    select s.work_date into v_wd
      from public.shift_assignments s
     where s.employment_id = new.employment_id and not s.is_rest_day
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
       and new.event_at >= s.start_at - interval '3 hours' and new.event_at < s.end_at
     order by s.start_at
     limit 1;
  else
    select a.* into v_ult
      from public.attendance_events a
     where a.employment_id = new.employment_id and a.id <> new.id
       and a.event_at <= new.event_at and a.event_at > new.event_at - interval '24 hours'
     order by a.event_at desc, a.created_at desc
     limit 1;
    if v_ult.id is not null and v_ult.event_type <> 'check_out' then
      v_wd := v_ult.work_date;
    end if;
  end if;
  if v_wd is null then
    v_tz := public.fn_timezone_for(v_org, coalesce(new.branch_id, v_branch));
    v_wd := (new.event_at at time zone v_tz)::date;
  end if;
  new.work_date := v_wd;
  return new;
end;
$$;
revoke all on function public.fn_hr_attendance_validar() from public, anon, authenticated;
drop trigger if exists trg_attendance_events_validar on public.attendance_events;
create trigger trg_attendance_events_validar before insert or update on public.attendance_events
  for each row execute function public.fn_hr_attendance_validar();

-- 5. Consolidación del día: pares entrada/salida, descansos, tardanza y salida temprana --
create or replace function public.fn_hr_timesheet_consolidar(p_employment uuid, p_fecha date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_branch integer;
  v_ts public.timesheets;
  a public.shift_assignments;
  r record;
  v_n integer;
  v_in timestamptz;
  v_out timestamptz;
  v_abierto timestamptz;
  v_pausa timestamptz;
  v_worked integer := 0;
  v_break integer := 0;
begin
  if p_employment is null or p_fecha is null then
    return null;
  end if;
  select e.organization_id, e.branch_id into v_org, v_branch from public.employments e where e.id = p_employment;
  select * into v_ts from public.timesheets t where t.employment_id = p_employment and t.work_date = p_fecha for update;
  if v_ts.id is not null and v_ts.status = 'locked' then
    raise exception 'jornada_cerrada: el día ya lo consumió la nómina' using errcode = '55000';
  end if;
  select count(*) into v_n from public.attendance_events ae where ae.employment_id = p_employment and ae.work_date = p_fecha;
  select * into a from public.shift_assignments s
   where s.employment_id = p_employment and s.work_date = p_fecha and not s.is_draft
     and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
   limit 1;

  if v_n = 0 and v_ts.id is null then
    return null;
  end if;
  if v_ts.id is null then
    insert into public.timesheets (organization_id, branch_id, employment_id, work_date)
    values (v_org, coalesce(a.branch_id, v_branch), p_employment, p_fecha)
    on conflict (employment_id, work_date) do nothing;
    select * into v_ts from public.timesheets t where t.employment_id = p_employment and t.work_date = p_fecha for update;
  end if;

  for r in
    select ae.event_type, ae.event_at from public.attendance_events ae
     where ae.employment_id = p_employment and ae.work_date = p_fecha
     order by ae.event_at, ae.created_at
  loop
    if r.event_type = 'check_in' then
      if v_abierto is null then
        v_abierto := r.event_at;
      end if;
      v_in := coalesce(v_in, r.event_at);
    elsif r.event_type = 'check_out' then
      if v_abierto is not null then
        if v_pausa is not null then
          v_break := v_break + (extract(epoch from (r.event_at - v_pausa)) / 60)::integer;
          v_pausa := null;
        end if;
        v_worked := v_worked + (extract(epoch from (r.event_at - v_abierto)) / 60)::integer;
        v_abierto := null;
      end if;
      v_out := r.event_at;
    elsif r.event_type = 'break_start' then
      if v_abierto is not null and v_pausa is null then
        v_pausa := r.event_at;
      end if;
    elsif r.event_type = 'break_end' then
      if v_pausa is not null then
        v_break := v_break + (extract(epoch from (r.event_at - v_pausa)) / 60)::integer;
        v_pausa := null;
      end if;
    end if;
  end loop;

  update public.timesheets t
     set first_check_in = v_in,
         last_check_out = v_out,
         worked_minutes = greatest(0, v_worked),
         break_minutes = greatest(0, v_break),
         net_worked_minutes = greatest(0, v_worked - v_break),
         scheduled_minutes = a.planned_minutes,
         late_minutes = case when a.start_at is not null and v_in is not null
                             then greatest(0, (extract(epoch from (v_in - a.start_at)) / 60)::integer) else 0 end,
         early_departure_minutes = case when a.end_at is not null and v_out is not null and v_abierto is null
                                        then greatest(0, (extract(epoch from (a.end_at - v_out)) / 60)::integer) else 0 end,
         input_version = t.input_version + 1,
         -- Un cambio de marcaciones saca el día de «lista para nómina»: hay que reclasificar.
         status = case when t.status = 'approved' then 'open' else t.status end,
         payroll_ready_at = case when t.status = 'approved' then null else t.payroll_ready_at end,
         payroll_ready_by = case when t.status = 'approved' then null else t.payroll_ready_by end,
         metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object('marcacion_abierta', v_abierto is not null),
         updated_at = now()
   where t.id = v_ts.id;
  return v_ts.id;
end;
$$;
revoke all on function public.fn_hr_timesheet_consolidar(uuid, date) from public, anon, authenticated;
grant execute on function public.fn_hr_timesheet_consolidar(uuid, date) to service_role;

create or replace function public.hrm_process_attendance_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fn_hr_timesheet_consolidar(new.employment_id, new.work_date);
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and (old.work_date is distinct from new.work_date or old.employment_id <> new.employment_id)) then
    perform public.fn_hr_timesheet_consolidar(old.employment_id, old.work_date);
  end if;
  return null;
end;
$$;
revoke all on function public.hrm_process_attendance_event() from public, anon, authenticated;
drop trigger if exists trg_attendance_event_process on public.attendance_events;
create trigger trg_attendance_event_process after insert or update or delete on public.attendance_events
  for each row execute function public.hrm_process_attendance_event();

-- 6. El token del QR ya no llega al empleado ---------------------------------------------
drop policy if exists time_clocks_select on public.time_clocks;
create policy time_clocks_select on public.time_clocks for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view'))
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

-- 7. Marcar (solo el servidor, con el actor de la sesión) --------------------------------
create or replace function public.fn_hr_marcar(p_actor uuid, p_org integer, p_datos jsonb,
                                               p_ip text default null, p_ua text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp public.employments;
  v_aj public.hr_attendance_settings;
  v_metodo text := coalesce(p_datos->>'metodo', '');
  v_tipo text := nullif(p_datos->>'tipo', '');
  v_pedido uuid;
  v_reloj public.time_clocks;
  v_ult public.attendance_events;
  v_ev public.attendance_events;
  v_geo jsonb;
  v_lat numeric;
  v_lng numeric;
  v_prec numeric;
  v_consent boolean;
  v_geo_ok boolean;
  v_dist numeric;
  v_radio numeric;
  v_remoto boolean := coalesce((p_datos->>'remoto')::boolean, false);
  v_modo text;
begin
  if p_actor is null or p_org is null or not exists (
       select 1 from public.organization_members om
        where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_metodo not in ('qr', 'app') then
    raise exception 'metodo_invalido: se marca con el QR de la sede o desde la app' using errcode = '22023';
  end if;
  if p_datos ? 'employment_id' then
    v_pedido := nullif(p_datos->>'employment_id', '')::uuid;
  end if;

  -- El vínculo es siempre el del actor en esta organización.
  select e.* into v_emp
    from public.employments e
    left join public.organization_members om on om.id = e.organization_member_id
    left join public.hr_people p on p.id = e.person_id
   where e.organization_id = p_org and e.status = 'active'
     and (om.user_id = p_actor or p.user_id = p_actor)
     and (v_pedido is null or e.id = v_pedido)
   order by e.hire_date desc nulls last, e.created_at desc
   limit 1;
  if v_emp.id is null then
    raise exception 'sin_vinculo_activo: no tienes un vínculo laboral activo en esta organización' using errcode = '42501';
  end if;
  v_aj := public.fn_hr_ajustes_asistencia(v_emp.id);
  if not (v_metodo = any (v_aj.mecanismos)) then
    raise exception 'mecanismo_no_permitido: tu empresa no habilitó este mecanismo de marcación para ti' using errcode = '42501';
  end if;

  -- Trabajo remoto: solo con modalidad remota o híbrida; el QR es siempre presencial.
  if v_metodo = 'qr' then
    v_remoto := false;
  elsif v_aj.modalidad = 'remoto' then
    v_remoto := true;
  elsif v_remoto and v_aj.modalidad = 'presencial' then
    raise exception 'remoto_no_permitido: tu modalidad de trabajo es presencial' using errcode = '42501';
  end if;
  v_modo := case when v_remoto then 'remoto' else 'presencial' end;

  -- QR: se valida aquí, contra la base. El token nunca se compara en el navegador.
  if v_metodo = 'qr' then
    begin
      select * into v_reloj from public.time_clocks c
       where c.id = nullif(p_datos->>'reloj_id', '')::uuid and c.organization_id = p_org;
    exception when invalid_text_representation then
      v_reloj := null;
    end;
    if v_reloj.id is null or not v_reloj.is_active or v_reloj.type not in ('qr_static', 'qr_dynamic')
       or v_reloj.current_qr_token is null or coalesce(p_datos->>'token', '') = ''
       or v_reloj.current_qr_token <> (p_datos->>'token') then
      raise exception 'qr_invalido: el código no corresponde a un punto de marcación activo de tu organización' using errcode = '42501';
    end if;
    if (v_reloj.type = 'qr_dynamic' and v_reloj.qr_token_expires_at is null)
       or (v_reloj.qr_token_expires_at is not null and v_reloj.qr_token_expires_at < now()) then
      raise exception 'qr_vencido: el código ya venció; escanea el que muestra la pantalla ahora' using errcode = '42501';
    end if;
  end if;

  -- Ubicación: solo la de este momento y solo con autorización vigente.
  if jsonb_typeof(p_datos->'ubicacion') = 'object' then
    begin
      v_lat := (p_datos->'ubicacion'->>'lat')::numeric;
      v_lng := (p_datos->'ubicacion'->>'lng')::numeric;
      v_prec := nullif(p_datos->'ubicacion'->>'precision', '')::numeric;
      if v_lat between -90 and 90 and v_lng between -180 and 180 then
        v_geo := jsonb_build_object('lat', round(v_lat, 6), 'lng', round(v_lng, 6), 'precision', round(v_prec));
      end if;
    exception when others then
      v_geo := null;
    end;
  end if;
  v_consent := public.fn_hr_ubicacion_autorizada(v_emp.id);
  if v_metodo = 'qr' and v_reloj.require_geo_validation and jsonb_typeof(v_reloj.geo_fence) = 'object' then
    if not v_consent then
      raise exception 'ubicacion_requiere_consentimiento: este punto pide tu ubicación y no la has autorizado' using errcode = '42501';
    end if;
    if v_geo is null then
      raise exception 'ubicacion_requerida: este punto pide tu ubicación al marcar' using errcode = '22023';
    end if;
    v_radio := coalesce(nullif(v_reloj.geo_fence->>'radius', '')::numeric, 100);
    v_dist := 2 * 6371000 * asin(sqrt(
                power(sin(radians(((v_reloj.geo_fence->>'lat')::numeric - v_lat) / 2)), 2)
              + cos(radians(v_lat)) * cos(radians((v_reloj.geo_fence->>'lat')::numeric))
              * power(sin(radians(((v_reloj.geo_fence->>'lng')::numeric - v_lng) / 2)), 2)));
    v_geo_ok := v_dist <= v_radio;
    if not v_geo_ok then
      raise exception 'fuera_de_rango: estás a % m del punto de marcación (máximo % m)', round(v_dist), round(v_radio)
        using errcode = '42501';
    end if;
  end if;
  if not v_consent then
    v_geo := null;
    v_geo_ok := null;
  end if;

  -- Entrada o salida: alterna con la última marcación de las 24 h anteriores.
  select * into v_ult from public.attendance_events a
   where a.employment_id = v_emp.id and a.event_at > now() - interval '24 hours'
   order by a.event_at desc, a.created_at desc
   limit 1;
  if v_tipo is null then
    v_tipo := case when v_ult.id is null or v_ult.event_type = 'check_out' then 'check_in'
                   when v_ult.event_type = 'break_start' then 'break_end'
                   else 'check_out' end;
  elsif v_tipo not in ('check_in', 'check_out', 'break_start', 'break_end') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_ult.id is not null and v_ult.event_type = v_tipo and v_ult.event_at > now() - interval '60 seconds' then
    raise exception 'marcacion_duplicada: ya registraste esta marcación hace menos de un minuto' using errcode = '55000';
  end if;

  insert into public.attendance_events
    (organization_id, branch_id, employment_id, event_type, event_at, source, time_clock_id,
     geo, geo_validated, device_info, is_manual_entry, created_by, work_mode)
  values
    (p_org, coalesce(v_reloj.branch_id, v_emp.branch_id), v_emp.id, v_tipo, now(), v_metodo, v_reloj.id,
     v_geo, v_geo_ok,
     jsonb_strip_nulls(jsonb_build_object('plataforma', left(p_datos->'dispositivo'->>'plataforma', 40),
                                          'app', left(p_datos->'dispositivo'->>'app', 40))),
     false, p_actor, v_modo)
  returning * into v_ev;

  return jsonb_build_object('evento_id', v_ev.id, 'tipo', v_ev.event_type, 'hora', v_ev.event_at,
                            'fecha_trabajo', v_ev.work_date, 'employment_id', v_emp.id, 'modo', v_modo,
                            'ubicacion_guardada', v_ev.geo is not null, 'reloj', v_reloj.name);
end;
$$;
revoke all on function public.fn_hr_marcar(uuid, integer, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_marcar(uuid, integer, jsonb, text, text) to service_role;

-- Estado de la marcación del actor (para /marcar y el panel del empleado).
create or replace function public.fn_hr_marcacion_estado(p_actor uuid, p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp public.employments;
  v_aj public.hr_attendance_settings;
  v_ult public.attendance_events;
  v_c public.hr_geo_consents;
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select e.* into v_emp
    from public.employments e
    left join public.organization_members om on om.id = e.organization_member_id
    left join public.hr_people p on p.id = e.person_id
   where e.organization_id = p_org and e.status = 'active' and (om.user_id = p_actor or p.user_id = p_actor)
   order by e.hire_date desc nulls last, e.created_at desc
   limit 1;
  if v_emp.id is null then
    return jsonb_build_object('vinculo', null);
  end if;
  v_aj := public.fn_hr_ajustes_asistencia(v_emp.id);
  select * into v_ult from public.attendance_events a
   where a.employment_id = v_emp.id and a.event_at > now() - interval '24 hours'
   order by a.event_at desc, a.created_at desc limit 1;
  select * into v_c from public.hr_geo_consents c where c.employment_id = v_emp.id order by c.created_at desc, c.id desc limit 1;
  return jsonb_build_object(
    'vinculo', jsonb_build_object('id', v_emp.id, 'sede_id', v_emp.branch_id,
                                  'sede', (select b.name from public.branches b where b.id = v_emp.branch_id),
                                  'nombre', public.fn_hr_nombre_persona(v_emp.person_id)),
    'modalidad', v_aj.modalidad,
    'mecanismos', to_jsonb(v_aj.mecanismos),
    'ubicacion', jsonb_build_object('autorizada', coalesce(v_c.granted, false), 'version', v_c.policy_version, 'fecha', v_c.created_at),
    'ultima', case when v_ult.id is null then null
                   else jsonb_build_object('tipo', v_ult.event_type, 'hora', v_ult.event_at, 'fecha_trabajo', v_ult.work_date) end,
    'siguiente', case when v_ult.id is null or v_ult.event_type = 'check_out' then 'check_in'
                      when v_ult.event_type = 'break_start' then 'break_end' else 'check_out' end);
end;
$$;
revoke all on function public.fn_hr_marcacion_estado(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_marcacion_estado(uuid, integer) to service_role;

-- Otorgar o retirar la autorización de ubicación.
create or replace function public.fn_hr_consentimiento_ubicacion(p_actor uuid, p_org integer, p_otorgar boolean,
                                                                 p_version text, p_ip text default null,
                                                                 p_ua text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp uuid;
  v_ip inet;
begin
  if p_otorgar is null or coalesce(btrim(p_version), '') = '' then
    raise exception 'consentimiento_invalido' using errcode = '22023';
  end if;
  select e.id into v_emp
    from public.employments e
    left join public.organization_members om on om.id = e.organization_member_id
    left join public.hr_people p on p.id = e.person_id
   where e.organization_id = p_org and e.status = 'active' and (om.user_id = p_actor or p.user_id = p_actor)
     and exists (select 1 from public.organization_members m where m.user_id = p_actor and m.organization_id = p_org and m.is_active)
   order by e.hire_date desc nulls last, e.created_at desc
   limit 1;
  if v_emp is null then
    raise exception 'sin_vinculo_activo' using errcode = '42501';
  end if;
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  insert into public.hr_geo_consents (organization_id, employment_id, user_id, granted, policy_version, ip, user_agent)
  values (p_org, v_emp, p_actor, p_otorgar, left(btrim(p_version), 40), v_ip, left(p_ua, 500));
  return jsonb_build_object('autorizada', p_otorgar, 'version', left(btrim(p_version), 40));
end;
$$;
revoke all on function public.fn_hr_consentimiento_ubicacion(uuid, integer, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_consentimiento_ubicacion(uuid, integer, boolean, text, text, text) to service_role;

-- Marcación con hora elegida: solo quien gestiona asistencia, con motivo.
create or replace function public.fn_hr_marcacion_manual(p_actor uuid, p_org integer, p_employment uuid, p_tipo text,
                                                         p_hora timestamptz, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ev public.attendance_events;
  v_branch integer;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select e.branch_id into v_branch from public.employments e where e.id = p_employment and e.organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if p_tipo not in ('check_in', 'check_out', 'break_start', 'break_end') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_hora is null or p_hora > now() + interval '5 minutes' or p_hora < now() - interval '62 days' then
    raise exception 'hora_invalida: entre hace 62 días y ahora' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) not between 5 and 500 then
    raise exception 'motivo_requerido: de 5 a 500 caracteres' using errcode = '22023';
  end if;
  insert into public.attendance_events
    (organization_id, branch_id, employment_id, event_type, event_at, source, is_manual_entry, manual_reason, created_by)
  values (p_org, v_branch, p_employment, p_tipo, p_hora, 'manual', true, btrim(p_motivo), p_actor)
  returning * into v_ev;
  return jsonb_build_object('evento_id', v_ev.id, 'tipo', v_ev.event_type, 'hora', v_ev.event_at, 'fecha_trabajo', v_ev.work_date);
end;
$$;
revoke all on function public.fn_hr_marcacion_manual(uuid, integer, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.fn_hr_marcacion_manual(uuid, integer, uuid, text, timestamptz, text) to service_role;

-- Nuevo token del QR, generado en la base.
create or replace function public.fn_hr_reloj_qr_rotar(p_actor uuid, p_org integer, p_reloj uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_vence timestamptz;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into c from public.time_clocks t where t.id = p_reloj and t.organization_id = p_org for update;
  if not found then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  if c.type not in ('qr_static', 'qr_dynamic') then
    raise exception 'reloj_sin_qr' using errcode = '22023';
  end if;
  if c.type = 'qr_dynamic' then
    v_vence := now() + make_interval(secs => least(greatest(coalesce(nullif(c.settings->>'qr_ttl_segundos', '')::integer, 300), 30), 86400));
  end if;
  update public.time_clocks set current_qr_token = v_token, qr_token_expires_at = v_vence, updated_at = now()
   where id = c.id;
  return jsonb_build_object('reloj_id', c.id, 'token', v_token, 'vence', v_vence);
end;
$$;
revoke all on function public.fn_hr_reloj_qr_rotar(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_reloj_qr_rotar(uuid, integer, uuid) to service_role;
