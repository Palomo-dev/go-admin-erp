-- HRM fase 0 · paso 13: consulta del registro de accesos (diseño 10.RH.3) e
-- intentos sin permiso. Decisiones del dueño del 2026-11-15:
-- - Se registran también los intentos sin permiso (acción `sin_permiso`).
-- - En el detalle, el valor anterior y el nuevo se ocultan hasta «Mostrar
--   valores», y ese clic también se registra.
-- - La IP se muestra parcialmente oculta.
-- - Abrir el registro sin permiso también queda registrado (grupo `registro_accesos`).

alter table public.hr_access_log drop constraint if exists hr_access_log_action_check;
alter table public.hr_access_log add constraint hr_access_log_action_check
  check (action in ('ver','editar','exportar','sin_permiso'));
alter table public.hr_access_log drop constraint if exists hr_access_log_grupo_chk;
alter table public.hr_access_log add constraint hr_access_log_grupo_chk
  check (data_group = any (public.fn_hr_grupos_datos()) or data_group in ('basico','registro_accesos'));

-- IP con el tercer octeto oculto (IPv4) o solo los dos primeros grupos (IPv6).
create or replace function public.fn_hr_ip_parcial(p_ip inet)
returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  v text := host(p_ip);
  p text[];
begin
  if p_ip is null then return null; end if;
  if family(p_ip) = 4 then
    p := string_to_array(v, '.');
    return p[1] || '.' || p[2] || '.•••.' || p[4];
  end if;
  p := string_to_array(v, ':');
  return coalesce(p[1], '') || ':' || coalesce(p[2], '') || ':•••';
end;
$$;

-- Intento sin permiso (lo registra el servidor cuando la base respondió 42501).
create or replace function public.fn_hr_registrar_intento(
  p_actor uuid, p_org integer, p_person uuid, p_employment uuid, p_grupo text, p_ip text, p_ua text, p_ruta text, p_detalle jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_person uuid := p_person;
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    return;
  end if;
  if v_person is not null and not exists (select 1 from public.hr_people p where p.id = v_person and p.organization_id = p_org) then
    v_person := null;
  end if;
  if v_person is null and p_employment is not null then
    select e.person_id into v_person from public.employments e where e.id = p_employment and e.organization_id = p_org;
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, v_person, p_employment,
    case when p_grupo = any (public.fn_hr_grupos_datos()) or p_grupo in ('basico','registro_accesos') then p_grupo else 'basico' end,
    'sin_permiso', p_ip, p_ua, p_ruta, coalesce(p_detalle, '{}'::jsonb));
end;
$$;

-- El registro de accesos permite la acción `sin_permiso` en la inserción interna.
create or replace function public.fn_hr_registrar_acceso_interno(
  p_actor uuid, p_org integer, p_person uuid, p_employment uuid,
  p_grupo text, p_accion text, p_ip text, p_ua text, p_ruta text, p_detalle jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet;
  v_origen text := 'declarada';
begin
  if p_actor is null then
    raise exception 'hr: el registro de accesos exige un actor' using errcode = '22023';
  end if;
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  if v_ip is null then
    v_ip := public.fn_hr_peticion_ip();
    v_origen := case when v_ip is null then 'desconocida' else 'cabecera' end;
  end if;
  insert into public.hr_access_log
    (organization_id, actor_user_id, person_id, employment_id, data_group, action, ip, user_agent, route, detail)
  values
    (p_org, p_actor, p_person, p_employment, p_grupo, p_accion, v_ip,
     left(coalesce(nullif(p_ua, ''), public.fn_hr_peticion_agente()), 500), left(p_ruta, 300),
     coalesce(p_detalle, '{}'::jsonb) || jsonb_build_object('ip_origen', v_origen));
end;
$$;

-- Nombre visible de una cuenta (profiles).
create or replace function public.fn_hr_nombre_usuario(p_user uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), split_part(pr.email, '@', 1))
    from public.profiles pr where pr.id = p_user;
$$;

