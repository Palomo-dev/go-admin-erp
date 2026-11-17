-- HRM · Marcación M0 · paso 2: un solo núcleo de marca, métodos por sede, QR que
-- cambia cada 30 s y sirve una sola vez, etiquetas NFC, intentos rechazados,
-- «En vivo», excepciones temporales y el método de cada marca en Asistencia.
-- Plan: docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md §6–§8 y §10 (M0).
--
-- Reglas que no cambian:
-- - fn_hr_marcar conserva su firma; los métodos de hoy (app y qr) se comportan igual
--   con la configuración por defecto de la sede.
-- - La hora de la marca es la del servidor; la marca original nunca se edita.
-- - Funciones SECURITY DEFINER con search_path fijo; las que llama el servidor solo
--   para service_role; ninguna para anon.

-- 1. Métodos efectivos ------------------------------------------------------------------

-- Sin fila de ajustes, la persona acepta también la etiqueta NFC (el mismo valor por
-- defecto de la columna). Quien tiene fila conserva lo que RR. HH. le dejó.
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
  s.mecanismos := array['app', 'qr', 'nfc']::text[];
  s.dia_descanso := 0;
  s.dias_laborables := array[1, 2, 3, 4, 5, 6]::smallint[];
  s.jornada_flexible := false;
  s.exento_horas_extra := false;
  return s;
end;
$function$;

