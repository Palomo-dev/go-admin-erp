-- Rollback de 20261006114659_auto_journal_web_order_sin_pagar.
-- Devuelve fn_auto_journal_web_order a su definición VIVA del 2026-10-06, tomada con
-- pg_get_functiondef antes de aplicar (md5 de prosrc 46c6470f30b0c9fffd8e287393078321).
-- Incluye su defecto: con este rollback, confirmar un pedido web sin pagar vuelve a fallar con
-- 23514 (invoice_sales_status_check). No toca datos: las facturas «WEB-…» creadas mientras
-- estuvo aplicada se conservan.
-- CREATE OR REPLACE sin SET quita también el search_path que fijó la migración, como estaba.

CREATE OR REPLACE FUNCTION public.fn_auto_journal_web_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_invoice RECORD;
    v_invoice_id uuid;
    v_existing_invoice uuid;
BEGIN
    -- Solo cuando el pedido cambia a 'confirmed' o 'completed' y tiene sale_id
    IF (NEW.status = 'confirmed' OR NEW.status = 'completed' OR NEW.status = 'delivered')
       AND (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.sale_id IS NOT NULL THEN

        -- Verificar si ya existe una factura para esta venta
        SELECT id INTO v_existing_invoice
        FROM invoice_sales
        WHERE sale_id = NEW.sale_id
          AND organization_id = NEW.organization_id
        LIMIT 1;

        -- Si ya existe factura, el trigger de invoice_sales ya la contabilizó
        IF v_existing_invoice IS NOT NULL THEN
            RETURN NEW;
        END IF;

        -- Crear factura de venta desde la web order
        -- Esto disparará el trigger trg_auto_journal_sale existente
        INSERT INTO invoice_sales (
            organization_id, branch_id, customer_id, sale_id,
            number, issue_date, subtotal, tax_total, total,
            status, document_type, tax_included, created_at
        ) VALUES (
            NEW.organization_id,
            NEW.branch_id,
            NULL,
            NEW.sale_id,
            'WEB-' || NEW.id::text,
            COALESCE(NEW.created_at, now()),
            NEW.total - COALESCE(NEW.tax_total, 0),
            COALESCE(NEW.tax_total, 0),
            NEW.total,
            'confirmed',
            'invoice',
            false,
            now()
        ) RETURNING id INTO v_invoice_id;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$function$;
