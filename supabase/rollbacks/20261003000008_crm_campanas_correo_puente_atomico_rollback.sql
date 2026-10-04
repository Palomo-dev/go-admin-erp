-- Revertir coordinadamente con el worker/Next. Conserva correos, activities y
-- recibos: borrar evidencia publicada podría permitir repetir envíos inciertos.
begin;
drop function if exists public.crm_email_campaign_batch_progress(integer,uuid,integer,timestamptz);
drop function if exists public.crm_email_campaign_dispatch(integer,uuid,uuid,text,uuid,text,text);
drop function if exists public.crm_prepare_email_campaign_contact(integer,uuid,uuid,uuid,jsonb);
drop function if exists public.crm_claim_email_campaign_batch(integer,uuid,integer,integer);
commit;
