-- Reversion de F-03: Restaurar fn_create_journal_entry con fallback MIN(id)
--
-- Reversa la migracion 20260910130000_f03_fix_fn_create_journal_entry_branch_fallback.sql
-- Restaura el comportamiento original: fallback a MIN(branches.id) cuando
-- p_branch_id es NULL/0/invalido, sin SET search_path.
-- ADVERTENCIA: al revertir se reintroduce el bug de sucursal arbitraria (F-03)
-- y el search_path mutable (F-11).

CREATE OR REPLACE FUNCTION public.fn_create_journal_entry(
    p_organization_id integer,
    p_branch_id integer,
    p_entry_date timestamp with time zone,
    p_memo text,
    p_source text,
    p_source_id text,
    p_debit_account text,
    p_credit_account text,
    p_amount numeric,
    p_tax_account text DEFAULT NULL::text,
    p_tax_amount numeric DEFAULT 0,
    p_created_by uuid DEFAULT NULL::uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_entry_id integer;
    v_period_open boolean;
    v_branch_id integer;
BEGIN
    -- Validar monto: NULL o <= 0 no genera asiento
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE NOTICE 'Monto invalido (NULL o <= 0) para source %. Asiento no creado.', p_source;
        RETURN NULL;
    END IF;

    -- Validar cuentas no vacias
    IF p_debit_account IS NULL OR p_credit_account IS NULL THEN
        RAISE NOTICE 'Cuentas debito/credito vacias para source %. Asiento no creado.', p_source;
        RETURN NULL;
    END IF;

    -- Validar que las cuentas existan en chart_of_accounts para la organizacion
    IF NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_debit_account
    ) THEN
        RAISE NOTICE 'Cuenta debito % no existe en chart_of_accounts para org %. Asiento no creado (source %).', p_debit_account, p_organization_id, p_source;
        RETURN NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_credit_account
    ) THEN
        RAISE NOTICE 'Cuenta credito % no existe en chart_of_accounts para org %. Asiento no creado (source %).', p_credit_account, p_organization_id, p_source;
        RETURN NULL;
    END IF;

    IF p_tax_account IS NOT NULL AND p_tax_amount > 0 AND NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_tax_account
    ) THEN
        RAISE NOTICE 'Cuenta de impuesto % no existe en chart_of_accounts para org %. Asiento no creado (source %).', p_tax_account, p_organization_id, p_source;
        RETURN NULL;
    END IF;

    -- Validar periodo contable abierto
    v_period_open := fn_is_period_open(p_organization_id, p_entry_date::date);
    IF NOT v_period_open THEN
        RAISE NOTICE 'Periodo contable cerrado para fecha %. Asiento no creado.', p_entry_date;
        RETURN NULL;
    END IF;

    -- Validar branch_id: NULL, 0, o que no pertenezca a la organizacion -> fallback
    IF p_branch_id IS NULL OR p_branch_id = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = p_branch_id AND organization_id = p_organization_id
    ) THEN
        SELECT MIN(id) INTO v_branch_id
        FROM branches
        WHERE organization_id = p_organization_id;
    ELSE
        v_branch_id := p_branch_id;
    END IF;

    -- Crear cabecera del asiento
    INSERT INTO journal_entries (
        organization_id, branch_id, entry_date, memo,
        source, source_id, posted, created_by
    ) VALUES (
        p_organization_id, v_branch_id, p_entry_date, p_memo,
        p_source, p_source_id, true, p_created_by
    ) RETURNING id INTO v_entry_id;

    -- Linea de debito (principal)
    INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
    VALUES (v_entry_id, p_debit_account, p_memo, p_amount - COALESCE(p_tax_amount, 0), 0);

    -- Linea de debito (impuesto) si aplica
    IF p_tax_account IS NOT NULL AND p_tax_amount > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0);
    END IF;

    -- Linea de credito
    INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
    VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount);

    RETURN v_entry_id;
END;
$function$;
