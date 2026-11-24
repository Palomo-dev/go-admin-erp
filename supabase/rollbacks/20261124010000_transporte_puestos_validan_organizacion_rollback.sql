-- Reversión de 20261124010000: vuelven las versiones sin guarda de organización (inseguras).
CREATE OR REPLACE FUNCTION public.fn_release_seat(p_trip_id uuid, p_seat_label text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_released BOOLEAN := false;
BEGIN
  UPDATE trip_seats
  SET status = 'available',
      ticket_id = NULL,
      reserved_until = NULL,
      updated_at = now()
  WHERE trip_id = p_trip_id
    AND seat_label = p_seat_label
    AND status IN ('reserved', 'sold')
  RETURNING true INTO v_released;
  IF v_released THEN
    UPDATE trips SET available_seats = available_seats + 1 WHERE id = p_trip_id;
  END IF;
  RETURN COALESCE(v_released, false);
END;
$function$;
ALTER FUNCTION public.fn_release_seat(uuid, text) RESET search_path;

CREATE OR REPLACE FUNCTION public.fn_reserve_seat(p_trip_id uuid, p_seat_label text, p_ticket_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_trip_seat_id UUID;
BEGIN
  UPDATE trip_seats
  SET status = CASE WHEN p_ticket_id IS NOT NULL THEN 'sold' ELSE 'reserved' END,
      ticket_id = p_ticket_id,
      reserved_until = CASE WHEN p_ticket_id IS NULL THEN now() + interval '15 minutes' ELSE NULL END,
      updated_at = now()
  WHERE trip_id = p_trip_id
    AND seat_label = p_seat_label
    AND status = 'available'
  RETURNING id INTO v_trip_seat_id;
  IF v_trip_seat_id IS NOT NULL THEN
    UPDATE trips SET available_seats = available_seats - 1 WHERE id = p_trip_id AND available_seats > 0;
  END IF;
  RETURN v_trip_seat_id;
END;
$function$;
ALTER FUNCTION public.fn_reserve_seat(uuid, text, uuid) RESET search_path;
