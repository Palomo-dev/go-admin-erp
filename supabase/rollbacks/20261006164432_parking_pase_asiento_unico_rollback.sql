-- Restaura fn_auto_journal_parking_pass y fn_auto_journal_parking_payment tal como estaban antes
-- de 20261006164432 (cuerpo copiado de pg_proc el 2026-10-06). No revierte datos: los asientos
-- creados con fact_key parking_pass:* se conservan.
set lock_timeout = '10s';

create or replace function public.fn_auto_journal_parking_pass()
returns trigger
language plpgsql
security definer
as $f$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_event_type text;
    v_branch_id integer;
BEGIN
    IF NEW.status IS NULL THEN RETURN NEW; END IF;

    IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
        v_event_type := 'paid';
    ELSIF NEW.status = 'cancelled' OR NEW.status = 'suspended' THEN
        v_event_type := 'reversed';
    ELSE
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'parking_pass'
      AND event_type = v_event_type
      AND is_active = true
    ORDER BY priority LIMIT 1;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'parking_pass'
          AND is_active = true
        ORDER BY priority LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW; END IF;

    SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := COALESCE(NEW.updated_at, NEW.created_at, now()),
        p_memo := 'Pase Parqueadero - ' || COALESCE(NEW.plan_name, NEW.id::text),
        p_source := 'parking_passes',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := COALESCE(NEW.price, 0)
    );

    RETURN NEW;
END;
$f$;
alter function public.fn_auto_journal_parking_pass() reset search_path;

create or replace function public.fn_auto_journal_parking_payment()
returns trigger
language plpgsql
security definer
as $f$
DECLARE
    v_rule RECORD;
    v_amount numeric;
    v_description text;
    v_org_id integer;
    v_branch_id integer;
    v_source_type text;
    v_event_type text;
    v_vehicle_plate text;
    v_has_invoice boolean;
    v_payment_method text;
BEGIN
    IF NEW.source NOT IN ('parking_session', 'parking_pass') THEN
        RETURN NEW;
    END IF;
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;
    v_org_id := NEW.organization_id;
    v_branch_id := COALESCE(NEW.branch_id, 0);
    v_amount := COALESCE(NEW.amount, 0);
    v_payment_method := COALESCE(NEW.method, 'cash');
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;
    v_has_invoice := NEW.reference IS NOT NULL AND NEW.reference LIKE 'INV:%';
    IF v_has_invoice THEN
        RETURN NEW;
    END IF;
    IF NEW.source = 'parking_session' THEN
        v_source_type := 'parking_session';
        SELECT vehicle_plate INTO v_vehicle_plate FROM parking_sessions WHERE id::text = NEW.source_id LIMIT 1;
        IF v_payment_method = 'credit' THEN v_event_type := 'paid_credit'; ELSE v_event_type := 'paid'; END IF;
        v_description := 'Parqueadero - Sesión ' || COALESCE(v_vehicle_plate, NEW.source_id);
    ELSE
        v_source_type := 'parking_pass';
        SELECT plan_name INTO v_vehicle_plate FROM parking_passes WHERE id::text = NEW.source_id LIMIT 1;
        IF v_payment_method = 'credit' THEN v_event_type := 'paid_credit'; ELSE v_event_type := 'paid'; END IF;
        v_description := 'Parqueadero - Pase ' || COALESCE(v_vehicle_plate, NEW.source_id);
    END IF;
    SELECT * INTO v_rule FROM accounting_rules WHERE organization_id = v_org_id AND source_type = v_source_type AND event_type = v_event_type AND is_active = true ORDER BY priority LIMIT 1;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    PERFORM fn_create_journal_entry(v_org_id, v_branch_id, COALESCE(NEW.created_at, now()), v_description, 'parking_payment', NEW.id::text, v_rule.debit_account_code, v_rule.credit_account_code, v_amount, NULL, 0, NEW.created_by);
    RETURN NEW;
END;
$f$;
alter function public.fn_auto_journal_parking_payment() reset search_path;
