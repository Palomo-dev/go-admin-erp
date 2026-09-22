-- Solicitud explícita del propietario: capacidades del asistente para todas las
-- organizaciones, no una lista piloto. No cambia roles, módulos, créditos ni
-- confirmación humana. Las nuevas organizaciones sin fila usan el mismo default
-- en getAssistantCapabilities; cualquier fila nueva recibe este DEFAULT.
ALTER TABLE public.ai_assistant_settings
  ALTER COLUMN capability_level SET DEFAULT 'write_full';

INSERT INTO public.ai_assistant_settings (organization_id, capability_level)
SELECT id, 'write_full' FROM public.organizations
ON CONFLICT (organization_id) DO UPDATE
SET capability_level = 'write_full', updated_at = now()
WHERE ai_assistant_settings.capability_level <> 'write_full';
