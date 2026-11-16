-- HRM fase 2 · paso 4: salida del motor de horas, novedades con aprobación y «lista para nómina» (ADR-002 §3 y §4).
-- El motor es TypeScript puro (src/lib/hrm/jornada/motorHoras.ts). La base le entrega los insumos
-- (fn_hr_jornada_insumos) y guarda su salida (fn_hr_jornada_guardar) con control de versión.

-- 0. ¿El vínculo es del actor? -------------------------------------------------------------
create or replace function public.fn_hr_vinculo_es_del_actor(p_actor uuid, p_employment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_actor is not null and exists (
    select 1 from public.employments e
      left join public.organization_members om on om.id = e.organization_member_id
      left join public.hr_people p on p.id = e.person_id
     where e.id = p_employment
       and (om.user_id = p_actor or p.user_id = p_actor)
       and e.organization_id in (select m.organization_id from public.organization_members m
                                  where m.user_id = p_actor and m.is_active));
$$;
revoke all on function public.fn_hr_vinculo_es_del_actor(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_vinculo_es_del_actor(uuid, uuid) to service_role;

-- 1. Líneas clasificadas del día (lo que consume la nómina) -------------------------------
create table if not exists public.hr_timesheet_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  timesheet_id uuid not null references public.timesheets(id) on delete cascade,
  employment_id uuid not null references public.employments(id),
  work_date date not null,
  local_date date not null,
  category text not null check (category in ('ord_diurna', 'ord_nocturna', 'dom_diurna', 'dom_nocturna',
                                             'extra_diurna', 'extra_nocturna', 'extra_dom_diurna', 'extra_dom_nocturna')),
  minutes integer not null check (minutes between 1 and 1440),
  surcharge numeric(6, 4) not null check (surcharge between 0 and 5),
  hour_divisor numeric(7, 2) not null check (hour_divisor > 0),
  dominical_reason text check (dominical_reason is null or dominical_reason in ('dia_descanso', 'festivo')),
  created_at timestamptz not null default now()
);
comment on table public.hr_timesheet_lines is
  'ADR-002 §3. Salida del motor de horas: minutos por categoría, día local, recargo (fracción, con los parámetros vigentes ese día) y divisor de la hora. Solo la escribe fn_hr_jornada_guardar.';
create index if not exists hr_timesheet_lines_ts_idx on public.hr_timesheet_lines (timesheet_id);
create index if not exists hr_timesheet_lines_vinculo_dia_idx on public.hr_timesheet_lines (employment_id, local_date);
create index if not exists hr_timesheet_lines_org_dia_idx on public.hr_timesheet_lines (organization_id, local_date);
alter table public.hr_timesheet_lines enable row level security;
revoke all on public.hr_timesheet_lines from anon;
revoke insert, update, delete, truncate on public.hr_timesheet_lines from authenticated;
drop policy if exists hr_timesheet_lines_select on public.hr_timesheet_lines;
create policy hr_timesheet_lines_select on public.hr_timesheet_lines for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team'))
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));

-- 2. Novedades de asistencia ----------------------------------------------------------------
create table if not exists public.hr_attendance_novelties (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  employment_id uuid not null references public.employments(id),
  timesheet_id uuid references public.timesheets(id),
  work_date date not null,
  kind text not null check (kind in ('horas_extra', 'tardanza', 'salida_temprana', 'ausencia', 'cambio_turno')),
  minutes integer check (minutes is null or minutes between 0 and 2880),
  status text not null default 'pendiente'
    check (status in ('esperando_contraparte', 'pendiente', 'aprobada', 'rechazada', 'anulada')),
  origin text not null default 'automatica' check (origin in ('automatica', 'empleado', 'gestor')),
  justification text check (justification is null or char_length(justification) <= 1000),
  detail jsonb not null default '{}'::jsonb,
  approval_instance_id uuid references public.hr_approval_instances(id),
  requested_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.hr_attendance_novelties is
  'ADR-002 §4. Novedades con aprobación. Aprobar: horas extra = se pagan; tardanza, salida temprana o ausencia = justificada (no se descuenta); cambio de turno = se aplica. Las horas extra no aprobadas no van a nómina.';
create unique index if not exists hr_attendance_novelties_abierta_uidx on public.hr_attendance_novelties (timesheet_id, kind)
  where status in ('pendiente', 'esperando_contraparte') and kind in ('tardanza', 'salida_temprana', 'horas_extra');
create index if not exists hr_attendance_novelties_vinculo_idx on public.hr_attendance_novelties (employment_id, work_date);
create index if not exists hr_attendance_novelties_org_estado_idx on public.hr_attendance_novelties (organization_id, status, work_date);
drop trigger if exists trg_hr_attendance_novelties_org on public.hr_attendance_novelties;
create trigger trg_hr_attendance_novelties_org before insert or update on public.hr_attendance_novelties
  for each row execute function public.fn_hr_org_del_vinculo();
drop trigger if exists trg_hr_attendance_novelties_updated_at on public.hr_attendance_novelties;
create trigger trg_hr_attendance_novelties_updated_at before update on public.hr_attendance_novelties
  for each row execute function public.hrm_update_updated_at();
alter table public.hr_attendance_novelties enable row level security;
revoke all on public.hr_attendance_novelties from anon;
revoke insert, update, delete, truncate on public.hr_attendance_novelties from authenticated;
drop policy if exists hr_attendance_novelties_select on public.hr_attendance_novelties;
create policy hr_attendance_novelties_select on public.hr_attendance_novelties for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team'))
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));

