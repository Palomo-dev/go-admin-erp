-- Bloque 1 contable · migración 6
--
-- `fn_auto_journal_bank_transfer` pasaba `v_rule.debit_account_code` **a los dos
-- lados** del asiento: dos líneas sobre la misma cuenta que se anulan. El
-- comentario justo encima decía «débito cuenta destino, crédito cuenta origen»,
-- y las dos cuentas bancarias se leían solo para sacarles el `branch_id`.
-- Contablemente la transferencia no existía
-- (docs/design/AUDITORIA-TESORERIA-CONTABILIDAD.md §G.2).
--
-- Ahora:
--
-- 1. El débito es la cuenta contable de la **cuenta bancaria destino** y el
--    crédito la de la **origen**, tomadas de `bank_accounts.account_code`. Si
--    una de las dos no la tiene asignada, se usa la de la regla —`debit` para
--    el destino, `credit` para el origen—, que al menos ya no es la misma a los
--    dos lados.
-- 2. Si aun así las dos cuentas coinciden, `fn_create_journal_entry` lo rechaza
--    por la validación nueva y lo anota en `journal_entry_failures`: el asiento
--    nulo deja de crearse en silencio.
-- 3. **Anular genera contrasiento.** Antes el guard cortaba todo lo que no
--    fuera `completed`/`confirmed`, así que anular una transferencia dejaba su
--    asiento vivo. Ahora, al pasar a `cancelled`, se escribe el asiento
--    inverso.
-- 4. Claves del hecho: `transfer:bank:{id}` y `transfer:bank:{id}:void`. Con
--    ellas, devolver el estado a `completed` ya no crea un asiento duplicado,
--    que era el otro defecto de §G.2.

create or replace function public.fn_auto_journal_bank_transfer()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_origen RECORD;
    v_destino RECORD;
    v_debito text;
    v_credito text;
    v_anulada boolean;
BEGIN
    -- OLD solo existe en UPDATE, y plpgsql evalúa la expresión entera: hay que
    -- separarlo en dos pasos o el disparador revienta en el INSERT.
    v_anulada := false;
    IF TG_OP = 'UPDATE' THEN
        v_anulada := (NEW.status = 'cancelled'
                      AND COALESCE(OLD.status, '') IN ('completed', 'confirmed'));
    END IF;

    IF NOT v_anulada AND (NEW.status IS NULL OR NEW.status NOT IN ('completed', 'confirmed')) THEN
        RETURN NEW;
    END IF;

    SELECT account_code, branch_id INTO v_origen
    FROM bank_accounts WHERE id = NEW.from_account_id;

    SELECT account_code, branch_id INTO v_destino
    FROM bank_accounts WHERE id = NEW.to_account_id;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'bank'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, COALESCE(v_destino.branch_id, NEW.branch_id),
            COALESCE(NEW.transfer_date, NEW.created_at),
            'bank_transfers', NEW.id::text, 'transfer:bank:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de bancos');
        RETURN NEW;
    END IF;

    -- Entra en la cuenta destino, sale de la origen.
    v_debito  := COALESCE(v_destino.account_code, v_rule.debit_account_code);
    v_credito := COALESCE(v_origen.account_code,  v_rule.credit_account_code);

    IF v_anulada THEN
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := COALESCE(v_origen.branch_id, NEW.branch_id, 0),
            p_entry_date := now(),
            p_memo := 'Anulación de transferencia bancaria - ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'bank_transfers',
            p_source_id := NEW.id::text,
            p_debit_account := v_credito,
            p_credit_account := v_debito,
            p_amount := ABS(NEW.amount),
            p_created_by := NEW.created_by,
            p_fact_key := 'transfer:bank:' || NEW.id::text || ':void'
        );
    ELSE
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := COALESCE(v_destino.branch_id, NEW.branch_id, 0),
            p_entry_date := COALESCE(NEW.transfer_date, NEW.created_at, now()),
            p_memo := 'Transferencia bancaria - ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'bank_transfers',
            p_source_id := NEW.id::text,
            p_debit_account := v_debito,
            p_credit_account := v_credito,
            p_amount := ABS(NEW.amount),
            p_created_by := NEW.created_by,
            p_fact_key := 'transfer:bank:' || NEW.id::text
        );
    END IF;

    RETURN NEW;
END;
$function$;
