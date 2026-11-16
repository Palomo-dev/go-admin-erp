-- HRM fase 2 · paso 6: lo que piden las pantallas de Ausencias (Figma 20.13 Vacaciones y 20.14
-- Incapacidades y licencias). ADR-002 §5 y §6; decisiones 2 y 10 del dueño (2026-11-16).
-- Solo funciones: ninguna tabla ni columna cambia. Ninguna decide el día con CURRENT_DATE: el día
-- sale de fn_today_for_org / fn_today_for.

-- 1. Sección de la pantalla según la clase legal del tipo --------------------------------------
create or replace function public.fn_hr_ausencia_seccion(p_clase text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
           when p_clase = 'vacaciones' then 'vacaciones'
           when p_clase in ('incapacidad_comun', 'incapacidad_laboral', 'maternidad', 'paternidad', 'luto') then 'incapacidades'
           else 'permisos'
         end;
$$;
comment on function public.fn_hr_ausencia_seccion(text) is
  'ADR-002 §5-6. Pestaña de Ausencias de un tipo: vacaciones, incapacidades (y licencias de ley) o permisos.';

-- 2. Día de regreso: el primer día laborable del vínculo después de la ausencia -----------------
create or replace function public.fn_hr_ausencia_regreso(p_org integer, p_employment uuid, p_hasta date)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch integer;
  aj public.hr_attendance_settings;
  d date := p_hasta + 1;
begin
  select e.branch_id into v_branch from public.employments e where e.id = p_employment and e.organization_id = p_org;
  aj := public.fn_hr_ajustes_asistencia(p_employment);
  for i in 1..31 loop
    if public.fn_hr_dias_habiles(p_org, d, d, v_branch, aj.dias_laborables) > 0 then
      return d;
    end if;
    d := d + 1;
  end loop;
  return p_hasta + 1;
end;
$$;

-- 3. Estado de la aprobación de una ausencia, con quién decide en cada paso ----------------------
create or replace function public.fn_hr_ausencia_aprobacion(p_actor uuid, p_org integer, p_inst uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  i public.hr_approval_instances;
  v_hoy date := public.fn_today_for_org(p_org);
begin
  if p_inst is null then
    return null;
  end if;
  select * into i from public.hr_approval_instances where id = p_inst and organization_id = p_org;
  if i.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', i.id, 'estado', i.status, 'paso_actual', i.current_step,
    'pasos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'orden', s.step_order, 'tipo', s.approver_type, 'estado', s.status, 'respaldo', s.is_fallback,
               'aprobadores', (select coalesce(jsonb_agg(public.fn_hr_nombre_usuario(u)), '[]'::jsonb) from unnest(s.approver_user_ids) u),
               'soy_yo', p_actor = any (s.approver_user_ids),
               'decidio', public.fn_hr_nombre_usuario(s.decided_by), 'decidido', s.decided_at) order by s.step_order)
        from public.hr_approval_steps s where s.instance_id = i.id), '[]'::jsonb),
    -- La misma regla de fn_hr_aprobacion_ver: nadie decide lo propio; la delegación vigente cuenta.
    'puede_decidir', i.status = 'pendiente' and i.requested_by is distinct from p_actor
      and exists (select 1 from public.hr_approval_steps s
                   where s.instance_id = i.id and s.step_order = i.current_step and s.status = 'pendiente'
                     and (p_actor = any (s.approver_user_ids)
                          or exists (select 1 from public.hr_approval_delegations d
                                      where d.organization_id = i.organization_id and d.delegate_user_id = p_actor
                                        and d.delegator_user_id = any (s.approver_user_ids) and d.is_active
                                        and v_hoy between d.starts_on and d.ends_on
                                        and public.fn_hr_delegacion_cubre(d.request_type, d.request_types, i.request_type)))));
end;
$$;

