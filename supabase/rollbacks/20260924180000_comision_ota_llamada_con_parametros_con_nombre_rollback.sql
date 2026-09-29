-- Reversion de 20260924180000_comision_ota_llamada_con_parametros_con_nombre.sql
--
-- ADVERTENCIA DOBLE, LEER ANTES DE EJECUTAR
--
-- 1) Esta reversion YA NO ES APLICABLE TAL CUAL. Despues de la migracion que
--    revierte, la sesion de Finanzas reescribio el cuerpo de la funcion con la
--    decision contable de ADR-CC-013 (regla 5235 -> 2335, busqueda de regla sin
--    exigir `event_type = 'confirmed'`, y registro del rechazo en
--    `journal_entry_failures`). Ejecutar este archivo NO devolveria la funcion
--    al estado inmediatamente anterior a la migracion: **destruiria el cuerpo
--    vigente de ADR-CC-013**. Si hay que revertir algo, hay que partir del
--    cuerpo vivo, no de este archivo.
--
-- 2) ADVERTENCIA: esta reversion REINSTAURA UN DEFECTO CONOCIDO (F-65).
-- El cuerpo que restaura llama a `fn_create_journal_entry` con diez argumentos
-- posicionales contra una funcion que solo tiene una firma, de catorce
-- parametros. En cuanto una fila de `booking_reservation_details` o de
-- `expedia_reservation_details` con `commission_amount > 0` pase por su
-- disparador, la transaccion entera aborta con
--
--   42883: function fn_create_journal_entry(integer, integer, unknown,
--          unknown, text, numeric, text, text, text,
--          timestamp with time zone) does not exist
--
-- Es decir: aplicando este rollback NO se puede guardar ninguna reserva de
-- Booking o de Expedia con comision. Solo tiene sentido si hay que volver
-- exactamente al estado anterior para reproducir el fallo.
--
-- Tambien deshace el `SET search_path TO 'public', 'pg_temp'` que la migracion
-- anadio, con lo que la funcion vuelve a ser SECURITY DEFINER con search_path
-- mutable (aviso `function_search_path_mutable` de get_advisors).
--
-- Cuerpo restaurado: el que dejo
-- 20260923235000_comision_de_oportunidad_sucursal_del_mismo_inquilino.sql
-- (md5 de pg_get_functiondef antes de la migracion:
--  c11e87a0e4591c0aa77ba483748cb838, 3202 caracteres).
--
-- No hay datos que restaurar: la migracion no hizo ningun INSERT, UPDATE ni
-- DELETE sobre datos reales. Los asientos que el cuerpo corregido haya creado
-- entretanto NO se borran (y no deben borrarse: son contabilidad).

CREATE OR REPLACE FUNCTION public.fn_auto_journal_ota_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rule RECORD;
    v_reservation RECORD;
    v_amount numeric;
    v_description text;
    v_channel text;
    v_priority smallint;
    v_branch_id integer;
BEGIN
    -- Determinar canal y monto de comision
    -- Funciona para booking_reservation_details y expedia_reservation_details
    v_amount := COALESCE(NEW.commission_amount, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Determinar canal segun la tabla (TG_TABLE_NAME)
    v_channel := CASE TG_TABLE_NAME
        WHEN 'booking_reservation_details' THEN 'booking'
        WHEN 'expedia_reservation_details' THEN 'expedia'
        ELSE 'unknown'
    END;

    v_priority := CASE v_channel
        WHEN 'booking' THEN 10
        WHEN 'expedia' THEN 11
        ELSE 10
    END;

    -- Obtener reserva
    SELECT r.organization_id, r.branch_id INTO v_reservation
    FROM reservations r
    WHERE r.id = NEW.reservation_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Buscar regla contable
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_reservation.organization_id
      AND source_type = 'ota_commission'
      AND event_type = 'confirmed'
      AND priority = v_priority
      AND is_active = true
    LIMIT 1;

    -- Fallback: cualquier regla de ota_commission
    IF NOT FOUND THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_reservation.organization_id
          AND source_type = 'ota_commission'
          AND event_type = 'confirmed'
          AND is_active = true
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- La sucursal sale de la reserva si es de esta organizacion; si no, la
    -- principal de la organizacion. NUNCA la sucursal 0, que no existe.
    v_branch_id := NULL;

    IF v_reservation.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id = v_reservation.branch_id
           AND b.organization_id = v_reservation.organization_id;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = v_reservation.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    IF v_branch_id IS NULL THEN
        RAISE WARNING 'fn_auto_journal_ota_commission: la organizacion % no tiene ninguna sucursal; no se crea el asiento de la reserva %',
              v_reservation.organization_id, NEW.reservation_id;
        RETURN NEW;
    END IF;

    v_description := 'Comision ' || v_channel || ' - Reserva ' || NEW.reservation_id::text;

    PERFORM fn_create_journal_entry(
        v_reservation.organization_id,
        v_branch_id,
        'ota_commission',
        'confirmed',
        NEW.id::text,
        v_amount,
        v_rule.debit_account_code,
        v_rule.credit_account_code,
        v_description,
        COALESCE(NEW.updated_at, now())
    );

    RETURN NEW;
END;
$function$;
