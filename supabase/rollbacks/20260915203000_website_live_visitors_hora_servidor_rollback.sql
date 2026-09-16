-- Rollback de 20260915203000_website_live_visitors_hora_servidor.
-- Elimina la función; el hook useLiveVisitors volvería a necesitar el
-- filtro por fecha calculado en el cliente.
drop function if exists public.website_live_visitors(integer, integer);
