-- RR. HH., fase 2 — pantallas de Asistencia, Horas extra y recargos y Novedades (Figma 20.10–20.12).
--
-- Lecturas para las pantallas (solo `service_role`, con el actor de getServerOrgContext) y el
-- ajuste manual de una marca con motivo y aprobación (ADR-002 §2 y §4):
--   * fn_hr_asistencia_ambito            alcance del actor: 'organizacion', 'equipo' o null.
--   * fn_hr_asistencia_hoy               quién está, quién falta y quién llegó tarde hoy.
--   * fn_hr_asistencia_hojas             hojas de tiempo del período, por persona.
--   * fn_hr_asistencia_hoja              la hoja de una persona: días, líneas del motor, novedades y ajustes.
--   * fn_hr_asistencia_topes             semanas por persona contra los topes vigentes.
--   * fn_hr_asistencia_novedades         novedades del período (y ajustes de marca) con quién puede decidir.
--   * fn_hr_ajuste_aprobador             a quién le llega un ajuste (vista previa del diálogo).
--   * fn_hr_ajuste_solicitar             pide un ajuste de marca; nace pendiente de aprobación.
--   * fn_hr_ajustes_aplicar              aplica los ajustes aprobados (marca manual con la hora pedida).
-- Cambios:
--   * timesheet_adjustments: columnas nuevas, todas NULL-ables (la tabla está vacía).
--   * fn_hr_aprobacion_al_cerrar: rama de `timesheet_adjustments`.
--   * fn_hr_jornada_lista_nomina: un día con un ajuste pendiente no pasa a «lista para nómina».
--   * job `hrm-aplicar-ajustes` cada 5 min (un ajuste aprobado desde «Mis aprobaciones»).
--
-- Salud: el tipo de una incapacidad solo lo ve quien tiene `hr.data.salud.view` en toda la
-- organización; RR. HH. sin ese permiso ve «incapacidad» y el jefe, «ausencia justificada».
-- Ningún día se decide con CURRENT_DATE: siempre fn_today_for(org, sede).

-- ── 1. Ajustes de marca: columnas nuevas ─────────────────────────────────────
alter table public.timesheet_adjustments
  add column if not exists approval_instance_id uuid references public.hr_approval_instances(id),
  add column if not exists event_type text,
  add column if not exists event_at timestamptz,
  add column if not exists note text,
  add column if not exists applied_event_id uuid references public.attendance_events(id),
  add column if not exists applied_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'timesheet_adjustments_event_type_chk') then
    alter table public.timesheet_adjustments
      add constraint timesheet_adjustments_event_type_chk
      check (event_type is null or event_type in ('check_in', 'check_out', 'break_start', 'break_end'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'timesheet_adjustments_note_chk') then
    alter table public.timesheet_adjustments
      add constraint timesheet_adjustments_note_chk check (note is null or char_length(note) <= 500);
  end if;
end $$;

create index if not exists timesheet_adjustments_timesheet_idx on public.timesheet_adjustments (timesheet_id);
create index if not exists timesheet_adjustments_aplicar_idx on public.timesheet_adjustments (status)
  where status = 'approved' and applied_event_id is null;

comment on column public.timesheet_adjustments.approval_instance_id is 'Aprobación del ajuste (tipo novedad_asistencia). ADR-002 §4.';
comment on column public.timesheet_adjustments.event_type is 'Marca que se agrega al aprobar: check_in, check_out, break_start o break_end.';
comment on column public.timesheet_adjustments.event_at is 'Hora pedida para la marca (instante con zona).';
comment on column public.timesheet_adjustments.applied_event_id is 'Marca manual creada al aplicar el ajuste aprobado.';

-- ── 2. Alcance del actor ─────────────────────────────────────────────────────
create or replace function public.fn_hr_asistencia_ambito(p_actor uuid, p_org integer)
returns text
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
      or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then 'organizacion'
    when public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view_team') then 'equipo'
    else null end;
$$;

-- Vínculos que el actor ve en asistencia (toda la organización o su equipo).
create or replace function public.fn_hr_asistencia_vinculos(p_actor uuid, p_org integer)
returns setof uuid
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
begin
  if v_amb = 'organizacion' then
    return query select e.id from public.employments e where e.organization_id = p_org;
  elsif v_amb = 'equipo' then
    return query select x from public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team') x
                  join public.employments e on e.id = x where e.organization_id = p_org;
  end if;
end;
$$;

-- Persona, cargo, área y sede de un vínculo (sin datos sensibles).
create or replace function public.fn_hr_asistencia_persona(p_employment uuid)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'employment_id', e.id, 'person_id', e.person_id,
    'nombre', coalesce(public.fn_hr_nombre_persona(e.person_id), '—'),
    'cargo', (select j.name from public.job_positions j where j.id = e.position_id),
    'area', (select d.name from public.departments d where d.id = e.department_id),
    'sede', (select b.name from public.branches b where b.id = e.branch_id),
    'branch_id', e.branch_id)
  from public.employments e where e.id = p_employment;
