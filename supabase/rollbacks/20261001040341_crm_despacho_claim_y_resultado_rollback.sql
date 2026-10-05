-- Conserva reservas, eventos y resultados: no permite reenviar una entrega ambigua.
revoke all on function public.crm_claim_message_dispatch(integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.crm_finish_message_dispatch(integer,uuid,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated,service_role;
