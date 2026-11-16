-- HRM fase 2 · paso 2: turnos, rotaciones, descansos y ajustes de asistencia (ADR-002 §2).
-- Las tablas shift_* tienen 0 filas: las columnas nuevas llevan DEFAULT o se calculan.

-- 0. Organización derivada del vínculo, para las tablas nuevas de la fase 2 ------------
create or replace function public.fn_hr_org_del_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
begin
  select e.organization_id into v_org from public.employments e where e.id = new.employment_id;
  if v_org is null then
    raise exception 'hr: el vínculo laboral no existe' using errcode = '23503';
  end if;
  if new.organization_id is not null and new.organization_id <> v_org then
    raise exception 'hr: el registro debe ser de la organización del vínculo' using errcode = '42501';
  end if;
  new.organization_id := v_org;
  return new;
end;
$$;
revoke all on function public.fn_hr_org_del_vinculo() from public, anon, authenticated;

-- 1. Ajustes de asistencia por vínculo --------------------------------------------------
create table if not exists public.hr_attendance_settings (
  employment_id uuid primary key references public.employments(id),
  organization_id integer not null references public.organizations(id) on delete cascade,
  modalidad text not null default 'presencial' check (modalidad in ('presencial', 'remoto', 'hibrido')),
  mecanismos text[] not null default array['app', 'qr']::text[]
    check (cardinality(mecanismos) > 0 and mecanismos <@ array['app', 'qr', 'sin_marcacion']::text[]),
  dia_descanso smallint not null default 0 check (dia_descanso between 0 and 6),
  dias_laborables smallint[] not null default array[1, 2, 3, 4, 5, 6]::smallint[]
    check (cardinality(dias_laborables) between 1 and 7 and dias_laborables <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  jornada_flexible boolean not null default false,
  exento_horas_extra boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 1000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
comment on table public.hr_attendance_settings is
  'ADR-002 §2. Ajustes de asistencia de un vínculo: modalidad, mecanismos de marcación, día de descanso pactado (0 = domingo), días laborables, jornada flexible y exento de horas extra (CST 162). Sin fila rigen los valores por defecto.';
create index if not exists hr_attendance_settings_org_idx on public.hr_attendance_settings (organization_id);
drop trigger if exists trg_hr_attendance_settings_org on public.hr_attendance_settings;
create trigger trg_hr_attendance_settings_org before insert or update on public.hr_attendance_settings
  for each row execute function public.fn_hr_org_del_vinculo();

alter table public.hr_attendance_settings enable row level security;
revoke all on public.hr_attendance_settings from anon;
drop policy if exists hr_attendance_settings_select on public.hr_attendance_settings;
create policy hr_attendance_settings_select on public.hr_attendance_settings for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team'))
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));
drop policy if exists hr_attendance_settings_write on public.hr_attendance_settings;
create policy hr_attendance_settings_write on public.hr_attendance_settings for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

-- Ajustes efectivos: la fila del vínculo o los valores por defecto.
create or replace function public.fn_hr_ajustes_asistencia(p_employment uuid)
returns public.hr_attendance_settings
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s public.hr_attendance_settings;
begin
  select * into s from public.hr_attendance_settings a where a.employment_id = p_employment;
  if found then
    return s;
  end if;
  select e.id, e.organization_id into s.employment_id, s.organization_id from public.employments e where e.id = p_employment;
  s.modalidad := 'presencial';
  s.mecanismos := array['app', 'qr']::text[];
  s.dia_descanso := 0;
  s.dias_laborables := array[1, 2, 3, 4, 5, 6]::smallint[];
  s.jornada_flexible := false;
  s.exento_horas_extra := false;
  return s;
end;
$$;
revoke all on function public.fn_hr_ajustes_asistencia(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_ajustes_asistencia(uuid) to service_role;

-- 2. Asignaciones: hora real del turno, descanso y borrador ----------------------------
alter table public.shift_assignments
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists planned_minutes integer,
  add column if not exists break_minutes integer,
  add column if not exists is_rest_day boolean not null default false,
  add column if not exists is_draft boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id);
