-- ROLLBACK de 20260915210000_f11_eliminar_mv_customer_health
-- Recrea la vista materializada con la definición exacta que tenía en
-- producción el 2026-09-15 (`pg_get_viewdef`), sus dos índices únicos y la
-- función de refresco. Los privilegios se dejan MÁS cerrados que antes: solo
-- `service_role` (la MV no admite RLS; ni `anon` ni `authenticated` deben
-- leer datos cross-tenant). Si de verdad hiciera falta que la aplicación
-- volviera a leerla, hágase desde el servidor con `getServiceClient()`.
-- La recreación deja la vista vacía hasta el primer REFRESH.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_customer_health AS
 SELECT c.organization_id,
    c.id AS customer_id,
    count(DISTINCT s.id) FILTER (WHERE s.created_at > (now() - '90 days'::interval)) AS purchases_90d,
    EXTRACT(day FROM now() - COALESCE(max(s.created_at), c.created_at))::integer AS recency_days,
    COALESCE(sum(s.total), 0::numeric) AS ltv_total,
    COALESCE(avg(s.total), 0::numeric) AS avg_ticket
   FROM customers c
     LEFT JOIN sales s ON s.customer_id = c.id
  GROUP BY c.organization_id, c.id
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mvh_customer
  ON public.mv_customer_health USING btree (organization_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS mv_customer_health_customer_id_idx
  ON public.mv_customer_health USING btree (customer_id);

REVOKE ALL ON public.mv_customer_health FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mv_customer_health TO service_role;

-- REFRESH CONCURRENTLY exige que la vista esté poblada al menos una vez.
REFRESH MATERIALIZED VIEW public.mv_customer_health;

CREATE OR REPLACE FUNCTION public.refresh_mv_customer_health()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$ BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_customer_health; END; $function$;

REVOKE EXECUTE ON FUNCTION public.refresh_mv_customer_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_mv_customer_health() TO service_role;
