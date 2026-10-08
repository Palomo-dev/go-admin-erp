-- Plantilla «Café de especialidad» · M4 (fase F4): disponibilidad POR MESA.
--
-- 1. Cálculo de solape compartido (CLAUDE.md, regla 7): hasta hoy vivía copiado
--    tres veces dentro de create_restaurant_reservation. Se extrae a dos
--    funciones internas que usan esta RPC y, desde M5, create_restaurant_reservation:
--    - fn_mesa_libre(mesa, fecha, hora, duración, turno, colchón): la mesa no
--      tiene una reserva viva (pending|confirmed|seated) que se solape;
--    - fn_reservas_sin_mesa_solapadas(org, sede, fecha, hora, duración, turno,
--      colchón): reservas vivas SIN mesa que se solapan (cuentan contra el aforo).
--    La reserva existente ocupa [inicio, inicio + coalesce(duración, turno) + colchón)
--    y la nueva [hora, hora + duración + colchón), en minutos del día.
--
-- 2. get_restaurant_table_availability(org, sede, fecha, hora, personas
--    [, p_validar_reglas]) → (table_id, estado), estado ∈
--      libre | ocupada | no_alcanza | no_web
--    con las MISMAS reglas que la rama web de create_restaurant_reservation:
--    fn_ajustes_reserva (DESHABILITADA), fn_restaurant_slot_valido (sin las
--    reglas de CONTACTO, que se validan al crear), el solape con turno + colchón
--    y las reservas sin mesa, que cuentan contra el aforo: si no queda aforo,
--    ninguna mesa sale «libre».
--    - no_web: la mesa tiene is_web_bookable = false;
--    - no_alcanza: no cabe el grupo (capacidad o rango web_min/max_party);
--    - ocupada: hay solape o la franja ya no tiene aforo.
--    Zonas: las mismas que muestra get_restaurant_floor_plan_public (allowed_zones
--    si no está vacía).
--    p_validar_reglas (por defecto true) sigue el interruptor del sitio
--    (RESERVAS_ENFORCE_REGLAS): en false, una regla incumplida no bloquea, igual
--    que en create_restaurant_reservation.
--
-- Permisos: las dos funciones internas no se exponen a nadie; la RPC a
-- service_role (sitio) y authenticated (equipo, con fn_assert_acceso_org).

create or replace function public.fn_mesa_libre(
  p_table_id uuid,
  p_date date,
  p_time time,
  p_duracion integer,
  p_turno integer,
  p_buffer integer
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select not exists (
    select 1
      from public.restaurant_reservations r
     where r.restaurant_table_id = p_table_id
       and r.reservation_date = p_date
       and r.status in ('pending', 'confirmed', 'seated')
       and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time))
           < (extract(hour from p_time) * 60 + extract(minute from p_time)) + p_duracion + p_buffer
       and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)
            + coalesce(r.duration_minutes, p_turno) + p_buffer)
           > (extract(hour from p_time) * 60 + extract(minute from p_time))
  );
$$;

comment on function public.fn_mesa_libre(uuid, date, time, integer, integer, integer) is
  'Interna. La mesa no tiene una reserva viva que se solape con [hora, hora + duración + colchón). Fuente única del solape para create_restaurant_reservation y get_restaurant_table_availability.';

create or replace function public.fn_reservas_sin_mesa_solapadas(
  p_org integer,
  p_branch integer,
  p_date date,
  p_time time,
  p_duracion integer,
  p_turno integer,
  p_buffer integer
)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from public.restaurant_reservations r
   where r.organization_id = p_org
     and (p_branch is null or r.branch_id = p_branch)
     and r.restaurant_table_id is null
     and r.reservation_date = p_date
     and r.status in ('pending', 'confirmed', 'seated')
     and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time))
         < (extract(hour from p_time) * 60 + extract(minute from p_time)) + p_duracion + p_buffer
     and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)
          + coalesce(r.duration_minutes, p_turno) + p_buffer)
         > (extract(hour from p_time) * 60 + extract(minute from p_time));
$$;

comment on function public.fn_reservas_sin_mesa_solapadas(integer, integer, date, time, integer, integer, integer) is
  'Interna. Reservas vivas sin mesa que se solapan con la franja: cuentan contra las mesas libres.';

