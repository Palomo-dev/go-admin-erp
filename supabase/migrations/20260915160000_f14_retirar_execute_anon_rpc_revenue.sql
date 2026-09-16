-- ============================================================
-- F14 · retirar EXECUTE a anon en fn_pipeline_funnel y fn_cohort_retention
-- ============================================================
-- Deuda registrada en la memoria «RPC a anon»: las tres RPC de Revenue OS eran
-- ejecutables por `anon`. `fn_revenue_metrics` quedó cerrada en la migración
-- 20260915120000; estas dos seguían abiertas (SECURITY INVOKER, así que anon no
-- veía filas por RLS, pero la superficie sobra). Solo las llaman route handlers
-- con sesión (`revenueOs/rpc.ts`, `commercialMetricsService.ts`).
-- ============================================================

REVOKE ALL ON FUNCTION public.fn_pipeline_funnel(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pipeline_funnel(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_cohort_retention(integer, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cohort_retention(integer, date, date) TO authenticated, service_role;
