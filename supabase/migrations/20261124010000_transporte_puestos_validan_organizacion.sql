-- Transporte: `fn_reserve_seat` y `fn_release_seat` validan la organización (2026-11-24).
--
-- Eran SECURITY DEFINER sin ninguna guarda: cualquier usuario con sesión, de cualquier
-- organización, podía retener, vender o liberar puestos de un viaje ajeno con solo su id. Ahora:
-- - el viaje debe existir y la sesión pertenecer a su organización (`fn_assert_acceso_org`);
-- - el boleto, si viene, debe ser de esa misma organización;
-- - `search_path` fijo.
-- El comportamiento para la organización dueña no cambia (los usa ticketsService.ts).

create or replace function public.fn_reserve_seat(p_trip_id uuid, p_seat_label text, p_ticket_id uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_trip_seat_id uuid;
  v_org integer;
begin
  select t.organization_id into v_org from public.trips t where t.id = p_trip_id;
  if v_org is null then
    raise exception 'VIAJE_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_org);
  if p_ticket_id is not null and not exists (
    select 1 from public.trip_tickets tk where tk.id = p_ticket_id and tk.organization_id = v_org
  ) then
    raise exception 'BOLETO_AJENO' using errcode = '42501';
  end if;

  update public.trip_seats
     set status = case when p_ticket_id is not null then 'sold' else 'reserved' end,
         ticket_id = p_ticket_id,
         reserved_until = case when p_ticket_id is null then now() + interval '15 minutes' else null end,
         updated_at = now()
   where trip_id = p_trip_id
     and seat_label = p_seat_label
     and status = 'available'
  returning id into v_trip_seat_id;

  if v_trip_seat_id is not null then
    update public.trips set available_seats = available_seats - 1 where id = p_trip_id and available_seats > 0;
  end if;

  return v_trip_seat_id;
end;
$function$;

create or replace function public.fn_release_seat(p_trip_id uuid, p_seat_label text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_released boolean := false;
  v_org integer;
begin
  select t.organization_id into v_org from public.trips t where t.id = p_trip_id;
  if v_org is null then
    raise exception 'VIAJE_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_org);

  update public.trip_seats
     set status = 'available',
         ticket_id = null,
         reserved_until = null,
         updated_at = now()
   where trip_id = p_trip_id
     and seat_label = p_seat_label
     and status in ('reserved', 'sold')
  returning true into v_released;

  if v_released then
    update public.trips set available_seats = available_seats + 1 where id = p_trip_id;
  end if;

  return coalesce(v_released, false);
end;
$function$;

revoke execute on function public.fn_reserve_seat(uuid, text, uuid) from public, anon;
revoke execute on function public.fn_release_seat(uuid, text) from public, anon;
grant execute on function public.fn_reserve_seat(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.fn_release_seat(uuid, text) to authenticated, service_role;
