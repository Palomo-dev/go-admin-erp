-- Rollback de 20261007100100_reservas_reglas_servidor.
-- ORDEN: revertir antes 20261006114054_disponibilidad_restaurante_por_sede (usa fn_ajustes_reserva y
-- fn_restaurant_franjas, que este archivo borra) y 20261006113648_reservas_recordatorio_no_show.
-- Devuelve create_restaurant_reservation (12 argumentos) y
-- cancel_restaurant_reservation (uuid, text) a su definición del 2026-10-07
-- (leída por MCP antes de escribir la migración) y quita lo nuevo.
-- Antes de ejecutarlo: el ERP debe volver a la versión que no llama a la
-- sobrecarga de 16 argumentos ni a cancel con p_forzar.

drop function if exists public.create_restaurant_reservation(integer, date, time without time zone, integer, text, uuid, uuid, integer, boolean, integer, text, text, text, text, text, text);
drop function if exists public.cancel_restaurant_reservation(uuid, boolean, text);
drop function if exists public.fn_restaurant_slot_valido(integer, integer, date, time, integer, text, text, text);
drop function if exists public.fn_restaurant_franjas(jsonb, date, integer, integer);
drop function if exists public.fn_ajustes_reserva(integer, integer);

CREATE OR REPLACE FUNCTION public.create_restaurant_reservation(p_organization_id integer, p_reservation_date date, p_reservation_time time without time zone, p_party_size integer, p_customer_name text, p_branch_id integer DEFAULT NULL::integer, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_zone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_special_requests text DEFAULT NULL::text, p_source text DEFAULT 'website'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings        record;
  v_turn_duration   integer := 90;
  v_buffer          integer := 15;
  v_slot_minutes    integer;
  v_slot_end        integer;
  v_assigned_table  uuid;
  v_customer_id     uuid;
  v_reservation_id  uuid;
  v_status          text;
  v_conflict        boolean;
  v_table_rec       record;
  v_branch          integer;
BEGIN
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  SELECT * INTO v_settings
  FROM public.restaurant_booking_settings
  WHERE organization_id = p_organization_id
    AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL))
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  IF v_settings IS NOT NULL THEN
    v_turn_duration := COALESCE(v_settings.turn_duration_minutes, 90);
    v_buffer := COALESCE(v_settings.buffer_minutes, 15);
    IF v_settings.is_enabled = false THEN
      RAISE EXCEPTION 'Las reservas online estan deshabilitadas para este restaurante';
    END IF;
    IF p_party_size < COALESCE(v_settings.min_party_size, 1) THEN
      RAISE EXCEPTION 'El numero minimo de personas es %', v_settings.min_party_size;
    END IF;
    IF p_party_size > COALESCE(v_settings.max_party_size, 12) THEN
      RAISE EXCEPTION 'El numero maximo de personas es %', v_settings.max_party_size;
    END IF;
    v_status := CASE WHEN v_settings.require_confirmation THEN 'pending' ELSE 'confirmed' END;
  ELSE
    v_status := 'confirmed';
  END IF;

  v_slot_minutes := EXTRACT(hour FROM p_reservation_time) * 60 + EXTRACT(minute FROM p_reservation_time);
  v_slot_end := v_slot_minutes + v_turn_duration + v_buffer;

  FOR v_table_rec IN
    SELECT t.id, t.capacity, t.branch_id
    FROM public.restaurant_tables t
    WHERE t.organization_id = p_organization_id
      AND COALESCE(t.capacity, 4) >= p_party_size
      AND (p_zone IS NULL OR t.zone = p_zone)
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
    ORDER BY t.capacity ASC
    FOR UPDATE OF t
  LOOP
    SELECT EXISTS(
      SELECT 1
      FROM public.restaurant_reservations r
      WHERE r.restaurant_table_id = v_table_rec.id
        AND r.reservation_date = p_reservation_date
        AND r.status IN ('pending', 'confirmed', 'seated')
        AND (
          (EXTRACT(hour FROM r.reservation_time) * 60 + EXTRACT(minute FROM r.reservation_time))
            < v_slot_end
          AND
          (EXTRACT(hour FROM r.reservation_time) * 60 + EXTRACT(minute FROM r.reservation_time)
            + COALESCE(r.duration_minutes, v_turn_duration) + v_buffer)
            > v_slot_minutes
        )
    ) INTO v_conflict;

    IF NOT v_conflict THEN
      v_assigned_table := v_table_rec.id;
      v_branch := v_table_rec.branch_id;
      EXIT;
    END IF;
  END LOOP;

  IF v_assigned_table IS NULL THEN
    RAISE EXCEPTION 'No hay mesas disponibles para la fecha y hora seleccionadas';
  END IF;

  PERFORM 1
  FROM public.restaurant_reservations r
  WHERE r.restaurant_table_id = v_assigned_table
    AND r.reservation_date = p_reservation_date
    AND r.status IN ('pending', 'confirmed', 'seated')
  FOR UPDATE OF r;

  IF p_customer_email IS NOT NULL AND p_customer_email != '' THEN
    SELECT c.id INTO v_customer_id
    FROM public.customers c
    WHERE c.organization_id = p_organization_id
      AND c.email = p_customer_email
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (organization_id, first_name, last_name, email, phone, is_registered)
      VALUES (p_organization_id, split_part(btrim(p_customer_name), ' ', 1), nullif(btrim(substr(btrim(p_customer_name), length(split_part(btrim(p_customer_name), ' ', 1)) + 1)), ''), p_customer_email, p_customer_phone, false)
      RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  INSERT INTO public.restaurant_reservations (
    organization_id, branch_id, restaurant_table_id,
    customer_name, customer_phone, customer_email, customer_id,
    party_size, reservation_date, reservation_time, duration_minutes,
    status, source, notes, special_requests,
    confirmed_at
  )
  VALUES (
    p_organization_id, v_branch, v_assigned_table,
    p_customer_name, p_customer_phone, p_customer_email, v_customer_id,
    p_party_size, p_reservation_date, p_reservation_time, v_turn_duration,
    v_status, p_source, p_notes, p_special_requests,
    CASE WHEN v_status = 'confirmed' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'table_id', v_assigned_table,
    'customer_id', v_customer_id,
    'status', v_status,
    'code', upper(substring(v_reservation_id::text, 1, 8))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_restaurant_reservation(p_reservation_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation  record;
  v_settings     record;
  v_cancellation_hours integer := 4;
  v_hours_until  numeric;
BEGIN
  SELECT * INTO v_reservation
  FROM public.restaurant_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_reservation.status = 'cancelled' THEN
    RAISE EXCEPTION 'La reserva ya esta cancelada';
  END IF;

  IF v_reservation.status IN ('completed', 'seated') THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva que ya fue completada o sentada';
  END IF;

  SELECT * INTO v_settings
  FROM public.restaurant_booking_settings
  WHERE organization_id = v_reservation.organization_id
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  IF v_settings IS NOT NULL THEN
    v_cancellation_hours := COALESCE(v_settings.cancellation_hours, 4);
  END IF;

  v_hours_until := EXTRACT(epoch FROM (v_reservation.reservation_date::timestamptz
    + v_reservation.reservation_time::time - now())) / 3600;

  IF v_hours_until < v_cancellation_hours AND v_hours_until > 0 THEN
    RAISE EXCEPTION 'No se puede cancelar con menos de % horas de anticipacion', v_cancellation_hours;
  END IF;

  UPDATE public.restaurant_reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = p_reason,
      updated_at = now()
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'status', 'cancelled'
  );
END;
$function$;
