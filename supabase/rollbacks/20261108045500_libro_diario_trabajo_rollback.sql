-- Reversión de 20261108045500_libro_diario_trabajo.sql (aplicada el 2026-11-08).
-- La función es solo de lectura: quitarla no toca datos, pero el libro diario
-- (`ContabilidadService.listarLibroDiario`) la llama desde ese día: revertir esto
-- exige volver antes a la versión del servicio que consultaba por PostgREST.
drop function if exists public.fn_libro_diario_trabajo(integer, timestamptz, timestamptz, text, text[], text, integer, text, integer, boolean, integer, integer);
