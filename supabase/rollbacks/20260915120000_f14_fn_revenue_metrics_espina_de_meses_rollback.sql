-- ROLLBACK de 20260915120000_f14_fn_revenue_metrics_espina_de_meses
-- Restaura la versión anterior (sin espina de meses; cobrado solo de facturas
-- enlazadas a oportunidad). Efecto: «Revenue cobrado» vuelve a $ 0 para las
-- organizaciones sin facturas enlazadas y los meses sin oportunidades
-- desaparecen del resultado.
DROP FUNCTION IF EXISTS public.fn_revenue_metrics(integer, date, date);

CREATE FUNCTION public.fn_revenue_metrics(p_org_id integer, p_start date, p_end date)
RETURNS TABLE(month date, deals_won bigint, deals_lost bigint, deals_open bigint, revenue_won_pipeline numeric, revenue_lost numeric, revenue_pipeline numeric, arpa numeric, avg_sales_cycle_days numeric, win_rate numeric, revenue_collected numeric, commissions_paid numeric)
LANGUAGE sql STABLE
AS $function$
  WITH pipeline AS (
    SELECT DATE_TRUNC('month', o.created_at)::date AS month,
      COUNT(*) FILTER (WHERE o.status = 'won') AS deals_won,
      COUNT(*) FILTER (WHERE o.status = 'lost') AS deals_lost,
      COUNT(*) FILTER (WHERE o.status NOT IN ('won','lost')) AS deals_open,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'won'), 0) AS revenue_won_pipeline,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'lost'), 0) AS revenue_lost,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status NOT IN ('won','lost')), 0) AS revenue_pipeline,
      AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at))/86400) FILTER (WHERE o.status = 'won') AS avg_sales_cycle_days,
      COUNT(*) FILTER (WHERE o.status = 'won')::float / NULLIF(COUNT(*) FILTER (WHERE o.status IN ('won','lost')), 0) AS win_rate
    FROM opportunities o
    WHERE o.organization_id = p_org_id AND o.created_at >= p_start AND o.created_at < p_end
    GROUP BY DATE_TRUNC('month', o.created_at)
  ),
  arpa_period AS (
    SELECT DATE_TRUNC('month', i.issue_date)::date AS month, AVG(i.total) AS arpa
    FROM invoice_sales i
    WHERE i.organization_id = p_org_id AND i.status = 'paid' AND i.issue_date >= p_start AND i.issue_date < p_end
    GROUP BY DATE_TRUNC('month', i.issue_date)
  ),
  revenue AS (
    SELECT DATE_TRUNC('month', p.payment_date)::date AS month,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed' AND i.opportunity_id IS NOT NULL), 0) AS revenue_collected
    FROM payments p
    JOIN invoice_sales i ON p.source_id = i.id::text AND p.source = 'invoice_sales'
    WHERE i.organization_id = p_org_id AND p.payment_date >= p_start AND p.payment_date < p_end
    GROUP BY DATE_TRUNC('month', p.payment_date)
  ),
  commissions_paid AS (
    SELECT DATE_TRUNC('month', c.paid_at)::date AS month, COALESCE(SUM(c.commission_amount), 0) AS commissions_paid
    FROM commissions c
    WHERE c.organization_id = p_org_id AND c.status = 'paid' AND c.paid_at >= p_start AND c.paid_at < p_end
    GROUP BY DATE_TRUNC('month', c.paid_at)
  )
  SELECT p.month, p.deals_won, p.deals_lost, p.deals_open, p.revenue_won_pipeline, p.revenue_lost, p.revenue_pipeline,
    a.arpa, p.avg_sales_cycle_days, p.win_rate, COALESCE(r.revenue_collected, 0), COALESCE(cp.commissions_paid, 0)
  FROM pipeline p
  LEFT JOIN arpa_period a ON a.month = p.month
  LEFT JOIN revenue r ON r.month = p.month
  LEFT JOIN commissions_paid cp ON cp.month = p.month
  ORDER BY p.month;
$function$;
GRANT EXECUTE ON FUNCTION public.fn_revenue_metrics(integer, date, date) TO anon, authenticated, service_role;
