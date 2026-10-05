-- Revierte las APIs nuevas y las lecturas anteriores; conserva campañas, audiencia, constancias y archivo.
-- No vuelve a reservar créditos ni restaura trabajos cancelados; no deshace las cancelaciones ya realizadas.
revoke all on function public.crm_campaign_save(integer,uuid,timestamptz,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.crm_campaign_archive(integer,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_campaign_read_context(p_org integer, p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign public.campaigns;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if exists(select 1 from public.campaign_contacts cc join public.customers u on u.id=cc.customer_id where cc.campaign_id=p_campaign and u.organization_id<>p_org) then raise exception 'contacto_campana_ajeno' using errcode='P0001';end if;
 return to_jsonb(v_campaign);
end;$function$;
CREATE OR REPLACE FUNCTION public.crm_campaigns_unificadas(p_org integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_data jsonb;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 with voice_counts as (
  select campaign_id,jsonb_object_agg(status,n) as counts from (
   select campaign_id,status,count(*) as n from public.voice_agent_calls
   where organization_id=p_org and campaign_id is not null group by campaign_id,status
  ) c group by campaign_id
 ), combined as (
  select c.id,c.name,'message'::text as source,c.channel,c.status,c.created_at,c.scheduled_at,
   c.statistics as stats,coalesce(s.name,'') as segment_name,t.name as content_name,
   false as emergency_stop,null::text as stopped_reason,null::timestamptz as rne_valid_until,null::integer as rne_numbers_in_file,
   '{}'::jsonb as voice_counts,null::text as data_policy_url
  from public.campaigns c
  left join public.segments s on s.id=c.segment_id and s.organization_id=p_org
  left join public.templates t on t.id=c.template_id and t.organization_id=p_org
  where c.organization_id=p_org
  union all
  select v.id,v.name,'voice','voice',v.status,v.created_at,null::timestamptz,v.stats,
   coalesce(s.name,''),a.name,v.emergency_stop,v.stopped_reason,r.valid_until,r.numbers_in_file,
   coalesce(vc.counts,'{}'::jsonb),cs.data_policy_url
  from public.voice_agent_campaigns v
  join public.voice_agents a on a.id=v.voice_agent_id and a.organization_id=p_org
  left join public.segments s on s.id::text=v.target_config->>'segment_id' and s.organization_id=p_org
  left join voice_counts vc on vc.campaign_id=v.id
  left join public.comm_settings cs on cs.organization_id=p_org and cs.is_active
  left join lateral (
   select valid_until,numbers_in_file from public.voice_campaign_rne_checks where organization_id=p_org and campaign_id=v.id
   order by checked_at desc,id desc limit 1
  ) r on true
  where v.organization_id=p_org
 )
 select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.source,c.id),'[]'::jsonb) into v_data from combined c;
 return v_data;
end;
$function$;