$$;

-- ── 3. Hoy ──────────────────────────────────────────────────────────────────
create or replace function public.fn_hr_asistencia_hoy(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
  v_hoy date := public.fn_today_for(p_org, p_branch);
  v_tol numeric;
  v_filas jsonb;
begin
  if v_amb is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  -- La tolerancia es de la empresa (libre); sin valor vigente, cualquier minuto cuenta como tarde.
  begin
    v_tol := public.fn_hr_parametro(p_org, 'tardanza_tolerancia_minutos', v_hoy);
  exception when others then
    v_tol := 0;
  end;

  with vis as (
    select e.* from public.employments e
     where e.id in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))
       and coalesce(e.status, 'active') = 'active'
  ),
  turno as (
    select distinct on (s.employment_id) s.*, st.name as plantilla
      from public.shift_assignments s
      join vis on vis.id = s.employment_id
      left join public.shift_templates st on st.id = s.shift_template_id
     where s.work_date = v_hoy and not s.is_draft
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
     order by s.employment_id, s.is_rest_day, s.start_at
  ),
  ev as (
    select a.employment_id,
           min(a.event_at) filter (where a.event_type = 'check_in') as entrada,
           max(a.event_at) filter (where a.event_type = 'check_out') as salida,
           (array_agg(a.event_type order by a.event_at desc, a.created_at desc))[1] as ultimo,
           (array_agg(a.source order by a.event_at) filter (where a.event_type = 'check_in'))[1] as fuente,
           (array_agg(a.geo is not null order by a.event_at) filter (where a.event_type = 'check_in'))[1] as con_ubicacion,
           bool_or(a.work_mode = 'remoto') as remoto
      from public.attendance_events a
      join vis on vis.id = a.employment_id
     where a.work_date = v_hoy
     group by a.employment_id
  ),
  aus as (
    select distinct on (l.employment_id) l.employment_id, lt.data_group, lt.legal_class, lt.name,
           public.fn_hr_vinculo_es_del_actor(p_actor, l.employment_id) as propio
      from public.leave_requests l
      join public.leave_types lt on lt.id = l.leave_type_id
      join vis on vis.id = l.employment_id
     where l.status in ('approved', 'taken') and v_hoy between l.start_date and l.end_date
     order by l.employment_id, l.start_date
  ),
  filas as (
    select vis.id, vis.branch_id, t.employment_id is not null and not t.is_rest_day as con_turno,
           t.plantilla, t.start_at, t.end_at, ev.entrada, ev.salida, ev.ultimo, ev.fuente, ev.con_ubicacion,
           coalesce(ev.remoto, false) as remoto,
           aus.employment_id is not null as ausente, aus.data_group, aus.legal_class, aus.name as ausencia_nombre, aus.propio
      from vis
      left join turno t on t.employment_id = vis.id
      left join ev on ev.employment_id = vis.id
      left join aus on aus.employment_id = vis.id
     where (t.employment_id is not null and not t.is_rest_day) or ev.employment_id is not null or aus.employment_id is not null
  )
  select coalesce(jsonb_agg(
           public.fn_hr_asistencia_persona(f.id) || jsonb_build_object(
             'turno', case when f.con_turno then jsonb_build_object('nombre', f.plantilla, 'inicio', f.start_at, 'fin', f.end_at) end,
             'entrada', f.entrada, 'salida', f.salida,
             'como', case when f.entrada is null then null
                          when f.remoto then 'remoto'
                          when f.fuente = 'qr' then 'qr'
                          when f.fuente = 'manual' then 'manual'
                          when f.con_ubicacion then 'ubicacion'
                          else 'app' end,
             'tarde_minutos', case when f.entrada is not null and f.start_at is not null
                                        and f.entrada > f.start_at + make_interval(mins => v_tol::integer)
                                   then floor(extract(epoch from (f.entrada - f.start_at)) / 60)::integer end,
             'estado', case
                 when f.ausente and f.entrada is null then 'ausencia'
                 when f.ultimo = 'break_start' then 'descanso'
                 when f.entrada is not null and f.ultimo = 'check_out' then 'salio'
                 when f.entrada is not null and f.start_at is not null
                      and f.entrada > f.start_at + make_interval(mins => v_tol::integer) then 'tarde'
                 when f.entrada is not null then 'presente'
                 when f.con_turno and f.start_at <= now() then 'falta'
                 else 'por_llegar' end,
             'remoto', f.remoto,
             -- Salud: el tipo solo con el grupo en toda la organización (o lo propio).
             'ausencia', case when not f.ausente then null
                 when f.data_group = 'salud' and not ((v_amb = 'organizacion' and v_salud) or f.propio)
                   then jsonb_build_object('clase', case when v_amb = 'organizacion' then 'incapacidad' else 'justificada' end)
                 else jsonb_build_object('clase', coalesce(f.legal_class, 'licencia'), 'nombre', f.ausencia_nombre) end)
         ), '[]'::jsonb)
    into v_filas
    from filas f
   where p_branch is null or f.branch_id = p_branch;

  return jsonb_build_object(
    'fecha', v_hoy, 'ahora', now(), 'zona', public.fn_timezone_for(p_org, p_branch), 'ambito', v_amb,
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'festivo', (select h.name from public.hr_holidays h where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = v_hoy limit 1),
    'tolerancia_minutos', v_tol,
    'filas', v_filas);