-- Configuración de la sede con sus valores por defecto. Sin fila, la sede ofrece lo
-- de la fase 2 (celular con ubicación y QR) y la etiqueta NFC; los métodos de kiosco
-- y terminales (M1, M2) nacen apagados.
create or replace function public.fn_hr_metodos_sede(p_org integer, p_branch integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with radio as (
    select coalesce((select nullif(b.features->>'radio_marcacion_m', '')::numeric
                       from public.branches b where b.id = p_branch and b.organization_id = p_org), 150) as m
  )
  select jsonb_object_agg(d.metodo, jsonb_build_object(
           'activo', coalesce(c.enabled, d.por_defecto),
           'reglas', d.reglas || coalesce(c.rules, '{}'::jsonb),
           'configurado', c.method is not null))
    from (values
            ('celular_ubicacion', true, jsonb_build_object('radio_m', (select m from radio), 'permitir_computador', true)),
            ('qr', true, jsonb_build_object('exigir_ubicacion', false, 'segundos', 30)),
            ('nfc_etiqueta', true, jsonb_build_object('exigir_ubicacion', true)),
            ('carne_nfc', false, '{}'::jsonb),
            ('pin', false, '{}'::jsonb),
            ('rostro', false, '{}'::jsonb),
            ('huella', false, '{}'::jsonb)) as d(metodo, por_defecto, reglas)
    left join public.hr_branch_clock_methods c
      on c.branch_id = p_branch and c.organization_id = p_org and c.method = d.metodo;
$$;
revoke all on function public.fn_hr_metodos_sede(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_metodos_sede(integer, integer) to service_role;

-- Lo que puede usar una persona: la sede ofrece, la ficha restringe y una excepción
-- vigente aprobada por RR. HH. abre un método puntual.
create or replace function public.fn_hr_metodos_vinculo(p_employment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp public.employments;
  v_aj public.hr_attendance_settings;
  v_sede jsonb;
  v_exc text[];
  v_cel boolean;
  v_qr boolean;
  v_nfc boolean;
begin
  select * into v_emp from public.employments e where e.id = p_employment;
  if v_emp.id is null then
    return null;
  end if;
  v_aj := public.fn_hr_ajustes_asistencia(v_emp.id);
  v_sede := public.fn_hr_metodos_sede(v_emp.organization_id, v_emp.branch_id);
  select coalesce(array_agg(distinct x.metodo), '{}') into v_exc
    from public.hr_marcacion_excepciones x
   where x.employment_id = v_emp.id and x.revocada_at is null
     and x.vigente_desde <= now() and x.vigente_hasta > now();
  v_cel := ((v_sede->'celular_ubicacion'->>'activo')::boolean and 'app' = any (v_aj.mecanismos)) or 'celular_ubicacion' = any (v_exc);
  v_qr := ((v_sede->'qr'->>'activo')::boolean and 'qr' = any (v_aj.mecanismos)) or 'qr' = any (v_exc);
  v_nfc := ((v_sede->'nfc_etiqueta'->>'activo')::boolean and 'nfc' = any (v_aj.mecanismos)) or 'nfc_etiqueta' = any (v_exc);
  return jsonb_build_object(
    'celular_ubicacion', v_cel,
    'qr', v_qr,
    'nfc_etiqueta', v_nfc,
    'remoto', 'app' = any (v_aj.mecanismos) and v_aj.modalidad in ('remoto', 'hibrido'),
    'excepciones', to_jsonb(v_exc),
    'sede', v_sede,
    'preferido', case
        when v_aj.modalidad = 'remoto' and 'app' = any (v_aj.mecanismos) then 'remoto'
        when v_cel then 'ubicacion'
        when v_qr then 'qr'
        when v_nfc then 'nfc'
        else null end);
end;
$$;
revoke all on function public.fn_hr_metodos_vinculo(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_metodos_vinculo(uuid) to service_role;

-- Para Inicio (sesión del usuario): el método con el que marca la persona de la sesión.
create or replace function public.fn_hr_mi_metodo_marcacion(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_emp uuid;
  v_m jsonb;
begin
  if v_uid is null or not exists (select 1 from public.organization_members om
                                   where om.user_id = v_uid and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select e.id into v_emp
    from public.employments e
    left join public.organization_members om on om.id = e.organization_member_id
    left join public.hr_people p on p.id = e.person_id
   where e.organization_id = p_org and e.status = 'active' and (om.user_id = v_uid or p.user_id = v_uid)
   order by e.hire_date desc nulls last, e.created_at desc
   limit 1;
  if v_emp is null then
    return null;
  end if;
  v_m := public.fn_hr_metodos_vinculo(v_emp);
  return jsonb_build_object('preferido', v_m->'preferido',
                            'metodos', jsonb_build_object('ubicacion', v_m->'celular_ubicacion', 'qr', v_m->'qr',
                                                          'nfc', v_m->'nfc_etiqueta', 'remoto', v_m->'remoto'));
end;
$$;
revoke all on function public.fn_hr_mi_metodo_marcacion(integer) from public, anon;
grant execute on function public.fn_hr_mi_metodo_marcacion(integer) to authenticated, service_role;

-- 2. Núcleo único de la marca -------------------------------------------------------------
-- Lo que antes eran las últimas líneas de fn_hr_marcar: tipo por alternancia, doble toque
-- en 60 s e inserción. Lo usan fn_hr_marcar y, desde M1/M2, el kiosco y los dispositivos.
-- Nadie más lo ejecuta: el vínculo llega ya validado.
create or replace function public.fn_hr_registrar_marca(
  p_actor uuid, p_org integer, p_employment uuid, p_tipo text, p_source text, p_method text,
  p_reloj uuid, p_branch integer, p_geo jsonb, p_geo_ok boolean, p_device_info jsonb, p_modo text)
returns public.attendance_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo text := p_tipo;
  v_ult public.attendance_events;
  v_ev public.attendance_events;
begin
  select * into v_ult from public.attendance_events a
   where a.employment_id = p_employment and a.event_at > now() - interval '24 hours'
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
     geo, geo_validated, device_info, is_manual_entry, created_by, work_mode, method)
  values
    (p_org, p_branch, p_employment, v_tipo, now(), p_source, p_reloj,
     p_geo, p_geo_ok, p_device_info, false, p_actor, p_modo, p_method)
  returning * into v_ev;
  return v_ev;
end;
$$;
revoke all on function public.fn_hr_registrar_marca(uuid, integer, uuid, text, text, text, uuid, integer, jsonb, boolean, jsonb, text)
  from public, anon, authenticated, service_role;

-- 3. fn_hr_marcar: misma firma; métodos de la sede, QR de un solo uso y etiqueta NFC ---------
create or replace function public.fn_hr_marcar(p_actor uuid, p_org integer, p_datos jsonb, p_ip text default null, p_ua text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_emp public.employments;
  v_aj public.hr_attendance_settings;
  v_met jsonb;
  v_metodo text := coalesce(p_datos->>'metodo', '');
  v_tipo text := nullif(p_datos->>'tipo', '');
  v_pedido uuid;
  v_reloj public.time_clocks;
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
  v_reglas jsonb;
  v_method text;
  v_partes text[];
  v_paso bigint;
  v_paso_ahora bigint;
  v_n integer;
  v_secreto text;
  v_hash text;
  v_exigir_geo boolean := false;
  v_sede_marca integer;
begin
  if p_actor is null or p_org is null or not exists (
       select 1 from public.organization_members om
        where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_metodo not in ('qr', 'app', 'nfc') then
    raise exception 'metodo_invalido: se marca con el QR de la sede, la etiqueta NFC o desde la app' using errcode = '22023';
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
  v_met := public.fn_hr_metodos_vinculo(v_emp.id);

  -- Trabajo remoto: solo con modalidad remota o híbrida; el QR y la etiqueta son presenciales.
  if v_metodo in ('qr', 'nfc') then
    v_remoto := false;
  elsif v_aj.modalidad = 'remoto' then
    v_remoto := true;
  elsif v_remoto and v_aj.modalidad = 'presencial' then
    raise exception 'remoto_no_permitido: tu modalidad de trabajo es presencial' using errcode = '42501';
  end if;
  v_modo := case when v_remoto then 'remoto' else 'presencial' end;

  -- La sede ofrece, la ficha restringe y una excepción vigente abre (decisión del 2026-11-16).
  if v_metodo = 'app' and v_remoto then
    if not ('app' = any (v_aj.mecanismos)) then
      raise exception 'mecanismo_no_permitido: tu empresa no habilitó este mecanismo de marcación para ti' using errcode = '42501';
    end if;
  elsif not coalesce((v_met->>(case v_metodo when 'app' then 'celular_ubicacion' when 'qr' then 'qr' else 'nfc_etiqueta' end))::boolean, false) then
    if (v_metodo = 'app' and 'app' = any (v_aj.mecanismos))
       or (v_metodo = 'qr' and 'qr' = any (v_aj.mecanismos))
       or (v_metodo = 'nfc' and 'nfc' = any (v_aj.mecanismos)) then
      raise exception 'metodo_no_disponible_en_sede: tu sede no recibe marcas por este método' using errcode = '42501';
    end if;
    raise exception 'mecanismo_no_permitido: tu empresa no habilitó este mecanismo de marcación para ti' using errcode = '42501';
  end if;

  -- QR y etiqueta: el punto se valida aquí, contra la base. Nada se compara en el navegador.
  if v_metodo in ('qr', 'nfc') then
    begin
      select * into v_reloj from public.time_clocks c
       where c.id = nullif(p_datos->>'reloj_id', '')::uuid and c.organization_id = p_org;
    exception when invalid_text_representation then
      v_reloj := null;
    end;
  end if;

  if v_metodo = 'qr' then
    if v_reloj.id is null or not coalesce(v_reloj.is_active, false) or v_reloj.disabled_at is not null
       or v_reloj.type not in ('qr_static', 'qr_dynamic') or coalesce(p_datos->>'token', '') = '' then
      raise exception 'qr_invalido: el código no corresponde a un punto de marcación activo de tu organización' using errcode = '42501';
    end if;
    if v_reloj.kind = 'pantalla_qr' then
      -- Código firmado por tiempo: «paso.número.firma». Vale el paso actual y el vecino
      -- (reloj de la pantalla corrido); cada código se usa una sola vez.
      v_partes := string_to_array(p_datos->>'token', '.');
      if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[1] !~ '^[0-9]{1,12}$'
         or v_partes[2] !~ '^[0-9]{1,3}$' or v_partes[3] !~ '^[0-9a-f]{20}$' then
        raise exception 'qr_invalido: el código no corresponde a un punto de marcación activo de tu organización' using errcode = '42501';
      end if;
      v_paso := v_partes[1]::bigint;
      v_n := v_partes[2]::integer;
      v_paso_ahora := floor(extract(epoch from now()) / 30)::bigint;
      if v_paso < v_paso_ahora - 1 then
        raise exception 'qr_vencido: el código ya venció; escanea el que muestra la pantalla ahora' using errcode = '42501';
      end if;
      if v_paso > v_paso_ahora + 1 then
        raise exception 'qr_invalido: el código no corresponde a un punto de marcación activo de tu organización' using errcode = '42501';
      end if;
      select s.qr_secret into v_secreto from public.hr_clock_secrets s where s.time_clock_id = v_reloj.id;
      if v_secreto is null or left(encode(extensions.hmac(convert_to(v_reloj.id::text || '.' || v_paso || '.' || v_n, 'UTF8'),
                                                             decode(v_secreto, 'hex'), 'sha256'), 'hex'), 20) <> v_partes[3] then
        raise exception 'qr_invalido: el código no corresponde a un punto de marcación activo de tu organización' using errcode = '42501';
      end if;
      insert into public.hr_qr_usos (time_clock_id, paso, n, employment_id)
      values (v_reloj.id, v_paso, v_n, v_emp.id)
      on conflict do nothing;
      if not found then
        raise exception 'qr_usado: ese código ya se usó; escanea el siguiente que muestra la pantalla' using errcode = '42501';
      end if;
      delete from public.hr_qr_usos u where u.time_clock_id = v_reloj.id and u.paso < v_paso_ahora - 2880;
    else
      -- QR de la fase 2 (token guardado en la base): igual que antes.
      if v_reloj.current_qr_token is null or v_reloj.current_qr_token <> (p_datos->>'token') then
        raise exception 'qr_invalido: el código no corresponde a un punto de marcación activo de tu organización' using errcode = '42501';
      end if;
      if (v_reloj.type = 'qr_dynamic' and v_reloj.qr_token_expires_at is null)
         or (v_reloj.qr_token_expires_at is not null and v_reloj.qr_token_expires_at < now()) then
        raise exception 'qr_vencido: el código ya venció; escanea el que muestra la pantalla ahora' using errcode = '42501';
      end if;
    end if;
    v_reglas := public.fn_hr_metodos_sede(p_org, coalesce(v_reloj.branch_id, v_emp.branch_id))->'qr'->'reglas';
    v_exigir_geo := coalesce((v_reglas->>'exigir_ubicacion')::boolean, false);
  end if;

  if v_metodo = 'nfc' then
    if v_reloj.id is null or not coalesce(v_reloj.is_active, false) or v_reloj.disabled_at is not null
       or coalesce(v_reloj.kind, '') <> 'etiqueta_nfc' or coalesce(p_datos->>'token', '') !~ '^[A-Za-z0-9_-]{16,64}$' then
      raise exception 'etiqueta_invalida: la etiqueta no corresponde a un punto de marcación activo de tu organización' using errcode = '42501';
    end if;
    select s.tag_hash into v_hash from public.hr_clock_secrets s where s.time_clock_id = v_reloj.id;
    if v_hash is null or v_hash <> encode(extensions.digest(p_datos->>'token', 'sha256'), 'hex') then
      raise exception 'etiqueta_invalida: la etiqueta no corresponde a un punto de marcación activo de tu organización' using errcode = '42501';
    end if;
    -- La etiqueta dice en qué sede estás: debe ser la de tu vínculo o la de tu turno de hoy.
    if v_reloj.branch_id is not null and v_emp.branch_id is not null and v_reloj.branch_id <> v_emp.branch_id
       and not exists (select 1 from public.shift_assignments s
                        where s.employment_id = v_emp.id and s.branch_id = v_reloj.branch_id and not s.is_draft
                          and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
                          and s.work_date between public.fn_today_for(p_org, v_reloj.branch_id) - 1
                                              and public.fn_today_for(p_org, v_reloj.branch_id)) then
      raise exception 'etiqueta_otra_sede: %', (select b.name from public.branches b where b.id = v_reloj.branch_id)
        using errcode = '42501';
    end if;
    -- NTAG215 (y NTAG 424 DNA mientras no se verifique su código por lectura, M3): la
    -- etiqueta se puede copiar, así que la ubicación es obligatoria.
    v_exigir_geo := true;
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

  if v_metodo in ('qr', 'nfc') and (v_exigir_geo or (v_reloj.require_geo_validation and jsonb_typeof(v_reloj.geo_fence) = 'object')) then
    if not v_consent then
      raise exception 'ubicacion_requiere_consentimiento: este punto pide tu ubicación y no la has autorizado' using errcode = '42501';
    end if;
    if v_geo is null then
      raise exception 'ubicacion_requerida: este punto pide tu ubicación al marcar' using errcode = '22023';
    end if;
    if jsonb_typeof(v_reloj.geo_fence) = 'object' and v_reloj.geo_fence ? 'lat' and v_reloj.geo_fence ? 'lng' then
      v_blat := (v_reloj.geo_fence->>'lat')::numeric;
      v_blng := (v_reloj.geo_fence->>'lng')::numeric;
      v_radio := coalesce(nullif(v_reloj.geo_fence->>'radius', '')::numeric, 100);
    else
      select b.latitude, b.longitude into v_blat, v_blng
        from public.branches b where b.id = coalesce(v_reloj.branch_id, v_emp.branch_id) and b.organization_id = p_org;
      v_radio := coalesce((public.fn_hr_metodos_sede(p_org, coalesce(v_reloj.branch_id, v_emp.branch_id))
                            ->'celular_ubicacion'->'reglas'->>'radio_m')::numeric, 150);
    end if;
    if v_blat is not null and v_blng is not null then
      v_dist := 2 * 6371000 * asin(sqrt(
                  power(sin(radians((v_blat - v_lat) / 2)), 2)
                + cos(radians(v_lat)) * cos(radians(v_blat)) * power(sin(radians((v_blng - v_lng) / 2)), 2)));
      v_geo_ok := v_dist <= v_radio;
      if not v_geo_ok then
        raise exception 'fuera_de_rango: estás a % m del punto de marcación (máximo % m)', round(v_dist), round(v_radio)
          using errcode = '42501';
      end if;
    end if;
  end if;
  if not v_consent then
    v_geo := null;
    v_geo_ok := null;
  end if;

  -- App en presencial (decisiones 3 y 9 de la fase 2): la ubicación del momento se compara con la sede.
  if v_metodo = 'app' and not v_remoto then
    v_reglas := v_met->'sede'->'celular_ubicacion'->'reglas';
    select b.latitude, b.longitude into v_blat, v_blng
      from public.branches b where b.id = v_emp.branch_id and b.organization_id = p_org;
    v_radio := coalesce((v_reglas->>'radio_m')::numeric, 150);
    if v_plataforma = 'escritorio' then
      -- Desde un computador no se toma ubicación: sin QR la marca queda para el jefe,
      -- si la sede lo permite.
      if not coalesce((v_reglas->>'permitir_computador')::boolean, true) then
        raise exception 'computador_no_permitido: tu sede no recibe marcas desde un computador' using errcode = '42501';
      end if;
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

  v_method := case v_metodo when 'qr' then 'qr' when 'nfc' then 'nfc_etiqueta'
                            else case when v_remoto then 'remoto' else 'celular_ubicacion' end end;
  v_sede_marca := coalesce(v_reloj.branch_id, v_emp.branch_id);
  v_ev := public.fn_hr_registrar_marca(
    p_actor, p_org, v_emp.id, v_tipo, v_metodo, v_method, v_reloj.id, v_sede_marca,
    v_geo, case when v_revisar is not null then false else v_geo_ok end,
    jsonb_strip_nulls(jsonb_build_object('plataforma', v_plataforma,
                                         'app', left(p_datos->'dispositivo'->>'app', 40),
                                         'revisar', v_revisar,
                                         'capturada', v_capturada,
                                         'nota', v_nota)),
    v_modo);

  if v_reloj.id is not null then
    update public.time_clocks set last_seen_at = now()
     where id = v_reloj.id and v_reloj.kind = 'etiqueta_nfc';
  end if;

  return jsonb_build_object('evento_id', v_ev.id, 'tipo', v_ev.event_type, 'hora', v_ev.event_at,
                            'fecha_trabajo', v_ev.work_date, 'employment_id', v_emp.id, 'modo', v_modo,
                            'ubicacion_guardada', v_ev.geo is not null, 'reloj', v_reloj.name,
                            'distancia_m', case when v_geo_ok then round(v_dist) end, 'revisar', v_revisar,
                            'metodo', v_method);
end;
$function$;
revoke all on function public.fn_hr_marcar(uuid, integer, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_marcar(uuid, integer, jsonb, text, text) to service_role;

-- 4. Intentos rechazados ------------------------------------------------------------------
-- fn_hr_marcar lanza el error y su transacción se deshace: el servidor registra el
-- intento después, con esta función. Límite de 60 por persona y hora; 90 días de vida.
create or replace function public.fn_hr_marcacion_intento(p_actor uuid, p_org integer, p_datos jsonb, p_motivo text, p_detalle jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp public.employments;
  v_reloj uuid;
  v_metodo text;
begin
  if p_actor is null or p_org is null or coalesce(p_motivo, '') !~ '^[a-z_]{3,60}$' or not exists (
       select 1 from public.organization_members om
        where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    return;
  end if;
  select e.* into v_emp
    from public.employments e
    left join public.organization_members om on om.id = e.organization_member_id
    left join public.hr_people p on p.id = e.person_id
   where e.organization_id = p_org and e.status = 'active' and (om.user_id = p_actor or p.user_id = p_actor)
   order by e.hire_date desc nulls last, e.created_at desc
   limit 1;
  if v_emp.id is null then
    return;
  end if;
  if (select count(*) from public.hr_marcacion_intentos i
       where i.employment_id = v_emp.id and i.created_at > now() - interval '1 hour') >= 60 then
    return;
  end if;
  begin
    select c.id into v_reloj from public.time_clocks c
     where c.id = nullif(p_datos->>'reloj_id', '')::uuid and c.organization_id = p_org;
  exception when invalid_text_representation then
    v_reloj := null;
  end;
  v_metodo := case p_datos->>'metodo' when 'qr' then 'qr' when 'nfc' then 'nfc_etiqueta'
                when 'app' then case when coalesce((p_datos->>'remoto')::boolean, false) then 'remoto' else 'celular_ubicacion' end
                else 'desconocido' end;
  insert into public.hr_marcacion_intentos (organization_id, employment_id, branch_id, time_clock_id, metodo, motivo, detalle)
  values (p_org, v_emp.id, coalesce((select c.branch_id from public.time_clocks c where c.id = v_reloj), v_emp.branch_id),
          v_reloj, v_metodo, p_motivo,
          jsonb_strip_nulls(jsonb_build_object(
            'distancia_m', case when (p_detalle->>'distancia_m') ~ '^[0-9]{1,7}$' then (p_detalle->>'distancia_m')::integer end,
            'plataforma', left(p_datos->'dispositivo'->>'plataforma', 40))));
  delete from public.hr_marcacion_intentos i where i.organization_id = p_org and i.created_at < now() - interval '90 days';
end;
$$;
revoke all on function public.fn_hr_marcacion_intento(uuid, integer, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_marcacion_intento(uuid, integer, jsonb, text, jsonb) to service_role;

-- 5. Estado de «Marcar turno»: lo de antes y los métodos de la sede ------------------------
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
  v_met jsonb;
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
  v_met := public.fn_hr_metodos_vinculo(v_emp.id);
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
                                       'radio_m', coalesce((v_met->'sede'->'celular_ubicacion'->'reglas'->>'radio_m')::numeric, 150))
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
               from public.employments j where j.id = v_emp.manager_id),
    -- Marcación M0 (Figma 20.30): lo que ofrece la sede para esta persona.
    'metodos_sede', jsonb_build_object(
               'ubicacion', (v_met->>'celular_ubicacion')::boolean,
               'qr', (v_met->>'qr')::boolean,
               'nfc', (v_met->>'nfc_etiqueta')::boolean),
    'metodo_preferido', v_met->'preferido',
    'reglas', jsonb_build_object(
               'qr_exige_ubicacion', coalesce((v_met->'sede'->'qr'->'reglas'->>'exigir_ubicacion')::boolean, false),
               'nfc_exige_ubicacion', true,
               'permitir_computador', coalesce((v_met->'sede'->'celular_ubicacion'->'reglas'->>'permitir_computador')::boolean, true)),
    'excepciones', coalesce((select jsonb_agg(jsonb_build_object('metodo', x.metodo, 'hasta', x.vigente_hasta) order by x.vigente_hasta)
                               from public.hr_marcacion_excepciones x
                              where x.employment_id = v_emp.id and x.revocada_at is null
                                and x.vigente_desde <= now() and x.vigente_hasta > now()), '[]'::jsonb));
end;
$function$;
