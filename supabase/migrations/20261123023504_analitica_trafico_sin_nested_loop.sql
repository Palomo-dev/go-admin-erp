-- La analítica de tráfico (GET /api/sitio-web/analitica/trafico) daba 500 por statement timeout:
-- website_visits nunca se había analizado desde el cambio de proyecto (reltuples heredado alto,
-- sin autoanalyze) y el planificador estimaba 1 fila, así que unía visitas con sesiones con un
-- nested loop (23 M comparaciones, ~9 s para un día). Con estadísticas al día tarda ~0,4 s.
-- Para que no vuelva: la función no usa nested loop y la tabla se re-analiza más seguido.
alter function public.fn_analitica_web_trafico(integer, date, date, integer) set enable_nestloop = off;
alter table public.website_visits set (autovacuum_analyze_scale_factor = 0.02, autovacuum_analyze_threshold = 1000);
