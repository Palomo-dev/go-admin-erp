-- Transporte · decisiones del dueño del 2026-11-23 (después de la primera entrega):
--
-- 1. Excepción de despacho: se queda el PIN de 6 dígitos de Recursos humanos, pero se elige al
--    supervisor. `fn_transporte_autorizadores(org)` lista a quien puede autorizar (permiso
--    `transporte.despacho.excepcion`, administradores incluidos) y si tiene PIN asignado (solo el
--    booleano: el hash nunca sale de la base). `transporte_despachar_viaje` gana `p_supervisor`:
--    el PIN se compara SOLO con el de esa persona y, si no tiene PIN, responde
--    `supervisor_sin_pin` para que la pantalla lo explique. Sin `p_supervisor` se comporta como
--    antes (el PIN identifica a la persona).
-- 2. Conductores en SOLO LECTURA para quien tiene `transporte.view`: `fn_transporte_conductores`
--    devuelve únicamente lo que sirve para despachar (nombre, documento, teléfono, licencia con
--    categoría y vencimiento, examen médico y estado). No abre `driver_credentials` por RLS:
--    editar sigue exigiendo `fn_logistica_gestiona` (logistica.manage) como hasta hoy.
--
-- Rollback: supabase/rollbacks/20261123233000_transporte_autorizadores_y_conductores_rollback.sql

-- ── 1. Conductores (solo lectura, columnas acotadas) ───────────────────────

