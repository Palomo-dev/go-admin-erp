-- Rollback F-52: restaura el cuerpo y los privilegios previos de
-- fn_auto_journal_sale_pos. Reintroduce deliberadamente la seleccion de la
-- primera regla por prioridad sin discriminar contado/credito.

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
    -- Solo procesar ventas confirmadas o pagadas
    IF NEW.status NOT IN ('paid', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    -- IDEMPOTENCIA: si ya existe un asiento para esta venta, no crear otro
    SELECT id INTO v_existing_id
    FROM journal_entries
    WHERE source = 'sales' AND source_id = NEW.id::text
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Determinar event_type
    v_event_type := CASE NEW.status
        WHEN 'paid' THEN 'paid'
        WHEN 'confirmed' THEN 'created'
        WHEN 'completed' THEN 'created'
    END;

    -- Buscar regla con event_type especifico
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND event_type = v_event_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    -- Fallback: buscar cualquier regla de sale con event_type='created'
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

    -- Fallback final: cualquier regla de sale
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

    -- Crear asiento contable
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

-- Restaurar el ACL anterior observado antes de F-52.
GRANT EXECUTE ON FUNCTION public.fn_auto_journal_sale_pos()
TO PUBLIC, anon, authenticated, service_role;
