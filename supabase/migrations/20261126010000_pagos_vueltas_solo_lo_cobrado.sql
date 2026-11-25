-- GO-pos · El recibo registra lo cobrado; las vueltas no entran a la caja (Contador, 2026-11-25)
--
-- HALLAZGO (org 377). En 8 cobros en efectivo del POS el pago guardó en payments.amount lo que el
-- cliente ENTREGÓ (y las vueltas en change_amount). fn_auto_journal_payment contabilizó amount:
-- Dr 1105 / Cr 1305 por lo entregado. La factura se devengó por lo cobrado, así que la 1305 quedó
-- con saldo CRÉDITO de $ 104.000 (la cartera en cero) y la 1105 inflada por lo mismo. El arqueo
-- (pos_caja__esperado_calculo) sí restaba las vueltas: por eso las cajas cuadraron y el error solo
-- se veía en el libro.
--
-- CAUSA. Dos convenciones para el mismo campo:
--   · POS (pos_checkout_v1, mostrador y mesa) y checkout de PMS (createSaleFromFolio): amount =
--     ENTREGADO, change_amount = vueltas.
--   · Cobro de cartera (fn_registrar_pago): amount = APLICADO, change_amount = vueltas (informativo).
-- Los lectores de la app y del arqueo usan amount − change_amount (el valor aplicado); el asiento
-- del recibo (fn_auto_journal_payment) y el pagado de la factura (fn_invoice_sales_paid) usaban
-- amount a secas.
--
-- ARREGLO (aditivo, una sola regla en la base para todas las vías):
--   1. Columnas informativas NULL-ables: payments.cash_received (efectivo entregado) y
--      payments.change_given (vueltas devueltas). No generan asiento: las vueltas entran y salen de
--      la misma caja.
--   2. trg_00_payments_vueltas (BEFORE INSERT): si el pago trae vueltas, lo normaliza para que
--      amount sea SOLO lo aplicado al documento:
--        · POS / PMS (sin grupo de recibo): cash_received = amount, amount = amount − vueltas.
--        · Cartera (con payment_group_id; amount ya es lo aplicado): cash_received = lo entregado
--          del recibo (payment_groups.received_amount).
--      En los dos casos change_given = vueltas y change_amount = 0. Así se cumple, para filas
--      nuevas y viejas, «aplicado = amount − change_amount», que es la regla que ya usan el arqueo,
--      la mesa (fn_pos_mesa_saldo, pos_checkout_v1), Inicio y los documentos.
--   3. fn_auto_journal_payment y fn_invoice_sales_paid usan el aplicado (amount − change_amount),
--      correcto también para las 8 filas viejas.
--   4. zz_payments_no_excede_saldo (restricción diferida al COMMIT, solo pagos en efectivo a una
--      factura o venta): lo aplicado no puede superar lo que se debe (total de la factura + propina
--      de la venta, que no es línea de la factura) con 1 unidad de tolerancia de redondeo. Se mira
--      al final de la transacción porque el POS inserta los pagos antes que las líneas de la
--      factura. El sobrante con regla explícita (saldo a favor → 2805 con tercero) sigue por
--      fn_registrar_pago/fn_saldo_favor_crear, que lo registran como pago aparte (customer_credit).
--      Los pagos electrónicos no entran: no tienen vueltas y la tienda web inserta el pago antes de
--      completar la factura en otra transacción.
--
-- La regla de tercero en la 1305 no cambia (zzz_trg_1305_exige_tercero).
-- Lo anterior (8 recibos de la org 377) se corrige aparte con asientos de ajuste:
-- 20261126020000_ajuste_vueltas_recaudo_org377.sql.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS.
-- Reversión: supabase/rollbacks/20261126010000_pagos_vueltas_solo_lo_cobrado_rollback.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columnas informativas.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cash_received numeric NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS change_given numeric NULL;

COMMENT ON COLUMN public.payments.cash_received IS
  'Efectivo que entregó el cliente en este cobro (informativo, no se contabiliza). En un recibo de varios documentos va en la fila que lleva las vueltas y es el total entregado del recibo.';
