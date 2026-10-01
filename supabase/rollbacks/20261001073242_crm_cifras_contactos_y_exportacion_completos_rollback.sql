-- Conserva datos; revoca nuevas lecturas y restaura el contador anterior.
set lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.crm_campaign_contact_counts(p_org integer, p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
 perform public.fn_assert_acceso_org(p_org);
 if not exists(select 1 from public.campaigns where organization_id=p_org and id=p_campaign) then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 with contacts as (
  select case when cc.state='sent' and cc.metadata->>'state' in('delivered','read','replied') then cc.metadata->>'state'
    else coalesce(cc.state,cc.metadata->>'state','pending') end as state,cc.replied_at,cc.metadata
  from public.campaign_contacts cc where cc.campaign_id=p_campaign
 ) select jsonb_build_object('total',count(*),'pending',count(*) filter(where state='pending'),
  'queued',count(*) filter(where state='queued'),'sent',count(*) filter(where state in('sent','delivered','read','replied','opened','clicked')),
  'delivered',count(*) filter(where state in('delivered','read','replied')),'read',count(*) filter(where state in('read','replied')),
  'replied',count(*) filter(where state='replied' or replied_at is not null),'failed',count(*) filter(where state in('failed','bounced')),
  'skipped',count(*) filter(where state='skipped'),
  'cost',round(coalesce(sum(case when metadata->>'cost_amount' ~ '^[0-9]+(\.[0-9]+)?$' then (metadata->>'cost_amount')::numeric else 0 end),0),5)) into v_result from contacts;
 return v_result;
end;$function$
;
revoke all on function public.crm_campaign_contact_stats(integer,uuid),public.crm_campaign_contacts_page(integer,uuid,text,text,integer,integer),public.crm_campaign_contacts_export(integer,uuid,text,text) from public,anon,authenticated,service_role;

