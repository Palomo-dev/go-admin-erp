-- Reversión de 20261115200000_crm_voice_audiencia_bloqueados.
drop function if exists public.crm_voice_audiencia_bloqueados(integer, uuid[]);