create or replace function public.fn_transporte_conductores(p_org integer)
returns table (
  id uuid,
  user_id uuid,
  nombre text,
  documento_tipo text,
  documento text,
  telefono text,
  licencia_categoria text,
  licencia_vence date,
  examen_vence date,
  activo boolean,
  sede_id integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dc.id, dc.user_id, dc.full_name, dc.document_type, dc.document_number, dc.phone,
         dc.license_category, dc.license_expiry, dc.medical_certificate_expiry,
         coalesce(dc.is_active, true), dc.branch_id
    from public.driver_credentials dc
   where dc.organization_id = p_org
     and (public.fn_caja_puede(p_org, 'transporte.view')
          or public.fn_caja_puede(p_org, 'transporte.despachar')
          or public.fn_logistica_ve_todo(p_org))
   order by dc.full_name;
$$;
revoke all on function public.fn_transporte_conductores(integer) from public, anon;
grant execute on function public.fn_transporte_conductores(integer) to authenticated, service_role;

comment on function public.fn_transporte_conductores(integer) is
  'Transporte: conductores en solo lectura para quien tiene transporte.view (o despachar, o ve todo en Logística). Solo columnas para despachar; sin nómina ni datos bancarios. fn_caja_puede usa auth.uid() y exige membresía.';

-- ── 2. Quién puede autorizar excepciones ───────────────────────────────────

create or replace function public.fn_transporte_tiene_pin(p_org integer, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.hr_credentials k
      join public.employments e on e.id = k.employment_id and e.status = 'active'
     where k.organization_id = p_org and k.kind = 'pin' and k.revoked_at is null
       and public.fn_hr_usuario_del_vinculo(e.id) = p_user
  );
$$;
revoke all on function public.fn_transporte_tiene_pin(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_transporte_tiene_pin(integer, uuid) to service_role;

create or replace function public.fn_transporte_autorizadores(p_org integer)
returns table (user_id uuid, nombre text, tiene_pin boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.fn_caja_puede(p_org, 'transporte.despachar') or public.fn_caja_puede(p_org, 'transporte.manage')) then
    raise exception 'transporte: sin permiso' using errcode = '42501';
  end if;
  return query
    select om.user_id,
           coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email, '—')::text,
           public.fn_transporte_tiene_pin(p_org, om.user_id)
      from public.organization_members om
      left join public.profiles p on p.id = om.user_id
     where om.organization_id = p_org and om.is_active
       and public.fn_transporte_puede_actor(om.user_id, p_org, 'transporte.despacho.excepcion')
     order by 2;
end;
$$;
revoke all on function public.fn_transporte_autorizadores(integer) from public, anon;
grant execute on function public.fn_transporte_autorizadores(integer) to authenticated, service_role;

comment on function public.fn_transporte_autorizadores(integer) is
  'Despachos de hoy: personas que pueden autorizar una excepción de despacho y si tienen PIN de Recursos humanos (solo el booleano). Exige transporte.despachar o transporte.manage.';

-- ── 3. Despachar con el supervisor elegido ─────────────────────────────────

drop function if exists public.transporte_despachar_viaje(uuid, text, text);

create or replace function public.transporte_despachar_viaje(p_trip uuid, p_motivo text default null, p_pin text default null, p_supervisor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.trips;
  v_actor uuid := auth.uid();
  v_c jsonb;
  v_causas text;
  v_autoriza uuid;
  v_cred public.hr_credentials;
  v_emp public.employments;
  v_fallos integer;
  v_planilla text;
  v_anio text;
begin
  if v_actor is null then
    raise exception 'transporte: sin sesión' using errcode = '42501';
  end if;
  select * into t from public.trips where id = p_trip for update;
  if t.id is null
     or not exists (select 1 from public.organization_members om where om.user_id = v_actor and om.organization_id = t.organization_id and om.is_active) then
    raise exception 'transporte: viaje no encontrado' using errcode = 'P0002';
  end if;
  if not (public.fn_transporte_puede_actor(v_actor, t.organization_id, 'transporte.despachar')
          or public.fn_transporte_puede_actor(v_actor, t.organization_id, 'transporte.manage')) then
    raise exception 'transporte: sin permiso para despachar' using errcode = '42501';
  end if;
  if coalesce(t.status, 'scheduled') not in ('scheduled', 'boarding', 'delayed') then
    return jsonb_build_object('estado', 'no_despachable', 'status', t.status);
  end if;

  v_c := public.fn_transporte_cumplimiento_interno(t.id);
  select string_agg(b ->> 'causa', ',') into v_causas from jsonb_array_elements(v_c -> 'bloqueos') b;

  if v_causas is not null then
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      update public.trips set dispatch_block_reason = v_causas, updated_at = now() where id = t.id;
      insert into public.trip_dispatch_log (organization_id, trip_id, event, causes, actor)
      values (t.organization_id, t.id, 'bloqueado', v_c -> 'bloqueos', v_actor);
      return jsonb_build_object('estado', 'bloqueado', 'cumplimiento', v_c);
    end if;
    if not coalesce((v_c ->> 'admite_excepcion')::boolean, false) then
      return jsonb_build_object('estado', 'no_admite_excepcion', 'cumplimiento', v_c);
    end if;
    if length(btrim(p_motivo)) < 10 or length(p_motivo) > 500 then
      return jsonb_build_object('estado', 'motivo_invalido');
    end if;

    if coalesce((v_c ->> 'pide_pin')::boolean, true) then
      -- El supervisor elegido tiene que poder autorizar y tener PIN (se dice antes de gastar intentos).
      if p_supervisor is not null then
        if not public.fn_transporte_puede_actor(p_supervisor, t.organization_id, 'transporte.despacho.excepcion') then
          return jsonb_build_object('estado', 'sin_permiso_excepcion');
        end if;
        if not public.fn_transporte_tiene_pin(t.organization_id, p_supervisor) then
          return jsonb_build_object('estado', 'supervisor_sin_pin');
        end if;
      end if;
      select count(*) into v_fallos from public.trip_dispatch_log l
       where l.organization_id = t.organization_id and l.actor = v_actor and l.event = 'pin_rechazado'
         and l.created_at > now() - interval '15 minutes';
      if v_fallos >= 5 then
        return jsonb_build_object('estado', 'pin_bloqueado');
      end if;
      if coalesce(p_pin, '') ~ '^[0-9]{6}$' then
        select * into v_cred from public.hr_credentials k
         where k.organization_id = t.organization_id and k.kind = 'pin' and k.revoked_at is null
           and k.lookup_hash = public.fn_hr_credencial_lookup(public.fn_hr_marcacion_pepper(t.organization_id), 'pin', p_pin);
        if v_cred.id is not null and v_cred.secret_hash = extensions.crypt(p_pin, v_cred.secret_hash)
           and (v_cred.locked_until is null or v_cred.locked_until <= now()) then
          select * into v_emp from public.employments e where e.id = v_cred.employment_id and e.status = 'active';
          if v_emp.id is not null then
            v_autoriza := public.fn_hr_usuario_del_vinculo(v_emp.id);
          end if;
        end if;
      end if;
      if v_autoriza is null
         or (p_supervisor is not null and v_autoriza <> p_supervisor)
         or not public.fn_transporte_puede_actor(v_autoriza, t.organization_id, 'transporte.despacho.excepcion') then
        insert into public.trip_dispatch_log (organization_id, trip_id, event, causes, actor)
        values (t.organization_id, t.id, 'pin_rechazado', v_c -> 'bloqueos', v_actor);
        return jsonb_build_object('estado', 'pin_rechazado');
      end if;
    else
      if not public.fn_transporte_puede_actor(v_actor, t.organization_id, 'transporte.despacho.excepcion') then
        return jsonb_build_object('estado', 'sin_permiso_excepcion');
      end if;
      v_autoriza := v_actor;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('transporte_planilla'), t.organization_id);
  v_anio := to_char(now(), 'YYYY');
  select 'PD-' || v_anio || '-' || lpad((coalesce(max(substring(x.dispatch_sheet_number from 9)::integer), 0) + 1)::text, 6, '0')
    into v_planilla
    from public.trips x
   where x.organization_id = t.organization_id and x.dispatch_sheet_number like 'PD-' || v_anio || '-%';

  perform set_config('transporte.despacho_rpc', '1', true);
  update public.trips
     set status = 'in_transit',
         actual_departure = coalesce(actual_departure, now()),
         dispatched_at = now(),
         dispatched_by = v_actor,
         dispatch_sheet_number = v_planilla,
         dispatch_block_reason = null,
         dispatch_override_reason = case when v_causas is not null then btrim(p_motivo) end,
         dispatch_override_by = case when v_causas is not null then v_autoriza end,
         dispatch_override_at = case when v_causas is not null then now() end,
         updated_at = now()
   where id = t.id;
  perform set_config('transporte.despacho_rpc', '', true);

  insert into public.trip_dispatch_log (organization_id, trip_id, event, causes, reason, actor, authorized_by)
  values (t.organization_id, t.id, case when v_causas is not null then 'excepcion' else 'despachado' end,
          coalesce(v_c -> 'bloqueos', '[]'::jsonb), case when v_causas is not null then btrim(p_motivo) end, v_actor, v_autoriza);

  return jsonb_build_object('estado', case when v_causas is not null then 'despachado_con_excepcion' else 'despachado' end,
                            'planilla', v_planilla, 'cumplimiento', v_c);
end;
$$;
revoke all on function public.transporte_despachar_viaje(uuid, text, text, uuid) from public, anon;
grant execute on function public.transporte_despachar_viaje(uuid, text, text, uuid) to authenticated, service_role;

comment on function public.transporte_despachar_viaje(uuid, text, text, uuid) is
  'Despachos de hoy: da salida al viaje (en ruta + planilla) o lo deja bloqueado. Excepción: motivo + PIN de Recursos humanos del supervisor elegido (p_supervisor), verificado aquí; sin PIN asignado responde supervisor_sin_pin. Exige transporte.despachar o transporte.manage.';