COMMENT ON COLUMN public.payments.change_given IS
  'Vueltas devueltas al cliente en este cobro (informativo, no se contabiliza: entran y salen de la misma caja). amount ya es solo lo aplicado al documento.';
COMMENT ON COLUMN public.payments.change_amount IS
  'Histórico: vueltas incluidas en amount (pagos del POS anteriores al 2026-11-26). Desde 20261126010000 siempre 0; las vueltas van en change_given. Valor aplicado = amount - change_amount.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Normalización al insertar: amount = lo aplicado.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_payments_vueltas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_vueltas numeric := round(coalesce(new.change_amount, 0), 2);
  v_recibido numeric;
begin
  if v_vueltas = 0 then
    new.change_amount := 0;
    return new;
  end if;
  if v_vueltas < 0 then
    raise exception 'VUELTAS_INVALIDAS: las vueltas no pueden ser negativas (%).', v_vueltas
      using errcode = '22023';
  end if;

  if new.payment_group_id is not null then
    -- Recibo de cartera (fn_registrar_pago): amount ya es lo aplicado a este documento.
    select g.received_amount into v_recibido
      from public.payment_groups g where g.id = new.payment_group_id;
    new.cash_received := coalesce(new.cash_received, v_recibido, coalesce(new.amount, 0) + v_vueltas);
  else
    -- POS / PMS: amount llega con lo entregado.
    if v_vueltas >= coalesce(new.amount, 0) then
      raise exception 'VUELTAS_INVALIDAS: las vueltas (%) no pueden igualar ni superar lo entregado (%).',
          v_vueltas, coalesce(new.amount, 0)
        using errcode = '22023';
    end if;
    new.cash_received := coalesce(new.cash_received, new.amount);
    new.amount := new.amount - v_vueltas;
  end if;

  new.change_given := v_vueltas;
  new.change_amount := 0;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_trg_payments_vueltas() FROM PUBLIC, anon, authenticated;

-- Después de trg_00_hora_oficial y antes de los que usan amount (procesador, recibo, estado).
DROP TRIGGER IF EXISTS trg_00_payments_vueltas ON public.payments;
CREATE TRIGGER trg_00_payments_vueltas
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_payments_vueltas();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a. Asiento del recibo por lo aplicado (amount − change_amount).
--     Igual a la versión de 20261125120000 salvo v_monto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_journal_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_source_type text;
    v_es_cobro boolean;
    v_memo text;
    v_money_account text;
    v_counterpart text;
    v_discount numeric := 0;
    v_discount_account text;
    v_anticipo boolean := false;
    -- Lo aplicado al documento. Las vueltas no se contabilizan (20261126010000): en los pagos del
    -- POS anteriores a esa migración amount traía lo entregado y change_amount las vueltas.
    v_monto numeric := COALESCE(NEW.amount, 0) - COALESCE(NEW.change_amount, 0);
