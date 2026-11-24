-- Rollback de 20261123233000_transporte_autorizadores_y_conductores: vuelve la RPC de tres
-- parámetros (el PIN identifica a la persona) y quita las funciones nuevas.

drop function if exists public.transporte_despachar_viaje(uuid, text, text, uuid);
drop function if exists public.fn_transporte_autorizadores(integer);
drop function if exists public.fn_transporte_tiene_pin(integer, uuid);
drop function if exists public.fn_transporte_conductores(integer);

create or replace function public.transporte_despachar_viaje(p_trip uuid, p_motivo text default null, p_pin text default null)
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
      if v_autoriza is null or not public.fn_transporte_puede_actor(v_autoriza, t.organization_id, 'transporte.despacho.excepcion') then
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

  -- Planilla: PD-AAAA-000001 por organización (candado por organización para el consecutivo).
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
revoke all on function public.transporte_despachar_viaje(uuid, text, text) from public, anon;
grant execute on function public.transporte_despachar_viaje(uuid, text, text) to authenticated, service_role;

comment on function public.transporte_despachar_viaje(uuid, text, text) is
  'Despachos de hoy: da salida al viaje (en ruta + planilla) o lo deja bloqueado con sus causas. Con motivo y PIN de un usuario con transporte.despacho.excepcion, sale con excepción registrada. Exige transporte.despachar o transporte.manage.';