alter table public.shift_assignments drop constraint if exists shift_assignments_planned_minutes_rango;
alter table public.shift_assignments add constraint shift_assignments_planned_minutes_rango
  check (planned_minutes is null or planned_minutes between 0 and 1440);
alter table public.shift_assignments drop constraint if exists shift_assignments_break_minutes_rango;
alter table public.shift_assignments add constraint shift_assignments_break_minutes_rango
  check (break_minutes is null or break_minutes between 0 and 720);
comment on column public.shift_assignments.start_at is
  'ADR-002 §2. Inicio real del turno en la zona de la sede (fn_timezone_for). Lo calcula trg_shift_assignments_calcular.';
comment on column public.shift_assignments.end_at is
  'ADR-002 §2. Fin real del turno; si la hora de fin es menor o igual a la de inicio, termina al día siguiente.';
comment on column public.shift_assignments.is_draft is
  'ADR-002 §2. Borrador del planificador: el empleado y su jefe no lo ven hasta publicarlo (fn_hr_turnos_publicar).';
comment on column public.shift_templates.overtime_multiplier is
  'Legado: no se usa. Los recargos salen de fn_hr_parametro por fecha (ADR-002 §3).';
comment on column public.shift_templates.night_multiplier is
  'Legado: no se usa. Los recargos salen de fn_hr_parametro por fecha (ADR-002 §3).';
create index if not exists shift_assignments_org_fecha_idx on public.shift_assignments (organization_id, work_date);
create index if not exists shift_assignments_empleo_inicio_idx on public.shift_assignments (employment_id, start_at);

create or replace function public.fn_hr_turno_calcular()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_branch integer;
  v_tz text;
  t public.shift_templates;
  v_ini time;
  v_fin time;
  v_desc integer;
  v_pagado boolean := false;
begin
  select e.organization_id, e.branch_id into v_org, v_branch from public.employments e where e.id = new.employment_id;
  if v_org is null then
    raise exception 'hr: el vínculo laboral no existe' using errcode = '23503';
  end if;
  if new.organization_id is distinct from v_org then
    raise exception 'hr: el turno debe ser de la organización del vínculo' using errcode = '42501';
  end if;
  if new.branch_id is not null and not exists (
       select 1 from public.branches b where b.id = new.branch_id and b.organization_id = v_org) then
    raise exception 'hr: la sede es de otra organización' using errcode = '42501';
  end if;
  if new.shift_rotation_id is not null and not exists (
       select 1 from public.shift_rotations r where r.id = new.shift_rotation_id and r.organization_id = v_org) then
    raise exception 'hr: la rotación es de otra organización' using errcode = '42501';
  end if;
  if new.swapped_with_employment_id is not null and not exists (
       select 1 from public.employments e where e.id = new.swapped_with_employment_id and e.organization_id = v_org) then
    raise exception 'hr: el vínculo del cambio es de otra organización' using errcode = '42501';
  end if;

  if new.is_rest_day then
    new.shift_template_id := null;
    new.start_at := null;
    new.end_at := null;
    new.planned_minutes := 0;
    new.break_minutes := 0;
    return new;
  end if;

  if new.shift_template_id is not null then
    select * into t from public.shift_templates s where s.id = new.shift_template_id and s.organization_id = v_org;
    if not found then
      raise exception 'hr: la plantilla es de otra organización' using errcode = '42501';
    end if;
    v_pagado := coalesce(t.paid_break, false);
  end if;
  v_ini := coalesce(new.actual_start_time, t.start_time);
  v_fin := coalesce(new.actual_end_time, t.end_time);
  if v_ini is null or v_fin is null then
    raise exception 'turno_sin_horario: el turno necesita una plantilla o su hora de inicio y de fin' using errcode = '22023';
  end if;
  v_desc := coalesce(new.break_minutes, t.break_minutes, 0);
  v_tz := public.fn_timezone_for(v_org, coalesce(new.branch_id, v_branch));
  new.start_at := (new.work_date + v_ini) at time zone v_tz;
  new.end_at := (new.work_date + v_fin + case when v_fin <= v_ini then interval '1 day' else interval '0 minutes' end) at time zone v_tz;
  new.break_minutes := v_desc;
  new.planned_minutes := greatest(0, (extract(epoch from (new.end_at - new.start_at)) / 60)::integer
                                     - case when v_pagado then 0 else v_desc end);

  if coalesce(new.status, 'scheduled') not in ('cancelled', 'swapped') and exists (
       select 1 from public.shift_assignments o
        where o.employment_id = new.employment_id
          and o.id <> new.id
          and not o.is_rest_day
          and coalesce(o.status, 'scheduled') not in ('cancelled', 'swapped')
          and o.start_at < new.end_at
          and o.end_at > new.start_at) then
    raise exception 'turno_cruzado: el turno se cruza con otro del mismo empleado' using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_hr_turno_calcular() from public, anon, authenticated;