-- Fila presentable del registro (sin valores).
create or replace function public.fn_hr_registro_fila(l public.hr_access_log)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', l.id,
    'cuando', l.occurred_at,
    'accion', l.action,
    'grupo', l.data_group,
    'ip', public.fn_hr_ip_parcial(l.ip),
    'agente', l.user_agent,
    'ruta', l.route,
    'campos', l.detail->'campos',
    'evento', l.detail->>'evento',
    'documento', l.detail->>'documento',
    'origen', l.detail->>'origen',
    'actor', jsonb_build_object(
      'id', l.actor_user_id,
      'nombre', public.fn_hr_nombre_usuario(l.actor_user_id),
      'cargo', (select jp.name from public.organization_members om join public.job_positions jp on jp.id = om.job_position_id
                 where om.user_id = l.actor_user_id and om.organization_id = l.organization_id limit 1)),
    'empleado', case when l.person_id is null then null else jsonb_build_object(
      'id', l.person_id,
      'nombre', (select btrim(concat_ws(' ', p.first_name, p.last_name)) from public.hr_people p where p.id = l.person_id),
      'cargo', (select jp.name from public.employments e join public.job_positions jp on jp.id = e.position_id
                 where e.person_id = l.person_id order by e.hire_date desc limit 1),
      'sede', (select b.name from public.employments e join public.branches b on b.id = e.branch_id
                where e.person_id = l.person_id order by e.hire_date desc limit 1)) end);
$$;

-- Lista con filtros. Sin permiso no falla: registra el intento y responde permitido=false.
create or replace function public.fn_hr_registro_accesos(
  p_org integer, p_desde timestamptz, p_hasta timestamptz, p_busca text, p_person uuid, p_grupo text, p_accion text,
  p_limite integer default 25, p_desplazamiento integer default 0)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_busca text := nullif(btrim(lower(p_busca)), '');
  v_total integer;
  v_conteos jsonb;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    raise exception 'hr: se necesita una sesión' using errcode = '42501';
  end if;
  if not public.fn_hr_puede(p_org, 'hr.access_log.view') then
    perform public.fn_hr_registrar_intento(v_uid, p_org, null, null, 'registro_accesos', null, null, 'rpc:fn_hr_registro_accesos', '{}'::jsonb);
    return jsonb_build_object('permitido', false);
  end if;

  create temp table if not exists zz_hr_registro (id bigint) on commit drop;
  truncate zz_hr_registro;
  insert into zz_hr_registro
  select l.id from public.hr_access_log l
   where l.organization_id = p_org
     and (p_desde is null or l.occurred_at >= p_desde)
     and (p_hasta is null or l.occurred_at < p_hasta)
     and (p_person is null or l.person_id = p_person)
     and (p_grupo is null or l.data_group = p_grupo)
     and (v_busca is null
          or lower(coalesce(public.fn_hr_nombre_usuario(l.actor_user_id), '')) like '%' || v_busca || '%'
          or exists (select 1 from public.hr_people p where p.id = l.person_id
                      and lower(concat_ws(' ', p.first_name, p.last_name)) like '%' || v_busca || '%'));

  select jsonb_build_object(
           'ver', count(*) filter (where l.action = 'ver'),
           'editar', count(*) filter (where l.action = 'editar'),
           'exportar', count(*) filter (where l.action = 'exportar'),
           'sin_permiso', count(*) filter (where l.action = 'sin_permiso'))
    into v_conteos
    from public.hr_access_log l where l.id in (select id from zz_hr_registro);

  select count(*) into v_total from public.hr_access_log l
   where l.id in (select id from zz_hr_registro) and (p_accion is null or l.action = p_accion);

  select coalesce(jsonb_agg(public.fn_hr_registro_fila(x) order by x.occurred_at desc, x.id desc), '[]'::jsonb) into v_filas
    from (select l.* from public.hr_access_log l
           where l.id in (select id from zz_hr_registro) and (p_accion is null or l.action = p_accion)
           order by l.occurred_at desc, l.id desc
           limit least(greatest(coalesce(p_limite, 25), 1), 100) offset greatest(coalesce(p_desplazamiento, 0), 0)) x;

  return jsonb_build_object('permitido', true, 'total', v_total, 'conteos', v_conteos, 'filas', v_filas);
end;
$$;