end;
$$;

-- ── 4. Hojas de tiempo del período ───────────────────────────────────────────
create or replace function public.fn_hr_asistencia_hojas(p_actor uuid, p_org integer, p_desde date, p_hasta date, p_branch integer default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
  v_filas jsonb;
begin
  if v_amb is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;

  with vis as (
    select e.id, e.branch_id from public.employments e
     where e.id in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))
       and (p_branch is null or e.branch_id = p_branch)
  ),
  prog as (
    select s.employment_id, sum(coalesce(s.planned_minutes, 0))::integer as minutos
      from public.shift_assignments s join vis on vis.id = s.employment_id
     where s.work_date between p_desde and p_hasta and not s.is_draft and not s.is_rest_day
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
     group by s.employment_id
  ),
  ts as (
    select t.employment_id, count(*)::integer as dias,
           count(*) filter (where t.status in ('approved', 'locked'))::integer as dias_listos,
           sum(coalesce(t.net_worked_minutes, 0))::integer as trabajadas,
           max(t.payroll_ready_at) as listo_en
      from public.timesheets t join vis on vis.id = t.employment_id
     where t.work_date between p_desde and p_hasta
     group by t.employment_id
  ),
  lin as (
    select l.employment_id,
           sum(l.minutes) filter (where l.category like 'extra%')::integer as extra,
           sum(l.minutes) filter (where l.category in ('ord_nocturna', 'dom_nocturna'))::integer as nocturnas,
           sum(l.minutes) filter (where l.category in ('dom_diurna', 'dom_nocturna'))::integer as dom_fest
      from public.hr_timesheet_lines l join vis on vis.id = l.employment_id
     where l.work_date between p_desde and p_hasta
     group by l.employment_id
  ),
  pend as (
    select x.employment_id, count(*)::integer as n from (
      select n.employment_id from public.hr_attendance_novelties n join vis on vis.id = n.employment_id
       where n.work_date between p_desde and p_hasta and n.status in ('pendiente', 'esperando_contraparte')
      union all
      select t.employment_id from public.timesheet_adjustments a
        join public.timesheets t on t.id = a.timesheet_id join vis on vis.id = t.employment_id
       where t.work_date between p_desde and p_hasta and a.status = 'pending'
    ) x group by x.employment_id
  )
  select coalesce(jsonb_agg(public.fn_hr_asistencia_persona(vis.id) || jsonb_build_object(
           'programadas', coalesce(prog.minutos, 0),
           'trabajadas', coalesce(ts.trabajadas, 0),
           'extra', coalesce(lin.extra, 0),
           'nocturnas', coalesce(lin.nocturnas, 0),
           'dom_fest', coalesce(lin.dom_fest, 0),
           'pendientes', coalesce(pend.n, 0),
           'dias', coalesce(ts.dias, 0),
           'dias_listos', coalesce(ts.dias_listos, 0),
           'listo_en', ts.listo_en,
           'estado', case when coalesce(ts.dias, 0) = 0 then 'sin_marcas'
                          when ts.dias_listos = ts.dias then 'aprobada'
                          else 'por_aprobar' end)), '[]'::jsonb)
    into v_filas
    from vis
    left join prog on prog.employment_id = vis.id
    left join ts on ts.employment_id = vis.id
    left join lin on lin.employment_id = vis.id
    left join pend on pend.employment_id = vis.id
   where prog.employment_id is not null or ts.employment_id is not null;

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'ambito', v_amb,
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'filas', v_filas);
end;
$$;

