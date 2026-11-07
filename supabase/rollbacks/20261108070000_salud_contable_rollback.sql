-- Reversión de 20261108070000_salud_contable (propuesta sin aplicar).
-- La función es solo de lectura: quitarla deja las pestañas Descuadres y
-- Huérfanos de Salud contable en «Revisión pendiente de activar».
drop function if exists public.fn_salud_contable(integer);
