-- Reversión de 20260930180030_analitica_web_rpc.
-- La función es nueva: no hay versión anterior que restaurar.
-- Antes de revertir, retirar la pantalla del ERP que la llama
-- (GET /api/analitica-web): si no, responde 500.

drop function if exists public.fn_analitica_web(integer, date, date, integer, text);
