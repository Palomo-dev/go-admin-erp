-- Bloque 1 contable · migración 5
--
-- `fn_auto_journal_cash_movement` decide el sentido del asiento con
-- `NEW.amount > 0`. Pero `amount` **siempre** es positivo: el sentido lo lleva
-- `NEW.type` (`in` / `out`). Verificado en producción: los 5 movimientos de
-- caja tienen importe positivo, 3 de ellos son `out`, y **los tres están
-- contabilizados al revés** (docs/design/AUDITORIA-TESORERIA-CONTABILIDAD.md
-- §D.1). Una salida de caja aumenta la caja en el libro.
--
-- Ahora el sentido sale del tipo, y el importe se toma siempre en valor
-- absoluto. Si algún día llegara un importe negativo, invierte otra vez el
-- sentido, que es lo que significa.
--
-- Se añade además `fact_key = 'cash_move:{id}'`: el disparador es AFTER INSERT,
-- pero una carga retroactiva o un reproceso ya no pueden duplicar el asiento.
--
-- La organización se toma de la sesión de caja, como antes. `cash_movements`
-- tiene su propio `organization_id`, pero es NULL-able y la sesión es la fuente
-- fiable de la sucursal.

create or replace function public.fn_auto_journal_cash_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_session RECORD;
    v_es_entrada boolean;
    v_importe numeric;
    v_debito text;
    v_credito text;
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
        PERFORM fn_log_journal_failure(
            v_session.organization_id, v_session.branch_id, NEW.created_at,
            'cash_movements', NEW.id::text, 'cash_move:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de movimiento de caja');
        RETURN NEW;
    END IF;

    -- El sentido lo manda el tipo, no el signo.
    v_es_entrada := COALESCE(NEW.type, 'in') IN ('in', 'deposit', 'income');
    v_importe := ABS(COALESCE(NEW.amount, 0));

    -- Un importe negativo invierte el sentido: es lo que significa.
    IF COALESCE(NEW.amount, 0) < 0 THEN
        v_es_entrada := NOT v_es_entrada;
    END IF;

    IF v_es_entrada THEN
        v_debito  := v_rule.debit_account_code;
        v_credito := v_rule.credit_account_code;
    ELSE
        v_debito  := v_rule.credit_account_code;
        v_credito := v_rule.debit_account_code;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_session.organization_id,
        p_branch_id := v_session.branch_id,
        p_entry_date := NEW.created_at,
        p_memo := 'Mov. Caja: ' || COALESCE(NEW.type, '') || ' - ' || COALESCE(NEW.concept, ''),
        p_source := 'cash_movements',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := v_importe,
        p_fact_key := 'cash_move:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;
