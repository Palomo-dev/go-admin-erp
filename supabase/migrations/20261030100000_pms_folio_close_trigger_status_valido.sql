-- PMS: el cierre de folio en check-out fallaba con
--   new row for relation "invoice_sales" violates check constraint "invoice_sales_status_check"
-- Causa: fn_auto_journal_folio_close insertaba status 'confirmed' (no está en
-- draft|issued|paid|partial|void) y su búsqueda de factura previa nunca encontraba
-- la del checkout, porque sales.notes guardaba solo los 8 primeros caracteres del
-- id de la reserva y además exigía sale_id IS NOT NULL para el caso 'FOLIO-<id>'.
-- NO APLICADA. Revisar y aplicar a mano.
CREATE OR REPLACE FUNCTION public.fn_auto_journal_folio_close()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_reservation RECORD;
    v_invoice_id uuid;
    v_existing_invoice uuid;
    v_subtotal numeric := 0;
    v_tax_total numeric := 0;
    v_total numeric := 0;
BEGIN
    IF (NEW.status IS DISTINCT FROM OLD.status) AND NEW.status = 'closed' THEN
        SELECT r.organization_id, r.branch_id, r.customer_id, r.id
        INTO v_reservation
        FROM reservations r
        WHERE r.id = NEW.reservation_id
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN NEW;
        END IF;

        -- Factura previa: la del checkout (venta con nota con id completo o los 8
        -- primeros caracteres, formato antiguo) o una 'FOLIO-<id>' ya generada.
        SELECT i.id INTO v_existing_invoice
        FROM invoice_sales i
        WHERE i.organization_id = v_reservation.organization_id
          AND (
            (i.sale_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM sales s
              WHERE s.id = i.sale_id
                AND (s.notes LIKE '%Checkout reserva ' || v_reservation.id::text || '%'
                     OR s.notes = 'Checkout reserva ' || left(v_reservation.id::text, 8))
            ))
            OR i.number = 'FOLIO-' || NEW.id::text
          )
        LIMIT 1;

        IF v_existing_invoice IS NOT NULL THEN
            RETURN NEW;
        END IF;

        SELECT
            COALESCE(SUM(amount), 0),
            COALESCE(SUM(CASE WHEN tax_code IS NOT NULL THEN amount * 0.19 ELSE 0 END), 0)
        INTO v_subtotal, v_tax_total
        FROM folio_items
        WHERE folio_id = NEW.id;

        v_total := v_subtotal + v_tax_total;

        IF v_total <= 0 THEN
            RETURN NEW;
        END IF;

        INSERT INTO invoice_sales (
            organization_id, branch_id, customer_id, sale_id,
            number, issue_date, subtotal, tax_total, total, balance,
            status, document_type, tax_included, created_at
        ) VALUES (
            v_reservation.organization_id,
            v_reservation.branch_id,
            v_reservation.customer_id,
            NULL,
            'FOLIO-' || NEW.id::text,
            now(),
            v_subtotal - v_tax_total,
            v_tax_total,
            v_total,
            v_total,
            'issued',   -- antes 'confirmed': violaba invoice_sales_status_check
            'invoice',
            false,
            now()
        ) RETURNING id INTO v_invoice_id;
    END IF;

    RETURN NEW;
END;
$function$;
