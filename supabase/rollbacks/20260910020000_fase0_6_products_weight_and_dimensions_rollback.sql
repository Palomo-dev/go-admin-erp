-- 20260910020000_fase0_6_products_weight_and_dimensions_rollback.sql
-- Revierte 20260910020000_fase0_6_products_weight_and_dimensions.sql
--
-- ADVERTENCIA sobre datos: DROP COLUMN destruye los valores que se hayan capturado.
-- Al aplicar la migración, las 4 columnas quedaron en NULL para los 28.349 productos;
-- desde entonces la UI de inventario permite rellenarlas. Antes de revertir, comprueba
-- cuántos productos tienen dato:
--   select count(*) from products
--    where weight_kg is not null or length_cm is not null
--       or width_cm is not null or height_cm is not null;
-- Si es > 0, exporta esos valores antes o no apliques este rollback.
--
-- El código de la UI (sección "Envío" del formulario de producto) debe retirarse en el
-- mismo despliegue: con las columnas fuera, el INSERT/UPDATE de producto fallaría.

ALTER TABLE public.products
  DROP COLUMN IF EXISTS height_cm,
  DROP COLUMN IF EXISTS width_cm,
  DROP COLUMN IF EXISTS length_cm,
  DROP COLUMN IF EXISTS weight_kg;
