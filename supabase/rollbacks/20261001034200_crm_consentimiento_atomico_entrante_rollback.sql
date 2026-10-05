-- Conserva consentimientos/evidencias y exclusiones ya registradas.
-- Revierte el disparador nuevo sin borrar datos ni modificar los predicados de contacto.
alter table public.messages disable trigger crm_message_consent_inbound;
revoke all on function public.crm_set_contact_consent(integer,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.crm_apply_inbound_contact_consent(integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.crm_normalize_contact_keyword(text) from public,anon,authenticated,service_role;
