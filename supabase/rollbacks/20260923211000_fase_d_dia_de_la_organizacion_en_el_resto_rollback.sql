-- Reversion de 20260923211000_fase_d_dia_de_la_organizacion_en_el_resto.sql
--
-- Devuelve las cinco funciones a su cuerpo anterior, el que decide el dia
-- (y la hora, y el corte de mes) con el reloj UTC del servidor.
-- Solo CREATE OR REPLACE: firma, tipo de retorno, volatilidad, SECURITY
-- DEFINER, search_path, owner y ACL se conservan solos.
--
-- Aplicar esta reversion devuelve: una agenda de restaurante que ofrece mesas
-- de hace horas, creditos de IA del mes mal contados en el corte, tareas del
-- agente diario para el dia equivocado, reprogramaciones a las 18:00 UTC y una
-- fecha de contratacion corrida un dia.
--
-- Nota sobre permisos: el 2026-09-23, entre la aplicacion de esta fase y su
-- verificacion, otra sesion (migraciones gosec_lote5 y gosec_lote7) retiro
-- EXECUTE a anon y a PUBLIC de las funciones SECURITY DEFINER del esquema,
-- entre ellas get_restaurant_availability y complete_invitation_registration.
-- Esta reversion NO devuelve esos permisos: no eran suyos.

