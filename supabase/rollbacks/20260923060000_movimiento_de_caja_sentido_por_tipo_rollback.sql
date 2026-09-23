-- Rollback de 20260923060000_movimiento_de_caja_sentido_por_tipo.sql
--
-- Restaura la versión que decide por el signo del importe, con lo que toda
-- salida de caja vuelve a contabilizarse como entrada. No toca datos.

create or replace function public.fn_auto_journal_cash_movement()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_session RECORD;
BEGIN
    SELECT cs.organization_id, cs.branch_id
    INTO v_session
    FROM cash_sessions cs
    WHERE cs.id = NEW.cash_session_id;

    IF v_session IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_session.organization_id
      AND source_type = 'cash_movement'
      AND event_type = 'created'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_session.organization_id,
        p_branch_id := v_session.branch_id,
        p_entry_date := NEW.created_at,
        p_memo := 'Mov. Caja: ' || NEW.type || ' - ' || COALESCE(NEW.concept, ''),
        p_source := 'cash_movements',
        p_source_id := NEW.id::text,
        p_debit_account := CASE WHEN NEW.amount > 0 THEN v_rule.debit_account_code ELSE v_rule.credit_account_code END,
        p_credit_account := CASE WHEN NEW.amount > 0 THEN v_rule.credit_account_code ELSE v_rule.debit_account_code END,
        p_amount := ABS(NEW.amount)
    );

    RETURN NEW;
END;
$function$;
