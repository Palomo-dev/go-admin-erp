-- Rollback de 20260923070000_transferencia_bancaria_asiento_real_y_contrasiento.sql
--
-- Restaura la versión anterior: la misma cuenta a débito y a crédito (asiento
-- nulo), sin contrasiento al anular y sin clave del hecho. No toca datos.

create or replace function public.fn_auto_journal_bank_transfer()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_from_account RECORD;
    v_to_account RECORD;
BEGIN
    IF NEW.status IS NULL OR NEW.status NOT IN ('completed', 'confirmed') THEN
        RETURN NEW;
    END IF;

    SELECT account_number, branch_id INTO v_from_account
    FROM bank_accounts WHERE id = NEW.from_account_id;

    SELECT account_number, branch_id INTO v_to_account
    FROM bank_accounts WHERE id = NEW.to_account_id;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'bank'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(v_to_account.branch_id, 0),
        p_entry_date := COALESCE(NEW.transfer_date, NEW.created_at, now()),
        p_memo := 'Transferencia bancaria - ' || COALESCE(NEW.reference, NEW.id::text),
        p_source := 'bank_transfers',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.debit_account_code,
        p_amount := ABS(NEW.amount)
    );

    RETURN NEW;
END;
$function$;
