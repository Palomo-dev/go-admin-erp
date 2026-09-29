-- Rollback de 20260930140500_voz_ley2300_rne_politica_datos.sql
--
-- ⚠️ No restaura datos: borra las verificaciones RNE registradas, los números
-- excluidos cargados y la URL de la política de tratamiento de datos que se
-- haya guardado. Las llamadas que la verificación marcó como `skipped`
-- (last_error_code = 'RNE') siguen así: revertirlas volvería a llamar a números
-- inscritos en el RNE, que es justo lo que la migración evita.
--
-- Antes de ejecutarlo, revierte el código que usa estas piezas
-- (voiceAgentService, rutas /api/crm/voice-agents/campaigns/[id]/rne): sin la
-- columna ni las tablas, la cola de campañas falla cerrado y no marca.

drop function if exists public.fn_contactos_efectivos_semana(integer, uuid, timestamptz, timestamptz);
drop function if exists public.fn_rne_registrar_verificacion(integer, uuid, text[], uuid[], integer, text, text, uuid, integer);

drop table if exists public.voice_campaign_rne_checks;
drop table if exists public.crm_excluded_numbers;

alter table public.comm_settings drop constraint if exists comm_settings_data_policy_url_https;
alter table public.comm_settings drop column if exists data_policy_url;
