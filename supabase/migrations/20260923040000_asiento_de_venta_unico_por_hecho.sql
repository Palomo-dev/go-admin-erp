-- Bloque 1 contable · migraciones 2 y 3
--
-- Una venta del POS produce hoy DOS asientos de devengo del mismo importe:
-- uno por `trg_auto_journal_sale_pos` sobre `sales` (`source='sales'`) y otro
-- por `trg_auto_journal_sale` sobre `invoice_sales` (`source='invoice_sales'`).
-- Como el índice de idempotencia miraba el origen y no el hecho, no los veía.
-- Verificado: 2.319 ventas con los dos asientos y 89.403.570 de ingreso que no
-- existió (docs/design/AUDITORIA-TESORERIA-CONTABILIDAD.md §E.2).
--
-- Las dos funciones pasan a emitir la MISMA clave del hecho —
-- `accrual:sale:{sale_id}`— así que la segunda que llegue no escribe nada.
--
-- **Dónde esta migración se aparta del plan.** La migración 2 decía «retirar el
-- trigger sobre `sales`». Al comprobarlo contra los datos aparece un agujero:
-- hay 105 ventas vivas SIN factura, en 10 organizaciones y hasta el 16 de
-- septiembre de 2026; 40 de ellas solo tienen asiento por la vía del POS.
-- Retirar el trigger sin más dejaría esas ventas sin devengo. En vez de eso,
-- el trigger del POS se vuelve **diferido y subordinado**: pasa a
-- `CONSTRAINT TRIGGER ... INITIALLY DEFERRED`, de modo que se ejecuta al
-- confirmar la transacción, cuando la factura —que se crea después, en el mismo
-- `pos_checkout_v1`— ya contabilizó el hecho. Resultado: la factura es el
-- origen del asiento siempre que exista, que es lo que pedía la decisión 1, y
-- la venta sin factura deja de quedarse fuera del libro.
--
-- Además se corrige §E.3: las tres consultas de reglas exigían
-- `(conditions->>'is_credit')::boolean = v_is_credit`, y con `conditions` NULL
-- esa expresión es NULL, así que la fila no entraba y el asiento no se creaba
-- nunca. De 250 reglas de venta, 86 no tienen esa condición y 2 organizaciones
-- no tienen ninguna que la tenga. Ahora se prefiere la regla con la condición
-- correcta, se acepta la que no trae condición, y **nunca** se usa la de la
-- condición contraria: contabilizar en la cuenta equivocada es peor que no
-- contabilizar, y el rechazo queda anotado en `journal_entry_failures`.
--
-- Contado o crédito se deduce del **saldo real** (`COALESCE(balance,0) > 0`) y
-- no de `payment_method = 'credit'`, que es un texto libre que nadie mantiene.

create or replace function public.fn_auto_journal_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_is_credit boolean;
    v_fact_key text;
BEGIN
    -- Las notas crédito tienen su propio disparador.
    IF NEW.document_type IS NOT NULL AND NEW.document_type <> 'invoice' THEN
        RETURN NEW;
    END IF;

    v_is_credit := COALESCE(NEW.balance, 0) > 0;

    -- La clave es del HECHO, no de la tabla: si la factura nace de una venta,
    -- el devengo es el de esa venta y la clave es la misma que emite el POS.
    v_fact_key := CASE
        WHEN NEW.sale_id IS NOT NULL THEN 'accrual:sale:' || NEW.sale_id::text
        ELSE 'accrual:invoice:' || NEW.id::text
    END;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND is_active = true
      AND (conditions->>'is_credit' IS NULL
           OR (conditions->>'is_credit')::boolean = v_is_credit)
    ORDER BY
      (CASE WHEN conditions->>'is_credit' IS NOT NULL THEN 0 ELSE 1 END),
      (CASE WHEN event_type = 'created' THEN 0 ELSE 1 END),
      priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule',
            'Sin regla contable activa de venta ' ||
            CASE WHEN v_is_credit THEN '(a crédito)' ELSE '(de contado)' END);
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
        p_created_by := NEW.created_by,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
    );

    RETURN NEW;
END;
$function$;

create or replace function public.fn_auto_journal_sale_pos()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_is_credit boolean;
    v_fact_key text;
BEGIN
    -- Solo ventas vivas. 'confirmed' y 'completed' no existen en
    -- `sales_status_check`, pero se conservan porque los pedidos web y código
    -- antiguo los escriben.
    IF NEW.status NOT IN ('paid', 'partial', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    -- La deuda real manda sobre payment_status. Al ser un disparador diferido,
    -- el saldo que se lee aquí es el definitivo de la transacción.
    v_is_credit := COALESCE(NEW.balance, 0) > 0;
    v_fact_key := 'accrual:sale:' || NEW.id::text;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'sale'
      AND is_active = true
      AND (conditions->>'is_credit' IS NULL
           OR (conditions->>'is_credit')::boolean = v_is_credit)
    ORDER BY
      (CASE WHEN conditions->>'is_credit' IS NOT NULL THEN 0 ELSE 1 END),
      (CASE WHEN event_type = 'created' THEN 0 ELSE 1 END),
      priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id,
            COALESCE(NEW.sale_date, NEW.created_at, now()),
            'sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule',
            'Sin regla contable activa de venta ' ||
            CASE WHEN v_is_credit THEN '(a crédito)' ELSE '(de contado)' END);
        RETURN NEW;
    END IF;

    -- Si la factura de esta venta ya contabilizó el hecho, la RPC lo detecta
    -- por la clave y devuelve el asiento existente sin escribir nada.
    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(NEW.branch_id, 0),
        p_entry_date := COALESCE(NEW.sale_date, NEW.created_at, now()),
        p_memo := 'Venta POS ' || NEW.id::text,
        p_source := 'sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
    );

    RETURN NEW;
END;
$function$;

-- El trigger del POS pasa a diferido: se ejecuta al confirmar la transacción,
-- cuando la factura ya existe y ya contabilizó. Un CONSTRAINT TRIGGER no admite
-- lista de columnas en el UPDATE, así que el filtro de estado lo hace la propia
-- función, que ya lo hacía.
drop trigger if exists trg_auto_journal_sale_pos on public.sales;

create constraint trigger trg_auto_journal_sale_pos
  after insert or update on public.sales
  deferrable initially deferred
  for each row
  execute function public.fn_auto_journal_sale_pos();
