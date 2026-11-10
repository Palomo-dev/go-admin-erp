-- Cartera · un pago a una factura de venta con nota crédito ya no le devuelve el valor de la nota al saldo.
--
-- ESTADO: ESCRITA, NO APLICADA (20261110160000). Se aplica por el MCP cuando el dueño lo ordene. Va después de
-- 20261110150000; no depende de ninguna migración sin aplicar y es compatible con 20261110100000 (que reemplaza
-- fn_invoice_sales_paid y fn_excedente_nota_credito): esta solo LLAMA a fn_invoice_sales_paid, a través de
-- fn_factura_venta_recalcular_saldo, sea cual sea su versión. Reversión:
-- supabase/rollbacks/20261110160000_saldo_factura_pago_resta_notas_credito_rollback.sql (restaura EXACTAMENTE la
-- definición de hoy). Prueba en seco: docs/contador/pruebas/31_cartera_pago_tras_nota_credito.sql.
--
-- El error (latente). fn_recalc_invoice_balance_from_payments (disparador trg_recalc_invoice_balance_from_payments de
-- payments) calculaba el saldo de una factura de venta como total − pagado, SIN restar las notas crédito, mientras que
-- fn_factura_venta_recalcular_saldo (la que usan las notas crédito, los saldos a favor aplicados y los abonos) resta
-- fn_invoice_sales_acreditado. Si a una factura con nota crédito le llegaba un pago DESPUÉS de la nota, su saldo y su
-- estado quedaban inflados en el valor de la nota, y la cartera (accounts_receivable, que sigue a la factura por
-- tr_update_account_receivable → create_account_receivable) también. A 2026-11-10 hay 0 facturas afectadas (SELECT
-- por el MCP: 258 facturas, ninguna nota crédito; todas con saldo = total − pagado − notas): no hay datos que reparar.
--
-- Diseño elegido: la rama de VENTAS delega en fn_factura_venta_recalcular_saldo (una sola fórmula de saldo y estado
-- para la factura de venta, CLAUDE.md regla 7). La rama de COMPRAS queda idéntica, byte a byte.
-- Diferencias entre las dos funciones (estudiadas sobre las definiciones aplicadas, leídas por el MCP el 2026-11-10) y
-- qué se hizo con cada una:
--   · Notas crédito: el saldo pasa a ser total − pagado − notas vivas (lo que se corrige).
--   · Estado sin pagos: la vieja devolvía a «issued» una factura «partial»/«paid» cuando su pago se anulaba aunque
--     tuviera nota crédito (saldo = total); la nueva la deja «partial»/«paid» por la nota (igual que hace la nota).
--   · Borrador: la vieja no tocaba los borradores; fn_factura_venta_recalcular_saldo sí les escribiría el saldo (sin
--     cambiar el estado). Se conserva el filtro previo (draft, void, voided): un pago a un borrador sigue sin tocarlo.
--   · Anulada: «void» queda fuera en las dos. «cancelled» y «voided» no existen (invoice_sales_status_check solo admite
--     draft, issued, paid, partial, void); la función de notas también las excluye.
--   · La nota crédito misma: fn_factura_venta_recalcular_saldo no recalcula documentos credit_note. La vieja sí podía
--     hacerlo: un pago de origen «sale» buscaba la factura con «WHERE sale_id = … LIMIT 1», y las notas crédito del POS
--     (procesar_devolucion, pos_anular_venta_v1) llevan el MISMO sale_id que su factura. Si la consulta devolvía la nota,
--     la vieja le cambiaba el estado (issued → paid) y la factura solo se arreglaba de rebote por el disparador de la
--     nota. Delegar sin más dejaría ese pago SIN recalcular la factura; por eso la búsqueda por venta excluye las notas
--     crédito y es determinista: prefiere la factura no anulada y, entre varias, la primera creada.
--   · Lo pagado: las dos usan fn_invoice_sales_paid (pagos de los tres orígenes, descuento de cartera y saldo a favor
--     aplicado; con 20261110100000, también los abonos por retención aplicados).
-- Cartera: no se escribe a mano. fn_factura_venta_recalcular_saldo actualiza balance/status de la factura solo si
-- cambian, y tr_update_account_receivable lleva ese saldo y estado a accounts_receivable, igual que antes.
-- CREATE OR REPLACE conserva el ACL (hoy: EXECUTE solo para postgres y service_role; ni anon ni authenticated) y el
-- disparador.
--
-- Definición que reemplaza (pg_get_functiondef leído por el MCP el 2026-11-10):
--   fn_recalc_invoice_balance_from_payments()  md5 766dcc160a61fd0469a4c7633c6b70c6 (APLICADA)
-- Funciones que usa, sin cambiarlas: fn_factura_venta_recalcular_saldo(uuid) md5 aaed3eee3cc38b60e6ae717544f83eac.

CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_balance_from_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r RECORD;
  v_invoice_id uuid;
  v_total numeric;
  v_balance numeric;
  v_status text;
BEGIN
  FOR r IN
    SELECT DISTINCT src, sid
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.source END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_id END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.source END,
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_id END)
    ) AS t(src, sid)
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale', 'account_payable', 'account_receivable')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    v_invoice_id := NULL;

    IF r.src IN ('invoice_purchase', 'account_payable') THEN
      IF r.src = 'invoice_purchase' THEN
        v_invoice_id := r.sid::uuid;
      ELSE
        SELECT invoice_id INTO v_invoice_id FROM accounts_payable WHERE id = r.sid::uuid;
      END IF;

      CONTINUE WHEN v_invoice_id IS NULL;

      SELECT total, status INTO v_total, v_status
      FROM invoice_purchase WHERE id = v_invoice_id;

      CONTINUE WHEN v_total IS NULL;
      CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

      -- Compras (F1.1): neto a pagar (total − retenciones) − pagado de los dos
      -- orígenes, con descuento (D4, D5).
      v_balance := GREATEST(fn_invoice_purchase_neto(v_invoice_id) - fn_invoice_purchase_paid(v_invoice_id), 0);

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSIF r.src = 'account_receivable' THEN
      -- La cartera sin factura la ajusta update_accounts_receivable_on_payment.
      SELECT invoice_id INTO v_invoice_id FROM accounts_receivable WHERE id = r.sid::uuid;
    ELSE
      -- Venta POS: su factura, nunca una nota crédito de la misma venta (devolución o
      -- anulación llevan el mismo sale_id). La no anulada primero; entre varias, la primera.
      SELECT id INTO v_invoice_id
      FROM invoice_sales
      WHERE sale_id = r.sid::uuid
        AND COALESCE(document_type, 'invoice') <> 'credit_note'
      ORDER BY (status = 'void'), created_at, id
      LIMIT 1;
    END IF;

    CONTINUE WHEN v_invoice_id IS NULL;

    SELECT total, status INTO v_total, v_status
    FROM invoice_sales WHERE id = v_invoice_id;

    CONTINUE WHEN v_total IS NULL;
    -- Un pago no toca borradores ni anuladas (como antes).
    CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

    -- Saldo y estado con la misma fórmula que las notas crédito, los saldos a favor
    -- y los abonos: total − pagado − notas crédito vivas. La cartera sigue a la
    -- factura por tr_update_account_receivable.
    PERFORM fn_factura_venta_recalcular_saldo(v_invoice_id);
  END LOOP;

  RETURN NULL;
END;
$function$;
