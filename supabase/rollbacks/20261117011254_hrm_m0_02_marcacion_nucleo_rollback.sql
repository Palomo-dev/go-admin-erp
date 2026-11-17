-- Reversión de 20261117011254_hrm_m0_02_marcacion_nucleo.
-- Aplicar DESPUÉS de revertir 20261117011440_hrm_m0_03 y ANTES de 20261117010041_hrm_m0_01.
-- Restaura fn_hr_marcar, fn_hr_marcacion_estado y fn_hr_ajustes_asistencia de la fase 2
-- (solo app y qr, QR con token guardado en la base) y quita el núcleo compartido, los
-- métodos efectivos y el registro de intentos. No toca datos: las marcas con método
-- 'nfc' ya registradas se quedan (source = 'nfc' ya era válido).

drop function if exists public.fn_hr_marcacion_intento(uuid, integer, jsonb, text, jsonb);
drop function if exists public.fn_hr_mi_metodo_marcacion(integer);

create or replace function public.fn_hr_ajustes_asistencia(p_employment uuid)
returns public.hr_attendance_settings
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
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
$function$;

create or replace function public.fn_hr_marcar(p_actor uuid, p_org integer, p_datos jsonb, p_ip text default null, p_ua text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
language plpgsql
stable
security definer
set search_path = public, pg_temp
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

drop function if exists public.fn_hr_registrar_marca(uuid, integer, uuid, text, text, text, uuid, integer, jsonb, boolean, jsonb, text);
drop function if exists public.fn_hr_metodos_vinculo(uuid);
drop function if exists public.fn_hr_metodos_sede(integer, integer);
