-- HRM · Marcación M1 · paso 2: funciones del kiosco y del lector de carnés.
-- Plan: docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md §4.3, §4.5, §5.2, §5.3, §6.2 y §7.
--
-- Flujo del kiosco (Figma 20.29):
--   tablet sin vincular → fn_hr_kiosco_codigo (código de 6 caracteres, 10 min)
--   RR. HH. escribe el código → fn_hr_kiosco_vincular (punto kiosco o lector_escritorio)
--   cada petición del equipo → fn_hr_kiosco_equipo (la organización sale del equipo)
--   PIN o carné → fn_hr_kiosco_identificar (bloqueo, foto según autorización)
--   marca → fn_hr_marcar_kiosco (lote idempotente por id_local; sin conexión conserva su hora)
--   foto → fn_hr_kiosco_foto_guardada (retención por sede; la tarea diaria la borra)
-- Todas terminan en fn_hr_registrar_marca_en: el mismo núcleo de fn_hr_marcar (regla 7).
-- Las del equipo y las internas no tienen EXECUTE para anon ni authenticated.

create or replace function pg_temp.fn_parchar(p_fn regprocedure, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $$
declare
  v text := pg_get_functiondef(p_fn);
begin
  if position(p_viejo in v) = 0 then
    raise exception 'parche_no_aplica: % no tiene el fragmento esperado', p_fn;
  end if;
  execute replace(v, p_viejo, p_nuevo);
end;
$$;

-- 1. Núcleo de la marca con hora propia ------------------------------------------------------
-- Igual a fn_hr_registrar_marca, más la hora de la marca (la del kiosco sin conexión,
-- ya validada), la hora que reportó el equipo y el evento de la bandeja. La alternancia
-- y el doble toque se miden contra esa hora.
create or replace function public.fn_hr_registrar_marca_en(
  p_actor uuid, p_org integer, p_employment uuid, p_tipo text, p_source text, p_method text,
  p_reloj uuid, p_branch integer, p_geo jsonb, p_geo_ok boolean, p_device_info jsonb, p_modo text,
  p_hora timestamptz, p_device_time timestamptz, p_raw uuid)
returns public.attendance_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hora timestamptz := coalesce(p_hora, now());
  v_tipo text := p_tipo;
  v_ult public.attendance_events;
  v_ev public.attendance_events;
begin
  select * into v_ult from public.attendance_events a
   where a.employment_id = p_employment and a.event_at > v_hora - interval '24 hours'
     and (p_hora is null or a.event_at <= v_hora)
   order by a.event_at desc, a.created_at desc
   limit 1;
  if v_tipo is null then
    v_tipo := case when v_ult.id is null or v_ult.event_type = 'check_out' then 'check_in'
                   when v_ult.event_type = 'break_start' then 'break_end'
                   else 'check_out' end;
  elsif v_tipo not in ('check_in', 'check_out', 'break_start', 'break_end') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_ult.id is not null and v_ult.event_type = v_tipo and v_ult.event_at > v_hora - interval '60 seconds' then
    raise exception 'marcacion_duplicada: ya registraste esta marcación hace menos de un minuto' using errcode = '55000';
  end if;

  insert into public.attendance_events
    (organization_id, branch_id, employment_id, event_type, event_at, source, time_clock_id,
     geo, geo_validated, device_info, is_manual_entry, created_by, work_mode, method, device_time, raw_event_id)
  values
    (p_org, p_branch, p_employment, v_tipo, v_hora, p_source, p_reloj,
     p_geo, p_geo_ok, p_device_info, false, p_actor, p_modo, p_method, p_device_time, p_raw)
  returning * into v_ev;
  return v_ev;
end;
$$;
revoke all on function public.fn_hr_registrar_marca_en(uuid, integer, uuid, text, text, text, uuid, integer, jsonb, boolean, jsonb, text, timestamptz, timestamptz, uuid)
  from public, anon, authenticated, service_role;

-- fn_hr_registrar_marca conserva firma y comportamiento: delega con la hora del servidor.
create or replace function public.fn_hr_registrar_marca(
  p_actor uuid, p_org integer, p_employment uuid, p_tipo text, p_source text, p_method text,
  p_reloj uuid, p_branch integer, p_geo jsonb, p_geo_ok boolean, p_device_info jsonb, p_modo text)
returns public.attendance_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.fn_hr_registrar_marca_en(p_actor, p_org, p_employment, p_tipo, p_source, p_method,
                                          p_reloj, p_branch, p_geo, p_geo_ok, p_device_info, p_modo,
                                          null, null, null);
end;
$$;
revoke all on function public.fn_hr_registrar_marca(uuid, integer, uuid, text, text, text, uuid, integer, jsonb, boolean, jsonb, text)
  from public, anon, authenticated, service_role;

-- 2. Métodos de la sede: vocabulario del plan («carne») y reglas del kiosco -------------------
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
            ('carne', false, jsonb_build_object('foto', true)),
            ('pin', false, jsonb_build_object('foto', true, 'largo', 6, 'intentos', 5, 'bloqueo_min', 15)),
            ('rostro', false, '{}'::jsonb),
            ('huella', false, '{}'::jsonb)) as d(metodo, por_defecto, reglas)
    left join public.hr_branch_clock_methods c
      on c.branch_id = p_branch and c.organization_id = p_org and c.method = d.metodo;
$$;

-- 3. Utilidades internas ---------------------------------------------------------------------
create or replace function public.fn_hr_marcacion_pepper(p_org integer)
returns bytea
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  select k.pepper into v from public.hr_marcacion_claves k where k.organization_id = p_org;
  if v is null then
    insert into public.hr_marcacion_claves (organization_id, pepper)
    values (p_org, encode(extensions.gen_random_bytes(32), 'hex'))
    on conflict (organization_id) do nothing;
    select k.pepper into v from public.hr_marcacion_claves k where k.organization_id = p_org;
  end if;
  return decode(v, 'hex');
end;
$$;
revoke all on function public.fn_hr_marcacion_pepper(integer) from public, anon, authenticated, service_role;

-- HMAC que identifica un PIN o un carné dentro de la organización.
create or replace function public.fn_hr_credencial_lookup(p_pepper bytea, p_kind text, p_valor text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(extensions.hmac(convert_to(p_kind || ':' || p_valor, 'UTF8'), p_pepper, 'sha256'), 'hex');
$$;
revoke all on function public.fn_hr_credencial_lookup(bytea, text, text) from public, anon, authenticated, service_role;

-- Forma canónica del valor de un carné (UID NFC o código del QR): mayúsculas, sin separadores.
create or replace function public.fn_hr_carne_normalizar(p_valor text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when v ~ '^[0-9A-Z]{4,40}$' then v end
    from (select upper(regexp_replace(coalesce(p_valor, ''), '[^0-9A-Za-z]', '', 'g')) as v) x;
$$;
revoke all on function public.fn_hr_carne_normalizar(text) from public, anon, authenticated;
grant execute on function public.fn_hr_carne_normalizar(text) to service_role;

-- Autorización vigente de un tipo (la última decisión que lo incluye).
create or replace function public.fn_hr_marcacion_autorizada(p_employment uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select c.granted from public.hr_marcacion_consents c
                    where c.employment_id = p_employment and p_kind = any (c.kinds)
                    order by c.created_at desc, c.id desc limit 1), false);
$$;
revoke all on function public.fn_hr_marcacion_autorizada(uuid, text) from public, anon, authenticated, service_role;

-- Días de la foto en la sede.
create or replace function public.fn_hr_foto_dias(p_branch integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select a.foto_dias from public.hr_branch_marcacion_ajustes a where a.branch_id = p_branch), 30)::integer;
$$;
revoke all on function public.fn_hr_foto_dias(integer) from public, anon, authenticated, service_role;