-- Detalle sin valores: quién, cuándo, desde dónde, qué campo, fecha de efecto,
-- motivo, aprobación y otros registros del mismo empleado este mes.
create or replace function public.fn_hr_registro_acceso_detalle(p_org integer, p_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  l public.hr_access_log;
  ev public.hr_employment_events;
  v_aprob jsonb;
  v_otros jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  if not public.fn_hr_puede(p_org, 'hr.access_log.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into l from public.hr_access_log where id = p_id and organization_id = p_org;
  if not found then
    raise exception 'hr: el registro no existe' using errcode = 'P0002';
  end if;
  if l.detail ? 'evento' then
    select * into ev from public.hr_employment_events where id = (l.detail->>'evento')::uuid and organization_id = p_org;
  end if;
  if ev.approval_instance_id is not null then
    select jsonb_build_object('estado', i.status, 'tipo', i.request_type,
             'aprobadores', coalesce((select jsonb_agg(public.fn_hr_nombre_usuario(d.actor_user_id) order by d.decided_at)
                                        from public.hr_approval_decisions d where d.instance_id = i.id and d.decision = 'aprobar'), '[]'::jsonb))
      into v_aprob from public.hr_approval_instances i where i.id = ev.approval_instance_id;
  elsif ev.id is not null and ev.approved_by is not null then
    v_aprob := jsonb_build_object('estado', 'aprobada', 'tipo', null, 'aprobadores', jsonb_build_array(public.fn_hr_nombre_usuario(ev.approved_by)));
  end if;
  select coalesce(jsonb_agg(public.fn_hr_registro_fila(x) order by x.occurred_at desc), '[]'::jsonb) into v_otros
    from (select o.* from public.hr_access_log o
           where o.organization_id = p_org and o.person_id = l.person_id and o.id <> l.id and l.person_id is not null
             and o.occurred_at >= date_trunc('month', l.occurred_at)
           order by o.occurred_at desc limit 5) x;
  return public.fn_hr_registro_fila(l) || jsonb_build_object(
    'evento_detalle', case when ev.id is null then null else jsonb_build_object(
       'id', ev.id, 'campo', ev.field, 'desde', ev.effective_from, 'motivo', ev.reason, 'estado', ev.status,
       'tiene_valores', true) end,
    'aprobacion', v_aprob,
    'otros', v_otros);
end;
$$;

-- «Mostrar valores»: exige ver el registro Y el grupo del empleado; queda registrado.
create or replace function public.fn_hr_registro_mostrar_valores(
  p_actor uuid, p_org integer, p_id bigint, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  l public.hr_access_log;
  ev public.hr_employment_events;
  v_grupo text;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.access_log.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into l from public.hr_access_log where id = p_id and organization_id = p_org;
  if not found or not (l.detail ? 'evento') then
    raise exception 'hr: el registro no tiene valores' using errcode = 'P0002';
  end if;
  select * into ev from public.hr_employment_events where id = (l.detail->>'evento')::uuid and organization_id = p_org;
  if not found then
    raise exception 'hr: el registro no tiene valores' using errcode = 'P0002';
  end if;
  v_grupo := public.fn_hr_grupo_de_campo(ev.field);
  if v_grupo = 'basico' then
    if not public.fn_hr_actor_puede_empleo(p_actor, ev.employment_id, 'basico', 'ver') then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
  elsif not public.fn_hr_actor_puede_grupo(p_actor, p_org, l.person_id, v_grupo, 'ver') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, l.person_id, ev.employment_id,
    case when v_grupo = 'basico' then 'basico' else v_grupo end, 'ver', p_ip, p_ua, p_ruta,
    jsonb_build_object('origen', 'registro_accesos', 'registro', l.id, 'evento', ev.id, 'campos', jsonb_build_array(ev.field)));
  return jsonb_build_object('anterior', ev.old_value, 'nuevo', ev.new_value, 'campo', ev.field);
end;
$$;

revoke execute on function public.fn_hr_ip_parcial(inet) from public, anon;
revoke execute on function public.fn_hr_registrar_intento(uuid, integer, uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_registrar_acceso_interno(uuid, integer, uuid, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_nombre_usuario(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_registro_fila(public.hr_access_log) from public, anon, authenticated;
revoke execute on function public.fn_hr_registro_accesos(integer, timestamptz, timestamptz, text, uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.fn_hr_registro_acceso_detalle(integer, bigint) from public, anon;
revoke execute on function public.fn_hr_registro_mostrar_valores(uuid, integer, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_ip_parcial(inet) to authenticated, service_role;
grant execute on function public.fn_hr_registrar_intento(uuid, integer, uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.fn_hr_registrar_acceso_interno(uuid, integer, uuid, uuid, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.fn_hr_registro_accesos(integer, timestamptz, timestamptz, text, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.fn_hr_registro_acceso_detalle(integer, bigint) to authenticated;
grant execute on function public.fn_hr_registro_mostrar_valores(uuid, integer, bigint, text, text, text) to service_role;
