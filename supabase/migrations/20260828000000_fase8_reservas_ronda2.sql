-- ============================================================
-- FASE 8 — Ronda 2 — Reservas de mesa: RPC transaccional + configuración
-- ============================================================
-- Añade:
--  · restaurant_booking_settings (tabla nueva) — horarios y reglas por org/sede
--  · RPC create_restaurant_reservation(...) — creación atómica con FOR UPDATE
--  · RPC get_restaurant_availability(...) — consulta de slots disponibles
--  · RLS: lectura pública de booking_settings (is_enabled = true)
-- ============================================================

-- ── 1. Tabla restaurant_booking_settings ──
CREATE TABLE IF NOT EXISTS public.restaurant_booking_settings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id              integer REFERENCES public.branches(id) ON DELETE CASCADE,
  is_enabled             boolean NOT NULL DEFAULT false,
  -- Turnos y horarios
  service_hours          jsonb NOT NULL DEFAULT '{}'::jsonb,
  slot_interval_minutes  integer NOT NULL DEFAULT 30,
  turn_duration_minutes  integer NOT NULL DEFAULT 90,
  buffer_minutes         integer NOT NULL DEFAULT 15,
  -- Aforo y tamaño de grupo
  min_party_size         integer NOT NULL DEFAULT 1,
  max_party_size         integer NOT NULL DEFAULT 12,
  max_covers_per_slot    integer,
  large_party_threshold  integer,
  -- Anticipación
  min_advance_minutes    integer NOT NULL DEFAULT 60,
  max_advance_days       integer NOT NULL DEFAULT 60,
  cancellation_hours     integer NOT NULL DEFAULT 4,
  -- Asignación de mesa
  auto_assign_table      boolean NOT NULL DEFAULT true,
  allow_zone_choice      boolean NOT NULL DEFAULT false,
  allowed_zones          text[],
  -- Política y confirmación
  require_confirmation   boolean NOT NULL DEFAULT false,
  require_deposit        boolean NOT NULL DEFAULT false,
  deposit_amount         numeric(12,2),
  deposit_per_person     boolean NOT NULL DEFAULT false,
  policy_text            text,
  -- Notificaciones
  notify_emails          text[],
  send_customer_email    boolean NOT NULL DEFAULT true,
  send_customer_whatsapp boolean NOT NULL DEFAULT false,
  reminder_hours_before  integer,
  -- Campos obligatorios
  require_phone          boolean NOT NULL DEFAULT true,
  require_email          boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id)
);

ALTER TABLE public.restaurant_booking_settings ENABLE ROW LEVEL SECURITY;

-- RLS: lectura pública solo de configuraciones habilitadas
DROP POLICY IF EXISTS "restaurant_booking_settings_public_select" ON public.restaurant_booking_settings;
CREATE POLICY "restaurant_booking_settings_public_select"
  ON public.restaurant_booking_settings
  FOR SELECT
  TO public
  USING (is_enabled = true);

-- RLS: escritura solo para miembros de la organización
DROP POLICY IF EXISTS "restaurant_booking_settings_org_manage" ON public.restaurant_booking_settings;
CREATE POLICY "restaurant_booking_settings_org_manage"
  ON public.restaurant_booking_settings
  FOR ALL
  TO public
  USING (organization_id IN (
    SELECT organization_members.organization_id
    FROM organization_members
    WHERE organization_members.user_id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_members.organization_id
    FROM organization_members
    WHERE organization_members.user_id = auth.uid()
  ));

-- RLS: super admins
DROP POLICY IF EXISTS "restaurant_booking_settings_super_admin" ON public.restaurant_booking_settings;
CREATE POLICY "restaurant_booking_settings_super_admin"
  ON public.restaurant_booking_settings
  FOR ALL
  TO public
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.fn_update_restaurant_booking_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restaurant_booking_settings_updated_at ON public.restaurant_booking_settings;
CREATE TRIGGER trg_restaurant_booking_settings_updated_at
  BEFORE UPDATE ON public.restaurant_booking_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_restaurant_booking_settings_updated_at();

COMMENT ON TABLE public.restaurant_booking_settings IS 'FASE 8: Configuración de reservas de mesa por organización y sede. Horarios, aforo, anticipación, política.';

