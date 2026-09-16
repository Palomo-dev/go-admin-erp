-- ============================================================
-- F14 · fn_revenue_metrics — espina de meses y cobrado real
-- ============================================================
-- Hallazgo del tester de F14 r1 con datos reales (2026-09-15):
--   1. `revenue_collected` exigía `invoice_sales.opportunity_id IS NOT NULL`
--      y 0 facturas con pago completado de toda la plataforma lo tienen:
--      «Revenue cobrado $ 0» para todas las organizaciones (org 135: $ 16,97 M
--      cobrados reales).
--   2. La CTE de oportunidades (por mes de creación) era la tabla conductora:
--      un mes con facturas o pagos pero sin oportunidades creadas desaparecía
--      (ARPA de org 2 +15,6 %; agosto 2026 de org 135 invisible).
--   3. ARPA salía como media de medias mensuales.
-- Cambios:
--   - Espina de meses con generate_series(p_start, p_end): todo mes del rango
--     aparece aunque no tenga oportunidades.
--   - `revenue_collected` = pagos `completed` de facturas de la organización
--     (payments.source = 'invoice_sales', source_id text = invoice_sales.id),
--     sin exigir enlace a oportunidad. Se añade `revenue_collected_linked`
--     (solo facturas con `opportunity_id`) para quien quiera la vista estricta.
--   - Se añade `invoices_paid` (numero de facturas `paid` del mes) para que el
--     consumidor pondere el ARPA global por facturas.
-- La firma cambia de columnas de salida (se añaden al final), por eso DROP +
-- CREATE. Sin llamadores en SQL (`pg_proc`); en código, `revenueOs/rpc.ts` y
-- `commercialMetricsService.ts` mapean por nombre de columna.
-- SECURITY INVOKER (RLS aplica). Se retira EXECUTE a anon (deuda conocida).
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_revenue_metrics(integer, date, date);

CREATE FUNCTION public.fn_revenue_metrics(p_org_id integer, p_start date, p_end date)
RETURNS TABLE(
  month date,
  deals_won bigint,
  deals_lost bigint,
  deals_open bigint,
  revenue_won_pipeline numeric,
  revenue_lost numeric,
  revenue_pipeline numeric,
  arpa numeric,
  avg_sales_cycle_days numeric,
  win_rate numeric,
  revenue_collected numeric,
  commissions_paid numeric,
  revenue_collected_linked numeric,
  invoices_paid bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH months AS (
    SELECT gs::date AS month
    FROM generate_series(
      DATE_TRUNC('month', p_start::timestamp),
      DATE_TRUNC('month', (p_end - 1)::timestamp),
      interval '1 month'
    ) gs
  ),
  pipeline AS (
    SELECT
      DATE_TRUNC('month', o.created_at)::date AS month,
      COUNT(*) FILTER (WHERE o.status = 'won') AS deals_won,
      COUNT(*) FILTER (WHERE o.status = 'lost') AS deals_lost,
      COUNT(*) FILTER (WHERE o.status NOT IN ('won','lost')) AS deals_open,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'won'), 0) AS revenue_won_pipeline,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'lost'), 0) AS revenue_lost,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status NOT IN ('won','lost')), 0) AS revenue_pipeline,
      AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at))/86400)
        FILTER (WHERE o.status = 'won') AS avg_sales_cycle_days,
      COUNT(*) FILTER (WHERE o.status = 'won')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE o.status IN ('won','lost')), 0) AS win_rate
    FROM public.opportunities o
    WHERE o.organization_id = p_org_id
      AND o.created_at >= p_start
      AND o.created_at < p_end
    GROUP BY DATE_TRUNC('month', o.created_at)
  ),
  arpa_period AS (
    SELECT
      DATE_TRUNC('month', i.issue_date)::date AS month,
      AVG(i.total) AS arpa,
      COUNT(*) AS invoices_paid
    FROM public.invoice_sales i
    WHERE i.organization_id = p_org_id
      AND i.status = 'paid'
      AND i.issue_date >= p_start
      AND i.issue_date < p_end
    GROUP BY DATE_TRUNC('month', i.issue_date)
  ),
  revenue AS (
    SELECT
      DATE_TRUNC('month', p.payment_date)::date AS month,
      COALESCE(SUM(p.amount), 0) AS revenue_collected,
      COALESCE(SUM(p.amount) FILTER (WHERE i.opportunity_id IS NOT NULL), 0) AS revenue_collected_linked
    FROM public.payments p
    JOIN public.invoice_sales i ON p.source = 'invoice_sales' AND p.source_id = i.id::text
    WHERE i.organization_id = p_org_id
      AND p.status = 'completed'
      AND p.payment_date >= p_start
      AND p.payment_date < p_end
    GROUP BY DATE_TRUNC('month', p.payment_date)
  ),
  commissions_paid AS (
    SELECT
      DATE_TRUNC('month', c.paid_at)::date AS month,
      COALESCE(SUM(c.commission_amount), 0) AS commissions_paid
    FROM public.commissions c
    WHERE c.organization_id = p_org_id
      AND c.status = 'paid'
      AND c.paid_at >= p_start
      AND c.paid_at < p_end
    GROUP BY DATE_TRUNC('month', c.paid_at)
  )
  SELECT
    m.month,
    COALESCE(p.deals_won, 0),
    COALESCE(p.deals_lost, 0),
    COALESCE(p.deals_open, 0),
    COALESCE(p.revenue_won_pipeline, 0),
    COALESCE(p.revenue_lost, 0),
    COALESCE(p.revenue_pipeline, 0),
    a.arpa,
    p.avg_sales_cycle_days,
    p.win_rate,
    COALESCE(r.revenue_collected, 0),
    COALESCE(cp.commissions_paid, 0),
    COALESCE(r.revenue_collected_linked, 0),
    COALESCE(a.invoices_paid, 0)
  FROM months m
  LEFT JOIN pipeline p ON p.month = m.month
  LEFT JOIN arpa_period a ON a.month = m.month
  LEFT JOIN revenue r ON r.month = m.month
  LEFT JOIN commissions_paid cp ON cp.month = m.month
  ORDER BY m.month;
$function$;

REVOKE ALL ON FUNCTION public.fn_revenue_metrics(integer, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_revenue_metrics(integer, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_revenue_metrics(integer, date, date) IS
  'F14: métricas mensuales de revenue con espina de meses; cobrado = pagos completed de facturas de la organización (revenue_collected_linked solo con oportunidad). SECURITY INVOKER.';