CREATE OR REPLACE FUNCTION public.get_restaurant_availability(p_organization_id integer, p_date date, p_party_size integer DEFAULT 2, p_zone text DEFAULT NULL::text, p_slot_interval integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  v_weekday := lower(to_char(p_date, 'Dy'));
  v_is_today := (p_date = current_date);
  v_now_min := EXTRACT(hour FROM v_now) * 60 + EXTRACT(minute FROM v_now);

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

CREATE OR REPLACE FUNCTION public.get_ai_tokens_usage(org_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  total_credits INTEGER;
BEGIN
  -- Sumar créditos consumidos de ai_usage_logs del mes actual
  SELECT COALESCE(SUM(credits_consumed), 0)
  INTO total_credits
  FROM ai_usage_logs
  WHERE organization_id = org_id
    AND created_at >= date_trunc('month', CURRENT_DATE)
    AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';

  RETURN total_credits;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_invitation_registration(invitation_code text, user_id uuid, user_email text, first_name text, last_name text, phone_number text, user_password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  invite_record RECORD;
  new_member_id bigint;
  result JSON;
BEGIN
  -- 1. Validar que la invitación existe y está pendiente
  SELECT * INTO invite_record
  FROM invitations
  WHERE code = invitation_code
    AND status = 'pending'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invitación no válida, expirada o ya utilizada'
    );
  END IF;

  -- 2. Verificar que el email coincide
  IF invite_record.email != user_email THEN
    RETURN json_build_object(
      'success', false,
      'error', 'El email no coincide con la invitación'
    );
  END IF;

  -- 3. Crear el perfil del usuario
  INSERT INTO profiles (
    id, email, first_name, last_name, phone, last_org_id, avatar_url, preferred_language, status
  ) VALUES (
    user_id, user_email, first_name, last_name, phone_number,
    invite_record.organization_id, null, 'es', 'active'
  );

  -- 4. Crear membresía en la organización y obtener el ID
  INSERT INTO organization_members (
    organization_id, user_id, role_id, is_super_admin, is_active
  ) VALUES (
    invite_record.organization_id, user_id, invite_record.role_id, false, true
  )
  RETURNING id INTO new_member_id;

  -- 5. NUEVO: Crear registro de empleo (employment)
  INSERT INTO employments (
    organization_member_id, status, hire_date, employment_type, contract_type,
    work_location, work_hours_per_week, currency_code, salary_period
  ) VALUES (
    new_member_id,
    'active',                    -- Estado activo
    CURRENT_DATE,                -- Fecha de contratación = hoy
    'employee',                  -- Tipo de empleo por defecto
    'indefinite',                -- Contrato indefinido por defecto
    'onsite',                    -- Ubicación por defecto
    48,                          -- Horas semanales estándar Colombia
    'COP',                       -- Moneda por defecto
    'monthly'                    -- Período de salario mensual
  );

  -- 6. Marcar invitación como utilizada
  UPDATE invitations
  SET status = 'used', used_at = NOW()
  WHERE id = invite_record.id;

  -- 7. Retornar éxito
  RETURN json_build_object(
    'success', true,
    'organization_id', invite_record.organization_id,
    'role_id', invite_record.role_id,
    'organization_member_id', new_member_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', 'Error interno: ' || SQLERRM
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reschedule_overdue_tasks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task RECORD;
  v_assignee uuid;
  v_estimated numeric;
  v_capacity numeric := 8.0;  -- 8 horas por día
  v_new_due timestamptz;
  v_day_date date;
  v_loaded numeric;
  v_found boolean;
  v_goal_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_task IN
    SELECT t.id, t.organization_id, t.assigned_to, t.estimated_hours,
           t.title, t.priority, t.due_date
    FROM tasks t
    WHERE t.status IN ('open','in_progress')
      AND t.due_date IS NOT NULL
      AND t.due_date < now()
      AND t.assigned_to IS NOT NULL
    ORDER BY
      CASE t.priority
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'med' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
      END,
      t.due_date ASC
  LOOP
    v_assignee := v_task.assigned_to;
    v_estimated := COALESCE(v_task.estimated_hours, 1.0);
    v_found := false;
    v_day_date := CURRENT_DATE + 1;  -- empezar desde mañana

    WHILE NOT v_found AND v_day_date <= CURRENT_DATE + 30 LOOP
      SELECT COALESCE(SUM(COALESCE(estimated_hours, 1.0)), 0)
      INTO v_loaded
      FROM tasks
      WHERE assigned_to = v_assignee
        AND status IN ('open','in_progress')
        AND due_date >= date_trunc('day', v_day_date::timestamptz)
        AND due_date < date_trunc('day', v_day_date::timestamptz) + interval '1 day'
        AND id != v_task.id;

      IF v_loaded + v_estimated <= v_capacity THEN
        v_found := true;
      ELSE
        v_day_date := v_day_date + 1;
      END IF;
    END LOOP;

    IF NOT v_found THEN
      v_day_date := CURRENT_DATE + 30;
    END IF;

    -- Hora de vencimiento: 18:00 de ese día
    v_new_due := date_trunc('day', v_day_date::timestamptz) + interval '18 hours';

    v_goal_id := fn_agent_ensure_operational_goal(v_task.organization_id);

    UPDATE tasks
    SET due_date = v_new_due,
        goal_id = COALESCE(goal_id, v_goal_id),
        updated_at = now()
    WHERE id = v_task.id;

    PERFORM fn_create_org_notification(
      v_task.organization_id,
      v_assignee,
      'app',
      'task_rescheduled',
      'Tarea reprogramada: ' || v_task.title,
      'La tarea estaba vencida desde el ' || to_char(v_task.due_date, 'DD/MM/YYYY HH24:MI') ||
      ' y se reprogramó para el ' || to_char(v_new_due, 'DD/MM/YYYY HH24:MI') ||
      ' respetando tu capacidad de 8h/día. Horas estimadas: ' || v_estimated::text || 'h.',
      jsonb_build_object('task_id', v_task.id, 'source', 'agent_reschedule', 'old_due', v_task.due_date, 'new_due', v_new_due)
    );

    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    PERFORM fn_create_org_notification(
      NULL::integer,
      NULL::uuid,
      'app',
      'task_reschedule_summary',
      'Reprogramación automática completada',
      'Se reprogramaron ' || v_count || ' tarea(s) vencida(s) respetando la capacidad de 8h/día por responsable.',
      jsonb_build_object('source', 'agent_reschedule', 'count', v_count)
    );
  END IF;
END;
$function$;

-- fn_daily_task_agent: se revierte cambiando de vuelta v_today -> CURRENT_DATE
-- (siete sitios) y v_day_start/v_day_end -> date_trunc('day', now()) (tres
-- sitios). El cuerpo completo anterior esta en el historial de git de
-- supabase/migrations/00000000000000_baseline_schema.sql; aqui se reescribe
-- entero para que la reversion sea autocontenida.
CREATE OR REPLACE FUNCTION public.fn_daily_task_agent()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  org RECORD;
  v_count integer;
  admin_first integer[] := ARRAY[2,5];
  ops_first   integer[] := ARRAY[4,5,2];
  mgr_first   integer[] := ARRAY[5,2];
  d_finanzas  text[] := ARRAY['finan','contab','cartera','tesorer'];
  d_ventas    text[] := ARRAY['ventas','comercial','tienda'];
  d_servicio  text[] := ARRAY['servicio','atencion','atención','soporte','marketing'];
  d_logistica text[] := ARRAY['logist','logíst','bodega','despacho','transport','almac'];
  d_compras   text[] := ARRAY['compras','abastec','inventar'];
  d_rrhh      text[] := ARRAY['rrhh','recursos humanos','talento','nomina','nómina','gestion humana','gestión humana'];
  d_recepcion text[] := ARRAY['recepcion','recepción','hotel','hospedaje','front'];
  d_ti        text[] := ARRAY['tecnolog','sistemas','ti','informat'];
  d_operacion text[] := ARRAY['operacion','operación','parquead','parking'];
  p_finanzas  text[] := ARRAY['contador','contable','cartera','tesorer','cobran','finan','auxiliar contable'];
  p_ventas    text[] := ARRAY['vendedor','comercial','asesor','ejecutivo de venta'];
  p_servicio  text[] := ARRAY['servicio al cliente','atencion','atención','soporte','community','recepcionista'];
  p_cajero    text[] := ARRAY['cajer','punto de venta','administrador de tienda'];
  p_bodega    text[] := ARRAY['bodegu','almacen','almacén','inventar','despach','logist'];
  p_compras   text[] := ARRAY['compras','comprador','abastec'];
  p_conductor text[] := ARRAY['conductor','transport','mensajer','domicili','repartidor'];
  p_rrhh      text[] := ARRAY['rrhh','recursos humanos','talento','nomina','nómina','gestion humana','gestión humana'];
  p_recepcion text[] := ARRAY['recepcionista','anfitrion','anfitrión','botones','camarer','housekeep'];
  p_lider     text[] := ARRAY['gerente','jefe','coordinador','supervisor','director','lider','líder'];
  p_ti        text[] := ARRAY['sistemas','desarroll','tecnolog','soporte tecnico','soporte técnico','ti'];
  p_parking   text[] := ARRAY['parquead','parking','vigilan','portero','operador'];
BEGIN
  FOR org IN SELECT id FROM organizations WHERE status = 'active' LOOP

    SELECT count(*) INTO v_count FROM accounts_receivable
    WHERE organization_id = org.id AND balance > 0 AND due_date < now();
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:cobrar_facturas',
        'Cobrar ' || v_count || ' factura(s) vencida(s)',
        'Hay ' || v_count || ' cuentas por cobrar vencidas con saldo pendiente. Revisa Finanzas → Cuentas por Cobrar y gestiona el recaudo.',
        admin_first, 'high', d_finanzas, p_finanzas, 2.0);
    END IF;

    SELECT count(*) INTO v_count FROM accounts_payable
    WHERE organization_id = org.id AND balance > 0 AND due_date < now();
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:pagar_facturas',
        'Pagar ' || v_count || ' factura(s) de proveedores vencida(s)',
        'Hay ' || v_count || ' cuentas por pagar vencidas. Revisa Finanzas → Cuentas por Pagar para evitar intereses o bloqueos.',
        admin_first, 'high', d_finanzas, p_finanzas, 1.5);
    END IF;

    SELECT count(*) INTO v_count FROM invoice_sales
    WHERE organization_id = org.id AND status = 'draft';
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:facturas_borrador',
        'Emitir ' || v_count || ' factura(s) de venta en borrador',
        'Hay ' || v_count || ' facturas de venta sin emitir. Revisa Finanzas → Facturas de Venta y complétalas.',
        admin_first, 'med', d_finanzas, p_finanzas, 1.0);
    END IF;

    SELECT count(*) INTO v_count FROM conversations
    WHERE organization_id = org.id AND status = 'open' AND unread_count > 0;
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:responder_mensajes',
        'Responder ' || v_count || ' conversación(es) de clientes',
        'Hay ' || v_count || ' conversaciones abiertas con mensajes sin leer en Chat. Respóndelas para no perder ventas.',
        ops_first, 'high', d_servicio, p_servicio, 1.0);
    END IF;

    SELECT count(*) INTO v_count FROM conversations
    WHERE organization_id = org.id AND status = 'open' AND assigned_member_id IS NULL;
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:asignar_conversaciones',
        'Asignar ' || v_count || ' conversación(es) sin responsable',
        'Hay ' || v_count || ' conversaciones abiertas sin agente asignado en Chat. Distribúyelas entre el equipo.',
        mgr_first, 'med', d_servicio, p_lider, 0.5);
    END IF;

    SELECT count(*) INTO v_count FROM opportunities
    WHERE organization_id = org.id AND status = 'open' AND expected_close_date < CURRENT_DATE;
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:seguimiento_oportunidades',
        'Hacer seguimiento a ' || v_count || ' oportunidad(es) vencida(s)',
        'Hay ' || v_count || ' oportunidades abiertas con fecha de cierre vencida. Revisa CRM → Pipeline y actualiza su estado.',
        ops_first, 'high', d_ventas, p_ventas, 1.5);
    END IF;

    SELECT count(*) INTO v_count FROM web_orders
    WHERE organization_id = org.id
      AND status IN ('pending','confirmed','preparing','ready')
      AND delivered_at IS NULL AND cancelled_at IS NULL;
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:despachar_pedidos',
        'Gestionar ' || v_count || ' pedido(s) online pendiente(s)',
        'Hay ' || v_count || ' pedidos online sin entregar. Revisa POS → Pedidos Online para confirmarlos, prepararlos y despacharlos.',
        ops_first, 'high', d_logistica, p_bodega, 2.0);
    END IF;

    SELECT count(*) INTO v_count FROM cash_sessions
    WHERE organization_id = org.id AND status = 'open' AND opened_at < date_trunc('day', now());
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:cerrar_caja',
        'Cerrar ' || v_count || ' caja(s) abierta(s) de días anteriores',
        'Hay sesiones de caja abiertas desde días anteriores. Ciérralas en POS → Caja para cuadrar la operación.',
        ops_first, 'high', d_ventas, p_cajero, 1.0);
    END IF;

    SELECT count(*) INTO v_count
    FROM stock_levels sl
    JOIN products p ON p.id = sl.product_id
    WHERE p.organization_id = org.id AND p.status = 'active'
      AND sl.min_level > 0 AND sl.qty_on_hand <= sl.min_level;
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:reponer_inventario',
        'Reponer ' || v_count || ' producto(s) con stock bajo',
        'Hay ' || v_count || ' productos en o por debajo del stock mínimo. Revisa Inventario → Stock y genera órdenes de compra.',
        ops_first, 'high', d_compras, p_bodega, 2.0);
    END IF;

    SELECT count(*) INTO v_count FROM purchase_orders
    WHERE organization_id = org.id AND expected_date <= CURRENT_DATE
      AND status NOT IN ('received','cancelled','closed','draft');
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:recibir_compras',
        'Recibir ' || v_count || ' orden(es) de compra atrasada(s)',
        'Hay ' || v_count || ' órdenes de compra con fecha esperada cumplida sin recibir. Revisa Inventario → Órdenes de Compra.',
        ops_first, 'med', d_compras, p_compras, 1.5);
    END IF;

    SELECT count(*) INTO v_count FROM products
    WHERE organization_id = org.id AND status = 'active'
      AND (description IS NULL OR description = '');
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:completar_productos',
        'Completar descripción de ' || v_count || ' producto(s)',
        'Hay ' || v_count || ' productos activos sin descripción. Complétalos en Inventario → Productos para mejorar catálogo y ventas online.',
        ops_first, 'low', d_compras, p_bodega, 1.0);
    END IF;

    SELECT count(*) INTO v_count FROM reservations
    WHERE organization_id = org.id AND checkin = CURRENT_DATE
      AND actual_checkin_at IS NULL AND status::text NOT IN ('cancelled','no_show','checked_in','checked_out');
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:gestionar_reservas',
        'Gestionar ' || v_count || ' reserva(s) con check-in hoy',
        'Hay ' || v_count || ' reservas que llegan hoy. Prepara los espacios y realiza el check-in en PMS → Reservas.',
        ops_first, 'high', d_recepcion, p_recepcion, 1.5);
    END IF;

    SELECT count(*) INTO v_count FROM reservations
    WHERE organization_id = org.id AND checkout = CURRENT_DATE
      AND actual_checkout_at IS NULL AND status::text = 'checked_in';
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:gestionar_checkouts',
        'Realizar ' || v_count || ' check-out(s) de hoy',
        'Hay ' || v_count || ' huéspedes que salen hoy. Realiza el check-out y liquida los consumos en PMS → Reservas.',
        ops_first, 'high', d_recepcion, p_recepcion, 1.5);
    END IF;

    SELECT count(*) INTO v_count
    FROM parking_sessions ps
    JOIN branches b ON b.id = ps.branch_id
    WHERE b.organization_id = org.id AND ps.exit_at IS NULL
      AND ps.entry_at < date_trunc('day', now());
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:parking_prolongado',
        'Revisar ' || v_count || ' vehículo(s) con estadía prolongada en parking',
        'Hay ' || v_count || ' vehículos dentro del parqueadero desde días anteriores. Verifica en PMS → Parking y gestiona el cobro.',
        ops_first, 'med', d_operacion, p_parking, 1.0);
    END IF;

    SELECT count(*) INTO v_count FROM shipments
    WHERE organization_id = org.id AND delivered_at IS NULL
      AND status NOT IN ('delivered','cancelled','returned');
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:gestionar_rutas',
        'Gestionar ' || v_count || ' envío(s) en ruta o pendientes',
        'Hay ' || v_count || ' envíos sin entregar. Asigna transportista y revisa rutas en Transporte → Envíos.',
        ops_first, 'med', d_logistica, p_conductor, 2.0);
    END IF;

    SELECT count(*) INTO v_count FROM payroll_periods
    WHERE organization_id = org.id AND payment_date <= CURRENT_DATE
      AND status NOT IN ('paid','closed','cancelled');
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:pagar_nomina',
        'Liquidar y pagar nómina (' || v_count || ' periodo(s))',
        'Hay ' || v_count || ' periodos de nómina con fecha de pago cumplida sin pagar. Revisa HRM → Nómina para liquidar colillas y pagar.',
        admin_first, 'critical', d_rrhh, p_rrhh, 4.0);
    END IF;

    SELECT count(*) INTO v_count FROM shift_assignments
    WHERE organization_id = org.id AND work_date = CURRENT_DATE AND status = 'scheduled';
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:registrar_turnos',
        'Registrar/confirmar ' || v_count || ' turno(s) de hoy',
        'Hay ' || v_count || ' turnos programados para hoy. Confirma asistencia y registra novedades en HRM → Turnos.',
        mgr_first, 'med', d_rrhh, p_lider, 1.0);
    END IF;

    SELECT count(*) INTO v_count FROM leave_requests
    WHERE organization_id = org.id AND status = 'pending';
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:aprobar_ausencias',
        'Revisar ' || v_count || ' solicitud(es) de ausencia pendiente(s)',
        'Hay ' || v_count || ' solicitudes de vacaciones/permisos sin revisar. Apruébalas o recházalas en HRM → Ausencias.',
        mgr_first, 'med', d_rrhh, p_rrhh, 0.5);
    END IF;

    SELECT count(*) INTO v_count
    FROM employments e
    JOIN organization_members om ON om.id = e.organization_member_id
    WHERE om.organization_id = org.id AND e.status = 'active'
      AND e.contract_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30;
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:contratos_por_vencer',
        'Renovar o cerrar ' || v_count || ' contrato(s) que vencen en 30 días',
        'Hay ' || v_count || ' contratos laborales próximos a vencer. Revisa HRM → Empleados y define renovación o liquidación.',
        admin_first, 'high', d_rrhh, p_rrhh, 1.5);
    END IF;

    SELECT count(*) INTO v_count FROM calendar_events
    WHERE organization_id = org.id
      AND start_at >= date_trunc('day', now()) AND start_at < date_trunc('day', now()) + interval '1 day'
      AND (status IS NULL OR status NOT IN ('cancelled','completed'));
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:eventos_hoy',
        'Preparar ' || v_count || ' evento(s) agendado(s) para hoy',
        'Hay ' || v_count || ' eventos en el Calendario para hoy. Confirma asistentes, lugares y recursos.',
        ops_first, 'med', d_servicio, p_lider, 1.0);
    END IF;

    SELECT count(*) INTO v_count FROM integration_connections
    WHERE organization_id = org.id
      AND (status = 'error' OR COALESCE(error_count_24h, 0) > 0);
    IF v_count > 0 THEN
      PERFORM fn_agent_upsert_task(org.id, 'agent:revisar_integraciones',
        'Revisar ' || v_count || ' integración(es) con errores',
        'Hay ' || v_count || ' conexiones de integraciones reportando errores. Revisa Integraciones → Conexiones y reconéctalas.',
        admin_first, 'high', d_ti, p_ti, 1.5);
    END IF;

  END LOOP;
END;
$function$;
