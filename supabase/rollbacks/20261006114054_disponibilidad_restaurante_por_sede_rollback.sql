-- Reversión de 20261006200000_disponibilidad_restaurante_por_sede (aplicada el 2026-10-06 como 20261006114054).
-- No toca datos. Antes de aplicarla, el sitio debe dejar de mandar `p_branch_id`
-- o al menos conservar su reintento sin sede (PGRST202), que ya trae.

-- 1. La firma de 5 argumentos recupera su cuerpo propio (el de
--    20260923211000_fase_d_dia_de_la_organizacion_en_el_resto, vivo hasta hoy).
create or replace function public.get_restaurant_availability(p_organization_id integer, p_date date, p_party_size integer default 2, p_zone text default null::text, p_slot_interval integer default 30)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_settings        record;
  v_turn_duration   integer := 90;
  v_buffer          integer := 15;
  v_slot_interval   integer := 30;
  v_service_hours   jsonb;
  v_weekday         text;
  v_shifts          jsonb;
  v_shift           jsonb;
  v_from_min        integer;
  v_to_min          integer;
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
BEGIN
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  SELECT * INTO v_settings
  FROM public.restaurant_booking_settings
  WHERE organization_id = p_organization_id
    AND is_enabled = true
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  IF v_settings IS NOT NULL THEN
    v_turn_duration := COALESCE(v_settings.turn_duration_minutes, 90);
    v_buffer := COALESCE(v_settings.buffer_minutes, 15);
    v_slot_interval := COALESCE(p_slot_interval, v_settings.slot_interval_minutes, 30);
    v_min_advance := COALESCE(v_settings.min_advance_minutes, 60);
    v_service_hours := v_settings.service_hours;
  END IF;

  -- Zona de la sede que reserva (NULL en branch_id = zona de la organizacion)
  v_tz := public.fn_timezone_for(p_organization_id, v_settings.branch_id);
  v_now_local := v_now AT TIME ZONE v_tz;

  v_weekday := lower(to_char(p_date, 'Dy'));
  v_is_today := (p_date = public.fn_today_for(p_organization_id, v_settings.branch_id));
  v_now_min := EXTRACT(hour FROM v_now_local) * 60 + EXTRACT(minute FROM v_now_local);

  IF v_service_hours IS NOT NULL AND v_service_hours != '{}'::jsonb AND v_service_hours ? v_weekday THEN
    v_shifts := v_service_hours->v_weekday;
  ELSE
    v_shifts := '[{"from":"12:00","to":"15:00"},{"from":"18:00","to":"22:30"}]'::jsonb;
  END IF;

  FOR v_shift IN SELECT * FROM jsonb_array_elements(v_shifts)
  LOOP
    v_from_min := (substring(v_shift->>'from' from 1 for 2))::integer * 60
                + (substring(v_shift->>'from' from 4 for 2))::integer;
    v_to_min := (substring(v_shift->>'to' from 1 for 2))::integer * 60
              + (substring(v_shift->>'to' from 4 for 2))::integer;

    v_slot_min := v_from_min;
    WHILE v_slot_min + v_turn_duration <= v_to_min LOOP
      IF NOT (v_is_today AND v_slot_min <= v_now_min + v_min_advance) THEN
        SELECT count(*) INTO v_free_count
        FROM public.restaurant_tables t
        WHERE t.organization_id = p_organization_id
          AND COALESCE(t.capacity, 4) >= p_party_size
          AND (p_zone IS NULL OR t.zone = p_zone)
          AND NOT EXISTS (
            SELECT 1
            FROM public.restaurant_reservations r
            WHERE r.restaurant_table_id = t.id
              AND r.reservation_date = p_date
              AND r.status IN ('pending', 'confirmed', 'seated')
              AND (
                (EXTRACT(hour FROM r.reservation_time) * 60 + EXTRACT(minute FROM r.reservation_time))
                  < v_slot_min + v_turn_duration + v_buffer
                AND
                (EXTRACT(hour FROM r.reservation_time) * 60 + EXTRACT(minute FROM r.reservation_time)
                  + COALESCE(r.duration_minutes, v_turn_duration) + v_buffer)
                  > v_slot_min
              )
          );

        v_slots := v_slots || jsonb_build_array(jsonb_build_object(
          'time', lpad((v_slot_min / 60)::text, 2, '0') || ':' || lpad((v_slot_min % 60)::text, 2, '0'),
          'available', v_free_count > 0,
          'remaining', v_free_count
        ));

        IF v_free_count > 0 AND jsonb_array_length(v_suggested) < 5 THEN
          v_suggested := v_suggested || jsonb_build_array(
            lpad((v_slot_min / 60)::text, 2, '0') || ':' || lpad((v_slot_min % 60)::text, 2, '0')
          );
        END IF;
      END IF;

      v_slot_min := v_slot_min + v_slot_interval;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'date', p_date,
    'partySize', p_party_size,
    'slots', v_slots,
    'suggestedTimes', v_suggested,
    'available', EXISTS(SELECT 1 FROM jsonb_array_elements(v_slots) WHERE (value->>'available')::boolean)
  );
END;
$function$;

-- 2. Se retira la sobrecarga con sede.
drop function if exists public.get_restaurant_availability(integer, integer, date, integer, text, integer);
