-- Rollback de 20260923223946_comision_ota_gasto_contra_pasivo.sql
--
-- Retira la liquidación del pago neto y la siembra automática de 2335/5235, y
-- devuelve fn_auto_journal_ota_commission a la versión de 20260923223149
-- (solo regla 'confirmed', salida silenciosa sin regla). Se conservan las
-- cuentas 2335/5235 sembradas y los asientos creados (hechos contables).
-- Las reglas ota_commission quedan en confirmed 5235/2335: devolverlas a
-- 5205/2205 o a created 5105/1305 sería reintroducir el defecto de F-65.

drop function if exists public.fn_liquidar_pago_ota(text, uuid, numeric, integer, timestamptz, text);
drop trigger if exists tr_auto_create_chart_of_accounts_zz_comision_ota on public.organizations;
drop function if exists public.trg_fn_asegurar_cuentas_comision_ota();
drop function if exists public.fn_asegurar_cuentas_comision_ota(integer);

create or replace function public.fn_auto_journal_ota_commission()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_reservation RECORD;
    v_amount numeric;
    v_description text;
    v_channel text;
    v_priority smallint;
    v_branch_id integer;
    v_event_type text := 'confirmed';
    v_entry_id integer;
BEGIN
    v_amount := COALESCE(NEW.commission_amount, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;
    v_channel := CASE TG_TABLE_NAME
        WHEN 'booking_reservation_details' THEN 'booking'
        WHEN 'expedia_reservation_details' THEN 'expedia'
        ELSE 'unknown'
    END;
    v_priority := CASE v_channel WHEN 'booking' THEN 10 WHEN 'expedia' THEN 11 ELSE 10 END;
    SELECT r.organization_id, r.branch_id INTO v_reservation FROM reservations r WHERE r.id = NEW.reservation_id LIMIT 1;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT * INTO v_rule FROM accounting_rules
     WHERE organization_id = v_reservation.organization_id AND source_type = 'ota_commission'
       AND event_type = v_event_type AND priority = v_priority AND is_active = true LIMIT 1;
    IF NOT FOUND THEN
        SELECT * INTO v_rule FROM accounting_rules
         WHERE organization_id = v_reservation.organization_id AND source_type = 'ota_commission'
           AND event_type = v_event_type AND is_active = true LIMIT 1;
    END IF;
    IF NOT FOUND THEN RETURN NEW; END IF;
    v_branch_id := NULL;
    IF v_reservation.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id FROM branches b
         WHERE b.id = v_reservation.branch_id AND b.organization_id = v_reservation.organization_id;
    END IF;
    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id FROM branches b WHERE b.organization_id = v_reservation.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC LIMIT 1;
    END IF;
    IF v_branch_id IS NULL THEN RETURN NEW; END IF;
    v_description := 'Comision ' || v_channel || ' - Reserva ' || NEW.reservation_id::text;
    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_reservation.organization_id, p_branch_id := v_branch_id,
        p_entry_date := COALESCE(NEW.updated_at, NEW.created_at, now()), p_memo := v_description,
        p_source := 'ota_commission', p_source_id := NEW.id::text || ':' || v_event_type,
        p_debit_account := v_rule.debit_account_code, p_credit_account := v_rule.credit_account_code,
        p_amount := v_amount, p_fact_key := 'accrual:ota_commission:' || NEW.id::text);
    RETURN NEW;
END;
$function$;
