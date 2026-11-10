-- Reversión de 20261110220000_puc_catalogo_decreto_2650.sql (y, con ella, de 20261110220010 y
-- 20261110220020, que solo cargan filas en la misma tabla).
--
-- Borra la tabla de referencia public.puc_catalogo con sus datos. No toca puc_plantilla ni el
-- plan de cuentas de ninguna organización: el catálogo se vuelve a cargar reaplicando las tres
-- migraciones en orden.

drop table if exists public.puc_catalogo;
