-- Higiene contable: F-49 · F-44 · F-47 · F-43.
--
-- F-49  Un borrador no genera asiento; al emitirse, sí. `fn_auto_journal_sale`
--       contabiliza solo con status IN ('issued','paid','partial') y su
--       disparador pasa a AFTER INSERT OR UPDATE OF status. Si el devengo
--       anterior de la factura fue revertido (los 31 borradores con asiento, en la
--       reversión histórica), la emisión usa la clave `…:reemision:n` para no
--       quedar bloqueada por el fact_key del asiento neutralizado.
--       `fn_auto_journal_void` solo revierte lo que llegó a contabilizarse: anular
--       un borrador ya no genera un contra-asiento de algo que nunca existió.
-- F-44  fn_recalc_invoice_totals, rama de compras: NEW.invoice_id, no OLD.
-- F-47  fn_create_journal_entry y _with_discount: solo service_role.
--       fn_sync_invoice_items_from_sale (SECURITY DEFINER, sin guarda, llamada
--       desde el navegador): guarda de pertenencia y fuera anon.
--       assistant_register_*_invoice (SECURITY INVOKER, con RLS, llamadas con la
--       sesión del usuario por diseño del asistente): fuera anon.
-- F-43  tax_account_mapping marcada como obsoleta.
--
-- ADR: docs/decisiones/ADR-CC-005-permisos-de-funciones-contables.md

-- ── F-49 ────────────────────────────────────────────────────────────────────
create or replace function public.fn_auto_journal_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_base_key text;
    v_fact_key text;
    v_prev_id integer;
    v_i integer;
