-- ============================================================
-- ROLLBACK de 20260914110000_ciclo_de_vida_cliente_por_compra_real
-- ============================================================
-- Quita los tres triggers y las cuatro funciones.
--
-- SOBRE LOS DATOS: este rollback NO devuelve las 382 fichas a `lead`, y no
-- puede hacerlo con exactitud: una vez en `customer`, una ficha promovida por
-- el backfill es indistinguible de una que ya lo estaba, de una promovida por
-- una oportunidad ganada (`trg_sync_customer_lifecycle`) o de una que el
-- usuario cambió a mano. Si de verdad hay que deshacerlo, la consulta de
-- abajo, comentada, devuelve a `lead` SOLO las fichas que cumplen la regla de
-- compra real Y no tienen ninguna oportunidad ganada; revísala antes.
--
-- Efecto de revertir: las compras nuevas (POS, sitio web, cartera) dejarán de
-- promover la ficha a `customer`; solo lo hará la oportunidad ganada.
-- ============================================================

DROP TRIGGER IF EXISTS trg_sales_mark_customer_purchased ON public.sales;
DROP TRIGGER IF EXISTS trg_web_orders_mark_customer_purchased ON public.web_orders;
DROP TRIGGER IF EXISTS trg_ar_mark_customer_purchased ON public.accounts_receivable;

DROP FUNCTION IF EXISTS public.fn_sales_mark_customer_purchased();
DROP FUNCTION IF EXISTS public.fn_web_orders_mark_customer_purchased();
DROP FUNCTION IF EXISTS public.fn_ar_mark_customer_purchased();
DROP FUNCTION IF EXISTS public.fn_customer_mark_purchased(uuid);

-- Reversión de datos, SOLO si se decide expresamente (ver cabecera):
-- UPDATE public.customers c SET lifecycle_stage = 'lead', updated_at = now()
--  WHERE c.lifecycle_stage = 'customer'
--    AND NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.customer_id = c.id AND o.status = 'won')
--    AND (
--         EXISTS (SELECT 1 FROM public.sales s WHERE s.customer_id = c.id AND s.status IS DISTINCT FROM 'void')
--      OR EXISTS (SELECT 1 FROM public.web_orders w WHERE w.customer_id = c.id AND w.status = 'confirmed')
--      OR EXISTS (SELECT 1 FROM public.accounts_receivable a WHERE a.customer_id = c.id)
--    );
