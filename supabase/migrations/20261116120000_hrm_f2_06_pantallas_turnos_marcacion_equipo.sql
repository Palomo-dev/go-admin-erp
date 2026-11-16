-- RR. HH. fase 2 · pantallas de Turnos (20.8), Marcación (20.9) y Mi equipo (20.15).
--
-- Lo que agrega (todo SECURITY DEFINER, search_path fijo, solo service_role; el
-- route handler pasa el actor y la organización de getServerOrgContext()):
--   - fn_hr_turnos_semana: la programación de un rango para el planificador
--     (gestor: todo, con borradores) o para el jefe (su equipo, solo publicado).
--   - fn_hr_turno_guardar / fn_hr_turno_quitar / fn_hr_turnos_copiar /
--     fn_hr_turnos_intercambiar: edición en borrador.
--   - fn_hr_turnos_publicar(…, p_motivo): decisión 4 del dueño. Un cruce impide
--     publicar; superar un tope deja publicar con motivo y crea una novedad de
--     horas extra planeadas por persona y fecha.
--   - fn_hr_turnos_deshacer: deshace la última publicación propia (10 min).
--   - fn_hr_marcar: decisiones 3 y 9. Desde la app y en presencial, con la
--     ubicación autorizada, se compara con la sede (radio por sede en
--     branches.features.radio_marcacion_m, 150 m si no hay); sin ubicación, desde
--     el computador sin QR o guardada sin señal, la marca vale pero queda para
--     que el jefe la revise (device_info.revisar). La hora sigue siendo la del
--     servidor: la capturada sin señal solo se guarda como dato.
--   - fn_hr_marcacion_estado: añade la sede (coordenadas y radio), la zona, el
--     turno en curso o el de hoy, el siguiente, las marcas del día, la
--     tolerancia de tardanza y el jefe.
--   - fn_hr_mi_asistencia: «Mi asistencia» del empleado, día por día.
--   - fn_hr_mi_equipo / fn_hr_equipo_persona: vista del jefe. Nunca salario,
--     banco ni salud: una incapacidad se ve como «ausencia justificada».
--   - fn_hr_pestanas: qué pestañas ve la persona (RR. HH. 9, jefe 6) y sus contadores.
-- Reversión: supabase/rollbacks/20261116120000_hrm_f2_06_pantallas_turnos_marcacion_equipo_rollback.sql

-- ─── Turnos: lectura de la semana ─────────────────────────────────────────────

create or replace function public.fn_hr_turnos_semana(p_actor uuid, p_org integer, p_desde date, p_hasta date, p_sede integer default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_gestiona boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage');
  v_ve boolean := v_gestiona or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view');
  v_todo_aus boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.view') or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
  v_equipo uuid[];
  v_vinculos uuid[];
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 41 then
    raise exception 'rango_invalido: el rango va de 1 a 42 días' using errcode = '22023';
  end if;
  if not v_ve then
    select array_agg(x) into v_equipo from public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team') x;
    if v_equipo is null then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
  end if;

  select array_agg(e.id) into v_vinculos
    from public.employments e
   where e.organization_id = p_org
     and (p_sede is null or e.branch_id = p_sede)
     and (v_ve or e.id = any (v_equipo))
     and (e.status = 'active'
          or exists (select 1 from public.shift_assignments s
                      where s.employment_id = e.id and s.work_date between p_desde and p_hasta
                        and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')));

  return jsonb_build_object(
    'zona', public.fn_timezone_for(p_org, p_sede),
    'permisos', jsonb_build_object('gestionar', v_gestiona, 'ver_borradores', v_ve, 'ausencias_org', v_todo_aus),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
               'cargo', jp.name, 'area_id', e.department_id, 'area', d.name, 'sede_id', e.branch_id,
               'jornada_semana', e.work_hours_per_week, 'jefe_id', e.manager_id)
             order by public.fn_hr_nombre_persona(e.person_id))
        from public.employments e
        left join public.job_positions jp on jp.id = e.position_id
        left join public.departments d on d.id = e.department_id
       where e.id = any (coalesce(v_vinculos, '{}'::uuid[]))), '[]'::jsonb),
    'asignaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'employment_id', s.employment_id, 'fecha', s.work_date,
               'inicio', s.start_at, 'fin', s.end_at, 'minutos', s.planned_minutes, 'descanso_min', s.break_minutes,
               'dia_descanso', s.is_rest_day, 'borrador', s.is_draft, 'publicado_en', s.published_at,
               'plantilla_id', s.shift_template_id, 'plantilla', t.name,
               'hora_inicio', to_char(coalesce(s.actual_start_time, t.start_time), 'HH24:MI'),
               'hora_fin', to_char(coalesce(s.actual_end_time, t.end_time), 'HH24:MI'),
               'rotacion_id', s.shift_rotation_id)
             order by s.work_date, s.start_at)
        from public.shift_assignments s
        left join public.shift_templates t on t.id = s.shift_template_id
       where s.organization_id = p_org
         and s.employment_id = any (coalesce(v_vinculos, '{}'::uuid[]))
         and s.work_date between p_desde and p_hasta
         and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
         and (v_ve or not s.is_draft)), '[]'::jsonb),
    -- Salud: fuera de quien ve ausencias y salud de toda la organización, solo «incapacidad».
    'ausencias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'employment_id', l.employment_id, 'desde', l.start_date, 'hasta', l.end_date,
               'estado', l.status,
               'clase', case when lt.data_group = 'salud' and not (v_todo_aus and v_salud) then 'incapacidad' else lt.legal_class end,
               'etiqueta', case when lt.data_group = 'salud' and not (v_todo_aus and v_salud) then null else lt.name end)
             order by l.start_date)
        from public.leave_requests l
        join public.leave_types lt on lt.id = l.leave_type_id
       where l.organization_id = p_org
         and l.employment_id = any (coalesce(v_vinculos, '{}'::uuid[]))
         and l.status in ('requested', 'approved', 'taken')
         and l.start_date <= p_hasta and l.end_date >= p_desde), '[]'::jsonb),
    'festivos', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', f.fecha, 'nombre', f.nombre, 'origen', f.origen) order by f.fecha)
        from (select h.holiday_date as fecha, h.name as nombre, 'plataforma'::text as origen
                from public.hr_holidays h
               where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date between p_desde and p_hasta
              union all
              select o.holiday_date, o.name, 'organizacion'
                from public.hr_org_holidays o
               where o.organization_id = p_org and o.holiday_date between p_desde and p_hasta
                 and (p_sede is null or o.branch_ids is null or p_sede = any (o.branch_ids))) f), '[]'::jsonb),
    'plantillas', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.name,
                                          'hora_inicio', to_char(t.start_time, 'HH24:MI'), 'hora_fin', to_char(t.end_time, 'HH24:MI'),
                                          'descanso_min', t.break_minutes, 'descanso_pagado', coalesce(t.paid_break, false))
             order by t.start_time, t.name)
        from public.shift_templates t
       where t.organization_id = p_org and coalesce(t.is_active, true)), '[]'::jsonb),
    'publicada_en', (select max(s.published_at) from public.shift_assignments s
                      where s.organization_id = p_org and s.employment_id = any (coalesce(v_vinculos, '{}'::uuid[]))
                        and s.work_date between p_desde and p_hasta and not s.is_draft),
    'borradores', (select count(*) from public.shift_assignments s
                    where v_ve and s.organization_id = p_org and s.employment_id = any (coalesce(v_vinculos, '{}'::uuid[]))
                      and s.work_date between p_desde and p_hasta and s.is_draft));