-- 4. Lista de ausencias de una pestaña ---------------------------------------------------------
-- Quién ve qué (decisión 2):
--   · RR. HH. (hr.leaves.view o .approve) ve todo; con hr.data.salud.view, además el soporte de salud.
--   · Sin el permiso de salud, la incapacidad se ve como incapacidad (tipo y fechas), nunca el diagnóstico.
--   · El jefe ve a su equipo; una ausencia de salud le llega como «ausencia justificada», sin tipo,
--     sin tramos de pago y sin soporte.
--   · El titular ve lo suyo completo.
create or replace function public.fn_hr_ausencias_listar(
  p_actor uuid, p_org integer, p_seccion text, p_desde date, p_hasta date, p_solo_propias boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_todo boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.view') or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_aprobar boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
  v_equipo uuid[];
  v_hoy date := public.fn_today_for_org(p_org);
  v_emp uuid;
  v_mio jsonb;
  v_saldo jsonb;
  v_filas jsonb;
  v_festivos jsonb;
  v_tipos jsonb;
  v_duraciones jsonb;
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_seccion is null or p_seccion not in ('vacaciones', 'incapacidades', 'permisos', 'todas') then
    raise exception 'seccion_invalida' using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  v_equipo := array(select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'));
  if not coalesce(p_solo_propias, false) and not v_todo and cardinality(v_equipo) = 0 then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select e2.id into v_emp from public.employments e2
    left join public.organization_members om on om.id = e2.organization_member_id
    left join public.hr_people p on p.id = e2.person_id
   where e2.organization_id = p_org and e2.status = 'active' and (om.user_id = p_actor or p.user_id = p_actor)
   order by e2.hire_date desc nulls last, e2.created_at desc limit 1;

  if v_aprobar or v_emp is not null then
    perform public.fn_hr_tipos_ausencia_asegurar(p_org);
  end if;

  with base as (
    select l.*, lt.code as t_code, lt.name as t_name, lt.legal_class as t_clase, lt.data_group as t_grupo,
           lt.paid as t_paga, lt.requires_document as t_soporte, lt.counts_days as t_cuenta,
           e.person_id, e.department_id, e.position_id, e.branch_id,
           public.fn_hr_vinculo_es_del_actor(p_actor, l.employment_id) as propio
      from public.leave_requests l
      join public.leave_types lt on lt.id = l.leave_type_id
      join public.employments e on e.id = l.employment_id
     where l.organization_id = p_org and l.status <> 'draft'
       and l.start_date <= p_hasta and l.end_date >= p_desde
       and (p_seccion = 'todas' or public.fn_hr_ausencia_seccion(lt.legal_class) = p_seccion)
  ),
  vis as (
    select b.*,
           case when b.t_grupo is distinct from 'salud' or b.propio or (v_todo and v_salud) then 'completo'
                when v_todo then 'tipo'
                else 'justificada' end as nivel
      from base b
     where case when coalesce(p_solo_propias, false) then b.propio
                else (v_todo or b.propio or b.employment_id = any (v_equipo)) end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'vinculo_id', v.employment_id, 'persona_id', v.person_id,
           'nombre', public.fn_hr_nombre_persona(v.person_id),
           'cargo', (select j.name from public.job_positions j where j.id = v.position_id),
           'area_id', v.department_id,
           'area', (select d.name from public.departments d where d.id = v.department_id),
           'area_personas', (select count(*) from public.employments x
                              where x.department_id = v.department_id and x.organization_id = p_org and x.status = 'active'),
           'sede', (select b.name from public.branches b where b.id = v.branch_id),
           'seccion', public.fn_hr_ausencia_seccion(v.t_clase),
           'nivel', v.nivel, 'propio', v.propio, 'sensible', coalesce(v.t_grupo = 'salud', false),
           'tipo', case when v.nivel = 'justificada' then null else v.t_code end,
           'tipo_nombre', case when v.nivel = 'justificada' then null else v.t_name end,
           'clase', case when v.nivel = 'justificada' then 'justificada' else v.t_clase end,
           'desde', v.start_date, 'hasta', v.end_date,
           'dias_calendario', v.total_days, 'dias_habiles', v.business_days, 'cuenta', v.t_cuenta,
           'medio_dia_inicio', coalesce(v.start_half_day, false), 'medio_dia_fin', coalesce(v.end_half_day, false),
           'jornada', v.half_day_period,
           'horas', case when jsonb_typeof(v.metadata->'horas') = 'object' then v.metadata->'horas' end,
           'se_repone', coalesce((v.metadata->>'se_repone')::boolean, false),
           'fecha_parto', v.metadata->>'fecha_parto',
           'motivo', case when v.t_grupo = 'salud' then null else v.reason end,
           'remunerado', v.t_paga,
           'estado', v.status, 'creado', v.created_at, 'prorroga_de', v.extends_leave_id,
           'soporte', case when v.nivel = 'justificada' then null
                           when v.document_id is not null then 'recibido'
                           when v.t_soporte then 'falta' end,
           'tramos', case when v.nivel <> 'justificada' and public.fn_hr_ausencia_seccion(v.t_clase) = 'incapacidades'
                          then public.fn_hr_ausencia_tramos_pago(p_org, v.id) end,
           'regresa', public.fn_hr_ausencia_regreso(p_org, v.employment_id, v.end_date),
           'aprobacion', public.fn_hr_ausencia_aprobacion(p_actor, p_org, v.approval_instance_id),
           'saldo_despues', case when v.t_clase = 'vacaciones' and v.status in ('requested', 'approved', 'taken') then
               round((public.fn_hr_vacaciones_saldo_interno(v.employment_id, v.start_date)->>'causados')::numeric
                     - (select coalesce(sum(coalesce(y.business_days, y.total_days)), 0)
                          from public.leave_requests y join public.leave_types yt on yt.id = y.leave_type_id
                         where y.employment_id = v.employment_id and yt.legal_class = 'vacaciones'
                           and y.status in ('requested', 'approved', 'taken')
                           and (y.start_date < v.start_date or (y.start_date = v.start_date and y.created_at <= v.created_at))), 2)
             end,
           -- Cruces: otras vacaciones de la misma área en las mismas fechas (ADR-002 §5).
           'cruces', case when v.t_clase = 'vacaciones' and v.status in ('requested', 'approved', 'taken') and v.department_id is not null then
               (select coalesce(jsonb_agg(jsonb_build_object('nombre', public.fn_hr_nombre_persona(o.person_id),
                                                             'desde', greatest(x.start_date, v.start_date),
                                                             'hasta', least(x.end_date, v.end_date), 'estado', x.status)
                                          order by x.start_date), '[]'::jsonb)
                  from public.leave_requests x
                  join public.employments o on o.id = x.employment_id
                  join public.leave_types xt on xt.id = x.leave_type_id
                 where x.organization_id = p_org and x.employment_id <> v.employment_id and xt.legal_class = 'vacaciones'
                   and x.status in ('requested', 'approved', 'taken')
                   and x.start_date <= v.end_date and x.end_date >= v.start_date
                   and o.department_id = v.department_id)
             end
         ) order by v.start_date, v.created_at), '[]'::jsonb)
    into v_filas
    from vis v;

  select coalesce(jsonb_agg(jsonb_build_object('fecha', f.fecha, 'nombre', f.nombre, 'propio', f.propio, 'medio_dia', f.medio)
                            order by f.fecha), '[]'::jsonb)
    into v_festivos
    from (select h.holiday_date as fecha, h.name as nombre, false as propio, false as medio
            from public.hr_holidays h
           where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date between p_desde and p_hasta
          union all
          select o.holiday_date, o.name, true, coalesce(o.half_day, false)
            from public.hr_org_holidays o
           where o.organization_id = p_org and o.holiday_date between p_desde and p_hasta) f;

  select coalesce(jsonb_agg(jsonb_build_object('id', lt.id, 'codigo', lt.code, 'nombre', lt.name, 'clase', lt.legal_class,
                                               'seccion', public.fn_hr_ausencia_seccion(lt.legal_class),
                                               'remunerado', lt.paid, 'cuenta', lt.counts_days, 'sensible', coalesce(lt.data_group = 'salud', false),
                                               'requiere_soporte', lt.requires_document)
                            order by lt.is_system desc, lt.name), '[]'::jsonb)
    into v_tipos
    from public.leave_types lt
   where lt.organization_id = p_org and lt.is_active;

  -- Duraciones de ley y quién paga: parámetros por vigencia, con su estado (el luto sigue «por confirmar»).
  v_duraciones := jsonb_build_object(
    'maternidad', public.fn_hr_parametro_detalle(p_org, 'licencia_maternidad_semanas', v_hoy),
    'paternidad', public.fn_hr_parametro_detalle(p_org, 'licencia_paternidad_semanas', v_hoy),
    'luto', public.fn_hr_parametro_detalle(p_org, 'licencia_luto_dias_habiles', v_hoy),
    'pago', public.fn_hr_parametro_detalle(p_org, 'licencias_pago', v_hoy)->'valor_json');

  if v_emp is not null then
    begin
      v_saldo := public.fn_hr_vacaciones_saldo_interno(v_emp, v_hoy);
    exception when others then
      v_saldo := null;
    end;
    select jsonb_build_object('vinculo_id', e.id, 'persona_id', e.person_id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
                              'cargo', (select j.name from public.job_positions j where j.id = e.position_id),
                              'area', (select d.name from public.departments d where d.id = e.department_id),
                              'saldo', v_saldo)
      into v_mio
      from public.employments e where e.id = v_emp;
  end if;

  return jsonb_build_object(
    'hoy', v_hoy,
    'permisos', jsonb_build_object('ver_todo', v_todo, 'aprobar', v_aprobar, 'salud', v_salud,
                                   'equipo', cardinality(v_equipo) > 0, 'registrar', v_aprobar),
    'filas', v_filas, 'festivos', v_festivos, 'tipos', v_tipos, 'duraciones', v_duraciones, 'mio', v_mio);
