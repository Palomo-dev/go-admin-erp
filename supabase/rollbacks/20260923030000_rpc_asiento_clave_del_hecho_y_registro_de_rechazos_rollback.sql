-- Rollback de 20260923030000_rpc_asiento_clave_del_hecho_y_registro_de_rechazos.sql
--
-- Devuelve `fn_create_journal_entry` a la versión de 13 argumentos: sin clave
-- del hecho, sin validación de débito ≠ crédito y con los rechazos otra vez en
-- RAISE NOTICE. Solo tiene sentido si antes se han revertido las migraciones
-- 2 a 6 del bloque 1, que llaman con `p_fact_key`.
--
-- La tabla `journal_entry_failures` se conserva: es un registro de lo que ya
-- pasó y borrarla perdería la evidencia. Para retirarla del todo, ejecutar
-- además el DROP comentado al final.

drop function if exists public.fn_create_journal_entry(
  integer, integer, timestamptz, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text
);

create or replace function public.fn_create_journal_entry(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamptz,
  p_memo text,
  p_source text,
  p_source_id text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_tax_account text default null,
  p_tax_amount numeric default 0,
  p_created_by uuid default null,
  p_tax_is_credit boolean default false
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_entry_id integer;
    v_period_open boolean;
    v_branch_id integer;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE NOTICE 'Monto invalido (NULL o <= 0) para source %. Asiento no creado.', p_source;
        RETURN NULL;
    END IF;

    IF p_debit_account IS NULL OR p_credit_account IS NULL THEN
        RAISE NOTICE 'Cuentas debito/credito vacias para source %. Asiento no creado.', p_source;
        RETURN NULL;
    END IF;

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

    v_period_open := fn_is_period_open(p_organization_id, p_entry_date::date);
    IF NOT v_period_open THEN
        RAISE NOTICE 'Periodo contable cerrado para fecha %. Asiento no creado.', p_entry_date;
        RETURN NULL;
    END IF;

    IF p_branch_id IS NULL OR p_branch_id = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = p_branch_id AND organization_id = p_organization_id
    ) THEN
        SELECT id INTO v_branch_id
        FROM branches
        WHERE organization_id = p_organization_id AND is_main = true AND is_active = true
        LIMIT 1;

        IF v_branch_id IS NULL THEN
            SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = p_organization_id;
        END IF;
    ELSE
        v_branch_id := p_branch_id;
    END IF;

    INSERT INTO journal_entries (
        organization_id, branch_id, entry_date, memo,
        source, source_id, posted, created_by
    ) VALUES (
        p_organization_id, v_branch_id, p_entry_date, p_memo,
        p_source, p_source_id, true, p_created_by
    ) RETURNING id INTO v_entry_id;

    IF p_tax_is_credit THEN
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount, 0);

        IF p_tax_account IS NOT NULL AND p_tax_amount > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
            VALUES (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount);
        END IF;

        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount - COALESCE(p_tax_amount, 0));
    ELSE
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount - COALESCE(p_tax_amount, 0), 0);

        IF p_tax_account IS NOT NULL AND p_tax_amount > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
            VALUES (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0);
        END IF;

        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount);
    END IF;

    RETURN v_entry_id;
END;
$function$;

drop function if exists public.fn_log_journal_failure(
  integer, integer, timestamptz, text, text, text, text, text, numeric, text, text
);

-- Para retirar también el registro de rechazos (pierde la evidencia):
-- drop table if exists public.journal_entry_failures;