BEGIN
    IF NEW.document_type IS NOT NULL AND NEW.document_type <> 'invoice' THEN
        RETURN NEW;
    END IF;

    -- Solo lo emitido se contabiliza (allow-list), y solo al entrar en ese
    -- conjunto: INSERT ya emitida, o UPDATE desde draft.
    IF NEW.status IS NULL OR NEW.status NOT IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;

    v_base_key := CASE
        WHEN NEW.sale_id IS NOT NULL THEN 'accrual:sale:' || NEW.sale_id::text
        ELSE 'accrual:invoice:' || NEW.id::text
    END;

    -- Si el devengo con esta clave fue neutralizado por un contra-asiento, la
    -- emisión necesita una clave nueva.
    v_fact_key := v_base_key;
    FOR v_i IN 1..20 LOOP
        SELECT id INTO v_prev_id FROM journal_entries
        WHERE organization_id = NEW.organization_id AND fact_key = v_fact_key;
        EXIT WHEN v_prev_id IS NULL;
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM journal_entries
            WHERE organization_id = NEW.organization_id AND fact_key = 'reversal:' || v_prev_id);
        v_fact_key := v_base_key || ':reemision:' || v_i;
    END LOOP;

    SELECT * INTO v_rule FROM fn_regla_devengo_venta(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de venta con cuenta de ingreso');
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

drop trigger if exists trg_auto_journal_sale on public.invoice_sales;
create trigger trg_auto_journal_sale
  after insert or update of status on public.invoice_sales
  for each row execute function public.fn_auto_journal_sale();

create or replace function public.fn_auto_journal_void()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_vivos integer;
BEGIN
    IF (NEW.status IN ('void','voided','cancelled'))
       AND (OLD.status IS DISTINCT FROM NEW.status)
       AND (OLD.status NOT IN ('void','voided','cancelled')) THEN

        IF NEW.document_type = 'credit_note' THEN
            RETURN NEW;
        END IF;

        IF EXISTS (
            SELECT 1 FROM invoice_sales cn
            WHERE cn.related_invoice_id = NEW.id
              AND cn.document_type = 'credit_note'
        ) THEN
            RETURN NEW;
        END IF;

        -- F-49: solo se revierte lo que llegó a contabilizarse y sigue vivo
        -- (devengos de la factura o de su venta que no tienen contra-asiento).
        SELECT count(*) INTO v_vivos
        FROM journal_entries je
        WHERE je.organization_id = NEW.organization_id
          AND (je.fact_key LIKE 'accrual:invoice:' || NEW.id::text || '%'
               OR (NEW.sale_id IS NOT NULL AND je.fact_key LIKE 'accrual:sale:' || NEW.sale_id::text || '%')
               OR (je.fact_key IS NULL AND je.source = 'invoice_sales' AND je.source_id = NEW.id::text))
          AND NOT EXISTS (
              SELECT 1 FROM journal_entries r
              WHERE r.organization_id = je.organization_id AND r.fact_key = 'reversal:' || je.id);
        IF v_vivos = 0 THEN
            RETURN NEW;
        END IF;

        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND event_type = 'voided'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;

        IF v_rule IS NULL THEN
            PERFORM fn_log_journal_failure(
                NEW.organization_id, NEW.branch_id, now(),
                'invoice_sales', NEW.id::text || ':void', 'void:invoice:' || NEW.id::text,
                NULL, NULL, ABS(COALESCE(NEW.total, 0)),
                'no_rule', 'Sin regla contable activa de anulación de venta');
            RETURN NEW;
        END IF;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := now(),
            p_memo := 'Anulación Factura ' || COALESCE(NEW.number, NEW.id::text),
            p_source := 'invoice_sales',
            p_source_id := NEW.id::text || ':void',
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := ABS(COALESCE(NEW.total, 0)),
            p_tax_account := v_rule.tax_account_code,
            p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN ABS(COALESCE(NEW.tax_total, 0)) ELSE 0 END,
            p_tax_is_credit := false,
            p_fact_key := 'void:invoice:' || NEW.id::text
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- ── F-44 ────────────────────────────────────────────────────────────────────
create or replace function public.fn_recalc_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_sales_id uuid;
  v_purchase_id uuid;
  v_subtotal numeric;
  v_total numeric;
  v_tax numeric;
  v_paid numeric;
  v_new_balance numeric;
  v_status text;
  v_tax_included boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_sales_id := COALESCE(OLD.invoice_sales_id, CASE WHEN OLD.invoice_type = 'sale' THEN OLD.invoice_id END);
    v_purchase_id := COALESCE(OLD.invoice_purchase_id, CASE WHEN OLD.invoice_type = 'purchase' THEN OLD.invoice_id END);
  ELSE
    v_sales_id := COALESCE(NEW.invoice_sales_id, CASE WHEN NEW.invoice_type = 'sale' THEN NEW.invoice_id END);
    -- F-44: era OLD.invoice_id; en un INSERT OLD es NULL y la compra no se recalculaba.
    v_purchase_id := COALESCE(NEW.invoice_purchase_id, CASE WHEN NEW.invoice_type = 'purchase' THEN NEW.invoice_id END);
  END IF;

  IF v_sales_id IS NOT NULL THEN
    SELECT tax_included INTO v_tax_included FROM invoice_sales WHERE id = v_sales_id;

    IF v_tax_included THEN
      -- Impuesto incluido: total_line es el bruto. La base de cada línea se
      -- redondea a centavos y el impuesto sale por resta (F-51: una sola regla,
      -- la misma que splitGrossLine en taxResolver.ts).
      SELECT
        COALESCE(SUM(
          CASE
            WHEN tax_rate > 0 THEN ROUND((qty * unit_price - COALESCE(discount_amount, 0)) / (1 + tax_rate / 100), 2)
            ELSE (qty * unit_price - COALESCE(discount_amount, 0))
          END
        ), 0),
        COALESCE(SUM(total_line), 0)
      INTO v_subtotal, v_total
      FROM invoice_items
      WHERE invoice_sales_id = v_sales_id
         OR (invoice_id = v_sales_id AND invoice_type = 'sale');
    ELSE
      SELECT
        COALESCE(SUM(qty * unit_price - COALESCE(discount_amount, 0)), 0),
        COALESCE(SUM(total_line), 0)
      INTO v_subtotal, v_total
      FROM invoice_items
      WHERE invoice_sales_id = v_sales_id
         OR (invoice_id = v_sales_id AND invoice_type = 'sale');
    END IF;

    v_tax := GREATEST(v_total - v_subtotal, 0);

    v_paid := fn_invoice_sales_paid(v_sales_id);

    v_new_balance := GREATEST(v_total - v_paid, 0);

    SELECT status INTO v_status FROM invoice_sales WHERE id = v_sales_id;

    IF v_status IN ('void', 'voided') THEN
      UPDATE invoice_sales
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          updated_at = NOW()
      WHERE id = v_sales_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax);
    ELSE
      UPDATE invoice_sales
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          balance = v_new_balance,
          updated_at = NOW()
      WHERE id = v_sales_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax
          OR balance IS DISTINCT FROM v_new_balance);
    END IF;
  END IF;

  IF v_purchase_id IS NOT NULL THEN
    SELECT
      COALESCE(SUM(qty * unit_price - COALESCE(discount_amount, 0)), 0),
      COALESCE(SUM(total_line), 0)
    INTO v_subtotal, v_total
    FROM invoice_items
    WHERE invoice_purchase_id = v_purchase_id
       OR (invoice_id = v_purchase_id AND invoice_type = 'purchase');

    v_tax := GREATEST(v_total - v_subtotal, 0);

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments
    WHERE source = 'invoice_purchase' AND source_id = v_purchase_id::text AND status = 'completed';

    v_new_balance := GREATEST(v_total - v_paid, 0);

    UPDATE invoice_purchase
    SET subtotal = v_subtotal,
        tax_total = v_tax,
        total = v_total,
        balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_purchase_id
      AND (total IS DISTINCT FROM v_total
        OR subtotal IS DISTINCT FROM v_subtotal
        OR tax_total IS DISTINCT FROM v_tax
        OR balance IS DISTINCT FROM v_new_balance);
  END IF;

  RETURN NULL;