end;
$$;

-- 5. Detalle de una ausencia (Figma 20.14 «Incapacidad · persona») ------------------------------
-- El diagnóstico NO sale de aquí: lo lee fn_hr_ausencia_detalle_salud, que deja el registro de accesos.
-- Los metadatos del soporte de salud solo los ve quien ve la incapacidad completa.
create or replace function public.fn_hr_ausencia_ver(p_actor uuid, p_org integer, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  l public.leave_requests;
  lt public.leave_types;
  e public.employments;
  d public.hr_documents;
  v_todo boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.view') or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_aprobar boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
  v_propio boolean;
  v_nivel text;
  v_turnos integer;
  v_soporte jsonb;
begin
  select * into l from public.leave_requests where id = p_id and organization_id = p_org;
  if l.id is null then
    raise exception 'hr: la ausencia no existe' using errcode = 'P0002';
  end if;
  select * into lt from public.leave_types where id = l.leave_type_id;
  select * into e from public.employments where id = l.employment_id;
  v_propio := public.fn_hr_vinculo_es_del_actor(p_actor, l.employment_id);
  if not (v_todo or v_propio
          or l.employment_id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_nivel := case when lt.data_group is distinct from 'salud' or v_propio or (v_todo and v_salud) then 'completo'
                  when v_todo then 'tipo' else 'justificada' end;

  select count(*) into v_turnos
    from public.shift_assignments s
   where s.employment_id = l.employment_id and s.work_date between l.start_date and l.end_date
     and not coalesce(s.is_draft, false) and not coalesce(s.is_rest_day, false);

  if l.document_id is not null then
    if v_nivel = 'completo' then
      select * into d from public.hr_documents where id = l.document_id;
      v_soporte := jsonb_build_object('id', d.id, 'restringido', false, 'nombre', d.file_name, 'tipo', d.mime_type,
                                      'tamano', d.size_bytes, 'vence', d.valid_until, 'creado', d.created_at,
                                      'subio', public.fn_hr_nombre_usuario(d.uploaded_by), 'grupo', d.data_group);
    elsif v_nivel = 'tipo' then
      v_soporte := jsonb_build_object('restringido', true, 'grupo', 'salud');
    end if;
  end if;

  return jsonb_build_object(
    'id', l.id, 'vinculo_id', l.employment_id, 'persona_id', case when v_nivel = 'justificada' then null else e.person_id end,
    'nombre', public.fn_hr_nombre_persona(e.person_id),
    'cargo', (select j.name from public.job_positions j where j.id = e.position_id),
    'area', (select x.name from public.departments x where x.id = e.department_id),
    'sede', (select b.name from public.branches b where b.id = e.branch_id),
    'seccion', public.fn_hr_ausencia_seccion(lt.legal_class),
    'nivel', v_nivel, 'propio', v_propio, 'sensible', coalesce(lt.data_group = 'salud', false),
    'tipo', case when v_nivel = 'justificada' then null else lt.code end,
    'tipo_nombre', case when v_nivel = 'justificada' then null else lt.name end,
    'clase', case when v_nivel = 'justificada' then 'justificada' else lt.legal_class end,
    'desde', l.start_date, 'hasta', l.end_date, 'dias_calendario', l.total_days, 'dias_habiles', l.business_days,
    'cuenta', lt.counts_days, 'estado', l.status, 'remunerado', lt.paid,
    'motivo', case when lt.data_group = 'salud' then null else l.reason end,
    'horas', case when jsonb_typeof(l.metadata->'horas') = 'object' then l.metadata->'horas' end,
    'fecha_parto', l.metadata->>'fecha_parto',
    'prorroga_de', l.extends_leave_id,
    'prorrogas', (select count(*) from public.leave_requests p where p.extends_leave_id = l.id and p.status in ('requested', 'approved', 'taken')),
    'regresa', public.fn_hr_ausencia_regreso(p_org, l.employment_id, l.end_date),
    'turnos_afectados', v_turnos,
    'registro', jsonb_build_object('por', public.fn_hr_nombre_usuario(nullif(l.metadata->>'registrado_por', '')::uuid),
                                   'en', l.created_at, 'canal', l.metadata->>'canal'),
    'soporte', v_soporte,
    'soporte_estado', case when v_nivel = 'justificada' then null when l.document_id is not null then 'recibido'
                           when lt.requires_document then 'falta' end,
    'tramos', case when v_nivel = 'completo' or (v_nivel = 'tipo' and lt.data_group is distinct from 'salud')
                   then public.fn_hr_ausencia_tramos_pago(p_org, l.id) end,
    'aprobacion', public.fn_hr_ausencia_aprobacion(p_actor, p_org, l.approval_instance_id),
    'permisos', jsonb_build_object('salud', v_nivel = 'completo' and lt.data_group = 'salud',
                                   'gestionar', v_aprobar,
                                   'cancelar', v_aprobar or (v_propio and l.status = 'requested')));
end;
$$;

-- 6. Vista previa de una solicitud: la misma regla de fn_hr_ausencia_solicitar, sin guardar ---------
-- Corre la solicitud dentro de un bloque que se deshace: el cálculo de días, el saldo, los cruces,
-- los tramos de pago y los aprobadores son los mismos que tendría la solicitud real (CLAUDE.md regla 7).
create or replace function public.fn_hr_ausencia_simular(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp uuid := nullif(p_datos->>'employment_id', '')::uuid;
  v_desde date := (p_datos->>'desde')::date;
  v_hasta date := (p_datos->>'hasta')::date;
  e public.employments;
  aj public.hr_attendance_settings;
  v_res jsonb;
  v_tramos jsonb;
  v_pasos jsonb;
  v_error text;
  v_no_laborables jsonb;
  v_festivos jsonb;
begin
  if v_emp is null then
    select e2.id into v_emp from public.employments e2
      left join public.organization_members om on om.id = e2.organization_member_id
      left join public.hr_people p on p.id = e2.person_id
     where e2.organization_id = p_org and e2.status = 'active' and (om.user_id = p_actor or p.user_id = p_actor)
     order by e2.hire_date desc nulls last, e2.created_at desc limit 1;
  end if;
  select * into e from public.employments where id = v_emp and organization_id = p_org;
  if e.id is null then
    raise exception 'sin_vinculo_activo' using errcode = '42501';
  end if;
  if not (public.fn_hr_vinculo_es_del_actor(p_actor, e.id) or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_desde is null or v_hasta is null or v_hasta < v_desde or v_hasta - v_desde > 540 then
    raise exception 'fechas_invalidas' using errcode = '22023';
  end if;
  aj := public.fn_hr_ajustes_asistencia(e.id);

  -- Desglose a la vista: días que no son laborables del vínculo y festivos (de ley y propios).
  select coalesce(jsonb_agg(d::date order by d), '[]'::jsonb) into v_no_laborables
    from generate_series(v_desde, v_hasta, interval '1 day') d
   where not (extract(dow from d)::smallint = any (aj.dias_laborables));
  select coalesce(jsonb_agg(jsonb_build_object('fecha', f.fecha, 'nombre', f.nombre, 'propio', f.propio) order by f.fecha), '[]'::jsonb)
    into v_festivos
    from (select h.holiday_date as fecha, h.name as nombre, false as propio from public.hr_holidays h
           where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date between v_desde and v_hasta
             and extract(dow from h.holiday_date)::smallint = any (aj.dias_laborables)
          union all
          select o.holiday_date, o.name, true from public.hr_org_holidays o
           where o.organization_id = p_org and o.holiday_date between v_desde and v_hasta
             and (o.branch_ids is null or e.branch_id = any (o.branch_ids))
             and extract(dow from o.holiday_date)::smallint = any (aj.dias_laborables)) f;

  begin
    v_res := public.fn_hr_ausencia_solicitar(p_actor, p_org, p_datos || jsonb_build_object('employment_id', e.id));
    v_tramos := public.fn_hr_ausencia_tramos_pago(p_org, (v_res->>'id')::uuid);
    v_pasos := (public.fn_hr_ausencia_aprobacion(p_actor, p_org, nullif(v_res->>'aprobacion_id', '')::uuid))->'pasos';
    raise exception 'simulacion' using errcode = 'P0001';
  exception
    when raise_exception then
      if sqlerrm <> 'simulacion' then
        v_error := sqlerrm;
      end if;
    when others then
      v_error := sqlerrm;
  end;

  return jsonb_build_object(
    'vinculo_id', e.id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
    'cargo', (select j.name from public.job_positions j where j.id = e.position_id),
    'area', (select x.name from public.departments x where x.id = e.department_id),
    'desde', v_desde, 'hasta', v_hasta,
    'dias_calendario', coalesce((v_res->>'dias_calendario')::numeric, v_hasta - v_desde + 1),
    'dias_habiles', coalesce((v_res->>'dias_habiles')::numeric,
                             public.fn_hr_dias_habiles(p_org, v_desde, v_hasta, e.branch_id, aj.dias_laborables)),
    'no_laborables', v_no_laborables, 'festivos', v_festivos,
    'regresa', public.fn_hr_ausencia_regreso(p_org, e.id, v_hasta),
    'estado', v_res->>'estado',
    'saldo', coalesce(v_res->'saldo', case when exists (select 1 from public.leave_types t
                                                         where t.organization_id = p_org and t.legal_class = 'vacaciones'
                                                           and (t.code = p_datos->>'tipo' or t.id::text = coalesce(p_datos->>'tipo_id', '')))
                                           then public.fn_hr_vacaciones_saldo_interno(e.id, v_desde) end),
    'cruces', coalesce(v_res->'cruces_equipo', '[]'::jsonb),
    'tramos', v_tramos, 'pasos', coalesce(v_pasos, '[]'::jsonb),
    'error', v_error);
end;
$$;

-- 7. Registrar con los datos que la tabla guarda en metadata (horas de un permiso, si se repone,
--    fecha probable de parto). Envuelve fn_hr_ausencia_solicitar en la misma transacción.
create or replace function public.fn_hr_ausencia_registrar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb := public.fn_hr_ausencia_solicitar(p_actor, p_org, p_datos);
  v_extra jsonb;
  v_hi text := p_datos->'horas'->>'inicio';
  v_hf text := p_datos->'horas'->>'fin';
begin
  if v_hi is not null or v_hf is not null then
    if v_hi !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_hf !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_hf <= v_hi
       or (p_datos->>'desde') is distinct from (p_datos->>'hasta') then
      raise exception 'horas_invalidas: un permiso por horas es de un solo día y termina después de empezar' using errcode = '22023';
    end if;
  end if;
  v_extra := jsonb_strip_nulls(jsonb_build_object(
    'horas', case when v_hi is not null then jsonb_build_object('inicio', v_hi, 'fin', v_hf) end,
    'se_repone', case when coalesce((p_datos->>'se_repone')::boolean, false) then true end,
    'fecha_parto', case when (p_datos->>'fecha_parto') ~ '^\d{4}-\d{2}-\d{2}$' then p_datos->>'fecha_parto' end));
  if v_extra <> '{}'::jsonb then
    update public.leave_requests set metadata = coalesce(metadata, '{}'::jsonb) || v_extra
     where id = (v_res->>'id')::uuid and organization_id = p_org;
  end if;
  return v_res;
end;
$$;

-- 8. Interrumpir unas vacaciones: devuelve los días no disfrutados ------------------------------
create or replace function public.fn_hr_ausencia_interrumpir(p_actor uuid, p_org integer, p_id uuid, p_ultimo_dia date, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.leave_requests;
  lt public.leave_types;
  e public.employments;
  aj public.hr_attendance_settings;
  v_total numeric;
  v_habiles numeric;
  v_antes numeric;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into l from public.leave_requests where id = p_id and organization_id = p_org for update;
  if l.id is null then
    raise exception 'hr: la ausencia no existe' using errcode = 'P0002';
  end if;
  select * into lt from public.leave_types where id = l.leave_type_id;
  if lt.legal_class is distinct from 'vacaciones' or l.status not in ('approved', 'taken') then
    raise exception 'ausencia_no_interrumpible: solo unas vacaciones aprobadas' using errcode = '55000';
  end if;
  if p_ultimo_dia is null or p_ultimo_dia < l.start_date or p_ultimo_dia >= l.end_date then
    raise exception 'fecha_invalida: el último día disfrutado va entre el inicio y la víspera del fin' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  select * into e from public.employments where id = l.employment_id;
  aj := public.fn_hr_ajustes_asistencia(e.id);
  v_total := (p_ultimo_dia - l.start_date + 1) - case when l.start_half_day then 0.5 else 0 end;
  v_habiles := greatest(0, public.fn_hr_dias_habiles(p_org, l.start_date, p_ultimo_dia, e.branch_id, aj.dias_laborables)
                           - case when l.start_half_day then 0.5 else 0 end);
  v_antes := case when lt.counts_days = 'habiles' then coalesce(l.business_days, l.total_days) else l.total_days end;
  update public.leave_requests
     set end_date = p_ultimo_dia, end_half_day = false, total_days = v_total, business_days = v_habiles,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('interrumpida', jsonb_build_object(
           'por', p_actor, 'en', now(), 'motivo', left(btrim(p_motivo), 500), 'hasta_original', l.end_date))
   where id = l.id;
  -- Saldo heredado de las pantallas viejas (leave_balances): devuelve la diferencia.
  update public.leave_balances
     set pending = pending - (v_antes - case when lt.counts_days = 'habiles' then v_habiles else v_total end), updated_at = now()
   where employment_id = l.employment_id and leave_type_id = l.leave_type_id and year = extract(year from l.start_date)::integer
     and l.status = 'approved';
  return jsonb_build_object('id', l.id, 'hasta', p_ultimo_dia, 'dias_habiles', v_habiles, 'dias_devueltos',
                            coalesce(l.business_days, l.total_days) - v_habiles);
end;
$$;

-- 9. Enlazar el soporte (un documento de hr-documentos de la misma persona) ----------------------
create or replace function public.fn_hr_ausencia_soporte(p_actor uuid, p_org integer, p_id uuid, p_documento uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.leave_requests;
begin
  select * into l from public.leave_requests where id = p_id and organization_id = p_org for update;
  if l.id is null then
    raise exception 'hr: la ausencia no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve') or public.fn_hr_vinculo_es_del_actor(p_actor, l.employment_id)) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if l.status not in ('requested', 'approved', 'taken') then
    raise exception 'ausencia_cerrada' using errcode = '55000';
  end if;
  -- fn_hr_ausencia_validar exige que sea de la misma persona y, en salud, del grupo salud.
  update public.leave_requests set document_id = p_documento where id = l.id;
  return jsonb_build_object('id', l.id, 'documento_id', p_documento);
end;
$$;

-- 10. Decisión 2 también en el calendario del equipo: el jefe ve «ausencia justificada»; RR. HH.
--     sin el permiso de salud ve la incapacidad; el tipo exacto, el titular y quien tiene salud.
create or replace function public.fn_hr_ausencias_equipo(p_actor uuid, p_org integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_todo boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.view') or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 370 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'desde', x->>'nombre')
      from (
        select jsonb_build_object(
                 'id', l.id, 'employment_id', l.employment_id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
                 'desde', l.start_date, 'hasta', l.end_date, 'estado', l.status,
                 'tipo', case when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then null else lt.code end,
                 'clase', case when lt.data_group = 'salud' and not propio and not v_todo then 'justificada'
                               when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then 'incapacidad'
                               else lt.legal_class end,
                 'etiqueta', case when lt.data_group = 'salud' and not propio and not v_todo then 'Ausencia justificada'
                                  when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then 'Ausente · incapacidad'
                                  else lt.name end) as x
          from (select l0.*, public.fn_hr_vinculo_es_del_actor(p_actor, l0.employment_id) as propio from public.leave_requests l0
                 where l0.organization_id = p_org and l0.status in ('requested', 'approved', 'taken')
                   and l0.start_date <= p_hasta and l0.end_date >= p_desde) l
          join public.employments e on e.id = l.employment_id
          join public.leave_types lt on lt.id = l.leave_type_id
         where v_todo or l.propio
            or l.employment_id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))
      ) s), '[]'::jsonb);
end;
$$;

-- 11. Permisos: solo el servidor, con el actor de la sesión -----------------------------------
revoke all on function public.fn_hr_ausencia_seccion(text) from public, anon, authenticated;
grant execute on function public.fn_hr_ausencia_seccion(text) to service_role;
revoke all on function public.fn_hr_ausencia_regreso(integer, uuid, date) from public, anon, authenticated;
revoke all on function public.fn_hr_ausencia_aprobacion(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_hr_ausencias_listar(uuid, integer, text, date, date, boolean) from public, anon, authenticated;
revoke all on function public.fn_hr_ausencia_ver(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_hr_ausencia_simular(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fn_hr_ausencia_registrar(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fn_hr_ausencia_interrumpir(uuid, integer, uuid, date, text) from public, anon, authenticated;
revoke all on function public.fn_hr_ausencia_soporte(uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_hr_ausencias_equipo(uuid, integer, date, date) from public, anon, authenticated;
grant execute on function public.fn_hr_ausencia_regreso(integer, uuid, date) to service_role;
grant execute on function public.fn_hr_ausencia_aprobacion(uuid, integer, uuid) to service_role;
grant execute on function public.fn_hr_ausencias_listar(uuid, integer, text, date, date, boolean) to service_role;
grant execute on function public.fn_hr_ausencia_ver(uuid, integer, uuid) to service_role;
grant execute on function public.fn_hr_ausencia_simular(uuid, integer, jsonb) to service_role;
grant execute on function public.fn_hr_ausencia_registrar(uuid, integer, jsonb) to service_role;
grant execute on function public.fn_hr_ausencia_interrumpir(uuid, integer, uuid, date, text) to service_role;
grant execute on function public.fn_hr_ausencia_soporte(uuid, integer, uuid, uuid) to service_role;
grant execute on function public.fn_hr_ausencias_equipo(uuid, integer, date, date) to service_role;