-- ── 2. RPC create_restaurant_reservation ──
-- Crea una reserva atómicamente: valida disponibilidad con FOR UPDATE,
-- autoasigna mesa, busca/crea customer e inserta la reserva.
-- Todo-o-nada dentro de una transacción.
CREATE OR REPLACE FUNCTION public.create_restaurant_reservation(
  p_organization_id   integer,
  p_reservation_date  date,
  p_reservation_time  time,
  p_party_size        integer,
  p_customer_name     text,
  p_branch_id         integer DEFAULT NULL,
  p_customer_phone    text DEFAULT NULL,
  p_customer_email    text DEFAULT NULL,
  p_zone              text DEFAULT NULL,
  p_notes             text DEFAULT NULL,
  p_special_requests  text DEFAULT NULL,
  p_source            text DEFAULT 'website'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_existing        jsonb;
  v_conflict        boolean;
  v_table_rec       record;
BEGIN
  -- ── Cargar configuración (branch específico → fallback a branch_id IS NULL) ──
  SELECT * INTO v_settings
  FROM public.restaurant_booking_settings
  WHERE organization_id = p_organization_id
    AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL))
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  -- Si hay configuración, usar sus valores; si no, defaults
  IF v_settings IS NOT NULL THEN
    v_turn_duration := COALESCE(v_settings.turn_duration_minutes, 90);
    v_buffer := COALESCE(v_settings.buffer_minutes, 15);
    IF v_settings.is_enabled = false THEN
      RAISE EXCEPTION 'Las reservas online están deshabilitadas para este restaurante';
    END IF;
    -- Validar tamaño del grupo
    IF p_party_size < COALESCE(v_settings.min_party_size, 1) THEN
      RAISE EXCEPTION 'El número mínimo de personas es %', v_settings.min_party_size;
    END IF;
    IF p_party_size > COALESCE(v_settings.max_party_size, 12) THEN
      RAISE EXCEPTION 'El número máximo de personas es %', v_settings.max_party_size;
    END IF;
    v_status := CASE WHEN v_settings.require_confirmation THEN 'pending' ELSE 'confirmed' END;
  ELSE
    v_status := 'confirmed';
  END IF;

  v_slot_minutes := EXTRACT(hour FROM p_reservation_time) * 60 + EXTRACT(minute FROM p_reservation_time);
  v_slot_end := v_slot_minutes + v_turn_duration + v_buffer;

  -- ── FOR UPDATE sobre mesas candidatas (bloquea para evitar doble reserva) ──
  FOR v_table_rec IN
    SELECT t.id, t.capacity
    FROM public.restaurant_tables t
    WHERE t.organization_id = p_organization_id
      AND COALESCE(t.capacity, 4) >= p_party_size
      AND (p_zone IS NULL OR t.zone = p_zone)
    ORDER BY t.capacity ASC  -- menor capacidad primero (no desperdiciar mesas grandes)
    FOR UPDATE OF t
  LOOP
    -- Verificar que no haya reservas que solapen para esta mesa
    SELECT EXISTS(
      SELECT 1
      FROM public.restaurant_reservations r
      WHERE r.restaurant_table_id = v_table_rec.id
        AND r.reservation_date = p_reservation_date
        AND r.status IN ('pending', 'confirmed', 'seated')
        AND (
          -- Solape de intervalos [slot_start, slot_end) ∩ [res_start, res_end)
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
      EXIT;  -- Primera mesa libre encontrada
    END IF;
  END LOOP;

  IF v_assigned_table IS NULL THEN
    RAISE EXCEPTION 'No hay mesas disponibles para la fecha y hora seleccionadas';
  END IF;

  -- ── FOR UPDATE sobre reservas existentes (doble verificación) ──
  -- Bloquea las filas de reservas de esa mesa+fecha para evitar concurrencia
  PERFORM 1
  FROM public.restaurant_reservations r
  WHERE r.restaurant_table_id = v_assigned_table
    AND r.reservation_date = p_reservation_date
    AND r.status IN ('pending', 'confirmed', 'seated')
  FOR UPDATE OF r;

  -- ── Buscar o crear customer ──
  IF p_customer_email IS NOT NULL AND p_customer_email != '' THEN
    SELECT c.id INTO v_customer_id
    FROM public.customers c
    WHERE c.organization_id = p_organization_id
      AND c.email = p_customer_email
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (organization_id, first_name, full_name, email, phone, is_registered)
      VALUES (p_organization_id, p_customer_name, p_customer_name, p_customer_email, p_customer_phone, false)
      RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- ── Insertar reserva ──
  INSERT INTO public.restaurant_reservations (
    organization_id, branch_id, restaurant_table_id,
    customer_name, customer_phone, customer_email, customer_id,
    party_size, reservation_date, reservation_time, duration_minutes,
    status, source, notes, special_requests,
    confirmed_at
  )
  VALUES (
    p_organization_id, p_branch_id, v_assigned_table,
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
$$;

COMMENT ON FUNCTION public.create_restaurant_reservation IS 'FASE 8: Crea una reserva de mesa atómicamente con FOR UPDATE. Valida disponibilidad, autoasigna mesa, busca/crea customer. Todo-o-nada.';

-- ── 3. RPC get_restaurant_availability ──
-- Devuelve los slots disponibles para una fecha dada.
CREATE OR REPLACE FUNCTION public.get_restaurant_availability(
  p_organization_id  integer,
  p_date             date,
  p_party_size       integer DEFAULT 2,
  p_zone             text DEFAULT NULL,
  p_slot_interval    integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- ── Cargar configuración ──
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

  -- Día de la semana (lowercase, 3 letras en inglés)
  v_weekday := lower(to_char(p_date, 'Dy'));
  v_is_today := (p_date = current_date);
  v_now_min := EXTRACT(hour FROM v_now) * 60 + EXTRACT(minute FROM v_now);

  -- Si hay service_hours configuradas, usarlas; si no, defaults
  IF v_service_hours IS NOT NULL AND v_service_hours != '{}'::jsonb AND v_service_hours ? v_weekday THEN
    v_shifts := v_service_hours->v_weekday;
  ELSE
    -- Defaults: almuerzo 12:00-15:00, cena 18:00-22:30
    v_shifts := '[{"from":"12:00","to":"15:00"},{"from":"18:00","to":"22:30"}]'::jsonb;
  END IF;

  -- Generar slots
  FOR v_shift IN SELECT * FROM jsonb_array_elements(v_shifts)
  LOOP
    v_from_min := (substring(v_shift->>'from' from 1 for 2))::integer * 60
                + (substring(v_shift->>'from' from 4 for 2))::integer;
    v_to_min := (substring(v_shift->>'to' from 1 for 2))::integer * 60
              + (substring(v_shift->>'to' from 4 for 2))::integer;

    v_slot_min := v_from_min;
    WHILE v_slot_min + v_turn_duration <= v_to_min LOOP
      -- Filtrar slots pasados si es hoy
      IF NOT (v_is_today AND v_slot_min <= v_now_min + v_min_advance) THEN
        -- Contar mesas libres para este slot
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

        -- Sugerencias (primeras 5 disponibles)
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
$$;

COMMENT ON FUNCTION public.get_restaurant_availability IS 'FASE 8: Consulta slots disponibles para una fecha. Lee horarios desde restaurant_booking_settings.';

-- ── 4. RPC cancel_restaurant_reservation ──
-- Cancela una reserva respetando cancellation_hours.
CREATE OR REPLACE FUNCTION public.cancel_restaurant_reservation(
  p_reservation_id  uuid,
  p_reason          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'La reserva ya está cancelada';
  END IF;

  IF v_reservation.status IN ('completed', 'seated') THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva que ya fue completada o sentada';
  END IF;

  -- Cargar cancellation_hours de la configuración
  SELECT * INTO v_settings
  FROM public.restaurant_booking_settings
  WHERE organization_id = v_reservation.organization_id
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  IF v_settings IS NOT NULL THEN
    v_cancellation_hours := COALESCE(v_settings.cancellation_hours, 4);
  END IF;

  -- Verificar anticipación mínima (excepto si la reserva es más lejana que la política)
  v_hours_until := EXTRACT(epoch FROM (v_reservation.reservation_date::timestamptz
    + v_reservation.reservation_time::time - now())) / 3600;

  IF v_hours_until < v_cancellation_hours AND v_hours_until > 0 THEN
    RAISE EXCEPTION 'No se puede cancelar con menos de % horas de anticipación', v_cancellation_hours;
  END IF;

  -- Cancelar
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
$$;

COMMENT ON FUNCTION public.cancel_restaurant_reservation IS 'FASE 8: Cancela una reserva respetando cancellation_hours.';