drop trigger if exists trg_shift_assignments_calcular on public.shift_assignments;
create trigger trg_shift_assignments_calcular before insert or update on public.shift_assignments
  for each row execute function public.fn_hr_turno_calcular();

-- La notificación solo sale con el turno publicado (no por cada borrador ni por un descanso).
alter function public.fn_notify_shift_assigned() set search_path = public, pg_temp;
drop trigger if exists trg_notify_shift_assigned on public.shift_assignments;
create trigger trg_notify_shift_assigned after insert on public.shift_assignments
  for each row when (not new.is_draft and not new.is_rest_day)
  execute function public.fn_notify_shift_assigned();
drop trigger if exists trg_notify_shift_published on public.shift_assignments;
create trigger trg_notify_shift_published after update of is_draft on public.shift_assignments
  for each row when (old.is_draft and not new.is_draft and not new.is_rest_day)
  execute function public.fn_notify_shift_assigned();

-- El empleado y su jefe ven solo lo publicado; quien supervisa asistencia ve también los borradores.
drop policy if exists shift_assignments_select on public.shift_assignments;
create policy shift_assignments_select on public.shift_assignments for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view'))
         or (not is_draft and (employment_id in (select public.fn_hr_mis_empleos())
                               or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team')))));

-- 3. Rotaciones: el patrón que ya usa shiftRotationsService --------------------------
-- [{ "day": 1, "shift_template_id": "<uuid>" | null, "is_off": false }, ...] con una posición por día del ciclo.
create or replace function public.fn_hr_rotacion_validar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  v_tpl text;
begin
  if new.cycle_days is null or new.cycle_days not between 1 and 62
     or jsonb_typeof(new.pattern) <> 'array' or jsonb_array_length(new.pattern) <> new.cycle_days then
    raise exception 'rotacion_invalida: el patrón debe tener una posición por cada día del ciclo (1 a 62)' using errcode = '22023';
  end if;
  for v in select value from jsonb_array_elements(new.pattern) loop
    if jsonb_typeof(v) <> 'object' then
      raise exception 'rotacion_invalida: cada día del patrón es un objeto' using errcode = '22023';
    end if;
    v_tpl := v->>'shift_template_id';
    if coalesce((v->>'is_off')::boolean, false) or v_tpl is null then
      continue;
    end if;
    if not exists (select 1 from public.shift_templates s
                    where s.id::text = v_tpl and s.organization_id = new.organization_id) then
      raise exception 'rotacion_invalida: la plantilla % no es de la organización', v_tpl using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.fn_hr_rotacion_validar() from public, anon, authenticated;
drop trigger if exists trg_shift_rotations_validar on public.shift_rotations;
create trigger trg_shift_rotations_validar before insert or update on public.shift_rotations
  for each row execute function public.fn_hr_rotacion_validar();

-- 4. Validar y publicar ------------------------------------------------------------------
-- Ventana de asignaciones vivas de la organización.
create or replace function public.fn_hr_turnos_ventana(p_org integer, p_desde date, p_hasta date, p_employments uuid[])
returns setof public.shift_assignments
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.* from public.shift_assignments s
   where s.organization_id = p_org
     and s.work_date between p_desde and p_hasta
     and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
     and (p_employments is null or s.employment_id = any (p_employments));
$$;
revoke all on function public.fn_hr_turnos_ventana(integer, date, date, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_hr_turnos_ventana(integer, date, date, uuid[]) to service_role;

create or replace function public.fn_hr_turnos_validar(p_actor uuid, p_org integer, p_desde date, p_hasta date,
                                                       p_employments uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_bloqueos jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  r record;
  v_tope numeric;
  v_contrato numeric;
  v_extra_max numeric;
  v_cap numeric;
  v_umbral numeric;
  v_aj public.hr_attendance_settings;
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 92 then
    raise exception 'rango_invalido: el rango va de 1 a 93 días' using errcode = '22023';
  end if;

  -- Bloqueo: dos turnos del mismo empleado que se cruzan (incluido el nocturno contra el del día siguiente).
  for r in
    select x.employment_id, x.work_date as fecha_a, y.work_date as fecha_b, x.id as a, y.id as b
      from public.fn_hr_turnos_ventana(p_org, p_desde - 1, p_hasta + 1, p_employments) x
      join public.fn_hr_turnos_ventana(p_org, p_desde - 1, p_hasta + 1, p_employments) y
        on y.employment_id = x.employment_id and x.id < y.id
     where not x.is_rest_day and not y.is_rest_day
       and x.start_at < y.end_at and x.end_at > y.start_at
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'turno_cruzado', 'employment_id', r.employment_id,
                    'fechas', jsonb_build_array(r.fecha_a, r.fecha_b), 'asignaciones', jsonb_build_array(r.a, r.b));
  end loop;

  -- Bloqueo: turno sobre una ausencia solicitada o aprobada.
  for r in
    select s.employment_id, s.work_date, s.id, l.id as ausencia
      from public.fn_hr_turnos_ventana(p_org, p_desde, p_hasta, p_employments) s
      join public.leave_requests l
        on l.employment_id = s.employment_id and l.organization_id = p_org
       and l.status in ('requested', 'approved', 'taken')
       and s.work_date between l.start_date and l.end_date
     where not s.is_rest_day
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'turno_en_ausencia', 'employment_id', r.employment_id,
                    'fechas', jsonb_build_array(r.work_date), 'asignaciones', jsonb_build_array(r.id), 'ausencia', r.ausencia);
  end loop;

  -- Alerta: extra planeada en el día.
  for r in
    select s.* from public.fn_hr_turnos_ventana(p_org, p_desde, p_hasta, p_employments) s where not s.is_rest_day
  loop
    v_aj := public.fn_hr_ajustes_asistencia(r.employment_id);
    v_cap := 60 * public.fn_hr_parametro(p_org, case when v_aj.jornada_flexible then 'jornada_flexible_max_diaria'
                                                     else 'jornada_max_diaria' end, r.work_date);
    if r.planned_minutes > v_cap then
      v_extra_max := 60 * public.fn_hr_parametro(p_org, 'horas_extra_max_dia', r.work_date);
      v_alertas := v_alertas || jsonb_build_object(
        'codigo', case when r.planned_minutes - v_cap > v_extra_max then 'extra_diaria_supera_tope' else 'extra_planeada' end,
        'employment_id', r.employment_id, 'fechas', jsonb_build_array(r.work_date), 'asignaciones', jsonb_build_array(r.id),
        'minutos_extra', r.planned_minutes - v_cap, 'tope_minutos', v_extra_max);
    end if;
    -- Día de descanso pactado o festivo trabajado (ocasional o habitual en el mes, CST 179).
    if extract(dow from r.work_date)::smallint = v_aj.dia_descanso or public.fn_hr_es_festivo(p_org, r.work_date, r.branch_id) then
      v_umbral := public.fn_hr_parametro(p_org, 'dominical_habitual_umbral_dias', r.work_date);
      v_alertas := v_alertas || jsonb_build_object(
        'codigo', 'trabaja_dia_descanso', 'employment_id', r.employment_id, 'fechas', jsonb_build_array(r.work_date),
        'asignaciones', jsonb_build_array(r.id),
        'en_el_mes', (select count(*) from public.shift_assignments m
                       where m.employment_id = r.employment_id and not m.is_rest_day
                         and coalesce(m.status, 'scheduled') not in ('cancelled', 'swapped')
                         and date_trunc('month', m.work_date) = date_trunc('month', r.work_date)
                         and (extract(dow from m.work_date)::smallint = v_aj.dia_descanso
                              or exists (select 1 from public.hr_holidays h
                                          where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = m.work_date))),
        'umbral_habitual', v_umbral);
    end if;
  end loop;

  -- Alertas por semana (lunes a domingo): jornada máxima, extra semanal y semana sin descanso.
  for r in
    select w.* from (
      select s.employment_id,
             s.work_date - (extract(isodow from s.work_date)::integer - 1) as semana,
             sum(s.planned_minutes) filter (where not s.is_rest_day) as minutos,
             count(distinct s.work_date) filter (where not s.is_rest_day) as dias
        from public.fn_hr_turnos_ventana(p_org, p_desde - 6, p_hasta + 6, p_employments) s
       group by 1, 2
    ) w
     where w.semana + 6 >= p_desde and w.semana <= p_hasta
  loop
    -- La jornada solo baja: se toma la menor de la semana, a favor del trabajador.
    v_tope := 60 * least(public.fn_hr_parametro(p_org, 'jornada_max_semanal', r.semana),
                         public.fn_hr_parametro(p_org, 'jornada_max_semanal', r.semana + 6));
    select nullif(e.work_hours_per_week, 0) into v_contrato from public.employments e where e.id = r.employment_id;
    if v_contrato is not null then
      v_tope := least(v_tope, 60 * v_contrato);
    end if;
    if coalesce(r.minutos, 0) > v_tope then
      v_extra_max := 60 * public.fn_hr_parametro(p_org, 'horas_extra_max_semana', r.semana + 6);
      v_alertas := v_alertas || jsonb_build_object(
        'codigo', case when r.minutos - v_tope > v_extra_max then 'extra_semanal_supera_tope' else 'semana_supera_jornada' end,
        'employment_id', r.employment_id, 'semana', r.semana, 'minutos_planeados', r.minutos,
        'tope_minutos', v_tope, 'minutos_extra', r.minutos - v_tope, 'tope_extra_minutos', v_extra_max);
    end if;
    if r.dias >= 7 then
      v_alertas := v_alertas || jsonb_build_object('codigo', 'semana_sin_descanso', 'employment_id', r.employment_id,
                                                   'semana', r.semana);
    end if;
  end loop;

  return jsonb_build_object('bloqueos', v_bloqueos, 'alertas', v_alertas);
end;
$$;
revoke all on function public.fn_hr_turnos_validar(uuid, integer, date, date, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_hr_turnos_validar(uuid, integer, date, date, uuid[]) to service_role;

create or replace function public.fn_hr_turnos_publicar(p_actor uuid, p_org integer, p_desde date, p_hasta date,
                                                        p_employments uuid[] default null,
                                                        p_aceptar_alertas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  n integer;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v := public.fn_hr_turnos_validar(p_actor, p_org, p_desde, p_hasta, p_employments);
  if jsonb_array_length(v->'bloqueos') > 0 then
    return v || jsonb_build_object('publicado', false);
  end if;
  if jsonb_array_length(v->'alertas') > 0 and not coalesce(p_aceptar_alertas, false) then
    return v || jsonb_build_object('publicado', false, 'requiere_confirmacion', true);
  end if;
  update public.shift_assignments s
     set is_draft = false, published_at = now(), published_by = p_actor
   where s.organization_id = p_org and s.is_draft
     and s.work_date between p_desde and p_hasta
     and (p_employments is null or s.employment_id = any (p_employments));
  get diagnostics n = row_count;
  return v || jsonb_build_object('publicado', true, 'publicados', n);
end;
$$;
revoke all on function public.fn_hr_turnos_publicar(uuid, integer, date, date, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.fn_hr_turnos_publicar(uuid, integer, date, date, uuid[], boolean) to service_role;

-- 5. Generar borradores desde una rotación -----------------------------------------------
create or replace function public.fn_hr_rotacion_aplicar(p_actor uuid, p_org integer, p_rotacion uuid,
                                                         p_employments uuid[], p_desde date, p_hasta date,
                                                         p_desfase integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rot public.shift_rotations;
  v_emp uuid;
  v_branch integer;
  d date;
  v_idx integer;
  v_pos jsonb;
  v_tpl uuid;
  v_creados integer := 0;
  v_omitidos jsonb := '[]'::jsonb;
  n integer;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 92 then
    raise exception 'rango_invalido: el rango va de 1 a 93 días' using errcode = '22023';
  end if;
  select * into rot from public.shift_rotations r where r.id = p_rotacion and r.organization_id = p_org and r.is_active;
  if not found then
    raise exception 'hr: la rotación no existe' using errcode = 'P0002';
  end if;
  if p_employments is null or cardinality(p_employments) = 0 or cardinality(p_employments) > 500 then
    raise exception 'empleados_invalidos: de 1 a 500 vínculos' using errcode = '22023';
  end if;

  foreach v_emp in array p_employments loop
    select e.branch_id into v_branch from public.employments e where e.id = v_emp and e.organization_id = p_org;
    if not found then
      raise exception 'hr: el vínculo es de otra organización' using errcode = '42501';
    end if;
    d := p_desde;
    while d <= p_hasta loop
      v_idx := (((d - p_desde) + coalesce(p_desfase, 0)) % rot.cycle_days + rot.cycle_days) % rot.cycle_days;
      v_pos := rot.pattern -> v_idx;
      v_tpl := case when coalesce((v_pos->>'is_off')::boolean, false) then null
                    else nullif(v_pos->>'shift_template_id', '')::uuid end;
      begin
        insert into public.shift_assignments
          (organization_id, branch_id, employment_id, shift_template_id, shift_rotation_id, work_date,
           is_rest_day, is_draft, created_by)
        values (p_org, v_branch, v_emp, v_tpl, rot.id, d, v_tpl is null, true, p_actor)
        on conflict (employment_id, work_date) do nothing;
        get diagnostics n = row_count;
        if n = 0 then
          v_omitidos := v_omitidos || jsonb_build_object('employment_id', v_emp, 'fecha', d, 'motivo', 'ya_tiene_turno');
        end if;
        v_creados := v_creados + n;
      exception when sqlstate '23P01' then
        v_omitidos := v_omitidos || jsonb_build_object('employment_id', v_emp, 'fecha', d, 'motivo', 'turno_cruzado');
      end;
      d := d + 1;
    end loop;
  end loop;
  return jsonb_build_object('creados', v_creados, 'omitidos', v_omitidos);
end;
$$;
revoke all on function public.fn_hr_rotacion_aplicar(uuid, integer, uuid, uuid[], date, date, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_rotacion_aplicar(uuid, integer, uuid, uuid[], date, date, integer) to service_role;
