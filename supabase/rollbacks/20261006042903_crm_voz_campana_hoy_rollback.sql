-- Reversión de 20261006230000_crm_voz_campana_hoy.
-- La función es nueva y de solo lectura: se borra. La ruta
-- GET /api/crm/voice-agents/campaigns/[id] detecta que no existe y el detalle
-- sigue con las cifras de crm_voice_campaign_detail, sin el panel «Hoy».
drop function if exists public.crm_voice_campaign_hoy(integer, uuid, uuid[]);
