-- Reversión de seguridad: desactiva escrituras para todas las organizaciones.
-- NO reconstruye la selección piloto anterior (7 filas write_low y las demás
-- sin fila). Conserva preferencias/filas y no elimina historial ni datos de negocio.
-- Coordinar con rollback de capabilities.ts, cuyo fallback nuevo es write_full.
ALTER TABLE public.ai_assistant_settings
  ALTER COLUMN capability_level SET DEFAULT 'off';
UPDATE public.ai_assistant_settings
SET capability_level = 'off', updated_at = now()
WHERE capability_level = 'write_full';