-- ── 5. Hoja de una persona (y desglose de horas y recargos) ──────────────────
create or replace function public.fn_hr_asistencia_hoja(p_actor uuid, p_org integer, p_employment uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  e public.employments;
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
  v_propio boolean := public.fn_hr_vinculo_es_del_actor(p_actor, p_employment);
  v_dias jsonb;
  v_vig jsonb;
  v_param jsonb;
  v_dom jsonb;
begin
  select * into e from public.employments where id = p_employment and organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (v_propio or p_employment in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;

  with fechas as (
    select s.work_date as fecha from public.shift_assignments s
     where s.employment_id = p_employment and s.work_date between p_desde and p_hasta and not s.is_draft
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
    union
    select t.work_date from public.timesheets t
     where t.employment_id = p_employment and t.work_date between p_desde and p_hasta
    union
    select n.work_date from public.hr_attendance_novelties n
     where n.employment_id = p_employment and n.work_date between p_desde and p_hasta and n.status <> 'anulada'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', f.fecha,
           'festivo', (select h.name from public.hr_holidays h where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = f.fecha limit 1),
           'turno', (select jsonb_build_object('nombre', st.name, 'inicio', s.start_at, 'fin', s.end_at,
                                               'planeado', s.planned_minutes, 'descanso', s.is_rest_day, 'asignacion_id', s.id)
                       from public.shift_assignments s left join public.shift_templates st on st.id = s.shift_template_id
                      where s.employment_id = p_employment and s.work_date = f.fecha and not s.is_draft
                        and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
                      order by s.is_rest_day, s.start_at limit 1),
           'hoja', (select jsonb_build_object('id', t.id, 'estado', t.status, 'entrada', t.first_check_in, 'salida', t.last_check_out,
                                              'trabajadas', t.net_worked_minutes, 'programadas', t.scheduled_minutes,
                                              'tarde', t.late_minutes, 'salida_temprana', t.early_departure_minutes,
                                              'clasificada', t.classified_version is not distinct from t.input_version,
                                              'marcacion_abierta', coalesce((t.metadata->>'marcacion_abierta')::boolean, false),
                                              'alertas', coalesce(t.classification->'alertas', '[]'::jsonb),
                                              'tramos', coalesce(t.classification->'tramos', '[]'::jsonb))
                       from public.timesheets t where t.employment_id = p_employment and t.work_date = f.fecha),
           'lineas', (select coalesce(jsonb_agg(jsonb_build_object('categoria', l.category, 'minutos', l.minutes, 'recargo', l.surcharge,
                                                                   'divisor', l.hour_divisor, 'fecha_local', l.local_date,
                                                                   'motivo', l.dominical_reason) order by l.local_date, l.category), '[]'::jsonb)
                        from public.hr_timesheet_lines l where l.employment_id = p_employment and l.work_date = f.fecha),
           'novedades', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'tipo', n.kind, 'estado', n.status, 'minutos', n.minutes,
                                                                      'justificacion', n.justification, 'instancia_id', n.approval_instance_id)
                                                   order by n.created_at), '[]'::jsonb)
                           from public.hr_attendance_novelties n
                          where n.employment_id = p_employment and n.work_date = f.fecha and n.status <> 'anulada'),
           'ajustes', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.event_type, 'hora', a.event_at, 'motivo', a.reason,
                                                                    'nota', a.note, 'estado', a.status, 'instancia_id', a.approval_instance_id,
                                                                    'aplicado', a.applied_event_id is not null)
                                                 order by a.created_at), '[]'::jsonb)
                         from public.timesheet_adjustments a join public.timesheets t on t.id = a.timesheet_id
                        where t.employment_id = p_employment and t.work_date = f.fecha)
         ) order by f.fecha desc), '[]'::jsonb)
    into v_dias
    from fechas f;

  -- Vigencias de los recargos por día local trabajado (cada hora usa el valor de su fecha).
  select coalesce(jsonb_object_agg(d.fecha_local, jsonb_build_object(
           'recargo_dominical_festivo', public.fn_hr_parametro_detalle(p_org, 'recargo_dominical_festivo', d.fecha_local),
           'recargo_nocturno', public.fn_hr_parametro_detalle(p_org, 'recargo_nocturno', d.fecha_local),
           'nocturno_hora_inicio', public.fn_hr_parametro_detalle(p_org, 'nocturno_hora_inicio', d.fecha_local),
           'recargo_extra_diurna', public.fn_hr_parametro_detalle(p_org, 'recargo_extra_diurna', d.fecha_local),
           'recargo_extra_nocturna', public.fn_hr_parametro_detalle(p_org, 'recargo_extra_nocturna', d.fecha_local))), '{}'::jsonb)
    into v_vig
    from (select distinct l.local_date as fecha_local from public.hr_timesheet_lines l
           where l.employment_id = p_employment and l.work_date between p_desde and p_hasta) d;

  v_param := jsonb_build_object(
    'jornada_max_semanal', public.fn_hr_parametro_detalle(p_org, 'jornada_max_semanal', p_hasta),
    'horas_extra_max_dia', public.fn_hr_parametro_detalle(p_org, 'horas_extra_max_dia', p_hasta),
    'horas_extra_max_semana', public.fn_hr_parametro_detalle(p_org, 'horas_extra_max_semana', p_hasta),
    'nocturno_hora_inicio', public.fn_hr_parametro_detalle(p_org, 'nocturno_hora_inicio', p_hasta),
    'dominical_habitual_umbral_dias', public.fn_hr_parametro_detalle(p_org, 'dominical_habitual_umbral_dias', p_hasta));

  -- Días de descanso trabajados por mes (ocasional vs. habitual, ADR-002 §4).
  select coalesce(jsonb_object_agg(m.mes, m.dias), '{}'::jsonb) into v_dom
    from (select to_char(l.local_date, 'YYYY-MM') as mes, count(distinct l.local_date)::integer as dias
            from public.hr_timesheet_lines l
           where l.employment_id = p_employment and l.dominical_reason = 'dia_descanso'
             and l.local_date between date_trunc('month', p_desde)::date and (date_trunc('month', p_hasta) + interval '1 month - 1 day')::date
           group by 1) m;

  return jsonb_build_object(
    'persona', public.fn_hr_asistencia_persona(p_employment),
    'desde', p_desde, 'hasta', p_hasta, 'zona', public.fn_timezone_for(p_org, e.branch_id),
    'hoy', public.fn_today_for(p_org, e.branch_id),
    'propio', v_propio,
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'puede_ajustar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') or v_amb is not null or v_propio,
    'contrato_horas_semana', e.work_hours_per_week,
    'dias', v_dias, 'vigencias', v_vig, 'parametros', v_param, 'dominicales_mes', v_dom);