-- Usuario de la plataforma de un vínculo (para registrar quién desbloquea).
create or replace function public.fn_hr_usuario_del_vinculo(p_employment uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(om.user_id, p.user_id)
    from public.employments e
    left join public.organization_members om on om.id = e.organization_member_id
    left join public.hr_people p on p.id = e.person_id
   where e.id = p_employment;
$$;
revoke all on function public.fn_hr_usuario_del_vinculo(uuid) from public, anon, authenticated, service_role;

-- 4. Vinculación del equipo (Figma 20.29.7 y 20.28.3) -----------------------------------------
-- La tablet genera su clave, manda el SHA-256 y recibe un código. Mientras no se
-- vincule, vuelve a preguntar con el mismo hash y recibe el mismo código (o uno nuevo
-- si venció). Límite: 20 códigos por IP cada 10 min (además del límite de la ruta).
create or replace function public.fn_hr_kiosco_codigo(p_key_hash text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet;
  v_p public.hr_kiosk_pairings;
  v_codigo text;
  v_bytes bytea;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
  v_intento integer := 0;
begin
  if coalesce(p_key_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'llave_invalida' using errcode = '22023';
  end if;
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  update public.hr_kiosk_pairings set status = 'vencido' where status = 'pendiente' and expires_at < now();
  delete from public.hr_kiosk_pairings where created_at < now() - interval '1 day';

  if exists (select 1 from public.hr_clock_secrets s where s.device_key_hash = p_key_hash) then
    return jsonb_build_object('estado', 'vinculado');
  end if;
  select * into v_p from public.hr_kiosk_pairings p where p.key_hash = p_key_hash;
  if v_p.id is not null and v_p.status = 'pendiente' then
    return jsonb_build_object('estado', 'pendiente', 'codigo', v_p.code, 'vence', v_p.expires_at);
  end if;
  if v_p.id is not null and v_p.status = 'vinculado' then
    -- Vinculado y luego revocado: la clave ya no sirve; la tablet debe generar otra.
    return jsonb_build_object('estado', 'revocado');
  end if;
  if v_ip is not null and (select count(*) from public.hr_kiosk_pairings p
                            where p.ip = v_ip and p.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'demasiados_codigos: espera unos minutos' using errcode = '55000';
  end if;

  loop
    v_intento := v_intento + 1;
    v_bytes := extensions.gen_random_bytes(6);
    v_codigo := '';
    for i in 0..5 loop
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    begin
      if v_p.id is not null then
        update public.hr_kiosk_pairings
           set code = v_codigo, status = 'pendiente', created_at = now(), expires_at = now() + interval '10 minutes', ip = v_ip
         where id = v_p.id
        returning * into v_p;
      else
        insert into public.hr_kiosk_pairings (code, key_hash, ip) values (v_codigo, p_key_hash, v_ip)
        returning * into v_p;
      end if;
      exit;
    exception when unique_violation then
      if v_intento >= 8 then
        raise;
      end if;
    end;
  end loop;
  return jsonb_build_object('estado', 'pendiente', 'codigo', v_p.code, 'vence', v_p.expires_at);
end;
$$;
revoke all on function public.fn_hr_kiosco_codigo(text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_codigo(text, text) to service_role;

-- RR. HH. escribe el código: nace el punto (o se vuelve a vincular uno existente).
create or replace function public.fn_hr_kiosco_vincular(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text := upper(regexp_replace(coalesce(p_datos->>'codigo', ''), '[^0-9A-Za-z]', '', 'g'));
  v_tipo text := coalesce(p_datos->>'tipo', 'kiosco');
  v_nombre text := btrim(coalesce(p_datos->>'nombre', ''));
  v_desc text := nullif(btrim(coalesce(p_datos->>'descripcion', '')), '');
  v_sede integer;
  v_reloj uuid;
  v_p public.hr_kiosk_pairings;
  c public.time_clocks;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_codigo !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'codigo_invalido: el código tiene 6 letras y números' using errcode = '22023';
  end if;
  select * into v_p from public.hr_kiosk_pairings p
   where p.code = v_codigo and p.status = 'pendiente' and p.expires_at > now()
   for update;
  if v_p.id is null then
    raise exception 'codigo_invalido: el código no existe o ya venció; la tablet muestra uno nuevo' using errcode = '22023';
  end if;

  if nullif(p_datos->>'reloj_id', '') is not null then
    -- Vincular de nuevo un kiosco o lector que perdió su clave.
    begin
      v_reloj := (p_datos->>'reloj_id')::uuid;
    exception when others then
      v_reloj := null;
    end;
    select * into c from public.time_clocks t where t.id = v_reloj and t.organization_id = p_org for update;
    if c.id is null or c.kind not in ('kiosco', 'lector_escritorio') then
      raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
    end if;
    update public.time_clocks set is_active = true, disabled_at = null, paired_at = now(), updated_at = now()
     where id = c.id;
    insert into public.hr_clock_secrets (time_clock_id, organization_id, device_key_hash, key_rotated_at, qr_secret)
    values (c.id, p_org, v_p.key_hash, now(), case when c.kind = 'kiosco' then encode(extensions.gen_random_bytes(32), 'hex') end)
    on conflict (time_clock_id) do update
      set device_key_hash = excluded.device_key_hash, key_rotated_at = now(), key_revoked_at = null,
          qr_secret = coalesce(public.hr_clock_secrets.qr_secret, excluded.qr_secret),
          pin_fallos = 0, pin_fallos_desde = null, pin_bloqueado_hasta = null, sup_fallos = 0, sup_fallos_desde = null;
  else
    if v_tipo not in ('kiosco', 'lector_escritorio') then
      raise exception 'tipo_no_disponible' using errcode = '22023';
    end if;
    if char_length(v_nombre) not between 2 and 80 then
      raise exception 'nombre_invalido: de 2 a 80 caracteres' using errcode = '22023';
    end if;
    if v_desc is not null and char_length(v_desc) > 200 then
      raise exception 'descripcion_invalida: hasta 200 caracteres' using errcode = '22023';
    end if;
    begin
      v_sede := (p_datos->>'sede_id')::integer;
    exception when others then
      v_sede := null;
    end;
    if v_sede is null or not exists (select 1 from public.branches b where b.id = v_sede and b.organization_id = p_org) then
      raise exception 'sede_invalida' using errcode = '22023';
    end if;
    insert into public.time_clocks (organization_id, branch_id, name, type, kind, protocol, location_description,
                                    settings, is_active, paired_at)
    values (p_org, v_sede, v_nombre, case v_tipo when 'kiosco' then 'qr_dynamic' else 'rfid' end, v_tipo,
            case v_tipo when 'kiosco' then 'kiosco' else 'escritorio' end, v_desc, '{}'::jsonb, true, now())
    returning * into c;
    insert into public.hr_clock_secrets (time_clock_id, organization_id, device_key_hash, key_rotated_at, qr_secret)
    values (c.id, p_org, v_p.key_hash, now(), case when v_tipo = 'kiosco' then encode(extensions.gen_random_bytes(32), 'hex') end);
  end if;

  update public.hr_kiosk_pairings
     set status = 'vinculado', organization_id = p_org, time_clock_id = c.id, claimed_by = p_actor, claimed_at = now()
   where id = v_p.id;
  return jsonb_build_object('id', c.id, 'tipo', c.kind, 'nombre', c.name);
end;
$$;
revoke all on function public.fn_hr_kiosco_vincular(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_vincular(uuid, integer, jsonb) to service_role;

-- Revocar la clave (tablet perdida o cambiada): el equipo deja de marcar al instante.
create or replace function public.fn_hr_kiosco_revocar(p_actor uuid, p_org integer, p_reloj uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into c from public.time_clocks t where t.id = p_reloj and t.organization_id = p_org;
  if c.id is null or c.kind not in ('kiosco', 'lector_escritorio') then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  update public.hr_clock_secrets set device_key_hash = null, key_revoked_at = now() where time_clock_id = c.id;
  update public.time_clocks set updated_at = now() where id = c.id;
  return jsonb_build_object('id', c.id, 'revocada', true);
end;
$$;
revoke all on function public.fn_hr_kiosco_revocar(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_revocar(uuid, integer, uuid) to service_role;

-- 5. Autenticación del equipo y configuración -------------------------------------------------
-- La organización, la sede y el tipo salen del equipo registrado (regla 5 para equipos).
create or replace function public.fn_hr_kiosco_equipo(p_key_hash text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
  v_ip inet;
begin
  if coalesce(p_key_hash, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select t.* into c
    from public.hr_clock_secrets s join public.time_clocks t on t.id = s.time_clock_id
   where s.device_key_hash = p_key_hash and s.organization_id = t.organization_id
     and t.kind in ('kiosco', 'lector_escritorio') and coalesce(t.is_active, false) and t.disabled_at is null;
  if c.id is null then
    return null;
  end if;
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  if c.last_seen_at is null or c.last_seen_at < now() - interval '30 seconds' or c.last_ip is distinct from v_ip then
    update public.time_clocks set last_seen_at = now(), last_ip = coalesce(v_ip, last_ip) where id = c.id;
  end if;
  return jsonb_build_object('reloj_id', c.id, 'org', c.organization_id, 'sede_id', c.branch_id, 'tipo', c.kind);
end;
$$;
revoke all on function public.fn_hr_kiosco_equipo(text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_equipo(text, text) to service_role;

create or replace function public.fn_hr_kiosco_config(p_reloj uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
  s public.hr_clock_secrets;
  v_sede jsonb;
  v_qr boolean;
begin
  select * into c from public.time_clocks t where t.id = p_reloj and t.kind in ('kiosco', 'lector_escritorio');
  if c.id is null then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  select * into s from public.hr_clock_secrets x where x.time_clock_id = c.id;
  v_sede := public.fn_hr_metodos_sede(c.organization_id, c.branch_id);
  v_qr := c.kind = 'kiosco' and coalesce((v_sede->'qr'->>'activo')::boolean, false) and s.qr_secret is not null;
  return jsonb_build_object(
    'reloj_id', c.id, 'org', c.organization_id, 'tipo', c.kind, 'nombre', c.name,
    'organizacion', (select o.name from public.organizations o where o.id = c.organization_id),
    'sede', (select b.name from public.branches b where b.id = c.branch_id),
    'zona', public.fn_timezone_for(c.organization_id, c.branch_id),
    'ahora', now(),
    'metodos', jsonb_build_object(
       'qr', v_qr,
       'pin', coalesce((v_sede->'pin'->>'activo')::boolean, false),
       'carne', coalesce((v_sede->'carne'->>'activo')::boolean, false)),
    'foto', jsonb_build_object(
       'pin', coalesce((v_sede->'pin'->'reglas'->>'foto')::boolean, true),
       'carne', coalesce((v_sede->'carne'->'reglas'->>'foto')::boolean, true),
       'dias', public.fn_hr_foto_dias(c.branch_id)),
    'pin', jsonb_build_object('largo', 6, 'intentos', 5, 'bloqueo_min', 15),
    'bloqueado_hasta', case when s.pin_bloqueado_hasta > now() then s.pin_bloqueado_hasta end,
    'qr', case when v_qr then jsonb_build_object('clave', s.qr_secret, 'segundos', 30) end);
end;
$$;
revoke all on function public.fn_hr_kiosco_config(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_config(uuid) to service_role;

-- Códigos del QR del kiosco ya usados en el paso (la pantalla pasa al siguiente).
create or replace function public.fn_hr_kiosco_qr_usos(p_reloj uuid, p_paso bigint)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('paso', p_paso,
                            'usado_hasta', (select max(u.code_n) from public.hr_qr_codes_used u
                                             where u.time_clock_id = p_reloj and u.time_step = p_paso),
                            'ahora', now());
$$;
revoke all on function public.fn_hr_kiosco_qr_usos(uuid, bigint) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_qr_usos(uuid, bigint) to service_role;

-- El QR que muestra el kiosco es el mismo de la pantalla de QR (TOTP de 30 s, un solo uso).
select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$    if v_reloj.kind = 'pantalla_qr' then$a$,
$a$    if v_reloj.kind in ('pantalla_qr', 'kiosco') then$a$);

-- 6. Identificación con PIN o carné (Figma 20.29.2, 20.29.5, 20.29.8) ------------------------
-- Interna. p_contar = true en el kiosco en vivo: cuenta los intentos fallidos del equipo
-- (5 seguidos en 15 min → teclado bloqueado 15 min) y, si el PIN equivocado difiere en un
-- solo dígito del PIN de UNA persona, también los de esa persona (5 → su PIN bloqueado
-- 15 min o hasta que un supervisor lo desbloquee). Sin conexión (p_contar = false) no
-- cuenta ni bloquea: la marca llega después y la persona ya no está frente a la tablet.
create or replace function public.fn_hr_kiosco_resolver(p_reloj uuid, p_cred jsonb, p_contar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
  s public.hr_clock_secrets;
  v_tipo text := coalesce(p_cred->>'tipo', '');
  v_valor text := coalesce(p_cred->>'valor', '');
  v_pep bytea;
  v_cred public.hr_credentials;
  v_emp public.employments;
  v_sede jsonb;
  v_metodo text;
  v_cerca uuid[];
  v_var text;
  v_hoy date;
  v_mec text[];
  v_restantes integer;
  i integer;
  d integer;
begin
  select * into c from public.time_clocks t where t.id = p_reloj;
  if c.id is null then
    return jsonb_build_object('estado', 'equipo_invalido');
  end if;
  if v_tipo = 'pin' then
    v_metodo := 'pin';
  elsif v_tipo in ('carne_nfc', 'carne_qr') then
    v_metodo := 'carne';
    v_valor := public.fn_hr_carne_normalizar(v_valor);
    if v_valor is null then
      return jsonb_build_object('estado', 'carne_desconocido');
    end if;
  else
    return jsonb_build_object('estado', 'credencial_invalida');
  end if;

  if v_tipo = 'pin' and p_contar then
    select * into s from public.hr_clock_secrets x where x.time_clock_id = c.id for update;
    if s.pin_bloqueado_hasta > now() then
      return jsonb_build_object('estado', 'kiosco_bloqueado', 'hasta', s.pin_bloqueado_hasta);
    end if;
  end if;

  v_pep := public.fn_hr_marcacion_pepper(c.organization_id);
  if v_tipo <> 'pin' or v_valor ~ '^[0-9]{6}$' then
    select * into v_cred from public.hr_credentials k
     where k.organization_id = c.organization_id and k.kind = v_tipo and k.revoked_at is null
       and k.lookup_hash = public.fn_hr_credencial_lookup(v_pep, v_tipo, v_valor)
     for update;
    if v_tipo = 'pin' and v_cred.id is not null and v_cred.secret_hash <> extensions.crypt(v_valor, v_cred.secret_hash) then
      v_cred := null;
    end if;
  end if;

  if v_cred.id is null then
    if v_tipo <> 'pin' then
      return jsonb_build_object('estado', 'carne_desconocido');
    end if;
    if not p_contar then
      return jsonb_build_object('estado', 'pin_incorrecto');
    end if;
    -- Contador del equipo (ventana de 15 min).
    if s.pin_fallos_desde is null or s.pin_fallos_desde < now() - interval '15 minutes' then
      s.pin_fallos := 0;
      s.pin_fallos_desde := now();
    end if;
    s.pin_fallos := s.pin_fallos + 1;
    -- ¿Se equivocó en un dígito del PIN de una sola persona?
    if v_valor ~ '^[0-9]{6}$' then
      v_cerca := '{}';
      for i in 1..6 loop
        for d in 0..9 loop
          v_var := overlay(v_valor placing d::text from i for 1);
          continue when v_var = v_valor;
          v_cerca := v_cerca || array(select k.id from public.hr_credentials k
                                       where k.organization_id = c.organization_id and k.kind = 'pin' and k.revoked_at is null
                                         and k.lookup_hash = public.fn_hr_credencial_lookup(v_pep, 'pin', v_var));
        end loop;
      end loop;
      if cardinality(v_cerca) = 1 then
        update public.hr_credentials k
           set failed_attempts = k.failed_attempts + 1,
               locked_until = case when k.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else k.locked_until end
         where k.id = v_cerca[1]
        returning * into v_cred;
      end if;
    end if;
    if s.pin_fallos >= 5 then
      update public.hr_clock_secrets set pin_fallos = 0, pin_fallos_desde = null, pin_bloqueado_hasta = now() + interval '15 minutes'
       where time_clock_id = c.id;
      return jsonb_build_object('estado', 'kiosco_bloqueado', 'hasta', now() + interval '15 minutes',
                                'credencial_id', v_cred.id, 'vinculo_id', v_cred.employment_id);
    end if;
    update public.hr_clock_secrets set pin_fallos = s.pin_fallos, pin_fallos_desde = s.pin_fallos_desde where time_clock_id = c.id;
    if v_cred.id is not null and v_cred.locked_until > now() then
      return jsonb_build_object('estado', 'pin_bloqueado', 'hasta', v_cred.locked_until, 'credencial_id', v_cred.id,
                                'vinculo_id', v_cred.employment_id);
    end if;
    v_restantes := 5 - greatest(s.pin_fallos, coalesce(v_cred.failed_attempts, 0));
    return jsonb_build_object('estado', 'pin_incorrecto', 'restantes', greatest(v_restantes, 1),
                              'vinculo_id', v_cred.employment_id);
  end if;

  select * into v_emp from public.employments e where e.id = v_cred.employment_id;
  if v_emp.id is null or v_emp.status <> 'active' or v_emp.organization_id <> c.organization_id then
    return jsonb_build_object('estado', 'sin_vinculo');
  end if;
  if p_contar and v_tipo = 'pin' and v_cred.locked_until > now() then
    return jsonb_build_object('estado', 'pin_bloqueado', 'hasta', v_cred.locked_until, 'credencial_id', v_cred.id,
                              'vinculo_id', v_emp.id, 'nombre', public.fn_hr_nombre_persona(v_emp.person_id));
  end if;

  -- La sede del kiosco debe ser la del vínculo o la de su turno de hoy (como la etiqueta NFC).
  v_hoy := public.fn_today_for(c.organization_id, c.branch_id);
  if c.branch_id is not null and v_emp.branch_id is not null and c.branch_id <> v_emp.branch_id
     and not exists (select 1 from public.shift_assignments sa
                      where sa.employment_id = v_emp.id and sa.branch_id = c.branch_id and not sa.is_draft
                        and coalesce(sa.status, 'scheduled') not in ('cancelled', 'swapped')
                        and sa.work_date between v_hoy - 1 and v_hoy) then
    return jsonb_build_object('estado', 'otra_sede', 'vinculo_id', v_emp.id);
  end if;
  -- Método: la sede lo ofrece o RR. HH. abrió una excepción vigente para la persona.
  v_sede := public.fn_hr_metodos_sede(c.organization_id, c.branch_id);
  if not coalesce((v_sede->v_metodo->>'activo')::boolean, false)
     and not exists (select 1 from public.hr_clock_method_exceptions x
                      where x.employment_id = v_emp.id and x.method = v_metodo and x.status = 'aprobada'
                        and x.revoked_at is null and v_hoy between x.valid_from and x.valid_to) then
    return jsonb_build_object('estado', 'metodo_no_disponible', 'vinculo_id', v_emp.id);
  end if;
  v_mec := (public.fn_hr_ajustes_asistencia(v_emp.id)).mecanismos;
  if 'sin_marcacion' = any (v_mec) then
    return jsonb_build_object('estado', 'sin_marcacion', 'vinculo_id', v_emp.id);
  end if;

  if p_contar then
    update public.hr_credentials set failed_attempts = 0 where id = v_cred.id and failed_attempts > 0;
    if v_tipo = 'pin' then
      update public.hr_clock_secrets set pin_fallos = 0, pin_fallos_desde = null where time_clock_id = c.id and pin_fallos > 0;
    end if;
  end if;
  return jsonb_build_object(
    'estado', 'ok', 'credencial_id', v_cred.id, 'vinculo_id', v_emp.id, 'metodo', v_tipo,
    'bloqueada', v_cred.locked_until > now(),
    'nombre', public.fn_hr_nombre_persona(v_emp.person_id),
    'foto', public.fn_hr_marcacion_autorizada(v_emp.id, 'foto_evidencia')
            and coalesce((v_sede->v_metodo->'reglas'->>'foto')::boolean, true));
end;
$$;
revoke all on function public.fn_hr_kiosco_resolver(uuid, jsonb, boolean) from public, anon, authenticated, service_role;

-- Intento rechazado en un equipo (En vivo, «Rechazada»). Tope de 200 por equipo y hora.
create or replace function public.fn_hr_kiosco_intento(p_reloj uuid, p_metodo text, p_motivo text, p_vinculo uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
begin
  if coalesce(p_motivo, '') !~ '^[a-z_]{3,60}$' or p_metodo not in ('pin', 'carne_nfc', 'carne_qr') then
    return;
  end if;
  select * into c from public.time_clocks t where t.id = p_reloj;
  if c.id is null or (select count(*) from public.hr_marcacion_intentos i
                       where i.time_clock_id = c.id and i.created_at > now() - interval '1 hour') >= 200 then
    return;
  end if;
  insert into public.hr_marcacion_intentos (organization_id, employment_id, branch_id, time_clock_id, metodo, motivo, detalle)
  values (c.organization_id,
          (select e.id from public.employments e where e.id = p_vinculo and e.organization_id = c.organization_id),
          c.branch_id, c.id, p_metodo, p_motivo, jsonb_build_object('plataforma', c.kind));
end;
$$;
revoke all on function public.fn_hr_kiosco_intento(uuid, text, text, uuid) from public, anon, authenticated, service_role;

-- Turno de hoy y tipo que toca (para «¡Entrada registrada, Carolina!» y su turno).
create or replace function public.fn_hr_kiosco_persona(p_reloj uuid, p_employment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
  v_emp public.employments;
  v_ult public.attendance_events;
  v_turno public.shift_assignments;
  v_hoy date;
  v_nombre text;
begin
  select * into c from public.time_clocks t where t.id = p_reloj;
  select * into v_emp from public.employments e where e.id = p_employment and e.organization_id = c.organization_id;
  if v_emp.id is null then
    return null;
  end if;
  v_hoy := public.fn_today_for(c.organization_id, c.branch_id);
  select * into v_ult from public.attendance_events a
   where a.employment_id = v_emp.id and a.event_at > now() - interval '24 hours'
   order by a.event_at desc, a.created_at desc limit 1;
  select * into v_turno from public.shift_assignments sa
   where sa.employment_id = v_emp.id and not sa.is_draft and not sa.is_rest_day
     and coalesce(sa.status, 'scheduled') not in ('cancelled', 'swapped') and sa.work_date = v_hoy
   order by sa.start_at nulls last limit 1;
  v_nombre := public.fn_hr_nombre_persona(v_emp.person_id);
  return jsonb_build_object(
    'nombre', v_nombre,
    'primer_nombre', (select coalesce(nullif(p.preferred_name, ''), split_part(p.first_name, ' ', 1)) from public.hr_people p where p.id = v_emp.person_id),
    'siguiente', case when v_ult.id is null or v_ult.event_type = 'check_out' then 'check_in'
                      when v_ult.event_type = 'break_start' then 'break_end' else 'check_out' end,
    'turno', case when v_turno.id is null then null
                  else jsonb_build_object('inicio', v_turno.start_at, 'fin', v_turno.end_at) end);
end;
$$;
revoke all on function public.fn_hr_kiosco_persona(uuid, uuid) from public, anon, authenticated, service_role;

-- Paso 1 del kiosco en vivo: identifica y deja la marca «identificada» en la bandeja.
create or replace function public.fn_hr_kiosco_identificar(p_reloj uuid, p_local uuid, p_cred jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
  v_r jsonb;
  v_raw public.hr_clock_raw_events;
  v_emp uuid;
begin
  select * into c from public.time_clocks t
   where t.id = p_reloj and t.kind in ('kiosco', 'lector_escritorio') and coalesce(t.is_active, false) and t.disabled_at is null;
  if c.id is null then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  if p_local is null then
    raise exception 'id_local_invalido' using errcode = '22023';
  end if;
  select * into v_raw from public.hr_clock_raw_events r where r.time_clock_id = c.id and r.local_id = p_local;
  if v_raw.id is not null and v_raw.status <> 'identificada' then
    return jsonb_build_object('estado', 'repetida', 'evento_id', v_raw.attendance_event_id);
  end if;

  v_r := public.fn_hr_kiosco_resolver(c.id, p_cred, true);
  if v_r->>'estado' <> 'ok' then
    perform public.fn_hr_kiosco_intento(c.id, p_cred->>'tipo', v_r->>'estado', nullif(v_r->>'vinculo_id', '')::uuid);
    -- Hacia la tablet: nunca el vínculo, y la credencial solo si el PIN era el correcto
    -- (persona bloqueada que escribió bien su PIN, Figma 20.29.9): un PIN equivocado no
    -- debe revelar que se parecía al de alguien.
    if v_r ? 'nombre' then
      return v_r - 'vinculo_id';
    end if;
    if v_r->>'estado' = 'pin_bloqueado' then
      return jsonb_build_object('estado', 'pin_incorrecto', 'restantes', 1);
    end if;
    return v_r - 'vinculo_id' - 'credencial_id';
  end if;
  v_emp := (v_r->>'vinculo_id')::uuid;

  insert into public.hr_clock_raw_events (organization_id, time_clock_id, local_id, verify_mode, employment_id, status, raw)
  values (c.organization_id, c.id, p_local, v_r->>'metodo', v_emp, 'identificada',
          jsonb_build_object('credencial_id', v_r->>'credencial_id', 'foto', (v_r->>'foto')::boolean))
  on conflict (time_clock_id, local_id) where local_id is not null do update
    set verify_mode = excluded.verify_mode, employment_id = excluded.employment_id, raw = excluded.raw, received_at = now()
    where public.hr_clock_raw_events.status = 'identificada';

  return public.fn_hr_kiosco_persona(c.id, v_emp)
         || jsonb_build_object('estado', 'identificada', 'foto', (v_r->>'foto')::boolean,
                               'foto_dias', public.fn_hr_foto_dias(c.branch_id));
end;
$$;
revoke all on function public.fn_hr_kiosco_identificar(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_identificar(uuid, uuid, jsonb) to service_role;

-- 7. Marcas del kiosco: lote idempotente (D7) -------------------------------------------------
-- Cada elemento: { id_local, credencial? {tipo, valor}, hora?, hora_equipo?, fuera_de_linea? }.
-- - En vivo: el id_local ya está «identificado» (paso 1); la hora es la del servidor.
-- - Sin conexión: trae la credencial; la hora es la de la tablet corregida con el desfase
--   medido (entre 7 días atrás y 2 min adelante; si no, la del servidor) y la marca queda
--   para revisión del jefe («Llegó al reconectar»). Sin foto: no se sabía quién era.
-- Reenviar el mismo id_local devuelve el mismo resultado y no duplica.
create or replace function public.fn_hr_marcar_kiosco(p_reloj uuid, p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
  v_item jsonb;
  v_local uuid;
  v_raw public.hr_clock_raw_events;
  v_r jsonb;
  v_emp uuid;
  v_metodo text;
  v_offline boolean;
  v_hora timestamptz;
  v_hora_equipo timestamptz;
  v_revisar text;
  v_ev public.attendance_events;
  v_foto boolean;
  v_ruta text;
  v_tz text;
  v_res jsonb := '[]'::jsonb;
  v_uno jsonb;
begin
  select * into c from public.time_clocks t
   where t.id = p_reloj and t.kind in ('kiosco', 'lector_escritorio') and coalesce(t.is_active, false) and t.disabled_at is null;
  if c.id is null then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_lote) <> 'array' or jsonb_array_length(p_lote) = 0 or jsonb_array_length(p_lote) > 50 then
    raise exception 'lote_invalido: entre 1 y 50 marcas' using errcode = '22023';
  end if;
  v_tz := public.fn_timezone_for(c.organization_id, c.branch_id);

  -- Las de sin conexión, en orden de hora: así la entrada y la salida se alternan bien.
  for v_item in select x from jsonb_array_elements(p_lote) x order by x->>'hora' nulls last loop
    v_uno := null;
    begin
      v_local := (v_item->>'id_local')::uuid;
    exception when others then
      v_local := null;
    end;
    if v_local is null then
      v_res := v_res || jsonb_build_array(jsonb_build_object('id_local', v_item->>'id_local', 'estado', 'rechazada', 'motivo', 'id_local_invalido'));
      continue;
    end if;
    v_offline := coalesce((v_item->>'fuera_de_linea')::boolean, false);

    begin
      select * into v_raw from public.hr_clock_raw_events r where r.time_clock_id = c.id and r.local_id = v_local for update;

      if v_raw.id is not null and v_raw.status in ('aceptada', 'a_revision', 'repetida', 'rechazada') then
        -- Idempotencia: el mismo resultado de la primera vez.
        select * into v_ev from public.attendance_events a where a.id = v_raw.attendance_event_id;
        v_uno := jsonb_build_object('id_local', v_local, 'estado', 'repetida', 'primera', v_raw.status, 'motivo', v_raw.reason,
                                    'evento_id', v_ev.id, 'tipo', v_ev.event_type, 'hora', v_ev.event_at);
      else
        v_revisar := null;
        v_hora_equipo := null;
        if v_raw.id is not null and not v_offline then
          if v_raw.received_at < now() - interval '5 minutes' then
            v_uno := jsonb_build_object('id_local', v_local, 'estado', 'vencida');
          end if;
          v_emp := v_raw.employment_id;
          v_metodo := v_raw.verify_mode;
          v_foto := coalesce((v_raw.raw->>'foto')::boolean, false) and public.fn_hr_marcacion_autorizada(v_emp, 'foto_evidencia');
          v_hora := now();
        else
          v_r := public.fn_hr_kiosco_resolver(c.id, v_item->'credencial', false);
          if v_r->>'estado' <> 'ok' then
            insert into public.hr_clock_raw_events (organization_id, time_clock_id, local_id, verify_mode, status, reason, raw)
            values (c.organization_id, c.id, v_local, nullif(v_item->'credencial'->>'tipo', ''), 'rechazada', v_r->>'estado',
                    jsonb_build_object('fuera_de_linea', v_offline))
            on conflict (time_clock_id, local_id) where local_id is not null do update
              set status = 'rechazada', reason = excluded.reason;
            perform public.fn_hr_kiosco_intento(c.id, v_item->'credencial'->>'tipo', v_r->>'estado', nullif(v_r->>'vinculo_id', '')::uuid);
            v_uno := jsonb_build_object('id_local', v_local, 'estado', 'rechazada', 'motivo', v_r->>'estado');
          else
            v_emp := (v_r->>'vinculo_id')::uuid;
            v_metodo := v_r->>'metodo';
            v_foto := false;
            v_hora := now();
            if v_offline then
              v_revisar := 'fuera_de_linea';
              begin
                v_hora_equipo := (v_item->>'hora_equipo')::timestamptz;
                v_hora := coalesce((v_item->>'hora')::timestamptz, now());
              exception when others then
                v_hora := now();
              end;
              if v_hora > now() + interval '2 minutes' or v_hora < now() - interval '7 days' then
                v_hora := now();
                v_revisar := 'hora_dudosa';
              end if;
            end if;
            if coalesce((v_r->>'bloqueada')::boolean, false) then
              v_revisar := coalesce(v_revisar, 'pin_bloqueado');
            end if;
          end if;
        end if;

        if v_uno is null then
          -- Doble toque: otra marca de la persona a menos de un minuto (en cualquier sentido)
          -- no cuenta; con la alternancia, la segunda sería una salida falsa.
          if exists (select 1 from public.attendance_events a
                      where a.employment_id = v_emp and a.event_at > v_hora - interval '60 seconds'
                        and a.event_at < v_hora + interval '60 seconds') then
            raise exception 'marcacion_duplicada' using errcode = '55000';
          end if;
          if v_raw.id is null then
            insert into public.hr_clock_raw_events (organization_id, time_clock_id, local_id, verify_mode, employment_id, status, raw, device_time)
            values (c.organization_id, c.id, v_local, v_metodo, v_emp, 'identificada',
                    jsonb_build_object('fuera_de_linea', v_offline), v_hora_equipo)
            returning * into v_raw;
          end if;
          v_ev := public.fn_hr_registrar_marca_en(
            null, c.organization_id, v_emp, null,
            case v_metodo when 'carne_nfc' then 'nfc' when 'carne_qr' then 'qr' else 'app' end,
            v_metodo, c.id, c.branch_id, null, null,
            jsonb_strip_nulls(jsonb_build_object(
              'plataforma', case c.kind when 'kiosco' then 'kiosco' else 'escritorio' end,
              'revisar', v_revisar,
              'capturada', case when v_offline then v_hora_equipo end,
              'foto', case when v_foto then 'pendiente' else 'sin_foto' end)),
            'presencial', v_hora, v_hora_equipo, v_raw.id);
          update public.hr_clock_raw_events
             set status = case when v_revisar is not null then 'a_revision' else 'aceptada' end,
                 attendance_event_id = v_ev.id, employment_id = v_emp, device_time = coalesce(device_time, v_hora_equipo)
           where id = v_raw.id;
          v_ruta := case when v_foto then format('org/%s/%s/%s.jpg', c.organization_id,
                                                  to_char(v_ev.event_at at time zone v_tz, 'YYYY/MM'), v_ev.id) end;
          v_uno := coalesce(public.fn_hr_kiosco_persona(c.id, v_emp) - 'siguiente', '{}'::jsonb)
                   || jsonb_build_object('id_local', v_local,
                                         'estado', case when v_revisar is not null then 'a_revision' else 'aceptada' end,
                                         'evento_id', v_ev.id, 'tipo', v_ev.event_type, 'hora', v_ev.event_at,
                                         'foto_ruta', v_ruta,
                                         'foto_vence', case when v_foto then
                                            ((v_ev.event_at + make_interval(days => public.fn_hr_foto_dias(c.branch_id))) at time zone v_tz)::date end);
        end if;
      end if;
    exception
      when sqlstate '55000' then
        -- Doble toque en menos de un minuto: la marca anterior ya cuenta.
        insert into public.hr_clock_raw_events (organization_id, time_clock_id, local_id, verify_mode, employment_id, status, reason)
        values (c.organization_id, c.id, v_local, v_metodo, v_emp, 'repetida', 'doble_marca')
        on conflict (time_clock_id, local_id) where local_id is not null do update set status = 'repetida', reason = 'doble_marca';
        v_uno := jsonb_build_object('id_local', v_local, 'estado', 'duplicada')
                 || coalesce(public.fn_hr_kiosco_persona(c.id, v_emp) - 'siguiente', '{}'::jsonb);
      when others then
        -- Error inesperado: no se guarda nada de esta marca y la tablet la reintenta.
        raise warning 'fn_hr_marcar_kiosco: % %', sqlstate, sqlerrm;
        v_uno := jsonb_build_object('id_local', v_local, 'estado', 'error');
    end;
    v_res := v_res || jsonb_build_array(v_uno);
  end loop;

  update public.time_clocks set last_seen_at = now() where id = c.id;
  delete from public.hr_clock_raw_events r where r.time_clock_id = c.id and r.received_at < now() - interval '180 days';
  return jsonb_build_object('resultados', v_res);
end;
$$;
revoke all on function public.fn_hr_marcar_kiosco(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_marcar_kiosco(uuid, jsonb) to service_role;

-- La ruta subió la foto al bucket: se enlaza a la marca con su vencimiento (D5).
create or replace function public.fn_hr_kiosco_foto_guardada(p_reloj uuid, p_evento uuid, p_ruta text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.attendance_events;
  c public.time_clocks;
  v_tz text;
  v_esperada text;
  v_vence timestamptz;
begin
  select * into c from public.time_clocks t where t.id = p_reloj;
  select * into a from public.attendance_events e where e.id = p_evento and e.time_clock_id = p_reloj;
  if c.id is null or a.id is null or a.photo_path is not null or a.created_at < now() - interval '15 minutes' then
    raise exception 'foto_no_aplica' using errcode = '22023';
  end if;
  v_tz := public.fn_timezone_for(c.organization_id, c.branch_id);
  v_esperada := format('org/%s/%s/%s.jpg', c.organization_id, to_char(a.event_at at time zone v_tz, 'YYYY/MM'), a.id);
  if p_ruta is distinct from v_esperada or not public.fn_hr_marcacion_autorizada(a.employment_id, 'foto_evidencia') then
    raise exception 'foto_no_aplica' using errcode = '22023';
  end if;
  v_vence := a.event_at + make_interval(days => public.fn_hr_foto_dias(c.branch_id));
  update public.attendance_events set photo_path = v_esperada, photo_expires_at = v_vence where id = a.id;
  return jsonb_build_object('ok', true, 'vence', (v_vence at time zone v_tz)::date);
end;
$$;
revoke all on function public.fn_hr_kiosco_foto_guardada(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_foto_guardada(uuid, uuid, text) to service_role;

-- 8. Desbloqueo del PIN (Figma 20.29.9 y gestión de RR. HH.) ----------------------------------
create or replace function public.fn_hr_pin_desbloquear_interno(p_actor uuid, p_org integer, p_credencial uuid, p_reloj uuid, p_via text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k public.hr_credentials;
begin
  if p_credencial is not null then
    update public.hr_credentials
       set failed_attempts = 0, locked_until = null, unlocked_by = p_actor, unlocked_at = now()
     where id = p_credencial and organization_id = p_org and kind = 'pin'
    returning * into k;
  end if;
  if p_reloj is not null then
    update public.hr_clock_secrets set pin_fallos = 0, pin_fallos_desde = null, pin_bloqueado_hasta = null
     where time_clock_id = p_reloj and organization_id = p_org;
  end if;
  perform public.fn_hr_registrar_acceso_interno(
    p_actor, p_org, (select e.person_id from public.employments e where e.id = k.employment_id), k.employment_id,
    'basico', 'editar', null, null, null,
    jsonb_strip_nulls(jsonb_build_object('accion', 'pin_desbloqueado', 'via', p_via, 'reloj_id', p_reloj, 'credencial_id', k.id)));
end;
$$;
revoke all on function public.fn_hr_pin_desbloquear_interno(uuid, integer, uuid, uuid, text) from public, anon, authenticated, service_role;

-- RR. HH. desde GO Admin (hr.attendance.manage).
create or replace function public.fn_hr_pin_desbloquear(p_actor uuid, p_org integer, p_employment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select k.id into v_id from public.hr_credentials k
   where k.employment_id = p_employment and k.organization_id = p_org and k.kind = 'pin' and k.revoked_at is null;
  if v_id is null then
    raise exception 'hr: la persona no tiene PIN' using errcode = 'P0002';
  end if;
  perform public.fn_hr_pin_desbloquear_interno(p_actor, p_org, v_id, null, 'gestion');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.fn_hr_pin_desbloquear(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_pin_desbloquear(uuid, integer, uuid) to service_role;

-- En el kiosco: un supervisor con hr.attendance.manage escribe SU PIN. Sus fallos tienen
-- su propio tope (5 en 15 min) para que nadie lo use como puerta trasera.
create or replace function public.fn_hr_kiosco_desbloquear(p_reloj uuid, p_pin text, p_credencial uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.time_clocks;
  s public.hr_clock_secrets;
  v_sup public.hr_credentials;
  v_emp public.employments;
  v_user uuid;
  v_ok boolean := false;
  v_obj uuid;
begin
  select * into c from public.time_clocks t
   where t.id = p_reloj and t.kind in ('kiosco', 'lector_escritorio') and coalesce(t.is_active, false) and t.disabled_at is null;
  if c.id is null then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  select * into s from public.hr_clock_secrets x where x.time_clock_id = c.id for update;
  if s.sup_fallos_desde is not null and s.sup_fallos_desde > now() - interval '15 minutes' and s.sup_fallos >= 5 then
    return jsonb_build_object('estado', 'supervisor_bloqueado', 'hasta', s.sup_fallos_desde + interval '15 minutes');
  end if;
  if coalesce(p_pin, '') ~ '^[0-9]{6}$' then
    select * into v_sup from public.hr_credentials k
     where k.organization_id = c.organization_id and k.kind = 'pin' and k.revoked_at is null
       and k.lookup_hash = public.fn_hr_credencial_lookup(public.fn_hr_marcacion_pepper(c.organization_id), 'pin', p_pin);
    if v_sup.id is not null and v_sup.secret_hash = extensions.crypt(p_pin, v_sup.secret_hash)
       and (v_sup.locked_until is null or v_sup.locked_until <= now()) then
      select * into v_emp from public.employments e where e.id = v_sup.employment_id and e.status = 'active';
      v_user := public.fn_hr_usuario_del_vinculo(v_emp.id);
      v_ok := v_emp.id is not null and public.fn_hr_puede_actor(v_user, c.organization_id, 'hr.attendance.manage');
    end if;
  end if;
  if not v_ok then
    if s.sup_fallos_desde is null or s.sup_fallos_desde < now() - interval '15 minutes' then
      update public.hr_clock_secrets set sup_fallos = 1, sup_fallos_desde = now() where time_clock_id = c.id;
    else
      update public.hr_clock_secrets set sup_fallos = sup_fallos + 1 where time_clock_id = c.id;
    end if;
    perform public.fn_hr_kiosco_intento(c.id, 'pin', 'supervisor_rechazado', null);
    return jsonb_build_object('estado', 'supervisor_rechazado');
  end if;
  select k.id into v_obj from public.hr_credentials k
   where k.id = p_credencial and k.organization_id = c.organization_id and k.kind = 'pin';
  update public.hr_clock_secrets set sup_fallos = 0, sup_fallos_desde = null where time_clock_id = c.id;
  perform public.fn_hr_pin_desbloquear_interno(v_user, c.organization_id, v_obj, c.id, 'kiosco');
  return jsonb_build_object('estado', 'ok', 'supervisor', public.fn_hr_nombre_persona(v_emp.person_id));
end;
$$;
revoke all on function public.fn_hr_kiosco_desbloquear(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_kiosco_desbloquear(uuid, text, uuid) to service_role;

-- 9. PIN y carnés: gestión de RR. HH. -------------------------------------------------------
create or replace function public.fn_hr_credenciales(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'ahora', now(),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'vinculo_id', e.id,
               'nombre', public.fn_hr_nombre_persona(e.person_id),
               'sede', b.name,
               'pin', (select jsonb_build_object('creado', k.created_at, 'bloqueado_hasta', case when k.locked_until > now() then k.locked_until end,
                                                 'fallos', k.failed_attempts)
                         from public.hr_credentials k where k.employment_id = e.id and k.kind = 'pin' and k.revoked_at is null),
               'carnes', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'tipo', k.kind, 'etiqueta', k.label, 'creado', k.created_at)
                                                    order by k.created_at)
                                     from public.hr_credentials k
                                    where k.employment_id = e.id and k.kind in ('carne_nfc', 'carne_qr') and k.revoked_at is null), '[]'::jsonb),
               'foto_autorizada', public.fn_hr_marcacion_autorizada(e.id, 'foto_evidencia'))
             order by public.fn_hr_nombre_persona(e.person_id))
        from public.employments e
        left join public.branches b on b.id = e.branch_id
       where e.organization_id = p_org and e.status = 'active' and (p_branch is null or e.branch_id = p_branch)), '[]'::jsonb));
end;
$$;
revoke all on function public.fn_hr_credenciales(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_credenciales(uuid, integer, integer) to service_role;

-- PIN nuevo de 6 dígitos, al azar y único en la organización. Se devuelve UNA vez.
create or replace function public.fn_hr_pin_asignar(p_actor uuid, p_org integer, p_employment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pep bytea;
  v_pin text;
  v_bytes bytea;
  v_intento integer := 0;
  v_lookup text;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employments e where e.id = p_employment and e.organization_id = p_org and e.status = 'active') then
    raise exception 'hr: el vínculo laboral no existe' using errcode = 'P0002';
  end if;
  v_pep := public.fn_hr_marcacion_pepper(p_org);
  loop
    v_intento := v_intento + 1;
    if v_intento > 40 then
      raise exception 'pin_no_disponible: intenta de nuevo' using errcode = '55000';
    end if;
    v_bytes := extensions.gen_random_bytes(4);
    v_pin := lpad(((get_byte(v_bytes, 0)::bigint * 16777216 + get_byte(v_bytes, 1) * 65536 + get_byte(v_bytes, 2) * 256 + get_byte(v_bytes, 3)) % 1000000)::text, 6, '0');
    -- Sin PIN obvios: todos iguales o en escalera.
    continue when v_pin ~ '^(\d)\1{5}$' or v_pin in ('012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210');
    v_lookup := public.fn_hr_credencial_lookup(v_pep, 'pin', v_pin);
    continue when exists (select 1 from public.hr_credentials k
                           where k.organization_id = p_org and k.kind = 'pin' and k.revoked_at is null and k.lookup_hash = v_lookup);
    exit;
  end loop;
  update public.hr_credentials set revoked_at = now(), revoked_by = p_actor
   where employment_id = p_employment and kind = 'pin' and revoked_at is null;
  insert into public.hr_credentials (organization_id, employment_id, kind, lookup_hash, secret_hash, created_by)
  values (p_org, p_employment, 'pin', v_lookup, extensions.crypt(v_pin, extensions.gen_salt('bf', 8)), p_actor);
  return jsonb_build_object('pin', v_pin);
end;
$$;
revoke all on function public.fn_hr_pin_asignar(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_pin_asignar(uuid, integer, uuid) to service_role;

-- Carné NFC (UID leído con el lector) o carné QR (GO Admin genera el código a imprimir).
create or replace function public.fn_hr_carne_registrar(p_actor uuid, p_org integer, p_employment uuid, p_tipo text, p_valor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_valor text;
  v_id uuid;
  v_bytes bytea;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employments e where e.id = p_employment and e.organization_id = p_org and e.status = 'active') then
    raise exception 'hr: el vínculo laboral no existe' using errcode = 'P0002';
  end if;
  if p_tipo = 'carne_nfc' then
    v_valor := public.fn_hr_carne_normalizar(p_valor);
    if v_valor is null then
      raise exception 'carne_invalido: acerca el carné al lector o escribe su código' using errcode = '22023';
    end if;
  elsif p_tipo = 'carne_qr' then
    v_bytes := extensions.gen_random_bytes(12);
    v_valor := 'GA';
    for i in 0..11 loop
      v_valor := v_valor || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
  else
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  begin
    insert into public.hr_credentials (organization_id, employment_id, kind, lookup_hash, label, created_by)
    values (p_org, p_employment, p_tipo,
            public.fn_hr_credencial_lookup(public.fn_hr_marcacion_pepper(p_org), p_tipo, v_valor),
            '…' || right(v_valor, 4), p_actor)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'carne_en_uso: ese carné ya está registrado a otra persona' using errcode = '22023';
  end;
  return jsonb_build_object('id', v_id, 'tipo', p_tipo, 'etiqueta', '…' || right(v_valor, 4),
                            'codigo', case when p_tipo = 'carne_qr' then v_valor end);
end;
$$;
revoke all on function public.fn_hr_carne_registrar(uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_carne_registrar(uuid, integer, uuid, text, text) to service_role;

create or replace function public.fn_hr_credencial_revocar(p_actor uuid, p_org integer, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k public.hr_credentials;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  update public.hr_credentials set revoked_at = now(), revoked_by = p_actor
   where id = p_id and organization_id = p_org and revoked_at is null
  returning * into k;
  if k.id is null then
    raise exception 'hr: la credencial no existe' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', k.id, 'revocada', true);
end;
$$;
revoke all on function public.fn_hr_credencial_revocar(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_credencial_revocar(uuid, integer, uuid) to service_role;

-- 10. Autorizaciones de la persona (Figma 20.32) ---------------------------------------------
create or replace function public.fn_hr_marcacion_autorizar(p_actor uuid, p_org integer, p_kinds text[], p_otorgar boolean,
                                                            p_version text, p_ip text default null, p_ua text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp uuid;
  v_ip inet;
begin
  if p_otorgar is null or coalesce(btrim(p_version), '') = '' or coalesce(cardinality(p_kinds), 0) = 0
     or not (p_kinds <@ array['huella', 'rostro', 'foto_evidencia']::text[]) then
    raise exception 'autorizacion_invalida' using errcode = '22023';
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
  insert into public.hr_marcacion_consents (organization_id, employment_id, user_id, granted, kinds, policy_version, ip, user_agent)
  values (p_org, v_emp, p_actor, p_otorgar, (select array_agg(distinct k) from unnest(p_kinds) k), left(btrim(p_version), 40), v_ip, left(p_ua, 500));
  return public.fn_hr_mis_autorizaciones(p_actor, p_org);
end;
$$;
revoke all on function public.fn_hr_marcacion_autorizar(uuid, integer, text[], boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_marcacion_autorizar(uuid, integer, text[], boolean, text, text, text) to service_role;

create or replace function public.fn_hr_mis_autorizaciones(p_actor uuid, p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp public.employments;
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
  return jsonb_build_object(
    'vinculo', jsonb_build_object('id', v_emp.id, 'sede', (select b.name from public.branches b where b.id = v_emp.branch_id)),
    'foto_dias', public.fn_hr_foto_dias(v_emp.branch_id),
    'tipos', (select jsonb_object_agg(k, (
                select jsonb_build_object('autorizada', c.granted, 'fecha', c.created_at, 'version', c.policy_version)
                  from public.hr_marcacion_consents c
                 where c.employment_id = v_emp.id and k = any (c.kinds)
                 order by c.created_at desc, c.id desc limit 1))
                from unnest(array['foto_evidencia', 'huella', 'rostro']) k),
    'historial', coalesce((select jsonb_agg(jsonb_build_object('fecha', c.created_at, 'autorizada', c.granted, 'tipos', to_jsonb(c.kinds),
                                                              'version', c.policy_version) order by c.created_at desc)
                             from (select * from public.hr_marcacion_consents c where c.employment_id = v_emp.id
                                    order by c.created_at desc limit 50) c), '[]'::jsonb));
end;
$$;
revoke all on function public.fn_hr_mis_autorizaciones(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_mis_autorizaciones(uuid, integer) to service_role;

-- 11. Métodos por sede con el kiosco y la foto (Figma 20.27.1) --------------------------------
create or replace function public.fn_hr_metodos_sede_guardar(p_actor uuid, p_org integer, p_branch integer, p_metodos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_m text;
  v_d jsonb;
  v_activo boolean;
  v_reglas jsonb;
  v_radio integer;
  v_activos integer := 0;
  v_actual jsonb;
  v_dias integer;
  v_letrero boolean;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is null or not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if jsonb_typeof(p_metodos) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  for v_m in select jsonb_object_keys(p_metodos) loop
    if v_m not in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'pin', 'carne', 'foto') then
      raise exception 'metodo_no_disponible: % llega con los terminales', v_m using errcode = '22023';
    end if;
  end loop;

  v_actual := public.fn_hr_metodos_sede(p_org, p_branch);
  foreach v_m in array array['celular_ubicacion', 'qr', 'nfc_etiqueta', 'pin', 'carne'] loop
    v_d := coalesce(p_metodos->v_m, jsonb_build_object('activo', (v_actual->v_m->>'activo')::boolean, 'reglas', v_actual->v_m->'reglas'));
    if jsonb_typeof(v_d->'activo') <> 'boolean' then
      raise exception 'datos_invalidos: activo' using errcode = '22023';
    end if;
    v_activo := (v_d->>'activo')::boolean;
    v_reglas := '{}'::jsonb;
    if v_m = 'celular_ubicacion' then
      begin
        v_radio := coalesce((v_d->'reglas'->>'radio_m')::numeric, 150)::integer;
      exception when others then
        raise exception 'radio_invalido: entre 20 y 2000 m' using errcode = '22023';
      end;
      if v_radio not between 20 and 2000 then
        raise exception 'radio_invalido: entre 20 y 2000 m' using errcode = '22023';
      end if;
      v_reglas := jsonb_build_object('radio_m', v_radio,
                                     'permitir_computador', coalesce((v_d->'reglas'->>'permitir_computador')::boolean, true));
    elsif v_m = 'qr' then
      v_reglas := jsonb_build_object('exigir_ubicacion', coalesce((v_d->'reglas'->>'exigir_ubicacion')::boolean, false));
    elsif v_m in ('pin', 'carne') then
      v_reglas := jsonb_build_object('foto', coalesce((v_d->'reglas'->>'foto')::boolean, true));
    end if;
    if v_activo then
      v_activos := v_activos + 1;
    end if;
    -- PIN y carné sin cambios y sin fila: no se crea una fila solo por guardar la sede.
    continue when v_m in ('pin', 'carne') and p_metodos->v_m is null
                  and not exists (select 1 from public.hr_branch_clock_methods x where x.branch_id = p_branch and x.method = v_m);
    insert into public.hr_branch_clock_methods (organization_id, branch_id, method, enabled, rules, updated_by, updated_at)
    values (p_org, p_branch, v_m, v_activo, v_reglas, p_actor, now())
    on conflict (branch_id, method) do update
      set enabled = excluded.enabled, rules = excluded.rules, updated_by = excluded.updated_by, updated_at = now();
  end loop;
  if v_activos = 0 then
    raise exception 'sin_metodos: la sede necesita al menos un método activo' using errcode = '22023';
  end if;

  -- Foto de evidencia: días (7 a 90) y letrero puesto.
  if jsonb_typeof(p_metodos->'foto') = 'object' then
    begin
      v_dias := coalesce((p_metodos->'foto'->>'dias')::numeric, 30)::integer;
    exception when others then
      raise exception 'foto_dias_invalido: entre 7 y 90 días' using errcode = '22023';
    end;
    if v_dias not between 7 and 90 then
      raise exception 'foto_dias_invalido: entre 7 y 90 días' using errcode = '22023';
    end if;
    v_letrero := coalesce((p_metodos->'foto'->>'letrero_puesto')::boolean, false);
    insert into public.hr_branch_marcacion_ajustes (branch_id, organization_id, foto_dias, letrero_puesto, letrero_puesto_at, updated_by, updated_at)
    values (p_branch, p_org, v_dias, v_letrero, case when v_letrero then now() end, p_actor, now())
    on conflict (branch_id) do update
      set foto_dias = excluded.foto_dias,
          letrero_puesto = excluded.letrero_puesto,
          letrero_puesto_at = case when excluded.letrero_puesto and not public.hr_branch_marcacion_ajustes.letrero_puesto then now()
                                   when excluded.letrero_puesto then public.hr_branch_marcacion_ajustes.letrero_puesto_at end,
          updated_by = excluded.updated_by, updated_at = now();
  end if;
  return public.fn_hr_metodos_sede(p_org, p_branch);
end;
$function$;

create or replace function public.fn_hr_metodos_sede_leer(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_branch integer := p_branch;
  v_sede public.branches;
  v_aj public.hr_branch_marcacion_ajustes;
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_branch is null then
    select b.id into v_branch from public.branches b
     where b.organization_id = p_org and coalesce(b.is_active, true)
     order by b.is_main desc nulls last, b.id limit 1;
  end if;
  select * into v_sede from public.branches b where b.id = v_branch and b.organization_id = p_org;
  if v_sede.id is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into v_aj from public.hr_branch_marcacion_ajustes a where a.branch_id = v_sede.id;
  return jsonb_build_object(
    'sede', jsonb_build_object('id', v_sede.id, 'nombre', v_sede.name, 'direccion', v_sede.address,
                               'con_ubicacion', v_sede.latitude is not null and v_sede.longitude is not null),
    'sedes', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name) order by b.name), '[]'::jsonb)
                from public.branches b where b.organization_id = p_org and coalesce(b.is_active, true)),
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'metodos', public.fn_hr_metodos_sede(p_org, v_sede.id),
    'etiquetas', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name) order by c.name), '[]'::jsonb)
                    from public.time_clocks c where c.organization_id = p_org and c.branch_id = v_sede.id
                     and c.kind = 'etiqueta_nfc' and coalesce(c.is_active, false) and c.disabled_at is null),
    'pantallas', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name) order by c.name), '[]'::jsonb)
                    from public.time_clocks c where c.organization_id = p_org and c.branch_id = v_sede.id
                     and c.kind = 'pantalla_qr' and coalesce(c.is_active, false) and c.disabled_at is null),
    'kioscos', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name, 'tipo', c.kind) order by c.name), '[]'::jsonb)
                  from public.time_clocks c where c.organization_id = p_org and c.branch_id = v_sede.id
                   and c.kind in ('kiosco', 'lector_escritorio') and coalesce(c.is_active, false) and c.disabled_at is null),
    'personas', (select count(*) from public.employments e
                  where e.organization_id = p_org and e.branch_id = v_sede.id and e.status = 'active'),
    'personas_remoto', (select count(*) from public.employments e
                         join public.hr_attendance_settings s on s.employment_id = e.id
                        where e.organization_id = p_org and e.branch_id = v_sede.id and e.status = 'active'
                          and s.modalidad in ('remoto', 'hibrido')),
    'credenciales', jsonb_build_object(
       'pines', (select count(distinct k.employment_id) from public.hr_credentials k join public.employments e on e.id = k.employment_id
                  where k.organization_id = p_org and k.kind = 'pin' and k.revoked_at is null and e.branch_id = v_sede.id and e.status = 'active'),
       'carnes', (select count(distinct k.employment_id) from public.hr_credentials k join public.employments e on e.id = k.employment_id
                   where k.organization_id = p_org and k.kind in ('carne_nfc', 'carne_qr') and k.revoked_at is null
                     and e.branch_id = v_sede.id and e.status = 'active')),
    'foto', jsonb_build_object(
       'dias', coalesce(v_aj.foto_dias, 30),
       'letrero_puesto', coalesce(v_aj.letrero_puesto, false),
       'letrero_puesto_at', v_aj.letrero_puesto_at,
       'autorizadas', (select count(*) from public.employments e
                        where e.organization_id = p_org and e.branch_id = v_sede.id and e.status = 'active'
                          and public.fn_hr_marcacion_autorizada(e.id, 'foto_evidencia'))));
end;
$function$;

-- 12. Lista de dispositivos con el estado de la clave del kiosco ------------------------------
create or replace function public.fn_hr_dispositivos(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_hoy date := public.fn_today_for(p_org, p_branch);
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'ahora', now(),
    'dispositivos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.name, 'tipo', c.kind, 'tipo_legado', c.type,
               'sede_id', c.branch_id, 'sede', b.name, 'descripcion', c.location_description,
               'activo', coalesce(c.is_active, false) and c.disabled_at is null,
               'ultima_conexion', c.last_seen_at,
               'chip', c.settings->>'chip',
               'vinculado', case when c.kind in ('kiosco', 'lector_escritorio') then s.device_key_hash is not null end,
               'clave_revocada_at', case when c.kind in ('kiosco', 'lector_escritorio') then s.key_revoked_at end,
               'hoy', (select count(*) from public.attendance_events a where a.time_clock_id = c.id and a.work_date = v_hoy))
             order by (coalesce(c.is_active, false) and c.disabled_at is null) desc, c.name)
        from public.time_clocks c
        left join public.branches b on b.id = c.branch_id
        left join public.hr_clock_secrets s on s.time_clock_id = c.id
       where c.organization_id = p_org and (p_branch is null or c.branch_id = p_branch)), '[]'::jsonb));
end;
$function$;

-- 13. Foto de evidencia: ver (con registro) y borrar las vencidas ------------------------------
-- La ven hr.attendance.view y el jefe directo mientras la marca tenga un caso abierto.
create or replace function public.fn_hr_foto_evidencia(p_actor uuid, p_org integer, p_evento uuid, p_ip text default null, p_ua text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.attendance_events;
  v_emp public.employments;
  v_ok boolean;
begin
  select * into a from public.attendance_events e where e.id = p_evento and e.organization_id = p_org;
  if a.id is null then
    raise exception 'hr: la marca no existe' using errcode = 'P0002';
  end if;
  select * into v_emp from public.employments e where e.id = a.employment_id;
  v_ok := public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')
          or (a.photo_hold and exists (select 1 from public.employments j
                                        where j.id = v_emp.manager_id
                                          and public.fn_hr_usuario_del_vinculo(j.id) = p_actor));
  if not v_ok then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if a.photo_path is null then
    return jsonb_build_object('ruta', null, 'motivo', coalesce(a.device_info->>'foto', 'sin_foto'));
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, v_emp.person_id, v_emp.id, 'foto_evidencia', 'ver',
                                                p_ip, p_ua, null, jsonb_build_object('evento_id', a.id));
  return jsonb_build_object('ruta', a.photo_path, 'vence', a.photo_expires_at, 'retenida', a.photo_hold, 'hora', a.event_at);
end;
$$;
revoke all on function public.fn_hr_foto_evidencia(uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_foto_evidencia(uuid, integer, uuid, text, text) to service_role;

-- Fotos para borrar: vencidas, sin retención por caso y sin ajuste pendiente.
create or replace function public.fn_hr_fotos_evidencia_vencidas(p_limite integer default 200)
returns table (evento_id uuid, ruta text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.photo_path
    from public.attendance_events a
   where a.photo_path is not null and a.photo_expires_at < now() and not a.photo_hold
     and not exists (select 1 from public.timesheet_adjustments x where x.attendance_event_id = a.id and x.status = 'pending')
   order by a.photo_expires_at
   limit least(greatest(coalesce(p_limite, 200), 1), 1000);
$$;
revoke all on function public.fn_hr_fotos_evidencia_vencidas(integer) from public, anon, authenticated;
grant execute on function public.fn_hr_fotos_evidencia_vencidas(integer) to service_role;

-- La tarea ya borró los archivos: la marca queda «sin foto» (columna técnica, R1).
create or replace function public.fn_hr_fotos_evidencia_borradas(p_eventos uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  update public.attendance_events a set photo_path = null
   where a.id = any (coalesce(p_eventos, '{}')) and a.photo_path is not null and a.photo_expires_at < now() and not a.photo_hold;
  get diagnostics n = row_count;
  -- Limpieza de la misma tarea: códigos de vinculación viejos.
  delete from public.hr_kiosk_pairings where created_at < now() - interval '1 day';
  return n;
end;
$$;
revoke all on function public.fn_hr_fotos_evidencia_borradas(uuid[]) from public, anon, authenticated;
grant execute on function public.fn_hr_fotos_evidencia_borradas(uuid[]) to service_role;

-- 14. En vivo sabe qué marca tiene foto ----------------------------------------------------
select pg_temp.fn_parchar('public.fn_hr_marcacion_en_vivo(uuid,integer,integer)',
$a$               'ubicacion_validada', a.geo_validated,$a$,
$a$               'ubicacion_validada', a.geo_validated,
               'foto', a.photo_path is not null,$a$);

-- 15. Tarea diaria de borrado de fotos (pg_cron → ruta del servidor con la API de Storage) ---
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-fotos-evidencia') then
    perform cron.unschedule('hrm-fotos-evidencia');
  end if;
  perform cron.schedule('hrm-fotos-evidencia', '40 5 * * *', $c$select public.fn_crm_cron_post('/api/cron/hrm-fotos-evidencia')$c$);
end;
$$;
