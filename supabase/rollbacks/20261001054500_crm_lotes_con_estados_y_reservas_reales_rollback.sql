-- Retira acceso al consumidor nuevo; conserva contactos, trabajos, evidencia y saldos.
-- No habilitar el lote antiguo: queued con mensaje no puede reclamarse por caducidad.
revoke execute on function public.crm_campaign_contact_ready_at(text,jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.crm_claim_campaign_batch(integer,uuid,integer,integer) from public,anon,authenticated,service_role;
revoke execute on function public.crm_finish_campaign_contact(integer,uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke execute on function public.crm_campaign_batch_progress(integer,uuid,integer,timestamptz) from public,anon,authenticated,service_role;
