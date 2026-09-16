-- 20260910020000_fase0_6_products_weight_and_dimensions.sql
-- Versión aplicada en Supabase: 20260910022424 (vía MCP, proyecto jgmgphmzusbluqhuqihj).
-- Versionada a posteriori: se aplicó bajo la regla anterior ("cero .sql en el repo").
--
-- Fase 0.6 (GO-1) — Peso y dimensiones de producto (C7).
--
-- `products` no tenía ninguna columna de peso, dimensión ni volumen, así que el POS
-- cotiza envíos con `weight_kg: 1` hardcodeado. Sin este dato no hay cotización real con
-- transportadora: el precio de una guía depende del peso y del peso volumétrico.
--
-- Estrictamente aditivo: las cuatro columnas son nullable y sin DEFAULT, así que todos los
-- productos existentes quedan en NULL y nada de lo que funciona hoy cambia. Esta migración
-- NO altera ningún cálculo: el `weight_kg: 1` del POS sigue igual hasta GO-13. Aquí sólo
-- se captura el dato. Verificado tras aplicar: 28.349 productos, los 28.349 en NULL.
--
-- Las unidades van en el nombre de la columna a propósito (kg, cm), igual que ya hace
-- `shipments` con `weight_kg`, `length_cm`, `width_cm`, `height_cm`. Así el dato de producto
-- y el del envío hablan el mismo idioma y no hay que convertir en el medio.
--
-- Rollback: supabase/rollbacks/20260910020000_fase0_6_products_weight_and_dimensions_rollback.sql

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS length_cm numeric,
  ADD COLUMN IF NOT EXISTS width_cm  numeric,
  ADD COLUMN IF NOT EXISTS height_cm numeric;

COMMENT ON COLUMN public.products.weight_kg IS 'Peso unitario en kilogramos. Para cotizar envíos con transportadora (GO-1). NULL = sin declarar.';
COMMENT ON COLUMN public.products.length_cm IS 'Largo unitario en centímetros. Para peso volumétrico (GO-1). NULL = sin declarar.';
COMMENT ON COLUMN public.products.width_cm  IS 'Ancho unitario en centímetros. Para peso volumétrico (GO-1). NULL = sin declarar.';
COMMENT ON COLUMN public.products.height_cm IS 'Alto unitario en centímetros. Para peso volumétrico (GO-1). NULL = sin declarar.';
