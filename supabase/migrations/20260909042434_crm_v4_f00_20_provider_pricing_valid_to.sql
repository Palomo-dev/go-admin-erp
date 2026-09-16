-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_20_provider_pricing_valid_to`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 849b52d3055f498f4377cfce8f129810). No reformatear.
-- P12 (REG): vigencia con fin en provider_pricing + fn_unit_cost respetándola.
-- NULL = precio vigente (sin fecha de fin). Aditivo: las 29 filas sembradas en
-- crm_v4_f00_04 quedan con valid_to NULL, así que fn_unit_cost no cambia de
-- resultado para ninguna de ellas.

ALTER TABLE public.provider_pricing ADD COLUMN IF NOT EXISTS valid_to date;

COMMENT ON COLUMN public.provider_pricing.valid_to IS
  'Último día de vigencia (inclusive). NULL = vigente. fn_unit_cost descarta las filas con valid_to < fecha consultada.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_pricing_valid_range_check') THEN
    ALTER TABLE public.provider_pricing
      ADD CONSTRAINT provider_pricing_valid_range_check
      CHECK (valid_to IS NULL OR valid_to >= valid_from);
  END IF;
END $$;

-- Índice para resolver el precio vigente por (provider, sku) sin tocar el histórico.
CREATE INDEX IF NOT EXISTS provider_pricing_vigente_idx
  ON public.provider_pricing (provider, sku, valid_from DESC)
  WHERE valid_to IS NULL;

-- fn_unit_cost respeta la vigencia. Se conserva SECURITY INVOKER + STABLE +
-- search_path=public y la ACL existente (authenticated, service_role).
CREATE OR REPLACE FUNCTION public.fn_unit_cost(p_provider text, p_sku text, p_at date DEFAULT CURRENT_DATE)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT unit_cost_usd FROM public.provider_pricing
   WHERE provider = p_provider
     AND sku = p_sku
     AND valid_from <= p_at
     AND (valid_to IS NULL OR valid_to >= p_at)
   ORDER BY valid_from DESC
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_unit_cost(text, text, date) IS
  'Precio unitario USD vigente en p_at para (provider, sku). Respeta valid_from/valid_to. NULL si no hay precio vigente.';
