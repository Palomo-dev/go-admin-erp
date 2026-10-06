-- Aplicada por MCP el 2026-10-06. Disponibilidad de mesas por sede.
--
-- Ajuste antes de aplicar (2026-10-06, después de D1 = 20261006113220): la
-- disponibilidad lee los ajustes con `fn_ajustes_reserva` y las franjas con
-- `fn_restaurant_franjas`, las MISMAS funciones con que `create_restaurant_reservation`
-- valida. Antes cada una tenía su propia consulta (la disponibilidad filtraba
-- `is_enabled` y caía en los defaults; la creación tomaba la fila de la sede
-- aunque estuviera apagada y respondía DESHABILITADA): con una sede apagada y
-- la organización encendida, el sitio ofrecía horas que luego se rechazaban.
-- Con reservas web apagadas ya no se ofrece ninguna hora. Con 0 filas en
-- `restaurant_booking_settings` (hoy) el resultado no cambia: reensayado.
--
-- Problema verificado por MCP: `get_restaurant_availability` no recibe sede.
-- Toma la PRIMERA configuración habilitada de la organización (`order by
-- branch_id nulls last limit 1`, es decir, la de cualquier sede) y cuenta las
-- mesas de TODAS las sedes. En cambio `create_restaurant_reservation` sí valida
-- por sede (`t.branch_id = p_branch_id`). Resultado: el sitio ofrecía horas de
-- la organización que luego la sede rechazaba con «No hay mesas disponibles».
-- Ejemplo real: org 120 tiene 24 mesas, todas en una sede, y otra sede sin
-- mesas, y la segunda sede salía con todas las horas libres.
--
-- Qué hace:
-- 1. Nueva sobrecarga con `p_branch_id` en SEGUNDA posición y SIN default:
--      get_restaurant_availability(p_organization_id, p_branch_id, p_date,
--                                  p_party_size, p_zone, p_slot_interval)
--    Con `p_branch_id` NULL: ajustes de la organización (`branch_id is null`)
--    y mesas de toda la organización. Con sede: la configuración de esa sede
--    (si no tiene, la de la organización), solo mesas de esa sede y la zona
--    horaria de la sede. Ajustes y franjas, con fn_ajustes_reserva y
--    fn_restaurant_franjas (ver arriba).
-- 2. La firma de 5 argumentos se conserva y pasa a delegar en la nueva con
--    sede NULL. Con 0 filas de configuración (hoy) devuelve lo mismo que la
--    función viva antes de aplicar (comprobado en el reensayo).
--
-- Por qué una sobrecarga y no un sexto parámetro con default: con las dos
-- firmas y default en ambas, una llamada sin sede es ambigua («function ... is
-- not unique», ensayado) y PostgREST responde PGRST203. Quitar la firma vieja
-- exige borrarla, cosa que esta ronda no admite. Sin default en `p_branch_id`, una
-- llamada sin sede solo encaja en la firma de 5 y una con sede solo en la de 6.
-- Para quien llama, la sede es opcional: omitirla = comportamiento actual.
--
-- El sitio (goadmin-websites) manda `p_branch_id` solo si la reserva tiene
-- sede, y si esta función aún no existe (PGRST202) repite la llamada sin sede:
-- funciona antes y después de aplicar.
--
-- Corrige además, en las dos firmas, `if v_settings is not null`: con un
-- `record`, eso solo es verdadero si TODAS sus columnas son no nulas, así que
-- una configuración con `max_covers_per_slot` o `deposit_amount` en NULL (lo
-- normal) se ignoraba y salían las horas por defecto. Hoy
-- `restaurant_booking_settings` tiene 0 filas: el resultado actual no cambia.
--
-- Ensayo 2026-10-06 (bloque `do` que aplica esto, prueba y termina en
-- `raise exception` para deshacerse, vía `execute_sql`):
--   ENSAYO_OK sin_sede_igual=true franjas_org=11 | sede95 libres=11/11 |
--   sede101 libres=0/6 primera=19:00 | sede_ajena=[42501 La sede no pertenece
--   a la organización] | anon=[42501 permission denied for function ...]
-- (org 120, fecha +7 días, como `authenticated` miembro de la org y como
-- `anon`. Sin sede, la firma de 5, la de 6 con NULL y la llamada con nombres
-- devuelven lo mismo que la función viva antes de aplicar.)
--
-- Reensayo 2026-10-06 (versión con fn_ajustes_reserva y fn_restaurant_franjas, después de D1):
--   ENSAYO_OK T1 firma de 5 (sitio sin sede) = función viva en 36 casos (todas
--   las orgs con mesas × 4 días) | T2 alta OK | T3 con sede (llamada del sitio por
--   nombre) 11 franjas | T4 sede apagada y org encendida: 0 horas y creación
--   DESHABILITADA | T5 turnos de la sede: primera hora 08:00 y la validación la
--   acepta | T6 sede ajena → 42501 | T7 anon sin EXECUTE
-- (La nota de alcance anterior sobre `create_restaurant_reservation` quedó
-- resuelta por D1, que ya lee la configuración con fn_ajustes_reserva.)

