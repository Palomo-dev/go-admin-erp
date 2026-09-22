-- F-45: fn_create_journal_entry invierte el IVA en ventas
-- Agrega parametro p_tax_is_credit boolean DEFAULT false (aditivo).
-- false (actual/compras): debito = p_amount - p_tax, IVA debito, credito = p_amount
-- true  (ventas):         debito = p_amount,         IVA credito, credito = p_amount - p_tax
--
-- Tambien actualiza los 2 llamadores de venta:
--   fn_auto_journal_sale      -> p_tax_is_credit := true
--   fn_auto_journal_sale_pos  -> p_tax_is_credit := true
-- Los otros 3 llamadores (purchase, credit_note, void) no cambian.

-- 1. fn_create_journal_entry: DROP firma vieja + CREATE firma nueva
-- CREATE OR REPLACE no puede agregar un parametro: crea una sobrecarga.
-- DROP de la firma de 12 args primero, luego CREATE de la de 13.
DROP FUNCTION IF EXISTS public.fn_create_journal_entry(
    integer, integer, timestamp with time zone, text, text, text,
    text, text, numeric, text, numeric, uuid
);

CREATE FUNCTION public.fn_create_journal_entry(
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
    p_created_by uuid DEFAULT NULL::uuid,
    p_tax_is_credit boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
            SELECT MIN(id) INTO v_branch_id
            FROM branches
            WHERE organization_id = p_organization_id;
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
        -- Ventas: debito = p_amount, IVA al credito, credito = p_amount - p_tax
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount, 0);

        IF p_tax_account IS NOT NULL AND p_tax_amount > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
            VALUES (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount);
        END IF;

        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount - COALESCE(p_tax_amount, 0));
    ELSE
        -- Compras/reversas: debito = p_amount - p_tax, IVA al debito, credito = p_amount
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

-- 2. fn_auto_journal_sale: pasar p_tax_is_credit := true
CREATE OR REPLACE FUNCTION public.fn_auto_journal_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_is_credit boolean;
BEGIN
    IF NEW.document_type IS NOT NULL AND NEW.document_type != 'invoice' THEN
        RETURN NEW;
    END IF;

    v_is_credit := (NEW.payment_method = 'credit');

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND event_type = 'created'
      AND is_active = true
      AND (conditions->>'is_credit')::boolean = v_is_credit
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND event_type = 'created'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Venta ' || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := true
    );

    RETURN NEW;
END;
$function$;

-- 3. fn_auto_journal_sale_pos: pasar p_tax_is_credit := true
CREATE OR REPLACE FUNCTION public.fn_auto_journal_sale_pos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_event_type text;
    v_memo text;
    v_existing_id integer;
BEGIN
    IF NEW.status NOT IN ('paid', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_existing_id
    FROM journal_entries
    WHERE source = 'sales' AND source_id = NEW.id::text
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.status
        WHEN 'paid' THEN 'paid'
        WHEN 'confirmed' THEN 'created'
        WHEN 'completed' THEN 'created'
    END;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND event_type = v_event_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND event_type = 'created'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_memo := 'Venta POS ' || COALESCE(NEW.id::text, '');

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(NEW.branch_id, 0),
        p_entry_date := COALESCE(NEW.sale_date, NEW.created_at, now()),
        p_memo := v_memo,
        p_source := 'sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := true
    );

    RETURN NEW;
END;
$function$;

-- 4. F-47: Restablecer privilegios (DROP se lleva los GRANT)
REVOKE ALL ON FUNCTION public.fn_create_journal_entry(
    integer, integer, timestamp with time zone, text, text, text,
    text, text, numeric, text, numeric, uuid, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_create_journal_entry(
    integer, integer, timestamp with time zone, text, text, text,
    text, text, numeric, text, numeric, uuid, boolean
) TO service_role;

-- F-47: Cerrar tambien fn_create_journal_entry_with_discount (mismo agujero)
REVOKE ALL ON FUNCTION public.fn_create_journal_entry_with_discount(
    integer, integer, timestamp with time zone, text, text, text,
    text, text, numeric, text, numeric, boolean, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_create_journal_entry_with_discount(
    integer, integer, timestamp with time zone, text, text, text,
    text, text, numeric, text, numeric, boolean, uuid
) TO service_role;
