-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_17_usage_logs_cost_amount`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 3a4b99d69f02ee244cdf4d95342b75d5). No reformatear.
-- P10 (REG): columna `cost_amount numeric(12,6)` en ai_usage_logs y comm_usage_logs.
-- Hoy el costo real en USD viaja en metadata->>'cost_amount' (aiCostService.ts).
-- Aditivo e idempotente. Los privilegios de estas tablas son a nivel de TABLA
-- (ALL a anon/authenticated/service_role), así que la columna nueva los hereda.

ALTER TABLE public.ai_usage_logs   ADD COLUMN IF NOT EXISTS cost_amount numeric(12,6);
ALTER TABLE public.comm_usage_logs ADD COLUMN IF NOT EXISTS cost_amount numeric(12,6);

COMMENT ON COLUMN public.ai_usage_logs.cost_amount   IS 'Costo real en USD (provider_pricing). Reemplaza a metadata->>''cost_amount''.';
COMMENT ON COLUMN public.comm_usage_logs.cost_amount IS 'Costo real en USD (provider_pricing). Reemplaza a metadata->>''cost_amount''.';

-- Migración de valores existentes desde metadata (solo si son numéricos y la
-- columna sigue vacía). En la BD actual no hay ninguna fila con esa clave
-- (0 de 111.408 en ai_usage_logs, 0 de 69 en comm_usage_logs): no-op defensivo.
UPDATE public.ai_usage_logs
   SET cost_amount = (metadata->>'cost_amount')::numeric
 WHERE cost_amount IS NULL
   AND jsonb_typeof(metadata->'cost_amount') = 'number';

UPDATE public.comm_usage_logs
   SET cost_amount = (metadata->>'cost_amount')::numeric
 WHERE cost_amount IS NULL
   AND jsonb_typeof(metadata->'cost_amount') = 'number';