create or replace function public.get_restaurant_availability(
  p_organization_id integer,
  p_branch_id integer,
  p_date date,
  p_party_size integer default 2,
  p_zone text default null::text,
  p_slot_interval integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_settings        public.restaurant_booking_settings;
  v_turn_duration   integer := 90;
  v_buffer          integer := 15;
  v_slot_interval   integer := 30;
  v_service_hours   jsonb;
  v_slot_min        integer;
  v_slots           jsonb := '[]'::jsonb;
  v_free_count      integer;
  v_suggested       jsonb := '[]'::jsonb;
  v_now             timestamptz := now();
  v_now_min         integer;
  v_is_today        boolean;
  v_min_advance     integer := 60;
  v_tz              text;
  v_now_local       timestamp;
  v_branch_tz       integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);

  if p_branch_id is not null then
    -- La sede debe ser de la organización: una sede ajena no devuelve horas.
    if not exists (
      select 1 from public.branches b
       where b.id = p_branch_id and b.organization_id = p_organization_id
    ) then
      raise exception 'La sede no pertenece a la organización' using errcode = '42501';
    end if;
  end if;

  -- Los MISMOS ajustes que valida create_restaurant_reservation (D1): la fila
  -- de la sede gana y la de la organización es el respaldo. Una sola regla.
  v_settings := public.fn_ajustes_reserva(p_organization_id, p_branch_id);

  if v_settings.id is not null then
    -- Reservas web apagadas: la creación responde DESHABILITADA, así que aquí
    -- no se ofrece ninguna hora.
    if v_settings.is_enabled = false then
      return jsonb_build_object(
        'date', p_date,
        'partySize', p_party_size,
        'slots', '[]'::jsonb,
        'suggestedTimes', '[]'::jsonb,
        'available', false
      );
    end if;
    v_turn_duration := coalesce(v_settings.turn_duration_minutes, 90);
    v_buffer := coalesce(v_settings.buffer_minutes, 15);
    v_slot_interval := coalesce(p_slot_interval, v_settings.slot_interval_minutes, 30);
    v_min_advance := coalesce(v_settings.min_advance_minutes, 60);
    v_service_hours := v_settings.service_hours;
  else
    v_slot_interval := coalesce(p_slot_interval, 30);
  end if;

  -- Zona de la sede que reserva (NULL = zona de la organización).
  v_branch_tz := coalesce(p_branch_id, v_settings.branch_id);
  v_tz := public.fn_timezone_for(p_organization_id, v_branch_tz);
  v_now_local := v_now at time zone v_tz;

  v_is_today := (p_date = public.fn_today_for(p_organization_id, v_branch_tz));
  v_now_min := extract(hour from v_now_local) * 60 + extract(minute from v_now_local);

  -- Las franjas del día salen de la misma función que usa la validación (D1).
  for v_slot_min in
    select f from public.fn_restaurant_franjas(v_service_hours, p_date, v_slot_interval, v_turn_duration) f
  loop
    if not (v_is_today and v_slot_min <= v_now_min + v_min_advance) then
      select count(*) into v_free_count
        from public.restaurant_tables t
       where t.organization_id = p_organization_id
         and (p_branch_id is null or t.branch_id = p_branch_id)
         and coalesce(t.capacity, 4) >= p_party_size
         and (p_zone is null or t.zone = p_zone)
         and not exists (
           select 1
             from public.restaurant_reservations r
            where r.restaurant_table_id = t.id
              and r.reservation_date = p_date
              and r.status in ('pending', 'confirmed', 'seated')
              and (
                (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time))
                  < v_slot_min + v_turn_duration + v_buffer
                and
                (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)
                  + coalesce(r.duration_minutes, v_turn_duration) + v_buffer)
                  > v_slot_min
              )
         );

      v_slots := v_slots || jsonb_build_array(jsonb_build_object(
        'time', lpad((v_slot_min / 60)::text, 2, '0') || ':' || lpad((v_slot_min % 60)::text, 2, '0'),
        'available', v_free_count > 0,
        'remaining', v_free_count
      ));

      if v_free_count > 0 and jsonb_array_length(v_suggested) < 5 then
        v_suggested := v_suggested || jsonb_build_array(
          lpad((v_slot_min / 60)::text, 2, '0') || ':' || lpad((v_slot_min % 60)::text, 2, '0')
        );
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'date', p_date,
    'partySize', p_party_size,
    'slots', v_slots,
    'suggestedTimes', v_suggested,
    'available', exists(select 1 from jsonb_array_elements(v_slots) where (value->>'available')::boolean)
  );
end;
$function$;

comment on function public.get_restaurant_availability(integer, integer, date, integer, text, integer) is
  'Horas disponibles de reserva de mesa con los mismos ajustes (fn_ajustes_reserva) y franjas (fn_restaurant_franjas) que valida create_restaurant_reservation. Con p_branch_id: mesas y zona horaria de esa sede. Con NULL: mesas de toda la organización.';

revoke all on function public.get_restaurant_availability(integer, integer, date, integer, text, integer) from public, anon;
grant execute on function public.get_restaurant_availability(integer, integer, date, integer, text, integer) to authenticated, service_role;

-- La firma de 5 argumentos delega: una sola implementación.
create or replace function public.get_restaurant_availability(
  p_organization_id integer,
  p_date date,
  p_party_size integer default 2,
  p_zone text default null::text,
  p_slot_interval integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.get_restaurant_availability(
    p_organization_id, null::integer, p_date, p_party_size, p_zone, p_slot_interval
  );
end;
$function$;
