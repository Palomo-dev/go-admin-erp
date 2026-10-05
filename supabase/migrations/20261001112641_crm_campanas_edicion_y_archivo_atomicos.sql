set lock_timeout='2s';
-- CRM: guardar y retirar campañas sin perder audiencia, RNE ni evidencia financiera.
-- RPC privadas: sesión/permisos se resuelven en la API; actor y organización se revalidan aquí.
create or replace function public.crm_campaign_save(p_org integer,p_campaign uuid,p_version timestamptz,p_actor uuid,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_previous public.campaigns;v_row public.campaigns;v_stats jsonb;v_audience jsonb;v_source text;v_kind text;
 v_ids uuid[];v_refs uuid[];v_pipeline uuid;v_channel uuid;v_status text;v_n integer;v_key text;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_actor is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501';end if;
 if jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>2000000 or exists(
  select 1 from jsonb_object_keys(p_values) k where k not in('name','channel','scheduled_at','template_id','segment_id','content','statistics')
 ) then raise exception 'datos_campana_invalidos' using errcode='22023';end if;
 if p_campaign is not null then
  select * into v_previous from public.campaigns where organization_id=p_org and id=p_campaign
   and nullif(statistics->>'archived_at','') is null for update;
  if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
  if p_version is null or v_previous.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='40001';end if;
  perform public.crm_campaign_read_context(p_org,p_campaign);
  v_status:=coalesce(nullif(v_previous.statistics->>'state',''),v_previous.status,'draft');
  if v_status not in('draft','scheduled') then raise exception 'campana_no_editable' using errcode='P0001';end if;
  v_row:=jsonb_populate_record(v_previous,p_values);
 else
  if p_version is not null then raise exception 'version_campana_invalida' using errcode='22023';end if;
  v_row:=jsonb_populate_record(null::public.campaigns,p_values);
 end if;
 v_stats:=coalesce(v_row.statistics,'{}');
 if jsonb_typeof(v_stats) is distinct from 'object' or nullif(btrim(v_row.name),'') is null or length(v_row.name)>200
  or v_row.channel is null or v_row.channel not in('whatsapp','email') or length(coalesce(v_row.content,''))>4096
  or (p_campaign is null and v_row.template_id is null and nullif(btrim(v_row.content),'') is null)
  or nullif(v_stats->>'archived_at','') is not null then raise exception 'datos_campana_invalidos' using errcode='22023';end if;
 if (p_campaign is null and nullif(v_stats->>'state','') is not null) or (p_campaign is not null and (v_stats->'state') is distinct from (v_previous.statistics->'state')) then raise exception 'estado_campana_no_editable' using errcode='22023';end if;
 if v_status='scheduled' and (
  v_row.channel is distinct from v_previous.channel or v_row.scheduled_at is distinct from v_previous.scheduled_at
  or v_row.template_id is distinct from v_previous.template_id or v_row.segment_id is distinct from v_previous.segment_id
  or v_row.content is distinct from v_previous.content
  or (v_stats-'description') is distinct from (coalesce(v_previous.statistics,'{}')-'description')
 ) then raise exception 'campana_programada_no_editable' using errcode='P0001';end if;
 if p_campaign is not null and exists(select 1 from public.crm_whatsapp_credit_reservations where organization_id=p_org and campaign_id=p_campaign and state='reserved') then
  raise exception 'reserva_anterior_requiere_conciliacion' using errcode='P0001';end if;
 if v_row.template_id is not null then
  perform id from public.templates where organization_id=p_org and id=v_row.template_id and channel=v_row.channel for share;
  if not found then raise exception 'plantilla_no_encontrada' using errcode='P0002';end if;
 end if;
 v_channel:=nullif(v_stats->>'channel_id','')::uuid;
 if v_channel is not null then
  perform id from public.channels where organization_id=p_org and id=v_channel and type=v_row.channel for share;
  if not found then raise exception 'canal_no_encontrado' using errcode='P0002';end if;
 end if;
 v_audience:=v_stats->'audience';v_source:=v_audience->>'source';
 if v_audience is not null and v_audience<>'null'::jsonb then
  if jsonb_typeof(v_audience) is distinct from 'object' or v_source is null or v_source not in('manual','stage','segment') then
   raise exception 'audiencia_invalida' using errcode='22023';end if;
  foreach v_key in array array['stage_ids','opportunity_ids','customer_ids'] loop
   if jsonb_typeof(coalesce(nullif(v_audience->v_key,'null'::jsonb),'[]'::jsonb)) is distinct from 'array' then
    raise exception 'audiencia_invalida' using errcode='22023';end if;
   if jsonb_array_length(coalesce(nullif(v_audience->v_key,'null'::jsonb),'[]'::jsonb))> (case when v_key='stage_ids' then 200 else 20000 end) then
    raise exception 'audiencia_invalida' using errcode='22023';end if;
  end loop;
  v_pipeline:=nullif(v_audience->>'pipeline_id','')::uuid;
  if v_pipeline is not null then
   perform id from public.pipelines where organization_id=p_org and id=v_pipeline for share;
   if not found then raise exception 'embudo_no_encontrado' using errcode='P0002';end if;
  end if;
  if v_source='segment' then
   v_ids:=array[nullif(v_audience->>'segment_id','')::uuid];
   if v_ids[1] is null or v_row.segment_id is distinct from v_ids[1] then raise exception 'audiencia_invalida' using errcode='22023';end if;
   perform id from public.segments where organization_id=p_org and id=v_ids[1] for share;
   if not found then raise exception 'segmento_no_encontrado' using errcode='P0002';end if;
  else
   if v_row.segment_id is not null then raise exception 'audiencia_invalida' using errcode='22023';end if;
   if v_source='stage' then
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_ids from jsonb_array_elements_text(coalesce(nullif(v_audience->'stage_ids','null'::jsonb),'[]'::jsonb));
    if cardinality(v_ids)=0 then raise exception 'audiencia_invalida' using errcode='22023';end if;
    perform p.id from public.pipelines p where p.organization_id=p_org and p.id in(select s.pipeline_id from public.stages s where s.id=any(v_ids)) order by p.id for share;
    perform s.id from public.stages s join public.pipelines p on p.id=s.pipeline_id and p.organization_id=p_org
     where s.id=any(v_ids) and (v_pipeline is null or s.pipeline_id=v_pipeline) order by s.id for share of s;
    get diagnostics v_n=row_count;
    if v_n<>cardinality(v_ids) then raise exception 'etapa_no_encontrada' using errcode='P0002';end if;
   else
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_ids from jsonb_array_elements_text(coalesce(nullif(v_audience->'customer_ids','null'::jsonb),'[]'::jsonb));
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_refs from jsonb_array_elements_text(coalesce(nullif(v_audience->'opportunity_ids','null'::jsonb),'[]'::jsonb));
    if cardinality(v_ids)+cardinality(v_refs)=0 then raise exception 'audiencia_invalida' using errcode='22023';end if;
    perform id from public.customers where organization_id=p_org and id=any(v_ids) order by id for share;
    get diagnostics v_n=row_count;
    if v_n<>cardinality(v_ids) then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
    perform id from public.opportunities where organization_id=p_org and id=any(v_refs) order by id for share;
    get diagnostics v_n=row_count;
    if v_n<>cardinality(v_refs) then raise exception 'oportunidad_no_encontrada' using errcode='P0002';end if;
    -- El cliente del negocio también es propio; una referencia antigua corrupta no llega al cálculo.
    if exists(select 1 from public.opportunities o where o.id=any(v_refs) and o.organization_id=p_org and o.customer_id is not null
      and not exists(select 1 from public.customers u where u.organization_id=p_org and u.id=o.customer_id)) then
     raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
    perform u.id from public.customers u where u.organization_id=p_org and u.id in(select o.customer_id from public.opportunities o where o.organization_id=p_org and o.id=any(v_refs)) order by u.id for share;
   end if;
  end if;
  v_audience:=jsonb_build_object('source',v_source,'segment_id',case when v_source='segment' then v_row.segment_id end,
   'pipeline_id',case when v_source='stage' then v_pipeline end,
   'stage_ids',case when v_source='stage' then coalesce(nullif(v_audience->'stage_ids','null'::jsonb),'[]'::jsonb) else '[]'::jsonb end,
   'customer_ids',case when v_source='manual' then coalesce(nullif(v_audience->'customer_ids','null'::jsonb),'[]'::jsonb) else '[]'::jsonb end,
   'opportunity_ids',case when v_source='manual' then coalesce(nullif(v_audience->'opportunity_ids','null'::jsonb),'[]'::jsonb) else '[]'::jsonb end);
  v_stats:=jsonb_set(v_stats,'{audience}',v_audience,true);
 elsif p_campaign is null then raise exception 'audiencia_invalida' using errcode='22023';
 end if;
 -- La franja legal nunca se desactiva al guardar un borrador.
 v_stats:=v_stats||jsonb_build_object('respect_allowed_hours',true,'last_saved_by',p_actor,'last_saved_at',clock_timestamp());
 if p_campaign is null then
  insert into public.campaigns(organization_id,name,channel,status,scheduled_at,template_id,segment_id,content,statistics,created_by)
  values(p_org,btrim(v_row.name),v_row.channel,'draft',v_row.scheduled_at,v_row.template_id,v_row.segment_id,v_row.content,v_stats,p_actor) returning * into v_row;
 else
  update public.campaigns set name=btrim(v_row.name),channel=v_row.channel,scheduled_at=v_row.scheduled_at,template_id=v_row.template_id,
   segment_id=v_row.segment_id,content=v_row.content,statistics=v_stats where organization_id=p_org and id=p_campaign returning * into v_row;
 end if;
 return to_jsonb(v_row);
end;$$;
revoke all on function public.crm_campaign_save(integer,uuid,timestamptz,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_campaign_save(integer,uuid,timestamptz,uuid,jsonb) to service_role;

create or replace function public.crm_campaign_archive(p_org integer,p_campaign uuid,p_version timestamptz,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.campaigns;v_status text;v_archived timestamptz:=clock_timestamp();
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_actor is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501';end if;
 select * into v_row from public.campaigns where organization_id=p_org and id=p_campaign for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if nullif(v_row.statistics->>'archived_at','') is not null then return to_jsonb(v_row);end if;
 if p_version is null or v_row.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='40001';end if;
 perform public.crm_campaign_read_context(p_org,p_campaign);
 v_status:=coalesce(nullif(v_row.statistics->>'state',''),v_row.status,'draft');
 if v_status not in('draft','scheduled','paused','sent','canceled') then raise exception 'campana_no_archivable' using errcode='P0001';end if;
 if v_status in('draft','scheduled','paused') then
  perform public.crm_campaign_transition(p_org,p_campaign,'cancel',p_version,p_actor,'{}');
 end if;
 if exists(select 1 from public.crm_whatsapp_credit_reservations where organization_id=p_org and campaign_id=p_campaign and state='reserved') then
  raise exception 'campana_requiere_conciliacion' using errcode='P0001';end if;
 update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('archived_at',v_archived,'archived_by',p_actor)
  where organization_id=p_org and id=p_campaign returning * into v_row;
 return to_jsonb(v_row);
end;$$;
revoke all on function public.crm_campaign_archive(integer,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.crm_campaign_archive(integer,uuid,timestamptz,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.crm_campaign_read_context(p_org integer, p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign public.campaigns;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign and nullif(statistics->>'archived_at','') is null;
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
  where c.organization_id=p_org and nullif(c.statistics->>'archived_at','') is null
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