-- Anula una instancia pendiente desde el sistema (reclasificación, retiro de la novedad).
create or replace function public.fn_hr_aprobacion_anular_interna(p_inst uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_inst is null then
    return;
  end if;
  update public.hr_approval_steps set status = 'cancelado' where instance_id = p_inst and status = 'pendiente';
  update public.hr_approval_instances
     set status = 'cancelada', decided_at = now(),
         context = coalesce(context, '{}'::jsonb) || jsonb_build_object('anulada_por', left(p_motivo, 120))
   where id = p_inst and status = 'pendiente';
end;
$$;
revoke all on function public.fn_hr_aprobacion_anular_interna(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_hr_aprobacion_anular_interna(uuid, text) to service_role;

-- Inicia la aprobación de una novedad. Sin nadie que apruebe queda pendiente: nunca se aprueba por omisión.
create or replace function public.fn_hr_novedad_iniciar_aprobacion(p_novedad uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n public.hr_attendance_novelties;
  e public.employments;
  v_tipo text;
  v_sol uuid;
  v_inst uuid;
begin
  select * into n from public.hr_attendance_novelties where id = p_novedad for update;
  if not found or n.status <> 'pendiente' then
    return null;
  end if;
  select * into e from public.employments where id = n.employment_id;
  v_tipo := case n.kind when 'horas_extra' then 'horas_extra' when 'cambio_turno' then 'cambio_turno'
                        else 'novedad_asistencia' end;
  v_sol := coalesce(n.requested_by, public.fn_hr_usuario_de_empleo(n.employment_id));
  begin
    v_inst := public.fn_hr_aprobacion_iniciar(
      n.organization_id, v_tipo, 'hr_attendance_novelties', n.id, n.employment_id, v_sol,
      jsonb_build_object('novedad', n.kind, 'fecha', n.work_date, 'minutos', n.minutes,
                         'horas', round(coalesce(n.minutes, 0) / 60.0, 2),
                         'branch_id', e.branch_id, 'department_id', e.department_id, 'position_id', e.position_id));
  exception when sqlstate '22023' then
    v_inst := null;
  end;
  update public.hr_attendance_novelties
     set approval_instance_id = v_inst, requested_by = v_sol,
         detail = detail || jsonb_build_object('sin_aprobador', v_inst is null)
   where id = n.id;
  return v_inst;
end;
$$;
revoke all on function public.fn_hr_novedad_iniciar_aprobacion(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_novedad_iniciar_aprobacion(uuid) to service_role;

-- Mantiene una novedad automática de tardanza o salida temprana alineada con el día.
create or replace function public.fn_hr_novedad_sincronizar(p_ts uuid, p_kind text, p_minutos integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.timesheets;
  n public.hr_attendance_novelties;
  v_id uuid;
begin
  select * into t from public.timesheets where id = p_ts;
  select * into n from public.hr_attendance_novelties
   where timesheet_id = p_ts and kind = p_kind and status = 'pendiente' limit 1;
  if coalesce(p_minutos, 0) > 0 then
    if n.id is not null then
      if n.minutes is distinct from p_minutos then
        update public.hr_attendance_novelties set minutes = p_minutos where id = n.id;
        update public.hr_approval_instances
           set context = coalesce(context, '{}'::jsonb) || jsonb_build_object('minutos', p_minutos, 'horas', round(p_minutos / 60.0, 2))
         where id = n.approval_instance_id and status = 'pendiente';
      end if;
    elsif not exists (select 1 from public.hr_attendance_novelties d
                       where d.timesheet_id = p_ts and d.kind = p_kind and d.status in ('aprobada', 'rechazada')) then
      insert into public.hr_attendance_novelties (organization_id, employment_id, timesheet_id, work_date, kind, minutes, origin, requested_by)
      values (t.organization_id, t.employment_id, t.id, t.work_date, p_kind, p_minutos, 'automatica',
              public.fn_hr_usuario_de_empleo(t.employment_id))
      returning id into v_id;
      perform public.fn_hr_novedad_iniciar_aprobacion(v_id);
    end if;
  elsif n.id is not null then
    perform public.fn_hr_aprobacion_anular_interna(n.approval_instance_id, 'reclasificacion');
    update public.hr_attendance_novelties set status = 'anulada', decided_at = now() where id = n.id;
  end if;
end;
$$;
revoke all on function public.fn_hr_novedad_sincronizar(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_novedad_sincronizar(uuid, text, integer) to service_role;

-- 3. Insumos del motor de horas ---------------------------------------------------------------
create or replace function public.fn_hr_jornada_insumos(p_actor uuid, p_org integer, p_employment uuid, p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  ts public.timesheets;
  a public.shift_assignments;
  tpl public.shift_templates;
  aj public.hr_attendance_settings;
  v_tz text;
  v_semana date;
  v_params jsonb := '{}'::jsonb;
  v_codigo text;
  v_eventos jsonb;
  v_fuente text;
  v_tol numeric := 0;
  v_ord integer;
  v_ext integer;
begin
  select * into e from public.employments where id = p_employment and organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or public.fn_hr_vinculo_es_del_actor(p_actor, p_employment)) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into ts from public.timesheets t where t.employment_id = p_employment and t.work_date = p_fecha;
  select * into a from public.shift_assignments s
   where s.employment_id = p_employment and s.work_date = p_fecha and not s.is_draft
     and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
   limit 1;
  if a.shift_template_id is not null then
    select * into tpl from public.shift_templates where id = a.shift_template_id;
  end if;
  aj := public.fn_hr_ajustes_asistencia(p_employment);
  v_tz := public.fn_timezone_for(p_org, coalesce(ts.branch_id, a.branch_id, e.branch_id));

  select coalesce(jsonb_agg(jsonb_build_object('tipo', ae.event_type, 'hora', ae.event_at) order by ae.event_at, ae.created_at), '[]'::jsonb)
    into v_eventos
    from public.attendance_events ae where ae.employment_id = p_employment and ae.work_date = p_fecha;

  v_fuente := case when jsonb_array_length(v_eventos) > 0 then 'marcaciones'
                   when 'sin_marcacion' = any (aj.mecanismos) and a.id is not null and not a.is_rest_day then 'turno'
                   end;

  foreach v_codigo in array array['nocturno_hora_inicio', 'nocturno_hora_fin', 'recargo_nocturno', 'recargo_dominical_festivo',
                                  'recargo_extra_diurna', 'recargo_extra_nocturna', 'jornada_max_semanal', 'jornada_max_diaria',
                                  'jornada_flexible_max_diaria', 'divisor_hora_mensual', 'horas_extra_max_dia', 'horas_extra_max_semana'] loop
    v_params := v_params || jsonb_build_object(v_codigo, coalesce((
      select jsonb_agg(jsonb_build_object('desde', t.desde, 'hasta', t.hasta, 'valor', t.valor, 'estado', t.status) order by t.desde)
        from public.fn_hr_parametro_tramos(p_org, v_codigo, p_fecha - 1, p_fecha + 2) t), '[]'::jsonb));
  end loop;

  v_semana := p_fecha - (extract(isodow from p_fecha)::integer - 1);
  select coalesce(sum(l.minutes) filter (where l.category not like 'extra%'), 0),
         coalesce(sum(l.minutes) filter (where l.category like 'extra%'), 0)
    into v_ord, v_ext
    from public.hr_timesheet_lines l
   where l.employment_id = p_employment and l.work_date >= v_semana and l.work_date < p_fecha;

  begin
    v_tol := public.fn_hr_parametro(p_org, 'tardanza_tolerancia_minutos', p_fecha);
  exception when others then
    v_tol := 0;
  end;

  return jsonb_build_object(
    'employment_id', p_employment,
    'fecha', p_fecha,
    'zona', v_tz,
    'version', coalesce(ts.input_version, 0),
    'estado', ts.status,
    'fuente', v_fuente,
    'eventos', v_eventos,
    'turno', case when a.id is null then null
                  when a.is_rest_day then jsonb_build_object('descanso', true)
                  else jsonb_build_object('inicio', a.start_at, 'fin', a.end_at, 'minutos', a.planned_minutes,
                                          'descanso_minutos', a.break_minutes, 'descanso_pagado', coalesce(tpl.paid_break, false)) end,
    'ajustes', jsonb_build_object('dia_descanso', aj.dia_descanso, 'exento_horas_extra', aj.exento_horas_extra,
                                  'jornada_flexible', aj.jornada_flexible, 'mecanismos', to_jsonb(aj.mecanismos)),
    'contrato_horas_semana', nullif(e.work_hours_per_week, 0),
    'festivos', coalesce((select jsonb_agg(h.holiday_date order by h.holiday_date) from public.hr_holidays h
                           where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date between p_fecha - 1 and p_fecha + 2), '[]'::jsonb),
    'parametros', v_params,
    'semana', jsonb_build_object('desde', v_semana, 'ordinarias_previas', v_ord, 'extras_previas', v_ext),
    'tolerancia_tardanza', v_tol);
end;
$$;
revoke all on function public.fn_hr_jornada_insumos(uuid, integer, uuid, date) from public, anon, authenticated;
grant execute on function public.fn_hr_jornada_insumos(uuid, integer, uuid, date) to service_role;

-- 4. Guardar la clasificación (idempotente: reemplaza las líneas del día) -----------------
create or replace function public.fn_hr_jornada_guardar(p_actor uuid, p_org integer, p_employment uuid, p_fecha date,
                                                        p_version integer, p_resultado jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  ts public.timesheets;
  l jsonb;
  n public.hr_attendance_novelties;
  v_fuente text := p_resultado->>'fuente';
  v_cat text;
  v_min integer;
  v_rec numeric;
  v_div numeric;
  v_dia date;
  v_total integer := 0;
  v_extra integer := 0;
  v_noct integer := 0;
  v_dom integer := 0;
  v_aprob integer;
  v_pend integer;
  v_id uuid;
  v_tol numeric := 0;
begin
  select * into e from public.employments where id = p_employment and organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')
          or public.fn_hr_vinculo_es_del_actor(p_actor, p_employment)) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_fuente is null or v_fuente not in ('marcaciones', 'turno') then
    raise exception 'clasificacion_invalida: fuente' using errcode = '22023';
  end if;
  if jsonb_typeof(p_resultado->'lineas') <> 'array' or jsonb_array_length(p_resultado->'lineas') > 64 then
    raise exception 'clasificacion_invalida: líneas' using errcode = '22023';
  end if;

  select * into ts from public.timesheets t where t.employment_id = p_employment and t.work_date = p_fecha for update;
  if ts.id is null then
    if v_fuente <> 'turno' then
      raise exception 'jornada_sin_marcaciones' using errcode = 'P0002';
    end if;
    insert into public.timesheets (organization_id, branch_id, employment_id, work_date)
    values (p_org, e.branch_id, p_employment, p_fecha)
    on conflict (employment_id, work_date) do nothing;
    select * into ts from public.timesheets t where t.employment_id = p_employment and t.work_date = p_fecha for update;
  end if;
  if ts.status in ('approved', 'locked') then
    raise exception 'jornada_cerrada: el día está listo para nómina o ya se pagó; reábrelo para reclasificar' using errcode = '55000';
  end if;
  if coalesce(ts.input_version, 0) <> coalesce(p_version, -1) then
    raise exception 'jornada_cambio_durante_calculo: llegaron marcaciones nuevas; vuelve a calcular' using errcode = '40001';
  end if;

  delete from public.hr_timesheet_lines where timesheet_id = ts.id;
  for l in select value from jsonb_array_elements(p_resultado->'lineas') loop
    v_cat := l->>'categoria';
    v_min := (l->>'minutos')::integer;
    v_rec := (l->>'recargo')::numeric;
    v_div := (l->>'divisor')::numeric;
    v_dia := (l->>'fecha_local')::date;
    if v_cat not in ('ord_diurna', 'ord_nocturna', 'dom_diurna', 'dom_nocturna',
                     'extra_diurna', 'extra_nocturna', 'extra_dom_diurna', 'extra_dom_nocturna')
       or v_min is null or v_min not between 1 and 1440 or v_rec is null or v_rec not between 0 and 5
       or v_div is null or v_div <= 0 or v_dia is null or v_dia not between p_fecha - 1 and p_fecha + 2 then
      raise exception 'clasificacion_invalida: línea %', l using errcode = '22023';
    end if;
    insert into public.hr_timesheet_lines
      (organization_id, timesheet_id, employment_id, work_date, local_date, category, minutes, surcharge, hour_divisor, dominical_reason)
    values (p_org, ts.id, p_employment, p_fecha, v_dia, v_cat, v_min, v_rec, v_div, nullif(l->>'motivo_dominical', ''));
    v_total := v_total + v_min;
    if v_cat like 'extra%' then v_extra := v_extra + v_min; end if;
    if v_cat like '%nocturna' then v_noct := v_noct + v_min; end if;
    if v_cat like 'dom%' or v_cat like 'extra_dom%' then v_dom := v_dom + v_min; end if;
  end loop;
  if v_total > 2880 then
    raise exception 'clasificacion_invalida: más de 48 h en un día' using errcode = '22023';
  end if;

  update public.timesheets
     set classification = jsonb_build_object('minutos', p_resultado->'minutos', 'alertas', p_resultado->'alertas',
                                             'tramos', p_resultado->'tramos', 'huella', p_resultado->>'huella',
                                             'motor', p_resultado->>'motor'),
         classified_version = p_version, classified_at = now(), classification_source = v_fuente,
         overtime_minutes = v_extra, night_minutes = v_noct, holiday_minutes = v_dom, updated_at = now()
   where id = ts.id;

  -- Horas extra: solo la diferencia con lo ya aprobado queda por aprobar.
  select coalesce(sum(minutes) filter (where status = 'aprobada'), 0), coalesce(sum(minutes) filter (where status = 'pendiente'), 0)
    into v_aprob, v_pend
    from public.hr_attendance_novelties where timesheet_id = ts.id and kind = 'horas_extra';
  if v_aprob + v_pend <> v_extra then
    for n in select * from public.hr_attendance_novelties where timesheet_id = ts.id and kind = 'horas_extra' and status = 'pendiente' loop
      perform public.fn_hr_aprobacion_anular_interna(n.approval_instance_id, 'reclasificacion');
      update public.hr_attendance_novelties set status = 'anulada', decided_at = now() where id = n.id;
    end loop;
    if v_extra > v_aprob then
      insert into public.hr_attendance_novelties
        (organization_id, employment_id, timesheet_id, work_date, kind, minutes, origin, requested_by, detail)
      values (p_org, p_employment, ts.id, p_fecha, 'horas_extra', v_extra - v_aprob, 'automatica',
              public.fn_hr_usuario_de_empleo(p_employment),
              jsonb_build_object('alertas', coalesce(p_resultado->'alertas', '[]'::jsonb)))
      returning id into v_id;
      perform public.fn_hr_novedad_iniciar_aprobacion(v_id);
    end if;
  end if;

  -- Tardanza y salida temprana por encima de la tolerancia de la empresa.
  begin
    v_tol := public.fn_hr_parametro(p_org, 'tardanza_tolerancia_minutos', p_fecha);
  exception when others then
    v_tol := 0;
  end;
  perform public.fn_hr_novedad_sincronizar(ts.id, 'tardanza',
            case when v_fuente = 'marcaciones' and ts.late_minutes > v_tol then ts.late_minutes else 0 end);
  perform public.fn_hr_novedad_sincronizar(ts.id, 'salida_temprana',
            case when v_fuente = 'marcaciones' and ts.early_departure_minutes > v_tol then ts.early_departure_minutes else 0 end);

  return jsonb_build_object(
    'timesheet_id', ts.id, 'version', p_version, 'minutos_extra', v_extra,
    'novedades', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.kind, 'minutos', x.minutes, 'estado', x.status,
                                                               'aprobacion_id', x.approval_instance_id) order by x.created_at)
                             from public.hr_attendance_novelties x
                            where x.timesheet_id = ts.id and x.status in ('pendiente', 'aprobada', 'rechazada')), '[]'::jsonb));
end;
$$;
revoke all on function public.fn_hr_jornada_guardar(uuid, integer, uuid, date, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_jornada_guardar(uuid, integer, uuid, date, integer, jsonb) to service_role;

-- 5. Cambio de turno aprobado -------------------------------------------------------------
create or replace function public.fn_hr_cambio_turno_aplicar(p_novedad uuid, p_aprobador uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n public.hr_attendance_novelties;
  a public.shift_assignments;
  b public.shift_assignments;
  v_con uuid;
begin
  select * into n from public.hr_attendance_novelties where id = p_novedad;
  select * into a from public.shift_assignments where id = nullif(n.detail->>'asignacion_id', '')::uuid for update;
  if a.id is null then
    raise exception 'hr: el turno del cambio ya no existe' using errcode = 'P0002';
  end if;
  if n.detail ? 'con_asignacion_id' and nullif(n.detail->>'con_asignacion_id', '') is not null then
    -- Intercambio del mismo día: cada uno queda con el horario del otro.
    select * into b from public.shift_assignments where id = (n.detail->>'con_asignacion_id')::uuid for update;
    update public.shift_assignments
       set shift_template_id = b.shift_template_id, actual_start_time = b.actual_start_time, actual_end_time = b.actual_end_time,
           break_minutes = b.break_minutes, branch_id = b.branch_id, is_rest_day = b.is_rest_day,
           swapped_with_employment_id = b.employment_id, swap_approved_by = p_aprobador
     where id = a.id;
    update public.shift_assignments
       set shift_template_id = a.shift_template_id, actual_start_time = a.actual_start_time, actual_end_time = a.actual_end_time,
           break_minutes = a.break_minutes, branch_id = a.branch_id, is_rest_day = a.is_rest_day,
           swapped_with_employment_id = a.employment_id, swap_approved_by = p_aprobador
     where id = b.id;
  else
    -- Cesión: el turno pasa a quien no tenía turno ese día.
    v_con := (n.detail->>'con_employment_id')::uuid;
    delete from public.shift_assignments where employment_id = v_con and work_date = a.work_date and is_rest_day;
    update public.shift_assignments
       set employment_id = v_con, swapped_with_employment_id = a.employment_id, swap_approved_by = p_aprobador
     where id = a.id;
  end if;
end;
$$;
revoke all on function public.fn_hr_cambio_turno_aplicar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_cambio_turno_aplicar(uuid, uuid) to service_role;

-- 6. Consecuencia de cada aprobación (se conservan las ramas de la fase 0) ----------------
create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inst public.hr_approval_instances;
  v_ultimo uuid;
  v_ev uuid;
  v_estado text;
  v_nov public.hr_attendance_novelties;
begin
  select * into v_inst from public.hr_approval_instances where id = p_inst;
  if not found or v_inst.status = 'pendiente' then return; end if;
  v_estado := case v_inst.status when 'aprobada' then 'aprobado' when 'rechazada' then 'rechazado' else 'anulado' end;
  select s.decided_by into v_ultimo from public.hr_approval_steps s
   where s.instance_id = p_inst and s.status in ('aprobado','rechazado')
   order by s.step_order desc limit 1;
  if v_inst.subject_table = 'hr_employment_events' then
    -- Todos los eventos de la solicitud (cargo + salario enlazados): juntos.
    update public.hr_employment_events ev
       set status = v_estado,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else ev.approved_by end,
           approved_at = case when v_inst.status = 'aprobada' then now() else ev.approved_at end
     where ev.approval_instance_id = p_inst and ev.status = 'pendiente';
    if v_inst.status = 'aprobada' then
      for v_ev in select ev.id from public.hr_employment_events ev where ev.approval_instance_id = p_inst order by ev.created_at loop
        perform public.fn_hr_aplicar_evento(v_ev);
      end loop;
    end if;
  elsif v_inst.subject_table = 'hr_bank_account_requests' then
    update public.hr_bank_account_requests set status = v_estado
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'pendiente';
    if v_inst.status = 'aprobada' then
      perform public.fn_hr_banco_aplicar_solicitud(v_inst.subject_id);
    end if;
  elsif v_inst.subject_table = 'hr_attendance_novelties' then
    -- ADR-002 §4: horas extra se pagan; tardanza, salida o ausencia quedan justificadas; el cambio de turno se aplica.
    update public.hr_attendance_novelties n
       set status = case v_inst.status when 'aprobada' then 'aprobada' when 'rechazada' then 'rechazada' else 'anulada' end,
           decided_at = now()
     where n.id = v_inst.subject_id and n.approval_instance_id = p_inst and n.status = 'pendiente'
     returning * into v_nov;
    if v_nov.id is not null and v_nov.kind = 'cambio_turno' and v_inst.status = 'aprobada' then
      perform public.fn_hr_cambio_turno_aplicar(v_nov.id, v_ultimo);
    end if;
  end if;
end;
$$;
revoke all on function public.fn_hr_aprobacion_al_cerrar(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_aprobacion_al_cerrar(uuid) to service_role;

-- 7. Novedades que registra una persona ------------------------------------------------------
create or replace function public.fn_hr_novedad_registrar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_accion text := p_datos->>'accion';
  v_gestor boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage');
  n public.hr_attendance_novelties;
  a public.shift_assignments;
  b public.shift_assignments;
  v_emp uuid;
  v_con uuid;
  v_id uuid;
  v_txt text;
  v_fecha date;
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if v_accion = 'justificar' then
    select * into n from public.hr_attendance_novelties
     where id = (p_datos->>'novedad_id')::uuid and organization_id = p_org for update;
    if n.id is null then
      raise exception 'hr: la novedad no existe' using errcode = 'P0002';
    end if;
    if not (v_gestor or public.fn_hr_vinculo_es_del_actor(p_actor, n.employment_id)) then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
    if n.status not in ('pendiente', 'esperando_contraparte') then
      raise exception 'novedad_cerrada' using errcode = '55000';
    end if;
    v_txt := btrim(coalesce(p_datos->>'justificacion', ''));
    if char_length(v_txt) not between 5 and 1000 then
      raise exception 'justificacion_requerida: de 5 a 1000 caracteres' using errcode = '22023';
    end if;
    update public.hr_attendance_novelties set justification = v_txt where id = n.id;
    return jsonb_build_object('id', n.id, 'estado', n.status);

  elsif v_accion = 'ausencia' then
    if not v_gestor then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
    v_emp := (p_datos->>'employment_id')::uuid;
    v_fecha := (p_datos->>'fecha')::date;
    if not exists (select 1 from public.employments e where e.id = v_emp and e.organization_id = p_org) then
      raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.hr_attendance_novelties x where x.employment_id = v_emp and x.work_date = v_fecha
                and x.kind = 'ausencia' and x.status in ('pendiente', 'aprobada', 'rechazada')) then
      raise exception 'ausencia_ya_registrada' using errcode = '23505';
    end if;
    insert into public.hr_attendance_novelties (organization_id, employment_id, timesheet_id, work_date, kind, minutes, origin,
                                                justification, requested_by, detail)
    values (p_org, v_emp,
            (select t.id from public.timesheets t where t.employment_id = v_emp and t.work_date = v_fecha),
            v_fecha, 'ausencia', nullif(p_datos->>'minutos', '')::integer, 'gestor',
            nullif(btrim(coalesce(p_datos->>'motivo', '')), ''), public.fn_hr_usuario_de_empleo(v_emp),
            jsonb_build_object('registrada_por', p_actor))
    returning id into v_id;
    perform public.fn_hr_novedad_iniciar_aprobacion(v_id);
    return jsonb_build_object('id', v_id, 'estado', 'pendiente');

  elsif v_accion = 'cambio_turno' then
    select * into a from public.shift_assignments
     where id = (p_datos->>'asignacion_id')::uuid and organization_id = p_org and not is_draft and not is_rest_day
       and coalesce(status, 'scheduled') not in ('cancelled', 'swapped');
    if a.id is null then
      raise exception 'hr: el turno no existe o no está publicado' using errcode = 'P0002';
    end if;
    if not (v_gestor or public.fn_hr_vinculo_es_del_actor(p_actor, a.employment_id)) then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
    if nullif(p_datos->>'con_asignacion_id', '') is not null then
      select * into b from public.shift_assignments
       where id = (p_datos->>'con_asignacion_id')::uuid and organization_id = p_org and not is_draft
         and work_date = a.work_date and employment_id <> a.employment_id
         and coalesce(status, 'scheduled') not in ('cancelled', 'swapped');
      if b.id is null then
        raise exception 'cambio_invalido: el otro turno debe ser del mismo día, de otra persona y estar publicado' using errcode = '22023';
      end if;
      v_con := b.employment_id;
    else
      v_con := nullif(p_datos->>'con_employment_id', '')::uuid;
      if v_con is null or v_con = a.employment_id
         or not exists (select 1 from public.employments e where e.id = v_con and e.organization_id = p_org and e.status = 'active') then
        raise exception 'cambio_invalido: indica a quién cedes el turno' using errcode = '22023';
      end if;
      if exists (select 1 from public.shift_assignments s where s.employment_id = v_con and s.work_date = a.work_date
                  and not s.is_rest_day and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')) then
        raise exception 'cambio_invalido: esa persona ya tiene turno ese día; propón un intercambio' using errcode = '22023';
      end if;
    end if;
    insert into public.hr_attendance_novelties (organization_id, employment_id, work_date, kind, status, origin,
                                                justification, requested_by, detail)
    values (p_org, a.employment_id, a.work_date, 'cambio_turno',
            case when v_gestor then 'pendiente' else 'esperando_contraparte' end,
            case when v_gestor then 'gestor' else 'empleado' end,
            nullif(btrim(coalesce(p_datos->>'motivo', '')), ''), p_actor,
            jsonb_strip_nulls(jsonb_build_object('asignacion_id', a.id, 'con_asignacion_id', b.id, 'con_employment_id', v_con)))
    returning id into v_id;
    if v_gestor then
      perform public.fn_hr_novedad_iniciar_aprobacion(v_id);
    end if;
    return jsonb_build_object('id', v_id, 'estado', case when v_gestor then 'pendiente' else 'esperando_contraparte' end);

  elsif v_accion in ('aceptar_cambio', 'rechazar_cambio') then
    select * into n from public.hr_attendance_novelties
     where id = (p_datos->>'novedad_id')::uuid and organization_id = p_org and kind = 'cambio_turno' for update;
    if n.id is null or n.status <> 'esperando_contraparte' then
      raise exception 'hr: no hay un cambio de turno esperando tu respuesta' using errcode = 'P0002';
    end if;
    if not public.fn_hr_vinculo_es_del_actor(p_actor, (n.detail->>'con_employment_id')::uuid) then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
    if v_accion = 'rechazar_cambio' then
      update public.hr_attendance_novelties set status = 'anulada', decided_at = now(),
             detail = detail || jsonb_build_object('rechazado_por_contraparte', true)
       where id = n.id;
      return jsonb_build_object('id', n.id, 'estado', 'anulada');
    end if;
    update public.hr_attendance_novelties set status = 'pendiente',
           detail = detail || jsonb_build_object('aceptado_por', p_actor, 'aceptado_en', now())
     where id = n.id;
    perform public.fn_hr_novedad_iniciar_aprobacion(n.id);
    return jsonb_build_object('id', n.id, 'estado', 'pendiente');
  end if;

  raise exception 'accion_invalida' using errcode = '22023';
end;
$$;
revoke all on function public.fn_hr_novedad_registrar(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_novedad_registrar(uuid, integer, jsonb) to service_role;

-- 8. «Lista para nómina» y reapertura -----------------------------------------------------
create or replace function public.fn_hr_jornada_lista_nomina(p_actor uuid, p_org integer, p_desde date, p_hasta date,
                                                             p_employments uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.timesheets;
  v_listas integer := 0;
  v_pend jsonb := '[]'::jsonb;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'rango_invalido: el rango va de 1 a 63 días' using errcode = '22023';
  end if;
  for r in
    select t.* from public.timesheets t
     where t.organization_id = p_org and t.work_date between p_desde and p_hasta
       and t.status in ('open', 'submitted')
       and (p_employments is null or t.employment_id = any (p_employments))
     order by t.work_date
     for update
  loop
    if coalesce((r.metadata->>'marcacion_abierta')::boolean, false) then
      v_pend := v_pend || jsonb_build_object('timesheet_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date, 'motivo', 'marcacion_abierta');
    elsif r.classified_version is distinct from r.input_version then
      v_pend := v_pend || jsonb_build_object('timesheet_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date, 'motivo', 'sin_clasificar');
    elsif exists (select 1 from public.hr_attendance_novelties x
                   where x.timesheet_id = r.id and x.status in ('pendiente', 'esperando_contraparte')) then
      v_pend := v_pend || jsonb_build_object('timesheet_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date, 'motivo', 'novedades_pendientes');
    else
      update public.timesheets
         set status = 'approved', approved_by = p_actor, approved_at = now(),
             payroll_ready_at = now(), payroll_ready_by = p_actor, updated_at = now()
       where id = r.id;
      v_listas := v_listas + 1;
    end if;
  end loop;
  return jsonb_build_object('listas', v_listas, 'pendientes', v_pend);
end;
$$;
revoke all on function public.fn_hr_jornada_lista_nomina(uuid, integer, date, date, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_hr_jornada_lista_nomina(uuid, integer, date, date, uuid[]) to service_role;

create or replace function public.fn_hr_jornada_reabrir(p_actor uuid, p_org integer, p_timesheet uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.timesheets;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into t from public.timesheets where id = p_timesheet and organization_id = p_org for update;
  if not found then
    raise exception 'hr: el día no existe' using errcode = 'P0002';
  end if;
  if t.status = 'locked' then
    raise exception 'jornada_cerrada: el día ya lo consumió la nómina' using errcode = '55000';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) not between 5 and 500 then
    raise exception 'motivo_requerido: de 5 a 500 caracteres' using errcode = '22023';
  end if;
  update public.timesheets
     set status = 'open', approved_by = null, approved_at = null, payroll_ready_at = null, payroll_ready_by = null,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reabierto', jsonb_build_object('por', p_actor, 'en', now(), 'motivo', btrim(p_motivo))),
         updated_at = now()
   where id = t.id;
  return jsonb_build_object('timesheet_id', t.id, 'estado', 'open');
end;
$$;
revoke all on function public.fn_hr_jornada_reabrir(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_hr_jornada_reabrir(uuid, integer, uuid, text) to service_role;