end;
$$;

-- ── 6. Topes del período ─────────────────────────────────────────────────────
create or replace function public.fn_hr_asistencia_topes(p_actor uuid, p_org integer, p_desde date, p_hasta date, p_branch integer default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
  v_lunes date;
  v_filas jsonb;
begin
  if v_amb is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  v_lunes := p_desde - ((extract(isodow from p_desde)::integer) - 1);

  with vis as (
    select e.id, e.branch_id from public.employments e
     where e.id in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))
       and (p_branch is null or e.branch_id = p_branch)
  ),
  dias as (
    select t.employment_id, t.work_date,
           t.work_date - ((extract(isodow from t.work_date)::integer) - 1) as semana,
           coalesce(t.net_worked_minutes, 0) as trabajadas,
           coalesce((select sum(l.minutes) from public.hr_timesheet_lines l
                      where l.timesheet_id = t.id and l.category like 'extra%'), 0)::integer as extra
      from public.timesheets t join vis on vis.id = t.employment_id
     where t.work_date between v_lunes and p_hasta
  ),
  sem as (
    select d.employment_id, d.semana, sum(d.trabajadas)::integer as trabajadas, sum(d.extra)::integer as extra,
           (array_agg(d.work_date order by d.extra desc, d.work_date))[1] as dia_max,
           max(d.extra)::integer as extra_dia_max
      from dias d group by d.employment_id, d.semana
     having max(d.work_date) >= p_desde
  ),
  topes as (
    -- El menor valor que rija en la semana: a favor del trabajador.
    select s.*,
           least(public.fn_hr_parametro(p_org, 'jornada_max_semanal', s.semana),
                 public.fn_hr_parametro(p_org, 'jornada_max_semanal', s.semana + 6)) as jornada,
           least(public.fn_hr_parametro(p_org, 'horas_extra_max_dia', s.semana),
                 public.fn_hr_parametro(p_org, 'horas_extra_max_dia', s.semana + 6)) as max_dia,
           least(public.fn_hr_parametro(p_org, 'horas_extra_max_semana', s.semana),
                 public.fn_hr_parametro(p_org, 'horas_extra_max_semana', s.semana + 6)) as max_semana
      from sem s
  )
  select coalesce(jsonb_agg(public.fn_hr_asistencia_persona(x.employment_id) || jsonb_build_object(
           'semana', x.semana, 'hasta', x.semana + 6,
           'trabajadas', x.trabajadas, 'extra', x.extra,
           'dia_max', case when x.extra_dia_max > 0 then x.dia_max end, 'extra_dia_max', x.extra_dia_max,
           'jornada_horas', x.jornada, 'max_dia_horas', x.max_dia, 'max_semana_horas', x.max_semana,
           'supera_semanal', x.extra > x.max_semana * 60,
           'supera_diario', x.extra_dia_max > x.max_dia * 60,
           'supera_jornada', x.trabajadas > x.jornada * 60)
         order by x.semana desc), '[]'::jsonb)
    into v_filas
    from topes x;

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'ambito', v_amb,
    'vigentes', jsonb_build_object(
      'jornada_horas', public.fn_hr_parametro(p_org, 'jornada_max_semanal', p_hasta),
      'max_dia_horas', public.fn_hr_parametro(p_org, 'horas_extra_max_dia', p_hasta),
      'max_semana_horas', public.fn_hr_parametro(p_org, 'horas_extra_max_semana', p_hasta)),
    'filas', v_filas);
end;
$$;

-- ── 7. Novedades del período ─────────────────────────────────────────────────
-- ¿Puede el actor decidir hoy el paso pendiente de la instancia? (aprobador o delegado vigente)
create or replace function public.fn_hr_actor_decide_instancia(p_actor uuid, p_inst uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.hr_approval_instances i
      join public.hr_approval_steps s on s.instance_id = i.id and s.step_order = i.current_step and s.status = 'pendiente'
     where i.id = p_inst and i.status = 'pendiente' and i.requested_by is distinct from p_actor
       and (p_actor = any (s.approver_user_ids)
            or exists (select 1 from public.hr_approval_delegations d
                        where d.organization_id = i.organization_id and d.delegate_user_id = p_actor
                          and d.delegator_user_id = any (s.approver_user_ids)
                          and d.delegator_user_id is distinct from i.requested_by and d.is_active
                          and public.fn_today_for(i.organization_id, null) between d.starts_on and d.ends_on
                          and public.fn_hr_delegacion_cubre(d.request_type, d.request_types, i.request_type))));
