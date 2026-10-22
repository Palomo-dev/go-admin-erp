-- Quita las funciones de cierre y de reportes de la fase 6.
-- Los asientos de cierre de ejercicio que ya se hayan publicado NO se
-- revierten: siguen en journal_entries. Los periodos que hayan quedado
-- cerrados tampoco se reabren.

drop function if exists public.fn_auxiliar_tercero(integer, timestamptz, timestamptz, text, integer);
drop function if exists public.fn_libro_diario(integer, timestamptz, timestamptz, integer);
drop function if exists public.fn_cierre_ejercicio(integer, integer);
drop function if exists public.fn_reabrir_periodo(integer, uuid);
drop function if exists public.fn_cierre_periodo(integer, uuid, text);