END;
$function$;

-- ── F-47 ────────────────────────────────────────────────────────────────────
revoke all on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text)
  to service_role;

revoke all on function public.fn_create_journal_entry_with_discount(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_create_journal_entry_with_discount(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, boolean, uuid)
  to service_role;

revoke execute on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) from public, anon;
revoke execute on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) from public, anon;

create or replace function public.fn_sync_invoice_items_from_sale(p_invoice_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_sale_id uuid;
  v_org integer;
  v_inserted integer := 0;
BEGIN
  SELECT sale_id, organization_id INTO v_sale_id, v_org FROM invoice_sales WHERE id = p_invoice_id;
  IF v_sale_id IS NULL THEN
    RETURN 0;
  END IF;

  -- F-47: SECURITY DEFINER salta la RLS; quien llama debe pertenecer a la
  -- organización de la factura. Afirmación positiva: sin sesión, falla cerrado.
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id = auth.uid() AND om.organization_id = v_org AND om.is_active
  ) THEN
    RAISE EXCEPTION 'No perteneces a la organización de esta factura' USING errcode = '42501';
  END IF;

  PERFORM 1 FROM invoice_items WHERE invoice_sales_id = p_invoice_id LIMIT 1;
  IF FOUND THEN
    RETURN 0;
  END IF;

  INSERT INTO invoice_items (invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price, tax_rate, total_line, discount_amount, tax_included)
  SELECT
    p_invoice_id,
    p_invoice_id,
    'sale',
    si.product_id,
    COALESCE(p.name, 'Producto'),
    si.quantity,
    si.unit_price,
    COALESCE(si.tax_rate, 0),
    si.total,
    COALESCE(si.discount_amount, 0),
    inv.tax_included
  FROM sale_items si
  LEFT JOIN products p ON p.id = si.product_id
  JOIN invoice_sales inv ON inv.id = p_invoice_id
  WHERE si.sale_id = v_sale_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN v_inserted;
END;
$function$;

revoke all on function public.fn_sync_invoice_items_from_sale(uuid) from public, anon;
grant execute on function public.fn_sync_invoice_items_from_sale(uuid) to authenticated, service_role;

-- ── F-43 ────────────────────────────────────────────────────────────────────
comment on table public.tax_account_mapping is
  'OBSOLETA: no la usa ninguna función contable (0 referencias en pg_proc al 2026-09-23) y sus códigos de 8 dígitos no existen en ningún chart_of_accounts. Las cuentas de impuesto salen de accounting_rules.tax_account_code. Ver docs/hallazgos/F-43.md.';