$$;

create or replace function public.fn_hr_asistencia_novedades(p_actor uuid, p_org integer, p_desde date, p_hasta date, p_branch integer default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
  v_filas jsonb;
  v_hojas integer;
  v_listas integer;
  v_listo_en timestamptz;
begin
  if v_amb is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;

  with vis as (
    select e.id from public.employments e
     where e.id in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))
       and (p_branch is null or e.branch_id = p_branch)
  ),
  todas as (
    select 'novedad'::text as fuente, n.id, n.employment_id, n.work_date, n.kind as tipo, n.status as estado, n.minutes,
           n.origin as origen, n.justification, n.detail, n.approval_instance_id as instancia_id, n.requested_by,
           coalesce(n.timesheet_id, (select t.id from public.timesheets t where t.employment_id = n.employment_id and t.work_date = n.work_date)) as timesheet_id,
           n.created_at, null::text as evento, null::timestamptz as hora
      from public.hr_attendance_novelties n join vis on vis.id = n.employment_id
     where n.work_date between p_desde and p_hasta and n.status <> 'anulada'
    union all
    select 'ajuste', a.id, t.employment_id, t.work_date, 'ajuste_marca',
           case a.status when 'pending' then 'pendiente' when 'approved' then 'aprobada' else 'rechazada' end,
           null, 'ajuste', a.reason, jsonb_strip_nulls(jsonb_build_object('nota', a.note, 'aplicado', a.applied_event_id is not null)),
           a.approval_instance_id, a.created_by, t.id, a.created_at, a.event_type, a.event_at
      from public.timesheet_adjustments a
      join public.timesheets t on t.id = a.timesheet_id
      join vis on vis.id = t.employment_id
     where t.work_date between p_desde and p_hasta
  )
  select coalesce(jsonb_agg(public.fn_hr_asistencia_persona(x.employment_id) || jsonb_build_object(
           'id', x.id, 'fuente', x.fuente, 'tipo', x.tipo, 'estado', x.estado, 'minutos', x.minutes, 'fecha', x.work_date,
           'origen', x.origen, 'justificacion', x.justification, 'evento', x.evento, 'hora', x.hora,
           'instancia_id', x.instancia_id,
           'sin_aprobador', x.estado = 'pendiente' and x.instancia_id is null,
           'puede_decidir', x.instancia_id is not null and public.fn_hr_actor_decide_instancia(p_actor, x.instancia_id),
           'solicito', public.fn_hr_nombre_usuario(x.requested_by),
           'lista_nomina', ts.status in ('approved', 'locked') and x.estado in ('aprobada', 'rechazada'),
           'turno', (select jsonb_build_object('nombre', st.name, 'inicio', s.start_at, 'fin', s.end_at)
                       from public.shift_assignments s left join public.shift_templates st on st.id = s.shift_template_id
                      where s.employment_id = x.employment_id and s.work_date = x.work_date and not s.is_draft and not s.is_rest_day
                      order by s.start_at limit 1),
           'cambio', case when x.tipo = 'cambio_turno' then jsonb_build_object(
               'con', public.fn_hr_nombre_persona((select e2.person_id from public.employments e2 where e2.id = (x.detail->>'con_employment_id')::uuid)),
               'de', (select st.name from public.shift_assignments s join public.shift_templates st on st.id = s.shift_template_id
                       where s.id = (x.detail->>'asignacion_id')::uuid),
               'a', (select st.name from public.shift_assignments s join public.shift_templates st on st.id = s.shift_template_id
                      where s.id = (x.detail->>'con_asignacion_id')::uuid)) end,
           'extra', case when x.tipo = 'horas_extra' then (
               select jsonb_build_object('categoria', l.category, 'recargo', l.surcharge)
                 from public.hr_timesheet_lines l
                where l.timesheet_id = ts.id and l.category like 'extra%'
                order by l.minutes desc limit 1) end,
           'alertas', coalesce(ts.classification->'alertas', '[]'::jsonb),
           'contraparte_pendiente', x.estado = 'esperando_contraparte')
         order by x.estado <> 'pendiente', x.work_date desc, x.created_at desc), '[]'::jsonb)
    into v_filas
    from todas x
    left join public.timesheets ts on ts.id = x.timesheet_id;

  select count(*), count(*) filter (where t.status in ('approved', 'locked')), max(t.payroll_ready_at)
    into v_hojas, v_listas, v_listo_en
    from public.timesheets t
   where t.organization_id = p_org and t.work_date between p_desde and p_hasta
     and t.employment_id in (select id from public.employments e
                              where e.id in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))
                                and (p_branch is null or e.branch_id = p_branch));

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'ambito', v_amb,
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'periodo', jsonb_build_object('hojas', v_hojas, 'listas', v_listas,
                                  'lista_nomina', v_hojas > 0 and v_hojas = v_listas, 'listo_en', v_listo_en),
    'filas', v_filas);
