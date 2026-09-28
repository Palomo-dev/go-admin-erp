-- Reversion de 20260923235000_comision_de_oportunidad_sucursal_del_mismo_inquilino.
--
-- ADVERTENCIA: esta reversion REINTRODUCE los defectos. Devuelve el cuerpo
-- exacto que tenian las tres funciones antes del arreglo:
--
--   * fn_create_commission_on_opportunity_won vuelve a `v_branch_id := 1`,
--     un literal sin filtro de organizacion. Con los datos de hoy (la
--     sucursal 1 no existe) eso significa que ninguna organizacion sin
--     sucursales puede volver a marcar una oportunidad como ganada: el
--     UPDATE aborta con 23503 commissions_branch_id_fkey. Y si alguien crea
--     una sucursal con id 1, las comisiones se cargan a ese inquilino.
--     Vuelve tambien el `LIMIT 1` sin `ORDER BY`, no determinista.
--
--   * fn_auto_journal_commission vuelve a copiar `NEW.branch_id` sin
--     comprobar que sea de la misma organizacion, y a pasar NULL a
--     `journal_entries.branch_id`, que es NOT NULL.
--
--   * fn_auto_journal_ota_commission vuelve a `COALESCE(branch_id, 0)`: la
--     sucursal 0 no existe, asi que solo puede producir una violacion de FK.
--
-- Se conserva aqui para que la migracion tenga reversion real, no vacia,
-- segun docs/POLITICA-MIGRACIONES.md. No aplicarla salvo para reproducir el
-- fallo original.
--
-- No revierte datos: la migracion no modifico ninguna fila.

-- -------------------------------------------------------------------------
-- 1. fn_create_commission_on_opportunity_won  (cuerpo anterior, con `:= 1`)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_commission_on_opportunity_won()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_commission_amount numeric;
    v_payee_name text;
    v_existing_commission_count integer;
    v_branch_id integer;
BEGIN
    IF NEW.status <> 'won' THEN
        RETURN NEW;
    END IF;

    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    IF NEW.commission_type = 'none' OR NEW.commission_rate IS NULL OR NEW.commission_rate <= 0 THEN
        RETURN NEW;
    END IF;

    IF NEW.salesperson_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_existing_commission_count
    FROM commissions
    WHERE source_type = 'opportunity' AND source_id = NEW.id::text;

    IF v_existing_commission_count > 0 THEN
        RETURN NEW;
    END IF;

    v_commission_amount := ROUND(COALESCE(NEW.amount, 0) * NEW.commission_rate / 100.0, 2);

    IF v_commission_amount <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email, 'Vendedor')
    INTO v_payee_name
    FROM auth.users
    WHERE id = NEW.salesperson_id;

    v_payee_name := COALESCE(v_payee_name, 'Vendedor');

    SELECT id INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id LIMIT 1;
    IF v_branch_id IS NULL THEN
        v_branch_id := 1;
    END IF;

    INSERT INTO commissions (
        organization_id, branch_id,
        commission_type, source_type, source_id,
        payee_type, payee_id, payee_name,
        base_amount, commission_rate, commission_amount,
        currency, status, notes
    ) VALUES (
        NEW.organization_id, v_branch_id,
        NEW.commission_type, 'opportunity', NEW.id::text,
        'employee', NEW.salesperson_id, v_payee_name,   -- uuid, sin ::text (era el bug)
        COALESCE(NEW.amount, 0), NEW.commission_rate, v_commission_amount,
        COALESCE(NEW.currency, 'USD'), 'accrued',
        'Comisión por oportunidad ganada - ' || NEW.name
    );

    RETURN NEW;
END;
$function$;

-- -------------------------------------------------------------------------
-- 2. fn_auto_journal_commission  (cuerpo anterior, sin guarda de inquilino)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_journal_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_branch_id integer;
    v_event_type text;
    v_memo text;
    v_source_id text;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'accrued' AND (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
        v_event_type := 'accrued';
    ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_event_type := 'paid';
    ELSE
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.commission_amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    IF v_event_type = 'paid' AND NEW.metadata ? 'payroll_slip_id' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'commission'
      AND event_type = v_event_type
      AND is_active = true
    ORDER BY priority LIMIT 1;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    IF NEW.branch_id IS NOT NULL THEN
        v_branch_id := NEW.branch_id;
    ELSE
        SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id;
    END IF;

    v_memo := CASE NEW.commission_type
        WHEN 'salesperson' THEN 'Comisión Vendedor - ' || COALESCE(NEW.payee_name, NEW.payee_id::text, 'N/A')
        WHEN 'intermediation_sale' THEN 'Comisión Intermediación Venta - ' || COALESCE(NEW.payee_name, NEW.source_id)
        WHEN 'intermediation_purchase' THEN 'Comisión Intermediación Compra - ' || COALESCE(NEW.payee_name, NEW.source_id)
        ELSE 'Comisión - ' || COALESCE(NEW.payee_name, 'N/A')
    END;

    v_source_id := NEW.id::text || ':' || v_event_type;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := CASE v_event_type
            WHEN 'accrued' THEN COALESCE(NEW.accrued_at, NEW.created_at, now())
            WHEN 'paid' THEN COALESCE(NEW.paid_at, NEW.updated_at, now())
        END,
        p_memo := v_memo,
        p_source := 'commissions',
        p_source_id := v_source_id,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.commission_amount
    );

    RETURN NEW;
END;
$function$;

-- -------------------------------------------------------------------------
-- 3. fn_auto_journal_ota_commission  (cuerpo anterior, con la sucursal 0)
-- -------------------------------------------------------------------------
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

    v_description := 'Comision ' || v_channel || ' - Reserva ' || NEW.reservation_id::text;

    PERFORM fn_create_journal_entry(
        v_reservation.organization_id,
        COALESCE(v_reservation.branch_id, 0),
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