end;
$function$;

-- ─── Turnos: edición en borrador ──────────────────────────────────────────────

create or replace function public.fn_hr_turno_guardar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_emp public.employments;
  v_fecha date;
  v_plantilla uuid;
  v_ini time;
  v_fin time;
  v_desc integer;
  v_libre boolean := coalesce((p_datos->>'dia_descanso')::boolean, false);
  v_actual public.shift_assignments;
  v_id uuid;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  begin
    v_fecha := (p_datos->>'fecha')::date;
    v_plantilla := nullif(p_datos->>'plantilla_id', '')::uuid;
    v_ini := nullif(p_datos->>'hora_inicio', '')::time;
    v_fin := nullif(p_datos->>'hora_fin', '')::time;
    v_desc := nullif(p_datos->>'descanso_min', '')::integer;
    select * into v_emp from public.employments e
     where e.id = nullif(p_datos->>'employment_id', '')::uuid and e.organization_id = p_org;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'datos_invalidos' using errcode = '22023';
  end;
  if v_emp.id is null or v_fecha is null then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not v_libre and v_plantilla is null and (v_ini is null or v_fin is null) then
    raise exception 'turno_sin_horario: el turno necesita una plantilla o su hora de inicio y de fin' using errcode = '22023';
  end if;
  if v_desc is not null and (v_desc < 0 or v_desc > 720) then
    raise exception 'descanso_invalido' using errcode = '22023';
  end if;

  select * into v_actual from public.shift_assignments s where s.employment_id = v_emp.id and s.work_date = v_fecha for update;
  if v_actual.id is not null then
    update public.shift_assignments
       set shift_template_id = case when v_libre then null else v_plantilla end,
           actual_start_time = case when v_libre then null else v_ini end,
           actual_end_time = case when v_libre then null else v_fin end,
           break_minutes = case when v_libre then null else v_desc end,
           is_rest_day = v_libre, is_draft = true, status = 'scheduled', shift_rotation_id = null,
           updated_at = now()
     where id = v_actual.id
    returning id into v_id;
  else
    insert into public.shift_assignments (organization_id, branch_id, employment_id, shift_template_id, work_date,
                                          actual_start_time, actual_end_time, break_minutes, is_rest_day, is_draft,
                                          status, created_by)
    values (p_org, v_emp.branch_id, v_emp.id, case when v_libre then null else v_plantilla end, v_fecha,
            case when v_libre then null else v_ini end, case when v_libre then null else v_fin end,
            case when v_libre then null else v_desc end, v_libre, true, 'scheduled', p_actor)
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id);
end;
$function$;

