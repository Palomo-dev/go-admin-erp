-- Reversión de 20260930180020_web_conversion_stats_zona_organizacion.
-- Restaura el cuerpo anterior EXACTO (con 'America/Bogota' cableada y sin
-- search_path), leído de pg_get_functiondef el 2026-09-30 antes de aplicar.

create or replace function public.get_web_conversion_stats(p_organization_id integer, p_date_from text, p_date_to text)
 returns table(total_orders bigint, confirmed_orders bigint, cancelled_orders bigint, pending_orders bigint, total_revenue numeric, conversion_rate numeric)
 language sql
 security definer
as $function$
  select public.fn_assert_acceso_org(p_organization_id);
  SELECT
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE payment_status = 'paid' OR status = 'delivered') AS confirmed_orders,
    COUNT(*) FILTER (WHERE status IN ('cancelled', 'rejected')) AS cancelled_orders,
    COUNT(*) FILTER (
      WHERE NOT (payment_status = 'paid' OR status = 'delivered')
        AND status NOT IN ('cancelled', 'rejected')
    ) AS pending_orders,
    COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid' OR status = 'delivered'), 0) AS total_revenue,
    CASE
      WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE payment_status = 'paid' OR status = 'delivered')::numeric / COUNT(*)::numeric) * 100, 1)
      ELSE 0
    END AS conversion_rate
  FROM web_orders
  WHERE organization_id = p_organization_id
    AND created_at >= (p_date_from::date)::timestamp AT TIME ZONE 'America/Bogota'
    AND created_at < ((p_date_to::date) + 1)::timestamp AT TIME ZONE 'America/Bogota';
$function$;
