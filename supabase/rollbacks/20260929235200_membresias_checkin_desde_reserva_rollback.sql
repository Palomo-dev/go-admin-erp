-- Rollback de 20260929235200_membresias_checkin_desde_reserva (los marcadores «20260929235000» dentro del
-- cuerpo de la función son los del texto aplicado por MCP; el archivo se renombró después para no chocar
-- de versión con 20260929235000_membresias_f3_precio_plan_legado).
-- Reinstala fn_membresia_registrar_checkin de 5 argumentos EXACTAMENTE como estaba viva antes de la
-- migración (pg_get_functiondef, md5 9e57bfeda59235d8f734615906ad70ba) y quita la de 6 argumentos
-- y el índice único parcial. No toca datos: las filas de member_checkins con class_reservation_id y
-- las reservas marcadas `checked_in` por la función nueva se conservan.
-- Antes de revertir, la ruta POST /api/membresias/reservas/[id]/entrada debe dejar de desplegarse
-- (llama con p_class_reservation_id y fallaría con «function does not exist»).

drop function if exists public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer, integer);

CREATE OR REPLACE FUNCTION public.fn_membresia_registrar_checkin(p_organization_id integer, p_customer_id uuid, p_branch_id integer, p_method text DEFAULT 'manual'::text, p_membership_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tz text;
  v_ahora_local timestamp;
  v_m public.memberships%rowtype;
  v_motivo text;
  v_aviso text;
  v_dias_gracia integer;
  v_sched jsonb;
  v_hoy_count integer;
  v_id integer;
  v_checkin integer;
  v_method text := case when p_method in ('qr', 'manual', 'rfid', 'fingerprint', 'facial') then p_method else 'manual' end;
begin
  perform public.fn_membresias_int_exigir(p_organization_id, array['memberships.checkin']);
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id) then
    raise exception 'cliente_no_encontrado' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  v_tz := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_ahora_local := now() at time zone v_tz;

  -- La membresía que mejor da acceso: vigente, en gracia, por activar, congelada, pendiente, vencida.
  select * into v_m from public.memberships m
   where m.organization_id = p_organization_id and m.customer_id = p_customer_id
     and (p_membership_id is null or m.id = p_membership_id)
     and m.status <> 'cancelled'
   order by case
              when m.status = 'active' and m.start_date <= now() and m.end_date >= now() then 0
              when m.status = 'past_due' and coalesce(m.grace_until, m.end_date) >= now() then 1
              when m.status = 'pending' then 2
              when m.status = 'frozen' then 3
              else 4 end,
            m.end_date desc
   limit 1
   for update;

  if not found then
    v_motivo := 'sin_membresia';
  elsif v_m.status = 'pending' then
    if coalesce((v_m.plan_snapshot->>'requires_activation')::boolean, false)
       and public.fn_membresias_int_pagada(v_m.sale_id, v_m.invoice_id) then
      v_id := public.fn_membresias_int_activar(v_m.id, true);
      select * into v_m from public.memberships where id = v_id;
      v_aviso := 'activada_hoy';
    else
      v_motivo := 'pendiente_de_pago';
    end if;
  elsif v_m.status = 'frozen' then
    v_motivo := 'congelada';
  elsif v_m.status = 'past_due' and coalesce(v_m.grace_until, v_m.end_date) >= now() then
    v_dias_gracia := greatest((coalesce(v_m.grace_until, v_m.end_date) at time zone v_tz)::date - v_ahora_local::date, 0);
    v_aviso := 'en_gracia';
  elsif v_m.status = 'active' and v_m.end_date >= now() and v_m.start_date <= now() then
    null;
  else
    v_motivo := 'vencida';
  end if;

  if v_motivo is null and v_m.id is not null then
    if jsonb_typeof(v_m.plan_snapshot->'allowed_branch_ids') = 'array'
       and jsonb_array_length(v_m.plan_snapshot->'allowed_branch_ids') > 0
       and not (v_m.plan_snapshot->'allowed_branch_ids') @> to_jsonb(p_branch_id) then
      v_motivo := 'sede_no_permitida';
    end if;
  end if;
  if v_motivo is null and v_m.id is not null then
    v_sched := v_m.plan_snapshot->'access_schedule';
    if jsonb_typeof(v_sched) = 'object' then
      if jsonb_typeof(v_sched->'dias') = 'array' and jsonb_array_length(v_sched->'dias') > 0
         and not (v_sched->'dias') @> to_jsonb(extract(isodow from v_ahora_local)::int) then
        v_motivo := 'fuera_de_horario';
      elsif nullif(v_sched->>'desde', '') is not null and nullif(v_sched->>'hasta', '') is not null
         and not (v_ahora_local::time between (v_sched->>'desde')::time and (v_sched->>'hasta')::time) then
        v_motivo := 'fuera_de_horario';
      end if;
    end if;
  end if;
  if v_motivo is null and v_m.id is not null and nullif(v_m.plan_snapshot->>'daily_checkin_limit', '') is not null then
    select count(*) into v_hoy_count from public.member_checkins c
     where c.membership_id = v_m.id and c.denied_reason is null
       and (c.checkin_at at time zone v_tz)::date = v_ahora_local::date;
    if v_hoy_count >= (v_m.plan_snapshot->>'daily_checkin_limit')::int then
      v_motivo := 'limite_diario';
    end if;
  end if;

  insert into public.member_checkins (organization_id, customer_id, branch_id, checkin_at, method, denied_reason,
                                      staff_id, membership_id)
  values (p_organization_id, p_customer_id, p_branch_id, now(), v_method, v_motivo, auth.uid(), v_m.id)
  returning id into v_checkin;
  if v_m.id is not null then
    perform public.fn_membresias_int_evento(v_m.id, p_organization_id,
      case when v_motivo is null then 'access_granted' else 'access_denied' end,
      coalesce(v_motivo, v_aviso, 'Entrada'), null, null,
      jsonb_build_object('checkin_id', v_checkin, 'branch_id', p_branch_id, 'method', v_method, 'aviso', v_aviso));
  end if;

  return jsonb_build_object(
    'permitido', v_motivo is null and v_m.id is not null,
    'motivo', v_motivo, 'aviso', v_aviso, 'dias_gracia', v_dias_gracia, 'checkin_id', v_checkin,
    'membresia', case when v_m.id is null then null else jsonb_build_object(
      'id', v_m.id, 'estado', v_m.status, 'plan', v_m.plan_snapshot->>'nombre', 'desde', v_m.start_date,
      'hasta', v_m.end_date, 'grace_until', v_m.grace_until, 'codigo', v_m.access_code) end);
end;
$function$;

revoke all on function public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer) from public, anon;
grant execute on function public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer) to authenticated, service_role;

drop index if exists public.member_checkins_reserva_permitida_uq;
