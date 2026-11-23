-- Reversión de 20261123023504_analitica_trafico_sin_nested_loop.
alter function public.fn_analitica_web_trafico(integer, date, date, integer) reset enable_nestloop;
alter table public.website_visits reset (autovacuum_analyze_scale_factor, autovacuum_analyze_threshold);