BEGIN
    IF NEW.status IS NOT NULL AND NEW.status <> 'completed' THEN
        RETURN NEW;
    END IF;

    IF NEW.source IN ('invoice_sales', 'account_receivable', 'sale', 'web_order') THEN
        v_source_type := 'sale_payment';
        v_es_cobro := true;
        v_memo := 'Cobro recibido';
    ELSIF NEW.source IN ('invoice_purchase', 'account_payable') THEN
        v_source_type := 'purchase_payment';
        v_es_cobro := false;
        v_memo := 'Pago a proveedor';
    ELSE
        RETURN NEW;
    END IF;

    -- Anticipo de contraentrega (20261125120000, Contador 2026-11-24): no es cartera, es un
    -- pasivo con el cliente hasta facturar. Dr pasarela/banco/caja / Cr 2805.
    v_anticipo := NEW.source = 'web_order'
      AND COALESCE(NEW.processor_response->>'concepto', '') = 'anticipo_contraentrega';

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = v_source_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL AND NOT v_anticipo THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            NULL, NULL, v_monto,
            'no_rule', 'Sin regla contable activa de ' || v_source_type);
        RETURN NEW;
    END IF;

    -- Cobro con tarjeta o pasarela: a la cuenta por cobrar del procesador (138020xx),
    -- que se salda con el abono. Contador 2026-11-21.
    v_money_account := CASE WHEN v_es_cobro
        THEN fn_cuenta_cobro(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id, NEW.processor)
        ELSE fn_money_account_code_pago(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id)
    END;

    IF v_anticipo THEN
        PERFORM public.fn_asegurar_cuenta_anticipos(NEW.organization_id);
        v_counterpart := '2805';
        v_memo := 'Anticipo de contraentrega recibido';
    ELSE
        v_counterpart := CASE WHEN v_es_cobro
            THEN v_rule.credit_account_code
            ELSE v_rule.debit_account_code
        END;
    END IF;

    IF v_money_account IS NULL THEN
        IF v_rule IS NULL THEN
            PERFORM fn_log_journal_failure(
                NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
                'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
                NULL, v_counterpart, v_monto,
                'no_rule', 'Sin cuenta de dinero para el anticipo ni regla de ' || v_source_type);
            RETURN NEW;
        END IF;
        v_money_account := CASE WHEN v_es_cobro
            THEN v_rule.debit_account_code
            ELSE v_rule.credit_account_code
        END;
    END IF;

    IF v_counterpart LIKE '4%' THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            v_money_account, v_counterpart, v_monto,
            'no_rule',
            'La regla de ' || v_source_type || ' lleva el cobro a la cuenta de ingreso ' ||
            v_counterpart || '; el ingreso ya se devengó con la venta');
        RETURN NEW;
    END IF;

    IF NOT v_anticipo AND COALESCE(NEW.discount_amount, 0) > 0 AND v_rule.discount_account_code IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM chart_of_accounts
           WHERE organization_id = NEW.organization_id
             AND account_code = v_rule.discount_account_code
       ) THEN
        v_discount := NEW.discount_amount;
        v_discount_account := v_rule.discount_account_code;
    END IF;

    IF v_es_cobro THEN
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.created_at, now()),
            p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'payments',
            p_source_id := NEW.id::text,
            p_debit_account := v_money_account,
            p_credit_account := v_counterpart,
            p_amount := v_monto + v_discount,
            p_tax_account := v_discount_account,
            p_tax_amount := v_discount,
            p_created_by := NEW.created_by,
            p_tax_is_credit := false,
            p_fact_key := 'settlement:payment:' || NEW.id::text
        );
    ELSE
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.created_at, now()),
            p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'payments',
            p_source_id := NEW.id::text,
            p_debit_account := v_counterpart,
            p_credit_account := v_money_account,
            p_amount := v_monto + v_discount,
            p_tax_account := v_discount_account,
            p_tax_amount := v_discount,
            p_created_by := NEW.created_by,
            p_tax_is_credit := true,
            p_fact_key := 'settlement:payment:' || NEW.id::text
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. Pagado de la factura por lo aplicado (igual a 20261110100000 salvo − change_amount).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_invoice_sales_paid(p_invoice_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.fn_assert_acceso_org((select i.organization_id from public.invoice_sales i where i.id = p_invoice_id));
  select coalesce((
    select sum(p.amount - coalesce(p.change_amount, 0)
               + case when p.source = 'account_receivable' then coalesce(p.discount_amount, 0) else 0 end)
      from public.payments p, public.invoice_sales i
     where i.id = p_invoice_id
       and p.status = 'completed'
       and (
         (p.source = 'invoice_sales' and p.source_id = i.id::text)
         or (p.source = 'sale' and i.sale_id is not null and p.source_id = i.sale_id::text)
         or (p.source = 'account_receivable' and p.source_id in (
             select ar.id::text from public.accounts_receivable ar where ar.invoice_id = i.id
           ))
       )
  ), 0)
  -- Saldo a favor aplicado a la factura: dinero ya recibido del cliente.
  + coalesce((
    select sum(a.amount) from public.credit_note_applications a where a.invoice_id = p_invoice_id
  ), 0);
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Un cobro en efectivo no aplica más de lo que se debe (al COMMIT).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_payments_no_excede_saldo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv public.invoice_sales%rowtype;
  v_sale public.sales%rowtype;
  v_limite numeric;
  v_pagado numeric;
  v_tol constant numeric := 1;  -- redondeo de las líneas (la mesa usa la misma unidad)
begin
  -- Restricción diferida: se relee el pago, que pudo anularse o borrarse antes del COMMIT.
  if not exists (select 1 from public.payments p
                  where p.id = new.id and p.status = 'completed' and p.method = 'cash') then
    return null;
  end if;
  if new.source_id is null
     or new.source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  if new.source = 'invoice_sales' then
    select * into v_inv from public.invoice_sales i
     where i.id = new.source_id::uuid and i.organization_id = new.organization_id;
  else
    select * into v_inv from public.invoice_sales i
     where i.sale_id = new.source_id::uuid and i.organization_id = new.organization_id
       and coalesce(i.document_type, 'invoice') = 'invoice'
     order by i.created_at limit 1;
  end if;

  if v_inv.id is not null then
    -- Documento todavía sin formar (borrador, anulado o sin total): no hay contra qué medir.
    if v_inv.status in ('draft', 'void', 'voided', 'cancelled') or coalesce(v_inv.total, 0) <= 0 then
      return null;
    end if;
    if v_inv.sale_id is not null then
      select * into v_sale from public.sales s where s.id = v_inv.sale_id;
    end if;
    -- La propina se cobra con la venta pero no es línea de la factura (pasivo 28150501).
    v_limite := v_inv.total + coalesce(v_sale.tip_amount, 0);
    select coalesce(sum(p.amount - coalesce(p.change_amount, 0)
                        + case when p.source = 'account_receivable' then coalesce(p.discount_amount, 0) else 0 end), 0)
      into v_pagado
      from public.payments p
     where p.organization_id = v_inv.organization_id
       and p.status = 'completed'
       and ((p.source = 'invoice_sales' and p.source_id = v_inv.id::text)
         or (p.source = 'sale' and v_inv.sale_id is not null and p.source_id = v_inv.sale_id::text)
         or (p.source = 'account_receivable' and p.source_id in (
               select ar.id::text from public.accounts_receivable ar where ar.invoice_id = v_inv.id)));
    v_pagado := v_pagado + coalesce((select sum(a.amount) from public.credit_note_applications a
                                      where a.invoice_id = v_inv.id), 0);
  elsif new.source = 'sale' then
    select * into v_sale from public.sales s
     where s.id = new.source_id::uuid and s.organization_id = new.organization_id;
    if v_sale.id is null or coalesce(v_sale.total, 0) <= 0 then
      return null;
    end if;
    v_limite := v_sale.total;
    select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0) into v_pagado
      from public.payments p
     where p.organization_id = v_sale.organization_id and p.status = 'completed'
       and p.source = 'sale' and p.source_id = v_sale.id::text;
  else
    return null;
  end if;

  if v_pagado > v_limite + v_tol then
    raise exception 'PAGO_EXCEDE_SALDO: lo cobrado (%) supera lo que se debe (%).', round(v_pagado, 2), round(v_limite, 2)
      using errcode = '23514',
            detail = 'Documento ' || coalesce(v_inv.number, v_inv.id::text, v_sale.id::text)
                     || ': el pago en efectivo aplica más que el saldo del documento.',
            hint = 'Registre las vueltas (lo entregado menos lo cobrado). Un sobrante que el cliente deja se registra como saldo a favor.';
  end if;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_trg_payments_no_excede_saldo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_payments_no_excede_saldo ON public.payments;
CREATE CONSTRAINT TRIGGER zz_payments_no_excede_saldo
  AFTER INSERT ON public.payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.method = 'cash' AND NEW.source IN ('invoice_sales', 'sale'))
  EXECUTE FUNCTION public.fn_trg_payments_no_excede_saldo();
