-- Reversión de 20261117193540_hrm_m1_02_kiosco_funciones.
-- Aplicar ANTES de revertir 20261117191900_hrm_m1_01_kiosco_esquema.
-- Restaura las funciones de M0 (núcleo de la marca, métodos por sede, lista de
-- dispositivos, fn_hr_marcar y En vivo) y borra las del kiosco. Las marcas que ya
-- registró el kiosco quedan en attendance_events (R1: no se borran). Las filas de
-- hr_branch_clock_methods con método 'pin' o 'carne' quedan (M0 las ignora).

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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-fotos-evidencia') then
    perform cron.unschedule('hrm-fotos-evidencia');
  end if;
end;
$$;

select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$    if v_reloj.kind in ('pantalla_qr', 'kiosco') then$a$,
$a$    if v_reloj.kind = 'pantalla_qr' then$a$);

select pg_temp.fn_parchar('public.fn_hr_marcacion_en_vivo(uuid,integer,integer)',
$a$               'ubicacion_validada', a.geo_validated,
               'foto', a.photo_path is not null,$a$,
$a$               'ubicacion_validada', a.geo_validated,$a$);

-- Núcleo de M0 (hora del servidor).
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

-- Métodos por sede de M0 (vocabulario carne_nfc).
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
    if v_m not in ('celular_ubicacion', 'qr', 'nfc_etiqueta') then
      raise exception 'metodo_no_disponible: % llega con el kiosco o los terminales', v_m using errcode = '22023';
    end if;
  end loop;

  v_actual := public.fn_hr_metodos_sede(p_org, p_branch);
  foreach v_m in array array['celular_ubicacion', 'qr', 'nfc_etiqueta'] loop
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
    end if;
    if v_activo then
      v_activos := v_activos + 1;
    end if;
    insert into public.hr_branch_clock_methods (organization_id, branch_id, method, enabled, rules, updated_by, updated_at)
    values (p_org, p_branch, v_m, v_activo, v_reglas, p_actor, now())
    on conflict (branch_id, method) do update
      set enabled = excluded.enabled, rules = excluded.rules, updated_by = excluded.updated_by, updated_at = now();
  end loop;
  if v_activos = 0 then
    raise exception 'sin_metodos: la sede necesita al menos un método activo (celular, QR o etiqueta)' using errcode = '22023';
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
    'personas', (select count(*) from public.employments e
                  where e.organization_id = p_org and e.branch_id = v_sede.id and e.status = 'active'),
    'personas_remoto', (select count(*) from public.employments e
                         join public.hr_attendance_settings s on s.employment_id = e.id
                        where e.organization_id = p_org and e.branch_id = v_sede.id and e.status = 'active'
                          and s.modalidad in ('remoto', 'hibrido')));
end;
$function$;

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
               'hoy', (select count(*) from public.attendance_events a where a.time_clock_id = c.id and a.work_date = v_hoy))
             order by (coalesce(c.is_active, false) and c.disabled_at is null) desc, c.name)
        from public.time_clocks c
        left join public.branches b on b.id = c.branch_id
       where c.organization_id = p_org and (p_branch is null or c.branch_id = p_branch)), '[]'::jsonb));
end;
$function$;

drop function if exists public.fn_hr_fotos_evidencia_borradas(uuid[]);
drop function if exists public.fn_hr_fotos_evidencia_vencidas(integer);
drop function if exists public.fn_hr_foto_evidencia(uuid, integer, uuid, text, text);
drop function if exists public.fn_hr_marcacion_autorizar(uuid, integer, text[], boolean, text, text, text);
drop function if exists public.fn_hr_mis_autorizaciones(uuid, integer);
drop function if exists public.fn_hr_credencial_revocar(uuid, integer, uuid);
drop function if exists public.fn_hr_carne_registrar(uuid, integer, uuid, text, text);
drop function if exists public.fn_hr_pin_asignar(uuid, integer, uuid);
drop function if exists public.fn_hr_credenciales(uuid, integer, integer);
drop function if exists public.fn_hr_kiosco_desbloquear(uuid, text, uuid);
drop function if exists public.fn_hr_pin_desbloquear(uuid, integer, uuid);
drop function if exists public.fn_hr_pin_desbloquear_interno(uuid, integer, uuid, uuid, text);
drop function if exists public.fn_hr_kiosco_foto_guardada(uuid, uuid, text);
drop function if exists public.fn_hr_marcar_kiosco(uuid, jsonb);
drop function if exists public.fn_hr_kiosco_identificar(uuid, uuid, jsonb);
drop function if exists public.fn_hr_kiosco_persona(uuid, uuid);
drop function if exists public.fn_hr_kiosco_intento(uuid, text, text, uuid);
drop function if exists public.fn_hr_kiosco_resolver(uuid, jsonb, boolean);
drop function if exists public.fn_hr_kiosco_qr_usos(uuid, bigint);
drop function if exists public.fn_hr_kiosco_config(uuid);
drop function if exists public.fn_hr_kiosco_equipo(text, text);
drop function if exists public.fn_hr_kiosco_revocar(uuid, integer, uuid);
drop function if exists public.fn_hr_kiosco_vincular(uuid, integer, jsonb);
drop function if exists public.fn_hr_kiosco_codigo(text, text);
drop function if exists public.fn_hr_usuario_del_vinculo(uuid);
drop function if exists public.fn_hr_foto_dias(integer);
drop function if exists public.fn_hr_marcacion_autorizada(uuid, text);
drop function if exists public.fn_hr_carne_normalizar(text);
drop function if exists public.fn_hr_credencial_lookup(bytea, text, text);
drop function if exists public.fn_hr_marcacion_pepper(integer);
drop function if exists public.fn_hr_registrar_marca_en(uuid, integer, uuid, text, text, text, uuid, integer, jsonb, boolean, jsonb, text, timestamptz, timestamptz, uuid);
