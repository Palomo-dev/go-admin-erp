-- ============================================================
-- get_web_conversion_stats: el día se corta con la zona de la ORGANIZACIÓN.
--
-- Antes cableaba la zona de Bogotá (regla 6 de docs/reglas-fechas-timezone.md).
-- Ahora usa `fn_timezone_for(p_organization_id)`: organización → fallback del sistema.
-- Misma firma, mismas columnas y mismos permisos: quien la
-- llame no cambia. Para las organizaciones con la zona de Bogotá (o sin zona) el
-- resultado es idéntico al de antes.
--
-- Se añade `set search_path` (era SECURITY DEFINER sin él). La guarda
-- `fn_assert_acceso_org` se conserva y los grants existentes (authenticated,
-- service_role; sin anon ni public) no cambian con CREATE OR REPLACE.
-- ============================================================

create or replace function public.get_web_conversion_stats(p_organization_id integer, p_date_from text, p_date_to text)
 returns table(total_orders bigint, confirmed_orders bigint, cancelled_orders bigint, pending_orders bigint, total_revenue numeric, conversion_rate numeric)
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
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
  FROM public.web_orders
  WHERE organization_id = p_organization_id
    AND created_at >= (p_date_from::date)::timestamp AT TIME ZONE public.fn_timezone_for(p_organization_id)
    AND created_at < ((p_date_to::date) + 1)::timestamp AT TIME ZONE public.fn_timezone_for(p_organization_id);
$function$;

revoke all on function public.get_web_conversion_stats(integer, text, text) from public, anon;
grant execute on function public.get_web_conversion_stats(integer, text, text) to authenticated, service_role;
