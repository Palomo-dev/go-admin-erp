-- Conserva audiencias y cifras publicadas; cierra las dos RPC nuevas.
revoke all on function public.crm_campaign_contact_counts(integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.crm_materialize_campaign(integer,uuid,timestamptz,uuid,jsonb,numeric,uuid) from public,anon,authenticated,service_role;
