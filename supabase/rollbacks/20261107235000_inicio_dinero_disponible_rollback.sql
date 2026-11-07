-- Reversión de 20261107235000_inicio_dinero_disponible.sql.
-- La función es nueva y de solo lectura: quitarla no toca datos.

drop function if exists public.fn_inicio_dinero_disponible(integer, integer);
