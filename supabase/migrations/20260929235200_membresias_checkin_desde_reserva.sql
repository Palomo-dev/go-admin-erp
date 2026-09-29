-- Membresías fase 3 · Check-in desde una reserva de clase (docs/design/MEMBRESIAS-FASE-1-2.md §13).
--
-- fn_membresia_registrar_checkin gana `p_class_reservation_id integer default null` (compatibilidad:
-- las llamadas de 5 argumentos siguen igual). Se parte de la definición VIVA (pg_get_functiondef,
-- md5 9e57bfeda59235d8f734615906ad70ba, de 20260929001000_membresias_m6_funciones) y solo se añade
-- el bloque «Reserva de clase». Con reserva:
--   - la reserva debe ser de la organización (si no: reserva_no_encontrada), del mismo miembro
--     (reserva_de_otro_miembro) y la sede es la de la clase (sucursal_invalida);
--   - reserva cancelada o clase cancelada: se rechaza sin registrar nada;
--   - las reglas de la entrada son las mismas (vencida, congelada, gracia con aviso, sede, horario,
--     tope diario): la reserva NO elige la membresía; se usa la que mejor da acceso;
--   - permitida: la reserva pasa a `checked_in` (checkin_time, membership_id si no tenía);
--     rechazada: la reserva queda como estaba y el rechazo queda registrado con la reserva;
--   - idempotente: el candado sobre la reserva serializa dos clics; si ya hay una entrada permitida
--     con esa reserva, se devuelve la misma (`repetida: true`) sin insertar otra. El índice único
--     parcial lo garantiza también a nivel de tabla.
-- Cambiar la lista de argumentos crea otra firma: se quita la de 5 argumentos en la misma
-- transacción (si quedaran las dos, una llamada con 5 argumentos sería ambigua).

create unique index if not exists member_checkins_reserva_permitida_uq
  on public.member_checkins (class_reservation_id)
  where class_reservation_id is not null and denied_reason is null;

drop function if exists public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer);

create or replace function public.fn_membresia_registrar_checkin(
  p_organization_id integer,
  p_customer_id uuid,
  p_branch_id integer,
  p_method text default 'manual'::text,
  p_membership_id integer default null::integer,
  p_class_reservation_id integer default null::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  -- Reserva de clase (20260929235000)
  v_res record;
  v_previo record;
  v_estado_reserva text;
begin
  perform public.fn_membresias_int_exigir(p_organization_id, array['memberships.checkin']);
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.organization_id = p_organization_id) then
    raise exception 'cliente_no_encontrado' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;

  -- Reserva de clase (20260929235000): de la organización, del miembro y en la sede de la clase.
  if p_class_reservation_id is not null then
    select r.id, r.customer_id, r.status, r.gym_class_id, c.branch_id as clase_sede, c.status as clase_estado
      into v_res
      from public.class_reservations r
      join public.gym_classes c on c.id = r.gym_class_id and c.organization_id = p_organization_id
     where r.id = p_class_reservation_id and r.organization_id = p_organization_id
     for update of r;
    if not found then
      raise exception 'reserva_no_encontrada' using errcode = 'P0002';
    end if;
    if v_res.customer_id <> p_customer_id then
      raise exception 'reserva_de_otro_miembro' using errcode = '22023';
    end if;
    if v_res.clase_sede <> p_branch_id then
      raise exception 'sucursal_invalida' using errcode = '22023';
    end if;
    if v_res.status = 'cancelled' then
      raise exception 'reserva_cancelada' using errcode = '22023';
    end if;
    if v_res.clase_estado = 'cancelled' then
      raise exception 'clase_cancelada' using errcode = '22023';
    end if;
    -- Idempotencia: ya hay una entrada permitida con esta reserva → la misma, sin insertar otra.
    select k.id, k.membership_id into v_previo
      from public.member_checkins k
     where k.class_reservation_id = v_res.id and k.denied_reason is null
     order by k.id desc
     limit 1;
    if found then
      select * into v_m from public.memberships m where m.id = v_previo.membership_id;
      return jsonb_build_object(
        'permitido', true, 'motivo', null, 'aviso', null, 'dias_gracia', null, 'checkin_id', v_previo.id,
        'repetida', true,
        'reserva', jsonb_build_object('id', v_res.id, 'estado', 'checked_in'),
        'membresia', case when v_m.id is null then null else jsonb_build_object(
          'id', v_m.id, 'estado', v_m.status, 'plan', v_m.plan_snapshot->>'nombre', 'desde', v_m.start_date,
          'hasta', v_m.end_date, 'grace_until', v_m.grace_until, 'codigo', v_m.access_code) end);
    end if;
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
                                      staff_id, membership_id, class_reservation_id)
  values (p_organization_id, p_customer_id, p_branch_id, now(), v_method, v_motivo, auth.uid(), v_m.id,
          p_class_reservation_id)
  returning id into v_checkin;
  if v_m.id is not null then
    perform public.fn_membresias_int_evento(v_m.id, p_organization_id,
      case when v_motivo is null then 'access_granted' else 'access_denied' end,
      coalesce(v_motivo, v_aviso, 'Entrada'), null, null,
      jsonb_build_object('checkin_id', v_checkin, 'branch_id', p_branch_id, 'method', v_method, 'aviso', v_aviso,
                         'class_reservation_id', p_class_reservation_id));
  end if;

  -- Reserva de clase (20260929235000): la entrada permitida marca la asistencia.
  if p_class_reservation_id is not null then
    v_estado_reserva := v_res.status;
    if v_motivo is null and v_m.id is not null then
      update public.class_reservations
         set status = 'checked_in',
             checkin_time = coalesce(checkin_time, now()),
             membership_id = coalesce(membership_id, v_m.id),
             updated_at = now()
       where id = p_class_reservation_id;
      v_estado_reserva := 'checked_in';
    end if;
  end if;

  return jsonb_build_object(
    'permitido', v_motivo is null and v_m.id is not null,
    'motivo', v_motivo, 'aviso', v_aviso, 'dias_gracia', v_dias_gracia, 'checkin_id', v_checkin,
    'repetida', false,
    'reserva', case when p_class_reservation_id is null then null
                    else jsonb_build_object('id', p_class_reservation_id, 'estado', v_estado_reserva) end,
    'membresia', case when v_m.id is null then null else jsonb_build_object(
      'id', v_m.id, 'estado', v_m.status, 'plan', v_m.plan_snapshot->>'nombre', 'desde', v_m.start_date,
      'hasta', v_m.end_date, 'grace_until', v_m.grace_until, 'codigo', v_m.access_code) end);
end;
$function$;

revoke all on function public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer, integer) from public, anon;
grant execute on function public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer, integer) to authenticated, service_role;

comment on function public.fn_membresia_registrar_checkin(integer, uuid, integer, text, integer, integer) is
  'Registra una entrada (o su rechazo) con las reglas de la membresía. Con p_class_reservation_id: valida la reserva '
  '(organización, miembro, sede de la clase), marca la asistencia si se permite y es idempotente por reserva.';