create or replace function public.fn_hr_turno_quitar(p_actor uuid, p_org integer, p_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  s public.shift_assignments;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into s from public.shift_assignments a where a.id = p_id and a.organization_id = p_org for update;
  if s.id is null then
    raise exception 'hr: el turno no existe' using errcode = 'P0002';
  end if;
  -- Un borrador que nunca se publicó se borra; uno publicado queda cancelado en
  -- borrador para que el cambio se avise al volver a publicar.
  if s.is_draft and s.published_at is null then
    delete from public.shift_assignments where id = s.id;
    return jsonb_build_object('id', s.id, 'resultado', 'borrado');
  end if;
  update public.shift_assignments set status = 'cancelled', is_draft = true, updated_at = now() where id = s.id;
  return jsonb_build_object('id', s.id, 'resultado', 'cancelado');
end;
$function$;

create or replace function public.fn_hr_turnos_copiar(p_actor uuid, p_org integer, p_origen date, p_destino date,
                                                       p_dias integer default 7, p_sede integer default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_creados integer := 0;
  v_omitidos jsonb := '[]'::jsonb;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_origen is null or p_destino is null or p_dias is null or p_dias < 1 or p_dias > 42 or p_origen = p_destino then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  for r in
    select s.*, (p_destino + (s.work_date - p_origen)) as nueva
      from public.shift_assignments s
      join public.employments e on e.id = s.employment_id and e.status = 'active'
     where s.organization_id = p_org
       and s.work_date between p_origen and p_origen + p_dias - 1
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
       and (p_sede is null or e.branch_id = p_sede)
     order by s.work_date
  loop
    if exists (select 1 from public.shift_assignments x where x.employment_id = r.employment_id and x.work_date = r.nueva
                and coalesce(x.status, 'scheduled') not in ('cancelled', 'swapped')) then
      v_omitidos := v_omitidos || jsonb_build_object('employment_id', r.employment_id, 'fecha', r.nueva, 'motivo', 'ya_tiene_turno');
      continue;
    end if;
    begin
      delete from public.shift_assignments x where x.employment_id = r.employment_id and x.work_date = r.nueva and x.status = 'cancelled' and x.is_draft and x.published_at is null;
      insert into public.shift_assignments (organization_id, branch_id, employment_id, shift_template_id, work_date,
                                            actual_start_time, actual_end_time, break_minutes, is_rest_day, is_draft,
                                            status, created_by)
      values (p_org, r.branch_id, r.employment_id, r.shift_template_id, r.nueva, r.actual_start_time, r.actual_end_time,
              case when r.shift_template_id is null or r.actual_start_time is not null then r.break_minutes end,
              r.is_rest_day, true, 'scheduled', p_actor)
      on conflict (employment_id, work_date) do update
         set shift_template_id = excluded.shift_template_id, actual_start_time = excluded.actual_start_time,
             actual_end_time = excluded.actual_end_time, break_minutes = excluded.break_minutes,
             is_rest_day = excluded.is_rest_day, is_draft = true, status = 'scheduled', updated_at = now();
      v_creados := v_creados + 1;
    exception when sqlstate '23P01' then
      v_omitidos := v_omitidos || jsonb_build_object('employment_id', r.employment_id, 'fecha', r.nueva, 'motivo', 'turno_cruzado');
    end;
  end loop;
  return jsonb_build_object('creados', v_creados, 'omitidos', v_omitidos);
end;
$function$;

create or replace function public.fn_hr_turnos_intercambiar(p_actor uuid, p_org integer, p_a uuid, p_b uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  a public.shift_assignments;
  b public.shift_assignments;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into a from public.shift_assignments where id = p_a and organization_id = p_org for update;
  select * into b from public.shift_assignments where id = p_b and organization_id = p_org for update;
  if a.id is null or b.id is null then
    raise exception 'hr: el turno no existe' using errcode = 'P0002';
  end if;
  if a.work_date <> b.work_date or a.employment_id = b.employment_id then
    raise exception 'cambio_invalido: los dos turnos deben ser del mismo día y de personas distintas' using errcode = '22023';
  end if;
  -- Cada persona conserva su fila (único por persona y día); se cambian los horarios.
  update public.shift_assignments
     set shift_template_id = b.shift_template_id, actual_start_time = b.actual_start_time, actual_end_time = b.actual_end_time,
         break_minutes = b.break_minutes, is_rest_day = b.is_rest_day, is_draft = true, status = 'scheduled',
         shift_rotation_id = null, updated_at = now()
   where id = a.id;
  update public.shift_assignments
     set shift_template_id = a.shift_template_id, actual_start_time = a.actual_start_time, actual_end_time = a.actual_end_time,
         break_minutes = a.break_minutes, is_rest_day = a.is_rest_day, is_draft = true, status = 'scheduled',
         shift_rotation_id = null, updated_at = now()
   where id = b.id;
  return jsonb_build_object('a', a.id, 'b', b.id);
end;
$function$;

-- ─── Turnos: publicar con motivo (decisión 4) y deshacer ─────────────────────

drop function if exists public.fn_hr_turnos_publicar(uuid, integer, date, date, uuid[], boolean);

create or replace function public.fn_hr_turnos_publicar(p_actor uuid, p_org integer, p_desde date, p_hasta date,
                                                         p_employments uuid[] default null, p_aceptar_alertas boolean default false,
                                                         p_motivo text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v jsonb;
  n integer;
  al jsonb;
  v_topes jsonb := '[]'::jsonb;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_fecha date;
  v_id uuid;
  v_novedades integer := 0;
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
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_topes
    from jsonb_array_elements(v->'alertas') x
   where x->>'codigo' in ('extra_planeada', 'extra_diaria_supera_tope', 'semana_supera_jornada', 'extra_semanal_supera_tope');
  if jsonb_array_length(v_topes) > 0 and char_length(v_motivo) not between 5 and 1000 then
    return v || jsonb_build_object('publicado', false, 'requiere_confirmacion', true, 'requiere_motivo', true);
  end if;

  update public.shift_assignments s
     set is_draft = false, published_at = now(), published_by = p_actor
   where s.organization_id = p_org and s.is_draft
     and s.work_date between p_desde and p_hasta
     and (p_employments is null or s.employment_id = any (p_employments));
  get diagnostics n = row_count;

  -- Cada tope superado queda como novedad de horas extra planeadas, con el motivo,
  -- para que pase por aprobación antes de la nómina.
  for al in select * from jsonb_array_elements(v_topes) loop
    v_fecha := coalesce((al->'fechas'->>0)::date, (al->>'semana')::date + 6);
    if exists (select 1 from public.hr_attendance_novelties x
                where x.employment_id = (al->>'employment_id')::uuid and x.work_date = v_fecha and x.kind = 'horas_extra'
                  and x.detail->>'planeada' = 'true' and x.detail->>'alerta' = al->>'codigo'
                  and x.status in ('pendiente', 'aprobada')) then
      continue;
    end if;
    insert into public.hr_attendance_novelties (organization_id, employment_id, work_date, kind, minutes, origin,
                                                justification, requested_by, detail)
    values (p_org, (al->>'employment_id')::uuid, v_fecha, 'horas_extra',
            least(greatest(coalesce((al->>'minutos_extra')::integer, 0), 0), 2880), 'gestor', v_motivo, p_actor,
            jsonb_strip_nulls(jsonb_build_object('planeada', true, 'alerta', al->>'codigo', 'semana', al->>'semana',
                                                 'tope_minutos', al->'tope_minutos', 'publicado_por', p_actor)))
    returning id into v_id;
    perform public.fn_hr_novedad_iniciar_aprobacion(v_id);
    v_novedades := v_novedades + 1;
  end loop;

  return v || jsonb_build_object('publicado', true, 'publicados', n, 'novedades', v_novedades);
end;
$function$;

create or replace function public.fn_hr_turnos_deshacer(p_actor uuid, p_org integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  n integer;
  r record;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  update public.shift_assignments s
     set is_draft = true, published_at = null, published_by = null
   where s.organization_id = p_org and not s.is_draft and s.published_by = p_actor
     and s.published_at > now() - interval '10 minutes'
     and s.work_date between p_desde and p_hasta;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'nada_que_deshacer: pasaron más de 10 minutos o no hay una publicación tuya' using errcode = '55000';
  end if;
  for r in select x.id, x.approval_instance_id from public.hr_attendance_novelties x
            where x.organization_id = p_org and x.kind = 'horas_extra' and x.status = 'pendiente'
              and x.detail->>'planeada' = 'true' and x.detail->>'publicado_por' = p_actor::text
              and x.created_at > now() - interval '10 minutes' and x.work_date between p_desde and p_hasta loop
    if r.approval_instance_id is not null then
      perform public.fn_hr_aprobacion_anular_interna(r.approval_instance_id, 'publicacion_deshecha');
    end if;
    update public.hr_attendance_novelties set status = 'anulada', decided_at = now() where id = r.id;
  end loop;
  return jsonb_build_object('deshechos', n);
end;
$function$;

-- ─── Marcación (decisiones 3 y 9) ─────────────────────────────────────────────

create or replace function public.fn_hr_marcar(p_actor uuid, p_org integer, p_datos jsonb, p_ip text default null, p_ua text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  v_blat numeric;
  v_blng numeric;
  v_plataforma text := left(p_datos->'dispositivo'->>'plataforma', 40);
  v_revisar text;
  v_capturada timestamptz;
  v_nota jsonb;
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

  -- App en presencial (decisiones 3 y 9): la ubicación del momento se compara con la sede.
  if v_metodo = 'app' and not v_remoto then
    select b.latitude, b.longitude, coalesce(nullif(b.features->>'radio_marcacion_m', '')::numeric, 150)
      into v_blat, v_blng, v_radio
      from public.branches b where b.id = v_emp.branch_id and b.organization_id = p_org;
    if v_plataforma = 'escritorio' then
      -- Desde un computador no se toma ubicación: sin QR la marca queda para el jefe.
      v_geo := null;
      v_geo_ok := null;
      v_revisar := 'computador_sin_qr';
    elsif v_geo is not null and v_blat is not null and v_blng is not null then
      v_dist := 2 * 6371000 * asin(sqrt(
                  power(sin(radians((v_blat - v_lat) / 2)), 2)
                + cos(radians(v_lat)) * cos(radians(v_blat)) * power(sin(radians((v_blng - v_lng) / 2)), 2)));
      v_geo_ok := v_dist <= v_radio;
      if not v_geo_ok then
        raise exception 'fuera_de_rango: estás a % m de la sede (máximo % m)', round(v_dist), round(v_radio)
          using errcode = '42501';
      end if;
    elsif v_blat is not null then
      v_revisar := 'sin_ubicacion';
    end if;
  end if;

  -- Sin señal: la hora es la del servidor; la capturada en el celular se guarda como dato y el jefe la revisa.
  if jsonb_typeof(p_datos->'fuera_de_linea') = 'object' then
    begin
      v_capturada := (p_datos->'fuera_de_linea'->>'capturada')::timestamptz;
    exception when others then
      v_capturada := null;
    end;
    if v_capturada is not null then
      v_revisar := 'fuera_de_linea';
    end if;
  end if;
  if jsonb_typeof(p_datos->'nota') = 'object' then
    v_nota := jsonb_strip_nulls(jsonb_build_object(
      'motivo', left(nullif(btrim(p_datos->'nota'->>'motivo'), ''), 200),
      'comentario', left(nullif(btrim(p_datos->'nota'->>'comentario'), ''), 500),
      'pedido_por', left(nullif(btrim(p_datos->'nota'->>'pedido_por'), ''), 120),
      'fuera_de_turno', case when (p_datos->'nota'->>'fuera_de_turno')::boolean then true end));
    if v_nota = '{}'::jsonb then
      v_nota := null;
    end if;
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
     v_geo, case when v_revisar is not null then false else v_geo_ok end,
     jsonb_strip_nulls(jsonb_build_object('plataforma', v_plataforma,
                                          'app', left(p_datos->'dispositivo'->>'app', 40),
                                          'revisar', v_revisar,
                                          'capturada', v_capturada,
                                          'nota', v_nota)),
     false, p_actor, v_modo)
  returning * into v_ev;

  return jsonb_build_object('evento_id', v_ev.id, 'tipo', v_ev.event_type, 'hora', v_ev.event_at,
                            'fecha_trabajo', v_ev.work_date, 'employment_id', v_emp.id, 'modo', v_modo,
                            'ubicacion_guardada', v_ev.geo is not null, 'reloj', v_reloj.name,
                            'distancia_m', case when v_geo_ok then round(v_dist) end, 'revisar', v_revisar);
end;
$function$;

create or replace function public.fn_hr_marcacion_estado(p_actor uuid, p_org integer)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_emp public.employments;
  v_aj public.hr_attendance_settings;
  v_ult public.attendance_events;
  v_c public.hr_geo_consents;
  v_tz text;
  v_hoy date;
  v_turno public.shift_assignments;
  v_sig public.shift_assignments;
  v_dia date;
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
  v_tz := public.fn_timezone_for(p_org, v_emp.branch_id);
  v_hoy := public.fn_today_for(p_org, v_emp.branch_id);
  select * into v_ult from public.attendance_events a
   where a.employment_id = v_emp.id and a.event_at > now() - interval '24 hours'
   order by a.event_at desc, a.created_at desc limit 1;
  select * into v_c from public.hr_geo_consents c where c.employment_id = v_emp.id order by c.created_at desc, c.id desc limit 1;
  -- Turno en curso (incluido el nocturno de ayer) o, si no, el de hoy.
  select * into v_turno from public.shift_assignments s
   where s.employment_id = v_emp.id and not s.is_draft and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
     and s.work_date between v_hoy - 1 and v_hoy
     and (s.work_date = v_hoy or (not s.is_rest_day and s.end_at + interval '2 hours' > now()))
   order by (s.work_date = v_hoy) asc, s.start_at nulls last
   limit 1;
  select * into v_sig from public.shift_assignments s
   where s.employment_id = v_emp.id and not s.is_draft and not s.is_rest_day
     and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
     and s.start_at > now() and (v_turno.id is null or s.id <> v_turno.id)
   order by s.start_at limit 1;
  v_dia := coalesce(case when v_ult.event_type <> 'check_out' then v_ult.work_date end, v_turno.work_date, v_hoy);
  return jsonb_build_object(
    'vinculo', jsonb_build_object('id', v_emp.id, 'sede_id', v_emp.branch_id,
                                  'sede', (select b.name from public.branches b where b.id = v_emp.branch_id),
                                  'nombre', public.fn_hr_nombre_persona(v_emp.person_id)),
    'zona', v_tz,
    'hoy', v_hoy,
    'sede', (select jsonb_build_object('id', b.id, 'nombre', b.name, 'lat', b.latitude, 'lng', b.longitude,
                                       'radio_m', coalesce(nullif(b.features->>'radio_marcacion_m', '')::numeric, 150))
               from public.branches b where b.id = v_emp.branch_id),
    'modalidad', v_aj.modalidad,
    'mecanismos', to_jsonb(v_aj.mecanismos),
    'dias_laborables', to_jsonb(v_aj.dias_laborables),
    'ubicacion', jsonb_build_object('autorizada', coalesce(v_c.granted, false), 'version', v_c.policy_version, 'fecha', v_c.created_at),
    'ultima', case when v_ult.id is null then null
                   else jsonb_build_object('tipo', v_ult.event_type, 'hora', v_ult.event_at, 'fecha_trabajo', v_ult.work_date) end,
    'siguiente', case when v_ult.id is null or v_ult.event_type = 'check_out' then 'check_in'
                      when v_ult.event_type = 'break_start' then 'break_end' else 'check_out' end,
    'turno', case when v_turno.id is null then null else jsonb_build_object(
               'id', v_turno.id, 'fecha', v_turno.work_date, 'inicio', v_turno.start_at, 'fin', v_turno.end_at,
               'dia_descanso', v_turno.is_rest_day, 'descanso_min', v_turno.break_minutes,
               'descanso_pagado', coalesce((select t.paid_break from public.shift_templates t where t.id = v_turno.shift_template_id), false),
               'plantilla', (select t.name from public.shift_templates t where t.id = v_turno.shift_template_id)) end,
    'proximo_turno', case when v_sig.id is null then null else jsonb_build_object(
               'fecha', v_sig.work_date, 'inicio', v_sig.start_at, 'fin', v_sig.end_at,
               'plantilla', (select t.name from public.shift_templates t where t.id = v_sig.shift_template_id)) end,
    'marcas', coalesce((select jsonb_agg(jsonb_build_object('tipo', a.event_type, 'hora', a.event_at, 'metodo', a.source,
                                                            'modo', a.work_mode, 'revisar', a.device_info->>'revisar')
                                         order by a.event_at)
                          from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = v_dia), '[]'::jsonb),
    'tolerancia_min', coalesce(public.fn_hr_parametro(p_org, 'tardanza_tolerancia_minutos', v_hoy), 0),
    'jefe', (select jsonb_build_object('id', j.id, 'nombre', public.fn_hr_nombre_persona(j.person_id))
               from public.employments j where j.id = v_emp.manager_id));
end;
$function$;

-- ─── Mi asistencia ────────────────────────────────────────────────────────────

create or replace function public.fn_hr_mi_asistencia(p_actor uuid, p_org integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_emp public.employments;
  v_aj public.hr_attendance_settings;
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 92 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  select e.* into v_emp
    from public.employments e
    left join public.organization_members om on om.id = e.organization_member_id
    left join public.hr_people p on p.id = e.person_id
   where e.organization_id = p_org and e.status = 'active' and (om.user_id = p_actor or p.user_id = p_actor)
   order by e.hire_date desc nulls last, e.created_at desc
   limit 1;
  if v_emp.id is null then
    return jsonb_build_object('vinculo', null, 'dias', '[]'::jsonb);
  end if;
  v_aj := public.fn_hr_ajustes_asistencia(v_emp.id);
  return jsonb_build_object(
    'vinculo', jsonb_build_object('id', v_emp.id, 'sede', (select b.name from public.branches b where b.id = v_emp.branch_id)),
    'zona', public.fn_timezone_for(p_org, v_emp.branch_id),
    'marca', not (v_aj.mecanismos = array['sin_marcacion']::text[]),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', d.dia,
               'festivo', exists (select 1 from public.hr_holidays h where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = d.dia),
               'sede', (select b.name from public.branches b where b.id = coalesce(s.branch_id, v_emp.branch_id)),
               'turno', case when s.id is null then null else jsonb_build_object(
                          'plantilla', t.name, 'inicio', s.start_at, 'fin', s.end_at, 'dia_descanso', s.is_rest_day) end,
               'entrada', (select min(a.event_at) from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia and a.event_type = 'check_in'),
               'salida', (select max(a.event_at) from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia and a.event_type = 'check_out'),
               'descanso_inicio', (select min(a.event_at) from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia and a.event_type = 'break_start'),
               'descanso_fin', (select max(a.event_at) from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia and a.event_type = 'break_end'),
               'metodo', (select case when a.is_manual_entry then 'manual' else a.source end
                            from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia and a.event_type = 'check_in'
                           order by a.event_at limit 1),
               'modo', (select a.work_mode from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia
                         order by a.event_at limit 1),
               'minutos', ts.net_worked_minutes,
               'tarde_min', ts.late_minutes,
               'revisar', exists (select 1 from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia
                                   and a.device_info ? 'revisar'))
             order by d.dia desc)
        from generate_series(p_desde, p_hasta, interval '1 day') g(x)
        cross join lateral (select g.x::date as dia) d
        left join public.shift_assignments s
          on s.employment_id = v_emp.id and s.work_date = d.dia and not s.is_draft
         and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
        left join public.shift_templates t on t.id = s.shift_template_id
        left join public.timesheets ts on ts.employment_id = v_emp.id and ts.work_date = d.dia
       where s.id is not null or ts.id is not null
          or exists (select 1 from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia)), '[]'::jsonb));
end;
$function$;

-- ─── Vista del jefe: Mi equipo ───────────────────────────────────────────────

create or replace function public.fn_hr_mi_equipo(p_actor uuid, p_org integer)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mios uuid[];
  v_equipo uuid[];
  v_jefe public.employments;
  v_tz text;
  v_hoy date;
  v_lunes date;
  v_tol numeric;
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select array_agg(e.id) into v_mios
    from public.employments e
    left join public.organization_members om on om.id = e.organization_member_id
    left join public.hr_people p on p.id = e.person_id
   where e.organization_id = p_org and (om.user_id = p_actor or p.user_id = p_actor);
  select * into v_jefe from public.employments e where e.id = any (coalesce(v_mios, '{}'::uuid[])) and e.status = 'active'
   order by e.hire_date desc nulls last limit 1;
  -- Su equipo: quienes le reportan de forma directa e indirecta (y las áreas que dirige).
  select array_agg(distinct x) into v_equipo
    from public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team') x
    join public.employments e on e.id = x and e.organization_id = p_org and e.status = 'active';
  if v_equipo is null then
    return jsonb_build_object('jefe', case when v_jefe.id is null then null else jsonb_build_object(
             'nombre', public.fn_hr_nombre_persona(v_jefe.person_id),
             'area', (select d.name from public.departments d where d.id = v_jefe.department_id),
             'sede', (select b.name from public.branches b where b.id = v_jefe.branch_id)) end,
           'personas', '[]'::jsonb, 'pendientes', '[]'::jsonb, 'kpis', null);
  end if;
  v_tz := public.fn_timezone_for(p_org, v_jefe.branch_id);
  v_hoy := public.fn_today_for(p_org, v_jefe.branch_id);
  v_lunes := v_hoy - (extract(isodow from v_hoy)::integer - 1);
  v_tol := coalesce(public.fn_hr_parametro(p_org, 'tardanza_tolerancia_minutos', v_hoy), 0);

  return (
    with equipo as (
      select e.*, (e.manager_id = any (coalesce(v_mios, '{}'::uuid[]))) as directo
        from public.employments e where e.id = any (v_equipo)
    ),
    hoy as (
      select q.id,
             s.id as turno, s.start_at, s.is_rest_day,
             (select min(a.event_at) from public.attendance_events a
               where a.employment_id = q.id and a.work_date = v_hoy and a.event_type = 'check_in') as entrada,
             exists (select 1 from public.leave_requests l where l.employment_id = q.id
                      and l.status in ('approved', 'taken') and v_hoy between l.start_date and l.end_date) as ausente
        from equipo q
        left join public.shift_assignments s on s.employment_id = q.id and s.work_date = v_hoy and not s.is_draft
         and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
    ),
    aprobar as (
      select i.id, i.request_type, i.subject_table, i.subject_id, i.employment_id, i.created_at, i.context
        from public.hr_approval_instances i
        join public.hr_approval_steps st on st.instance_id = i.id and st.step_order = i.current_step and st.status = 'pendiente'
       where i.organization_id = p_org and i.status = 'pendiente' and i.employment_id = any (v_equipo)
         and p_actor = any (st.approver_user_ids)
    )
    select jsonb_build_object(
      'zona', v_tz, 'hoy', v_hoy,
      'jefe', jsonb_build_object('nombre', public.fn_hr_nombre_persona(v_jefe.person_id),
                                 'area', (select d.name from public.departments d where d.id = v_jefe.department_id),
                                 'sede', (select b.name from public.branches b where b.id = v_jefe.branch_id)),
      'personas', (select jsonb_agg(jsonb_build_object('id', q.id, 'nombre', public.fn_hr_nombre_persona(q.person_id),
                                                       'cargo', jp.name, 'area', d.name, 'area_id', q.department_id,
                                                       'directo', q.directo)
                                    order by public.fn_hr_nombre_persona(q.person_id))
                     from equipo q
                     left join public.job_positions jp on jp.id = q.position_id
                     left join public.departments d on d.id = q.department_id),
      'kpis', jsonb_build_object(
        'por_aprobar', (select count(*) from aprobar),
        'por_aprobar_ausencias', (select count(*) from aprobar where request_type = 'ausencia'),
        'por_aprobar_novedades', (select count(*) from aprobar where request_type <> 'ausencia'),
        'faltan_hoy', (select count(*) from hoy where turno is not null and not is_rest_day and not ausente
                        and entrada is null and start_at < now()),
        'tarde_hoy', (select count(*) from hoy where turno is not null and not is_rest_day
                       and entrada > start_at + make_interval(mins => v_tol::integer)),
        'ausentes_semana', (select count(distinct l.employment_id) from public.leave_requests l
                             where l.employment_id = any (v_equipo) and l.status in ('approved', 'taken')
                               and l.start_date <= v_lunes + 6 and l.end_date >= v_lunes)),
      'pendientes', coalesce((
        select jsonb_agg(x order by x->>'desde' desc) from (
          select jsonb_build_object(
                   'id', a.id, 'tipo', a.request_type, 'employment_id', a.employment_id, 'desde', a.created_at,
                   'estado', 'por_aprobar',
                   'novedad', n.kind, 'fecha', coalesce(n.work_date, l.start_date), 'hasta', l.end_date,
                   'minutos', n.minutes, 'dias_habiles', l.business_days,
                   -- Nunca el tipo de una ausencia de salud: «ausencia justificada».
                   'clase', case when lt.data_group = 'salud' then 'incapacidad' else lt.legal_class end,
                   'etiqueta', case when lt.data_group = 'salud' then null else lt.name end) as x
            from aprobar a
            left join public.hr_attendance_novelties n on a.subject_table = 'hr_attendance_novelties' and n.id = a.subject_id
            left join public.leave_requests l on a.subject_table = 'leave_requests' and l.id = a.subject_id
            left join public.leave_types lt on lt.id = l.leave_type_id
          union all
          select jsonb_build_object('id', 'falta-' || h.id, 'tipo', 'falta', 'employment_id', h.id, 'desde', h.start_at,
                                    'estado', 'falta', 'fecha', v_hoy)
            from hoy h where h.turno is not null and not h.is_rest_day and not h.ausente and h.entrada is null and h.start_at < now()
          union all
          select jsonb_build_object('id', 'revisar-' || a.id, 'tipo', 'marca_por_revisar', 'employment_id', a.employment_id,
                                    'desde', a.event_at, 'estado', 'por_revisar', 'fecha', a.work_date,
                                    'motivo', a.device_info->>'revisar', 'marca', a.event_type)
            from public.attendance_events a
           where a.employment_id = any (v_equipo) and a.device_info ? 'revisar'
             and a.event_at > now() - interval '7 days'
        ) s), '[]'::jsonb)
    ));
end;
$function$;

create or replace function public.fn_hr_equipo_persona(p_actor uuid, p_org integer, p_employment uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  e public.employments;
  v_tz text;
  v_hoy date;
  v_lunes date;
  v_mes date;
  v_aus record;
  v_mios uuid[];
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into e from public.employments x where x.id = p_employment and x.organization_id = p_org;
  if e.id is null then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or p_employment in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select array_agg(x.id) into v_mios
    from public.employments x
    left join public.organization_members om on om.id = x.organization_member_id
    left join public.hr_people p on p.id = x.person_id
   where x.organization_id = p_org and (om.user_id = p_actor or p.user_id = p_actor);
  v_tz := public.fn_timezone_for(p_org, e.branch_id);
  v_hoy := public.fn_today_for(p_org, e.branch_id);
  v_lunes := v_hoy - (extract(isodow from v_hoy)::integer - 1);
  v_mes := date_trunc('month', v_hoy)::date;
  select l.end_date, lt.data_group, lt.name, lt.legal_class into v_aus
    from public.leave_requests l join public.leave_types lt on lt.id = l.leave_type_id
   where l.employment_id = e.id and l.status in ('approved', 'taken') and v_hoy between l.start_date and l.end_date
   order by l.start_date limit 1;
  return jsonb_build_object(
    'id', e.id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
    'cargo', (select jp.name from public.job_positions jp where jp.id = e.position_id),
    'area', (select d.name from public.departments d where d.id = e.department_id),
    'directo', e.manager_id = any (coalesce(v_mios, '{}'::uuid[])),
    'reporta_a', case when e.manager_id = any (coalesce(v_mios, '{}'::uuid[])) then null
                      else (select public.fn_hr_nombre_persona(j.person_id) from public.employments j where j.id = e.manager_id) end,
    'hoy', v_hoy,
    -- Salud nunca: una incapacidad es «ausencia justificada».
    'estado_hoy', case
       when v_aus.end_date is not null then jsonb_build_object(
              'tipo', 'ausente', 'clase', case when v_aus.data_group = 'salud' then 'incapacidad' else v_aus.legal_class end,
              'etiqueta', case when v_aus.data_group = 'salud' then null else v_aus.name end,
              'regresa', v_aus.end_date + 1)
       else (select jsonb_build_object('tipo', case when s.id is null then 'sin_turno' when s.is_rest_day then 'descanso'
                                                   when exists (select 1 from public.attendance_events a where a.employment_id = e.id
                                                                 and a.work_date = v_hoy and a.event_type = 'check_in') then 'en_turno'
                                                   else 'programado' end,
                                       'inicio', s.start_at, 'fin', s.end_at)
               from (select 1) z left join public.shift_assignments s on s.employment_id = e.id and s.work_date = v_hoy
                and not s.is_draft and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped'))
     end,
    'turnos_semana', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', s.work_date, 'plantilla', t.name, 'inicio', s.start_at, 'fin', s.end_at,
                                          'dia_descanso', s.is_rest_day) order by s.work_date)
        from public.shift_assignments s left join public.shift_templates t on t.id = s.shift_template_id
       where s.employment_id = e.id and s.work_date between v_lunes and v_lunes + 6 and not s.is_draft
         and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')), '[]'::jsonb),
    'vacaciones_disponibles', (public.fn_hr_vacaciones_saldo_interno(e.id, v_hoy)->>'disponibles')::numeric,
    'minutos_periodo', (select coalesce(sum(ts.net_worked_minutes), 0) from public.timesheets ts
                         where ts.employment_id = e.id and ts.work_date between v_mes and v_hoy),
    'minutos_planeados_periodo', (select coalesce(sum(s.planned_minutes), 0) from public.shift_assignments s
                                   where s.employment_id = e.id and s.work_date between v_mes and (v_mes + interval '1 month - 1 day')::date
                                     and not s.is_draft and not s.is_rest_day
                                     and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')),
    'novedades_por_aprobar', (select count(*) from public.hr_attendance_novelties n
                               where n.employment_id = e.id and n.status in ('pendiente', 'esperando_contraparte')));
end;
$function$;

-- ─── Pestañas del módulo (decisión 1): RR. HH. 9, jefe 6 ──────────────────────

create or replace function public.fn_hr_pestanas(p_actor uuid, p_org integer)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rrhh boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view');
  v_asis boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view') or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage');
  v_equipo uuid[];
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select array_agg(distinct x) into v_equipo
    from public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team') x
    join public.employments e on e.id = x and e.organization_id = p_org and e.status = 'active';
  return jsonb_build_object(
    'vista', case when v_rrhh then 'rrhh' when v_equipo is not null then 'jefe' else 'ninguna' end,
    'contadores', jsonb_build_object(
      'empleados', case when v_rrhh then (select count(*) from public.employments e where e.organization_id = p_org and e.status = 'active') end,
      'equipo', coalesce(array_length(v_equipo, 1), 0),
      'novedades', (select count(*) from public.hr_attendance_novelties n
                     where n.organization_id = p_org and n.status = 'pendiente'
                       and (v_asis or n.employment_id = any (coalesce(v_equipo, '{}'::uuid[]))))));
end;
$function$;

-- ─── Permisos de ejecución: solo el servidor ─────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.fn_hr_turnos_semana(uuid, integer, date, date, integer)',
    'public.fn_hr_turno_guardar(uuid, integer, jsonb)',
    'public.fn_hr_turno_quitar(uuid, integer, uuid)',
    'public.fn_hr_turnos_copiar(uuid, integer, date, date, integer, integer)',
    'public.fn_hr_turnos_intercambiar(uuid, integer, uuid, uuid)',
    'public.fn_hr_turnos_publicar(uuid, integer, date, date, uuid[], boolean, text)',
    'public.fn_hr_turnos_deshacer(uuid, integer, date, date)',
    'public.fn_hr_marcar(uuid, integer, jsonb, text, text)',
    'public.fn_hr_marcacion_estado(uuid, integer)',
    'public.fn_hr_mi_asistencia(uuid, integer, date, date)',
    'public.fn_hr_mi_equipo(uuid, integer)',
    'public.fn_hr_equipo_persona(uuid, integer, uuid)',
    'public.fn_hr_pestanas(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