revoke all on function public.fn_mesa_libre(uuid, date, time, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.fn_reservas_sin_mesa_solapadas(integer, integer, date, time, integer, integer, integer) from public, anon, authenticated;

create or replace function public.get_restaurant_table_availability(
  p_organization_id integer,
  p_branch_id integer,
  p_date date,
  p_time time,
  p_party_size integer,
  p_validar_reglas boolean default true
)
returns table (table_id uuid, estado text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ajustes  public.restaurant_booking_settings;
  v_hay      boolean;
  v_turno    integer := 90;
  v_buffer   integer := 15;
  v_regla    text;
  v_zonas    text[];
  v_libres   integer := 0;
  v_sin_mesa integer := 0;
  v_aforo    boolean;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_organization_id is null or p_branch_id is null or not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'SEDE: La sede no pertenece a la organizacion' using errcode = '42501';
  end if;
  if p_date is null or p_time is null then
    raise exception 'FUERA_DE_HORARIO: Elige la fecha y la hora' using errcode = '22023';
  end if;
  if p_party_size is null or p_party_size < 1 then
    raise exception 'PERSONAS: El numero minimo de personas es 1';
  end if;

  v_ajustes := public.fn_ajustes_reserva(p_organization_id, p_branch_id);
  v_hay := v_ajustes.id is not null;
  if v_hay then
    if v_ajustes.is_enabled = false then
      raise exception 'DESHABILITADA: Las reservas online estan deshabilitadas para este restaurante';
    end if;
    v_turno := coalesce(v_ajustes.turn_duration_minutes, 90);
    v_buffer := coalesce(v_ajustes.buffer_minutes, 15);
    if coalesce(array_length(v_ajustes.allowed_zones, 1), 0) > 0 then
      v_zonas := v_ajustes.allowed_zones;
    end if;
  end if;

  -- El contacto se valida al crear la reserva. Aquí va un marcador para que
  -- fn_restaurant_slot_valido no se detenga en CONTACTO y revise el resto
  -- (personas, anticipación, horario y cupo de la franja).
  v_regla := public.fn_restaurant_slot_valido(
    p_organization_id, p_branch_id, p_date, p_time, p_party_size, null, '-', '-');
  if v_regla is not null and coalesce(p_validar_reglas, true) then
    raise exception '%', v_regla;
  end if;

  -- Aforo de la franja: las mismas cuentas que la rama web de
  -- create_restaurant_reservation (mesas que caben y están libres frente a las
  -- reservas sin mesa que se solapan). La duración web es la del turno.
  select count(*)::integer into v_libres
    from public.restaurant_tables t
   where t.organization_id = p_organization_id
     and t.branch_id = p_branch_id
     and coalesce(t.capacity, 4) >= p_party_size
     and public.fn_mesa_libre(t.id, p_date, p_time, v_turno, v_turno, v_buffer);
  v_sin_mesa := public.fn_reservas_sin_mesa_solapadas(
    p_organization_id, p_branch_id, p_date, p_time, v_turno, v_turno, v_buffer);
  v_aforo := v_libres > v_sin_mesa;

  return query
    select t.id,
           case
             when not t.is_web_bookable then 'no_web'
             when coalesce(t.capacity, 4) < p_party_size
               or p_party_size < coalesce(t.web_min_party, 1)
               or p_party_size > coalesce(t.web_max_party, coalesce(t.capacity, 4)) then 'no_alcanza'
             when not v_aforo
               or not public.fn_mesa_libre(t.id, p_date, p_time, v_turno, v_turno, v_buffer) then 'ocupada'
             else 'libre'
           end
      from public.restaurant_tables t
     where t.organization_id = p_organization_id
       and t.branch_id = p_branch_id
       and (v_zonas is null or t.zone = any (v_zonas))
     order by t.zone nulls last, t.name;
end;
$$;

comment on function public.get_restaurant_table_availability(integer, integer, date, time, integer, boolean) is
  'Disponibilidad por mesa de una sede para fecha, hora y personas: libre | ocupada | no_alcanza | no_web. Mismas reglas que la rama web de create_restaurant_reservation.';

revoke all on function public.get_restaurant_table_availability(integer, integer, date, time, integer, boolean) from public, anon;
grant execute on function public.get_restaurant_table_availability(integer, integer, date, time, integer, boolean) to service_role, authenticated;
