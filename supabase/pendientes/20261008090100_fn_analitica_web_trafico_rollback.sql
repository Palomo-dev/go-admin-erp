-- Reversión de 20261008090100_fn_analitica_web_trafico.sql
-- La función es nueva: quitarla deja la analítica como estaba (los bloques
-- nuevos muestran «aún no disponible»).
drop function if exists public.fn_analitica_web_trafico(integer, date, date, integer);
