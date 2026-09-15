-- ROLLBACK de 20260915160000_f14_retirar_execute_anon_rpc_revenue
-- Devuelve EXECUTE a anon (estado anterior). No recomendado.
GRANT EXECUTE ON FUNCTION public.fn_pipeline_funnel(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_cohort_retention(integer, date, date) TO anon;
