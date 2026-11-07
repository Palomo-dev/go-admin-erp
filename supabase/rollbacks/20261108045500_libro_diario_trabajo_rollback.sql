-- Reversión de 20261108045500_libro_diario_trabajo.sql (propuesta, sin aplicar).
-- La función es solo de lectura y nadie más la llama: quitarla no toca datos.
drop function if exists public.fn_libro_diario_trabajo(integer, timestamptz, timestamptz, text, text[], text, integer, text, integer, boolean, integer, integer);
