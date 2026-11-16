-- Reversión de 20261116120000_hrm_f2_06_pantallas_turnos_marcacion_equipo:
-- borra las funciones nuevas de las pantallas y devuelve fn_hr_turnos_publicar,
-- fn_hr_marcar y fn_hr_marcacion_estado a sus cuerpos de hrm_f2_02 y hrm_f2_03.
-- Las novedades de horas extra planeadas que ya se crearon al publicar se conservan.

drop function if exists public.fn_hr_turnos_semana(uuid, integer, date, date, integer);
drop function if exists public.fn_hr_turno_guardar(uuid, integer, jsonb);
drop function if exists public.fn_hr_turno_quitar(uuid, integer, uuid);
drop function if exists public.fn_hr_turnos_copiar(uuid, integer, date, date, integer, integer);
drop function if exists public.fn_hr_turnos_intercambiar(uuid, integer, uuid, uuid);
drop function if exists public.fn_hr_turnos_deshacer(uuid, integer, date, date);
drop function if exists public.fn_hr_mi_asistencia(uuid, integer, date, date);
drop function if exists public.fn_hr_mi_equipo(uuid, integer);
drop function if exists public.fn_hr_equipo_persona(uuid, integer, uuid);
drop function if exists public.fn_hr_pestanas(uuid, integer);
drop function if exists public.fn_hr_turnos_publicar(uuid, integer, date, date, uuid[], boolean, text);

-- fn_hr_turnos_publicar de hrm_f2_02_turnos
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

-- fn_hr_marcar y fn_hr_marcacion_estado de hrm_f2_03_marcacion
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

revoke all on function public.fn_hr_turnos_publicar(uuid, integer, date, date, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.fn_hr_turnos_publicar(uuid, integer, date, date, uuid[], boolean) to service_role;
revoke all on function public.fn_hr_marcar(uuid, integer, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_marcar(uuid, integer, jsonb, text, text) to service_role;
revoke all on function public.fn_hr_marcacion_estado(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_marcacion_estado(uuid, integer) to service_role;