end;
$$;

-- ── 8. Ajuste de marca con motivo y aprobación ──────────────────────────────
create or replace function public.fn_hr_ajuste_aprobador(p_actor uuid, p_org integer, p_employment uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  e public.employments;
  v_plan jsonb;
  v_paso jsonb;
begin
  select * into e from public.employments where id = p_employment and organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_vinculo_es_del_actor(p_actor, p_employment)
          or p_employment in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_plan := public.fn_hr_aprobacion_plan(p_org, 'novedad_asistencia', p_employment, p_actor,
              jsonb_build_object('novedad', 'ajuste_marca', 'branch_id', e.branch_id, 'department_id', e.department_id, 'position_id', e.position_id));
  v_paso := v_plan->'pasos'->0;
  if v_paso is null then
    return jsonb_build_object('tipo', null, 'nombres', '[]'::jsonb);
  end if;
  return jsonb_build_object('tipo', v_paso->>'tipo', 'pasos', jsonb_array_length(v_plan->'pasos'),
    'nombres', (select coalesce(jsonb_agg(public.fn_hr_nombre_usuario(u::uuid)), '[]'::jsonb)
                  from jsonb_array_elements_text(v_paso->'aprobadores') u));
end;
$$;

create or replace function public.fn_hr_ajuste_solicitar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  e public.employments;
  v_emp uuid := nullif(p_datos->>'employment_id', '')::uuid;
  v_fecha date := nullif(p_datos->>'fecha', '')::date;
  v_tipo text := p_datos->>'tipo';
  v_hora timestamptz := nullif(p_datos->>'hora', '')::timestamptz;
  v_motivo text := btrim(coalesce(p_datos->>'motivo', ''));
  v_nota text := nullif(btrim(coalesce(p_datos->>'nota', '')), '');
  v_ts public.timesheets;
  v_prev timestamptz;
  v_id uuid;
  v_inst uuid;
begin
  select * into e from public.employments where id = v_emp and organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')
          or public.fn_hr_vinculo_es_del_actor(p_actor, v_emp)
          or v_emp in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_tipo is null or v_tipo not in ('check_in', 'check_out', 'break_start', 'break_end') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_fecha is null or v_hora is null or v_hora > now() + interval '5 minutes' or v_hora < now() - interval '62 days' then
    raise exception 'hora_invalida: entre hace 62 días y ahora' using errcode = '22023';
  end if;
  if char_length(v_motivo) not between 5 and 500 or char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'motivo_requerido: de 5 a 500 caracteres' using errcode = '22023';
  end if;

  insert into public.timesheets (organization_id, branch_id, employment_id, work_date)
  values (p_org, e.branch_id, v_emp, v_fecha)
  on conflict (employment_id, work_date) do nothing;
  select * into v_ts from public.timesheets where employment_id = v_emp and work_date = v_fecha for update;
  if v_ts.status = 'locked' then
    raise exception 'jornada_cerrada: el día ya lo consumió la nómina' using errcode = '55000';
  end if;
  if exists (select 1 from public.timesheet_adjustments a where a.timesheet_id = v_ts.id
              and a.status = 'pending' and a.event_type = v_tipo) then
    raise exception 'ajuste_ya_pendiente' using errcode = '23505';
  end if;

  select max(a.event_at) into v_prev from public.attendance_events a
   where a.employment_id = v_emp and a.work_date = v_fecha and a.event_type = v_tipo;

  insert into public.timesheet_adjustments (timesheet_id, adjustment_type, previous_value, new_value, reason, note,
                                            event_type, event_at, created_by, status)
  values (v_ts.id,
          case v_tipo when 'check_in' then 'override_check_in' when 'check_out' then 'override_check_out' else 'other' end,
          v_prev::text, v_hora::text, v_motivo, v_nota, v_tipo, v_hora, p_actor, 'pending')
  returning id into v_id;

  begin
    v_inst := public.fn_hr_aprobacion_iniciar(p_org, 'novedad_asistencia', 'timesheet_adjustments', v_id, v_emp, p_actor,
                jsonb_build_object('novedad', 'ajuste_marca', 'fecha', v_fecha, 'evento', v_tipo, 'hora', v_hora,
                                   'motivo', v_motivo, 'branch_id', e.branch_id, 'department_id', e.department_id,
                                   'position_id', e.position_id));
  exception when sqlstate '22023' then
    v_inst := null;  -- nadie a quien llegue: queda pendiente; nunca se aprueba por omisión
  end;
  update public.timesheet_adjustments set approval_instance_id = v_inst where id = v_id;
  return jsonb_build_object('id', v_id, 'estado', 'pendiente', 'instancia_id', v_inst, 'timesheet_id', v_ts.id);
end;
$$;

-- Aplica los ajustes aprobados: una marca manual con la hora pedida.
-- Solo sin sesión de usuario (service role o cron): con sesión, el disparador de
-- attendance_events pondría la hora del servidor a quien no gestiona asistencia.
create or replace function public.fn_hr_ajustes_aplicar_interno(p_org integer default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
  v_ev uuid;
  v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null then
    return v_out;
  end if;
  for r in
    select a.id, a.event_type, a.event_at, a.reason, a.created_by, t.organization_id, t.branch_id, t.employment_id, t.work_date
      from public.timesheet_adjustments a
      join public.timesheets t on t.id = a.timesheet_id
      join public.hr_approval_instances i on i.id = a.approval_instance_id and i.status = 'aprobada'
     where a.status = 'approved' and a.applied_event_id is null and a.event_type is not null and a.event_at is not null
       and t.status <> 'locked'
       and (p_org is null or t.organization_id = p_org)
     order by a.approved_at nulls last, a.created_at
     for update of a skip locked
  loop
    insert into public.attendance_events (organization_id, branch_id, employment_id, event_type, event_at, source,
                                          is_manual_entry, manual_reason, created_by)
    values (r.organization_id, r.branch_id, r.employment_id, r.event_type, r.event_at, 'manual',
            true, left('Ajuste aprobado: ' || r.reason, 500), r.created_by)
    returning id into v_ev;
    update public.timesheet_adjustments set applied_event_id = v_ev, applied_at = now() where id = r.id;
    v_out := v_out || jsonb_build_object('ajuste_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date);
  end loop;
  return v_out;
end;
$$;

create or replace function public.fn_hr_ajustes_aplicar(p_actor uuid, p_org integer)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if public.fn_hr_asistencia_ambito(p_actor, p_org) is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return public.fn_hr_ajustes_aplicar_interno(p_org);
end;
$$;

create or replace function public.fn_hr_ajustes_aplicar_pendientes()
returns integer
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  return jsonb_array_length(public.fn_hr_ajustes_aplicar_interno(null));
end;
$$;

-- ── 9. Consecuencia al cerrar la aprobación (rama nueva) ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  elsif v_inst.subject_table = 'timesheet_adjustments' then
    -- Ajuste de marca (Figma 20.10.6): aprobado, se agrega la marca manual con la hora pedida.
    update public.timesheet_adjustments a
       set status = case v_inst.status when 'aprobada' then 'approved' else 'rejected' end,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else a.approved_by end,
           approved_at = now()
     where a.id = v_inst.subject_id and a.approval_instance_id = p_inst and a.status = 'pending';
    if v_inst.status = 'aprobada' then
      -- Sin sesión (service role) se aplica ya; con sesión lo aplica la ruta o el job.
      perform public.fn_hr_ajustes_aplicar_interno(v_inst.organization_id);
    end if;
  elsif v_inst.subject_table = 'leave_requests' then
    -- ADR-002 §5 y §6: vacaciones, licencias e incapacidades.
    update public.leave_requests
       set status = case v_inst.status when 'aprobada' then 'approved' when 'rechazada' then 'rejected' else 'cancelled' end,
           reviewed_by = v_ultimo, reviewed_at = now()
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'requested';
  end if;
end;
$function$;

-- ── 10. «Lista para nómina»: un ajuste pendiente también detiene el día ──────
CREATE OR REPLACE FUNCTION public.fn_hr_jornada_lista_nomina(p_actor uuid, p_org integer, p_desde date, p_hasta date, p_employments uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    elsif exists (select 1 from public.timesheet_adjustments a
                   where a.timesheet_id = r.id and (a.status = 'pending' or (a.status = 'approved' and a.applied_event_id is null))) then
      v_pend := v_pend || jsonb_build_object('timesheet_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date, 'motivo', 'ajustes_pendientes');
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
$function$;

-- ── 11. Permisos de ejecución ────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'fn_hr_asistencia_ambito(uuid, integer)',
    'fn_hr_asistencia_vinculos(uuid, integer)',
    'fn_hr_asistencia_persona(uuid)',
    'fn_hr_asistencia_hoy(uuid, integer, integer)',
    'fn_hr_asistencia_hojas(uuid, integer, date, date, integer)',
    'fn_hr_asistencia_hoja(uuid, integer, uuid, date, date)',
    'fn_hr_asistencia_topes(uuid, integer, date, date, integer)',
    'fn_hr_actor_decide_instancia(uuid, uuid)',
    'fn_hr_asistencia_novedades(uuid, integer, date, date, integer)',
    'fn_hr_ajuste_aprobador(uuid, integer, uuid)',
    'fn_hr_ajuste_solicitar(uuid, integer, jsonb)',
    'fn_hr_ajustes_aplicar_interno(integer)',
    'fn_hr_ajustes_aplicar(uuid, integer)',
    'fn_hr_ajustes_aplicar_pendientes()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ── 12. Job: ajustes aprobados desde «Mis aprobaciones» ──────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-aplicar-ajustes') then
    perform cron.unschedule('hrm-aplicar-ajustes');
  end if;
  perform cron.schedule('hrm-aplicar-ajustes', '*/5 * * * *', 'select public.fn_hr_ajustes_aplicar_pendientes();');
end $$;
