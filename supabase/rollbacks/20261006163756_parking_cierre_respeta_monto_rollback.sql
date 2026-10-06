-- Restaura las dos funciones tal como estaban antes de 20261006163756 (cuerpo copiado de
-- pg_proc el 2026-10-06). No revierte datos: las sesiones cerradas con el monto de la pantalla
-- conservan ese monto.
set lock_timeout = '10s';

create or replace function public.calculate_parking_session_amount()
returns trigger
language plpgsql
as $f$
DECLARE
    v_rate_price NUMERIC;
    v_rate_unit TEXT;
    v_grace_period INTEGER;
    v_duration_minutes INTEGER;
    v_unit_count NUMERIC;
BEGIN
    IF NEW.status = 'closed' AND OLD.status = 'open' THEN
        NEW.duration_min := EXTRACT(EPOCH FROM (NEW.exit_at - NEW.entry_at)) / 60;
        IF NEW.rate_id IS NOT NULL THEN
            SELECT price, unit::TEXT, COALESCE(grace_period_min, 0)
            INTO v_rate_price, v_rate_unit, v_grace_period
            FROM parking_rates
            WHERE id = NEW.rate_id;
            v_duration_minutes := GREATEST(0, NEW.duration_min - v_grace_period);
            CASE v_rate_unit
                WHEN 'minute' THEN v_unit_count := v_duration_minutes;
                WHEN 'hour' THEN v_unit_count := CEILING(v_duration_minutes / 60.0);
                WHEN 'day' THEN v_unit_count := CEILING(v_duration_minutes / (60.0 * 24));
                ELSE v_unit_count := 0;
            END CASE;
            NEW.amount := v_rate_price * v_unit_count;
        END IF;
    END IF;
    RETURN NEW;
END;
$f$;

create or replace function public.fn_auto_journal_parking_session()
returns trigger
language plpgsql
security definer
as $f$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_org_id integer;
BEGIN
    IF NEW.status::text NOT IN ('closed', 'paid', 'completed') THEN
        RETURN NEW;
    END IF;
    IF COALESCE(NEW.amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;
    SELECT organization_id INTO v_org_id FROM branches WHERE id = NEW.branch_id;
    IF v_org_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_org_id
      AND source_type = 'parking'
      AND is_active = true
    ORDER BY priority LIMIT 1;
    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure(coalesce((to_jsonb(NEW)->>'organization_id')::integer, v_org_id), NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;
    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_org_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.exit_at, NEW.created_at, now()),
        p_memo := 'Parking - ' || COALESCE(NEW.vehicle_plate, NEW.id::text),
        p_source := 'parking_sessions',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.amount
    );
    RETURN NEW;
END;
$f$;
alter function public.fn_auto_journal_parking_session() reset search_path;
