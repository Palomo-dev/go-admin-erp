-- Rollback de 20260923081427_impuesto_de_linea_normalizado_en_la_base.sql
--
-- Retira la normalización de impuesto de línea y su auditoría, devuelve el
-- disparador de recálculo a «cualquier UPDATE» y restaura la base sin redondear
-- por línea en facturas con impuesto incluido (F-51 vuelve).
--
-- No borra los tax_code rellenados (280 líneas con tarifa 19 → IVA_19): es un
-- dato correcto y borrarlo reabriría F-50. Si hiciera falta, se identifican por
-- tax_code = 'IVA_19' AND updated_at < '2026-09-23 08:14:27+00'.

drop trigger if exists trg_normalizar_impuesto_linea on public.invoice_items;
drop function if exists public.fn_normalizar_impuesto_linea();
drop function if exists public.fn_codigo_impuesto_linea(integer, integer, numeric);
drop table if exists public.invoice_item_tax_audit;

drop trigger if exists trg_recalc_invoice_totals_upd on public.invoice_items;
create trigger trg_recalc_invoice_totals_upd
  after update on public.invoice_items
  for each row execute function public.fn_recalc_invoice_totals();

create or replace function public.fn_recalc_invoice_totals()
returns trigger
language plpgsql
security definer
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
    v_purchase_id := COALESCE(NEW.invoice_purchase_id, CASE WHEN NEW.invoice_type = 'purchase' THEN OLD.invoice_id END);
  END IF;

  IF v_sales_id IS NOT NULL THEN
    SELECT tax_included INTO v_tax_included FROM invoice_sales WHERE id = v_sales_id;

    IF v_tax_included THEN
      SELECT
        COALESCE(SUM(
          CASE
            WHEN tax_rate > 0 THEN (qty * unit_price - COALESCE(discount_amount, 0)) / (1 + tax_rate / 100)
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
