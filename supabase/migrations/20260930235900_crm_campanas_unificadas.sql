-- Campañas unificadas: una lectura consistente; los estados usan el núcleo existente en Node.
create or replace function public.crm_campaigns_unificadas(p_org integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
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
   false as emergency_stop,null::text as stopped_reason,null::timestamptz as rne_valid_until,
   '{}'::jsonb as voice_counts,null::text as data_policy_url
  from public.campaigns c
  left join public.segments s on s.id=c.segment_id and s.organization_id=p_org
  left join public.templates t on t.id=c.template_id and t.organization_id=p_org
  where c.organization_id=p_org
  union all
  select v.id,v.name,'voice','voice',v.status,v.created_at,null::timestamptz,v.stats,
   coalesce(s.name,''),a.name,v.emergency_stop,v.stopped_reason,r.valid_until,
   coalesce(vc.counts,'{}'::jsonb),cs.data_policy_url
  from public.voice_agent_campaigns v
  join public.voice_agents a on a.id=v.voice_agent_id and a.organization_id=p_org
  left join public.segments s on s.id::text=v.target_config->>'segment_id' and s.organization_id=p_org
  left join voice_counts vc on vc.campaign_id=v.id
  left join public.comm_settings cs on cs.organization_id=p_org and cs.is_active
  left join lateral (
   select valid_until from public.voice_campaign_rne_checks where organization_id=p_org and campaign_id=v.id
   order by checked_at desc,id desc limit 1
  ) r on true
  where v.organization_id=p_org
 )
 select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.source,c.id),'[]'::jsonb) into v_data from combined c;
 return v_data;
end;
$$;
revoke all on function public.crm_campaigns_unificadas(integer) from public,anon;
grant execute on function public.crm_campaigns_unificadas(integer) to authenticated,service_role;
