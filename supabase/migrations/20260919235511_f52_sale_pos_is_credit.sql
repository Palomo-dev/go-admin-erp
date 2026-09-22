-- F-52: escoger la regla contable de la venta POS segun su saldo pendiente.
--
-- Medicion previa sobre 2.934 ventas:
--   balance = 0: 2.103; balance > 0: 828; balance < 0: 3; NULL: 0.
--   Entre las 40 ventas contabilizables sin factura, todas tienen balance = 0,
--   pero 3 conservan payment_status = 'pending'. Por eso payment_status no es
--   un discriminador confiable y el saldo es la fuente elegida.
--
-- El cambio tambien acota la idempotencia por organizacion. No cambia triggers,
-- estados, asientos historicos ni datos.

CREATE OR REPLACE FUNCTION public.fn_auto_journal_sale_pos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_event_type text;
    v_memo text;
    v_existing_id integer;
    v_is_credit boolean;
BEGIN
    -- Solo procesar ventas confirmadas o pagadas.
    IF NEW.status NOT IN ('paid', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    -- La deuda real manda sobre payment_status: hay ventas pagadas con el
    -- estado de pago rezagado y ventas con saldo positivo marcadas como pagadas.
    v_is_credit := COALESCE(NEW.balance, 0) > 0;

    -- Idempotencia por tenant y venta.
    SELECT id INTO v_existing_id
    FROM public.journal_entries
    WHERE organization_id = NEW.organization_id
      AND source = 'sales'
      AND source_id = NEW.id::text
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE NEW.status
        WHEN 'paid' THEN 'paid'
        WHEN 'confirmed' THEN 'created'
        WHEN 'completed' THEN 'created'
    END;

    -- Regla especifica para el evento y la condicion contado/credito.
    SELECT * INTO v_rule
    FROM public.accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND event_type = v_event_type
      AND is_active = true
      AND (conditions->>'is_credit')::boolean = v_is_credit
    ORDER BY priority
    LIMIT 1;

    -- Fallback al evento created, sin perder la condicion contado/credito.
    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM public.accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND event_type = 'created'
          AND is_active = true
          AND (conditions->>'is_credit')::boolean = v_is_credit
        ORDER BY priority
        LIMIT 1;
    END IF;

    -- Fallback final a cualquier evento, conservando contado/credito.
    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM public.accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND is_active = true
          AND (conditions->>'is_credit')::boolean = v_is_credit
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    v_memo := 'Venta POS ' || COALESCE(NEW.id::text, '');

    v_entry_id := public.fn_create_journal_entry(
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

-- Es una funcion de trigger: las escrituras autorizadas llegan por sales y ya
-- pasaron su RLS. No se expone como RPC directa a roles cliente.
REVOKE ALL ON FUNCTION public.fn_auto_journal_sale_pos()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_auto_journal_sale_pos()
TO service_role;
