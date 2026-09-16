-- ============================================================
-- CRM: quien compra es cliente (ciclo de vida por compra real, presente y futuro)
-- ============================================================
-- Decisión de producto (2026-09-14, delegada por el dueño con «termina todo»):
-- `customers.lifecycle_stage = 'customer'` significa **ha comprado de verdad**.
-- Evidencia de compra real, y solo esta:
--   · una venta con `sales.status <> 'void'` (las anuladas no cuentan);
--   · un pedido web con `web_orders.status = 'confirmed'` (cancelados y
--     vencidos no cuentan);
--   · cualquier cuenta por cobrar (`accounts_receivable`): si alguien debe
--     dinero por algo, compró.
--
-- Por qué hacía falta decidirlo: medido el 2026-09-10, las 369 fichas en
-- `customer` eran EXACTAMENTE las 369 con cuenta por cobrar, es decir, la
-- etapa significaba «tiene cuenta por cobrar», no «ha comprado». Y con la
-- definición laxa (cualquier venta o pedido, anulados incluidos) salían 928
-- fichas «con compra» marcadas como lead; con la regla estricta de arriba son
-- 382. Esa diferencia es justamente la razón de fijar la definición antes de
-- corregir datos.
--
-- Escalera: lead → opportunity → customer. Nunca se baja por esta vía. Una
-- ficha `churned` que vuelve a comprar vuelve a `customer` (reactivación); hoy
-- no hay ninguna `churned`, así que la rama no afecta datos existentes.
--
-- «Presente y futuro»:
--   1. `fn_customer_mark_purchased(customer_id)`: promueve a `customer` si no
--      lo es ya. Idempotente.
--   2. Triggers AFTER INSERT/UPDATE en `sales`, `web_orders` y
--      `accounts_receivable` con la condición de compra real de cada tabla.
--      Cubren TODOS los caminos que registran una compra (POS, sitio web,
--      cartera) sin depender de que el código se acuerde.
--   3. Backfill con la misma regla.
--
-- El trigger `trg_sync_customer_lifecycle` de `opportunities` (oportunidad
-- ganada → customer) sigue vigente; este es su complemento para las compras
-- que no pasan por el pipeline.
--
-- Sin nombres de organizaciones cliente. Sin credenciales. SECURITY DEFINER
-- con search_path fijo y REVOKE. Probado en seco con conteos antes de aplicar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_customer_mark_purchased(p_customer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows int;
BEGIN
  IF p_customer_id IS NULL THEN RETURN false; END IF;
  UPDATE customers
     SET lifecycle_stage = 'customer',
         updated_at = now()
   WHERE id = p_customer_id
     AND lifecycle_stage IS DISTINCT FROM 'customer';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_customer_mark_purchased(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_customer_mark_purchased(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_customer_mark_purchased(uuid) IS
  'Promueve la ficha a lifecycle_stage=customer al registrarse una compra real. Nunca baja de etapa. Idempotente.';

-- Ventas del POS: cuenta toda venta no anulada.
CREATE OR REPLACE FUNCTION public.fn_sales_mark_customer_purchased()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NEW.status IS DISTINCT FROM 'void' THEN
    PERFORM public.fn_customer_mark_purchased(NEW.customer_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_sales_mark_customer_purchased() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_sales_mark_customer_purchased ON public.sales;
CREATE TRIGGER trg_sales_mark_customer_purchased
  AFTER INSERT OR UPDATE OF status, customer_id ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.fn_sales_mark_customer_purchased();

-- Pedidos web: solo los confirmados.
CREATE OR REPLACE FUNCTION public.fn_web_orders_mark_customer_purchased()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NEW.status = 'confirmed' THEN
    PERFORM public.fn_customer_mark_purchased(NEW.customer_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_web_orders_mark_customer_purchased() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_web_orders_mark_customer_purchased ON public.web_orders;
CREATE TRIGGER trg_web_orders_mark_customer_purchased
  AFTER INSERT OR UPDATE OF status, customer_id ON public.web_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_web_orders_mark_customer_purchased();

-- Cartera: cualquier cuenta por cobrar es una compra.
CREATE OR REPLACE FUNCTION public.fn_ar_mark_customer_purchased()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    PERFORM public.fn_customer_mark_purchased(NEW.customer_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_ar_mark_customer_purchased() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_ar_mark_customer_purchased ON public.accounts_receivable;
CREATE TRIGGER trg_ar_mark_customer_purchased
  AFTER INSERT OR UPDATE OF customer_id ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.fn_ar_mark_customer_purchased();

-- Backfill con la misma regla (382 fichas medidas el 2026-09-14).
UPDATE public.customers c
   SET lifecycle_stage = 'customer', updated_at = now()
 WHERE c.lifecycle_stage IS DISTINCT FROM 'customer'
   AND (
        EXISTS (SELECT 1 FROM public.sales s WHERE s.customer_id = c.id AND s.status IS DISTINCT FROM 'void')
     OR EXISTS (SELECT 1 FROM public.web_orders w WHERE w.customer_id = c.id AND w.status = 'confirmed')
     OR EXISTS (SELECT 1 FROM public.accounts_receivable a WHERE a.customer_id = c.id)
   );
