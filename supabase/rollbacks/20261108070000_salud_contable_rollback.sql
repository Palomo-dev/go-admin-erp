-- Reversión de 20261108070000_salud_contable (aplicada el 2026-11-08).
-- La función es solo de lectura: quitarla deja las pestañas Descuadres y
-- Huérfanos de Salud contable en «Revisión pendiente de activar».
drop function if exists public.fn_salud_contable(integer);
