-- CRM: voz conserva historial y valida referencias/versiones dentro de la transacción.
-- Privadas: la API autoriza permisos; el actor activo se comprueba de nuevo aquí.
create or replace function public.crm_voice_campaign_save(p_org integer,p_campaign uuid,p_version timestamptz,p_actor uuid,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_previous public.voice_agent_campaigns%rowtype; v_row public.voice_agent_campaigns%rowtype;
 v_config jsonb; v_id uuid; v_ids uuid[]; v_found integer; v_cap integer;
 v_changed boolean; v_activating boolean; v_rne public.voice_campaign_rne_checks%rowtype;
 v_settings public.comm_settings%rowtype;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_actor is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or exists(select 1 from jsonb_object_keys(p_values) k where k not in
  ('name','voice_agent_id','objective','target_source','target_config','schedule','max_calls_per_day','max_calls_per_hour','max_concurrent','status','emergency_stop')) then
  raise exception 'datos_invalidos' using errcode='22023'; end if;
 if p_campaign is not null then
  select * into v_previous from public.voice_agent_campaigns where id=p_campaign and organization_id=p_org and stats->>'archived_at' is null for update;
  if not found then raise exception 'campana_no_encontrada' using errcode='P0002'; end if;
  if p_version is null or v_previous.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001'; end if;
  v_row:=jsonb_populate_record(v_previous,p_values);
 else
  v_row:=jsonb_populate_record(null::public.voice_agent_campaigns,
   jsonb_build_object('target_source','manual_list','target_config','{}'::jsonb,'schedule','{}'::jsonb,
    'max_calls_per_day',50,'max_calls_per_hour',20,'max_concurrent',3,'status','draft','emergency_stop',false)||p_values);
  if v_row.status is distinct from 'draft' then raise exception 'estado_invalido' using errcode='22023'; end if;
 end if;
 if v_row.name is null or length(btrim(v_row.name)) not between 1 and 200 or length(coalesce(v_row.objective,''))>2000 or
  v_row.voice_agent_id is null or v_row.status is null or v_row.status not in ('draft','scheduled','running','paused','completed') or
  v_row.target_source is null or v_row.target_source not in ('segment','pipeline_stage','manual_list','sequence_step','followup_due') or
  v_row.max_calls_per_day is null or v_row.max_calls_per_day not between 1 and 500 or
  v_row.max_calls_per_hour is null or v_row.max_calls_per_hour not between 1 and 500 or
  v_row.max_concurrent is null or v_row.max_concurrent not between 1 and 100 or
  v_row.schedule is null or jsonb_typeof(v_row.schedule)<>'object' or
  v_row.target_config is null or jsonb_typeof(v_row.target_config)<>'object' or
  (p_values ? 'emergency_stop' and p_values->'emergency_stop'<>'false'::jsonb) then
  raise exception 'datos_invalidos' using errcode='22023'; end if;
 if p_campaign is not null and ((v_previous.status='completed' and v_row.status<>'completed') or
  (v_previous.status<>'draft' and v_row.status='draft')) then raise exception 'estado_invalido' using errcode='P0001'; end if;
 v_changed:=p_campaign is null or v_row.voice_agent_id is distinct from v_previous.voice_agent_id or
  v_row.objective is distinct from v_previous.objective or v_row.target_source is distinct from v_previous.target_source or
  v_row.target_config is distinct from v_previous.target_config;
 if p_campaign is not null and v_changed and (v_previous.status<>'draft' or exists(select 1 from public.voice_agent_calls where organization_id=p_org and campaign_id=p_campaign) or exists(select 1 from public.voice_campaign_rne_checks where organization_id=p_org and campaign_id=p_campaign)) then
  raise exception 'audiencia_no_editable' using errcode='P0001'; end if;
 v_activating:=v_row.status in ('running','scheduled') and (p_campaign is null or v_previous.status is distinct from v_row.status or v_previous.emergency_stop);
 -- Pausar sigue disponible aunque el agente o el canal de una campaña antigua ya no estén disponibles.
 if v_changed or v_activating then
  perform 1 from public.voice_agents where id=v_row.voice_agent_id and organization_id=p_org and (not v_activating or is_active) for key share;
  if not found then raise exception 'agente_no_encontrado' using errcode='P0002'; end if;
  v_config:=v_row.target_config;
  if v_row.target_source='segment' then
   v_id:=(v_config->>'segment_id')::uuid;
   perform 1 from public.segments where id=v_id and organization_id=p_org for key share;
   if not found then raise exception 'segmento_no_encontrado' using errcode='P0002'; end if;
   v_config:=jsonb_build_object('segment_id',v_id);
  elsif v_row.target_source='pipeline_stage' then
   v_id:=(v_config->>'stage_id')::uuid;
   perform 1 from public.stages s join public.pipelines p on p.id=s.pipeline_id where s.id=v_id and p.organization_id=p_org for key share of s,p;
   if not found then raise exception 'etapa_no_encontrada' using errcode='P0002'; end if;
   v_config:=jsonb_build_object('stage_id',v_id);
  elsif v_row.target_source='sequence_step' then
   v_id:=(v_config->>'step_id')::uuid;
   perform 1 from public.sequence_steps s join public.sequences q on q.id=s.sequence_id and q.organization_id=p_org
    where s.id=v_id and s.organization_id=p_org for key share of s,q;
   if not found then raise exception 'paso_no_encontrado' using errcode='P0002'; end if;
   v_config:=jsonb_build_object('step_id',v_id);
  elsif v_row.target_source='manual_list' then
   if jsonb_typeof(coalesce(v_config->'customer_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_config->'customer_ids','[]'::jsonb))>500 then
    raise exception 'audiencia_invalida' using errcode='22023'; end if;
   select coalesce(array_agg(distinct t::uuid order by t::uuid),'{}'::uuid[]) into v_ids from jsonb_array_elements_text(coalesce(v_config->'customer_ids','[]'::jsonb)) t;
   if exists(select 1 from unnest(v_ids) x where x is null) then raise exception 'audiencia_invalida' using errcode='22023'; end if;
   select count(*) into v_found from (select id from public.customers where organization_id=p_org and id=any(v_ids) for key share) own;
   if v_found<>cardinality(v_ids) then raise exception 'cliente_no_encontrado' using errcode='P0002'; end if;
   if v_activating and cardinality(v_ids)=0 then raise exception 'audiencia_vacia' using errcode='P0001'; end if;
   v_config:=jsonb_build_object('customer_ids',to_jsonb(v_ids));
  else v_config:='{}'::jsonb; end if;
  v_row.target_config:=v_config;
 end if;
 if p_campaign is null or p_values ? 'max_concurrent' or v_activating then
  select voice_max_concurrent_calls into v_cap from public.comm_settings where organization_id=p_org and is_active for update;
  if v_row.max_concurrent>coalesce(v_cap,0) then raise exception 'concurrencia_invalida' using errcode='22023'; end if;
 end if;
 if v_activating then
  select * into v_settings from public.comm_settings where organization_id=p_org and is_active for update;
  if not found or not v_settings.voice_agent_enabled then raise exception 'canal_no_disponible' using errcode='P0001'; end if;
  if v_settings.data_policy_url is null or v_settings.data_policy_url !~ '^https://\S+$' or length(v_settings.data_policy_url)>500 then
   raise exception 'politica_datos_requerida' using errcode='P0001'; end if;
  select * into v_rne from public.voice_campaign_rne_checks where organization_id=p_org and campaign_id=p_campaign order by checked_at desc,id desc limit 1;
  if not found or v_rne.numbers_in_file<=0 or v_rne.valid_until<=now() then raise exception 'verificacion_rne_requerida' using errcode='P0001'; end if;
  if v_settings.voice_minutes_remaining is not null and v_settings.voice_minutes_remaining<=0 then raise exception 'saldo_insuficiente' using errcode='P0001'; end if;
  v_row.emergency_stop:=false; v_row.stopped_reason:=null; v_row.stopped_at:=null; v_row.consecutive_failures:=0;
 elsif p_campaign is not null then v_row.emergency_stop:=v_previous.emergency_stop; end if;
 if p_campaign is null then
  insert into public.voice_agent_campaigns(organization_id,voice_agent_id,name,objective,target_source,target_config,schedule,max_calls_per_day,max_calls_per_hour,max_concurrent,status,stats)
   values(p_org,v_row.voice_agent_id,btrim(v_row.name),v_row.objective,v_row.target_source,v_row.target_config,v_row.schedule,v_row.max_calls_per_day,v_row.max_calls_per_hour,v_row.max_concurrent,'draft','{}') returning * into v_row;
 else
  update public.voice_agent_campaigns set voice_agent_id=v_row.voice_agent_id,name=btrim(v_row.name),objective=v_row.objective,
   target_source=v_row.target_source,target_config=v_row.target_config,schedule=v_row.schedule,max_calls_per_day=v_row.max_calls_per_day,
   max_calls_per_hour=v_row.max_calls_per_hour,max_concurrent=v_row.max_concurrent,status=v_row.status,emergency_stop=v_row.emergency_stop,
   stopped_reason=v_row.stopped_reason,stopped_at=v_row.stopped_at,consecutive_failures=v_row.consecutive_failures,updated_at=clock_timestamp()
   where id=p_campaign and organization_id=p_org returning * into v_row;
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
  values(p_org,'campaign.saved','voice_agent_campaign',v_row.id,jsonb_build_object('actor_id',p_actor,'previous_status',v_previous.status,'status',v_row.status),'processed',clock_timestamp());
 return to_jsonb(v_row);
end $$;
revoke all on function public.crm_voice_campaign_save(integer,uuid,timestamptz,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_voice_campaign_save(integer,uuid,timestamptz,uuid,jsonb) to service_role;

create or replace function public.crm_voice_campaign_archive(p_org integer,p_campaign uuid,p_version timestamptz,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.voice_agent_campaigns%rowtype; v_now timestamptz:=clock_timestamp();
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_actor is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501'; end if;
 select * into v_row from public.voice_agent_campaigns where id=p_campaign and organization_id=p_org and stats->>'archived_at' is null for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002'; end if;
 if p_version is null or v_row.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001'; end if;
 perform 1 from public.voice_agent_calls where organization_id=p_org and campaign_id=p_campaign order by id for update;
 if exists(select 1 from public.voice_agent_calls where organization_id=p_org and campaign_id=p_campaign and status='in_progress') or
  exists(select 1 from public.calls c where c.organization_id=p_org and c.status in ('dialing','ringing','in_progress') and
   (c.metadata->>'campaign_id'=p_campaign::text or exists(select 1 from public.voice_agent_calls v where v.organization_id=p_org and v.campaign_id=p_campaign and v.call_id=c.id))) then
  raise exception 'llamadas_activas' using errcode='P0001'; end if;
 if exists(select 1 from public.voice_agent_calls where organization_id=p_org and campaign_id=p_campaign and credits_reserved>0 and credits_settled_at is null) then
  raise exception 'creditos_pendientes' using errcode='P0001'; end if;
 update public.voice_agent_calls set status='canceled',completed_at=v_now,updated_at=v_now,last_error_code='CAMPAIGN_ARCHIVED',locked_by=null
  where organization_id=p_org and campaign_id=p_campaign and status in ('pending','queued');
 update public.voice_agent_campaigns set status='completed',emergency_stop=true,stopped_at=v_now,stopped_reason='CAMPAIGN_ARCHIVED',updated_at=v_now,
  stats=stats||jsonb_build_object('archived_at',v_now,'archived_by',p_actor) where id=p_campaign and organization_id=p_org returning * into v_row;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
  values(p_org,'campaign.archived','voice_agent_campaign',p_campaign,jsonb_build_object('actor_id',p_actor),'processed',v_now);
 return to_jsonb(v_row);
end $$;
revoke all on function public.crm_voice_campaign_archive(integer,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.crm_voice_campaign_archive(integer,uuid,timestamptz,uuid) to service_role;

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
  select c.id,c.name,'message'::text as source,c.channel,c.status,c.created_at,c.scheduled_at,c.updated_at,
   c.statistics as stats,coalesce(s.name,'') as segment_name,t.name as content_name,
   false as emergency_stop,null::text as stopped_reason,null::timestamptz as rne_valid_until,null::integer as rne_numbers_in_file,
   '{}'::jsonb as voice_counts,null::text as data_policy_url
  from public.campaigns c
  left join public.segments s on s.id=c.segment_id and s.organization_id=p_org
  left join public.templates t on t.id=c.template_id and t.organization_id=p_org
  where c.organization_id=p_org and nullif(c.statistics->>'archived_at','') is null
  union all
  select v.id,v.name,'voice','voice',v.status,v.created_at,null::timestamptz,v.updated_at,v.stats,
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
  where v.organization_id=p_org and v.stats->>'archived_at' is null
 )
 select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.source,c.id),'[]'::jsonb) into v_data from combined c;
 return v_data;
end;
$function$;
revoke all on function public.crm_campaigns_unificadas(integer) from public,anon,authenticated;
grant execute on function public.crm_campaigns_unificadas(integer) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_voice_campaign_detail(p_org integer, p_campaign uuid, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign jsonb; v_result jsonb; v_tz text;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 if p_page<1 or p_page>100000 then raise exception 'pagina_invalida' using errcode='22023';end if;
 select jsonb_build_object('id',v.id,'updated_at',v.updated_at,'voice_agent_id',v.voice_agent_id,'target_source',v.target_source,'target_config',v.target_config,'name',v.name,'status',v.status,'agent_name',a.name,
  'objective',v.objective,'emergency_stop',v.emergency_stop,'stopped_reason',v.stopped_reason,
  'stopped_at',v.stopped_at,'consecutive_failures',v.consecutive_failures,
  'max_calls_per_day',v.max_calls_per_day,'max_calls_per_hour',v.max_calls_per_hour,
  'max_concurrent',v.max_concurrent,'schedule',v.schedule,
  'rne_checked_at',r.checked_at,'rne_valid_until',r.valid_until,'rne_numbers_in_file',r.numbers_in_file)
 into v_campaign from public.voice_agent_campaigns v
 join public.voice_agents a on a.id=v.voice_agent_id and a.organization_id=p_org
 left join lateral(select checked_at,valid_until,numbers_in_file from public.voice_campaign_rne_checks
   where organization_id=p_org and campaign_id=v.id order by checked_at desc,id desc limit 1)r on true
 where v.id=p_campaign and v.organization_id=p_org and v.stats->>'archived_at' is null;
 if v_campaign is null then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 select coalesce(timezone,'America/Bogota') into v_tz from public.organizations where id=p_org;
 with targets as materialized(
  select id,call_id,status,outcome,created_at,scheduled_at from public.voice_agent_calls
  where organization_id=p_org and campaign_id=p_campaign
 ), physical as materialized(
  select c.id,c.customer_id,c.status,c.started_at,c.direction,c.answered_at,c.answered_by,c.duration_seconds
  from public.calls c where c.organization_id=p_org and
   (c.metadata->>'campaign_id'=p_campaign::text
    or (c.metadata->>'campaign_id' is null and exists(select 1 from targets t where t.call_id=c.id)))
 ), history as(
  select c.id,c.status,c.started_at,c.duration_seconds,cu.full_name as customer_name
  from physical c left join public.customers cu on cu.id=c.customer_id and cu.organization_id=p_org
  order by c.started_at desc nulls last,c.id desc limit 25 offset (p_page-1)*25
 ), active as(
  select c.id,c.status,c.started_at,cu.full_name as customer_name from physical c
  left join public.customers cu on cu.id=c.customer_id and cu.organization_id=p_org
  where c.status in ('dialing','ringing','in_progress')
  order by c.started_at desc nulls last,c.id desc limit 100
 ), outcomes as(
  select status,count(*) as n from targets group by status
 )
 select jsonb_build_object('campaign',v_campaign,'stats',jsonb_build_object(
  'targets',(select count(*) from targets),
  'attempts',(select count(*) from physical),
  'today',(select count(*) from physical where (started_at at time zone v_tz)::date=(now() at time zone v_tz)::date),
  'effective',(select count(*) from physical where public.fn_es_contacto_voz_efectivo(direction,status,answered_at,answered_by)),
  'meetings',(select count(distinct coalesce(a.metadata->>'calendar_event_id',a.id::text)) from public.activities a
    where a.organization_id=p_org and a.outcome='meeting_booked'
    and exists(select 1 from targets t where t.id::text=a.metadata->>'voice_agent_call_id')),
  'conversation_minutes',(select coalesce(sum(greatest(coalesce(duration_seconds,0),0)),0)/60.0 from physical),
  'remaining_minutes',(select voice_minutes_remaining from public.comm_settings where organization_id=p_org and is_active limit 1),
  'active_total',(select count(*) from physical where status in ('dialing','ringing','in_progress')),
  'pending',(select count(*) from targets where status in ('pending','queued')),
  'rescheduled',(select count(*) from targets where status in ('pending','queued') and scheduled_at>now()),
  'outcomes',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from outcomes)),
  'history',(select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from history h),
  'active',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from active a),
  'page',p_page,'timezone',v_tz) into v_result;
 return v_result;
end;
$function$;
revoke all on function public.crm_voice_campaign_detail(integer, uuid, integer) from public,anon,authenticated;
grant execute on function public.crm_voice_campaign_detail(integer, uuid, integer) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_claim_voice_agent_call_one(p_org integer, p_call uuid, p_worker text)
 RETURNS SETOF voice_agent_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_campaign uuid;
BEGIN
  PERFORM public.crm_lock_comm_wallet(p_org);
  SELECT campaign_id INTO v_campaign FROM public.voice_agent_calls WHERE id=p_call AND organization_id=p_org;
  IF v_campaign IS NOT NULL THEN
   PERFORM 1 FROM public.voice_agent_campaigns WHERE id=v_campaign AND organization_id=p_org AND stats->>'archived_at' IS NULL FOR UPDATE;
   IF NOT FOUND THEN RETURN; END IF;
  END IF;
  RETURN QUERY
  WITH candidato AS (
    SELECT vac.id
      FROM public.voice_agent_calls vac
     WHERE vac.organization_id = p_org
       AND vac.id = p_call
       AND vac.status IN ('pending','queued')
     FOR UPDATE SKIP LOCKED
  ), reclamada AS (
    UPDATE public.voice_agent_calls v
       SET status = 'in_progress',
           claimed_at = now(),
           locked_by = p_worker,
           attempts = v.attempts + 1,
           updated_at = now()
      FROM candidato c
     WHERE v.id = c.id
    RETURNING v.*
  ), registrada AS (
    INSERT INTO public.voice_agent_call_attempts
      (organization_id, voice_agent_call_id, voice_agent_id, campaign_id, customer_id, attempt_no, source, worker)
    SELECT r.organization_id, r.id, r.voice_agent_id, r.campaign_id, r.customer_id, r.attempts, 'manual', p_worker
      FROM reclamada r
    RETURNING voice_agent_call_id
  )
  SELECT r.* FROM reclamada r
   WHERE r.id IN (SELECT voice_agent_call_id FROM registrada);
END $function$;
revoke all on function public.fn_claim_voice_agent_call_one(integer, uuid, text) from public,anon,authenticated;
grant execute on function public.fn_claim_voice_agent_call_one(integer, uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.fn_claim_voice_agent_calls(p_org integer, p_campaign uuid, p_limit integer, p_worker text)
 RETURNS SETOF voice_agent_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.crm_lock_comm_wallet(p_org);
  PERFORM 1 FROM public.voice_agent_campaigns c
   WHERE c.organization_id=p_org AND c.id=p_campaign AND c.stats->>'archived_at' IS NULL
    AND c.status='running' AND NOT c.emergency_stop FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  -- El motor aplica Ley 2300 por destinatario; esta guarda evita que cambie cumplimiento al reclamar.
  IF NOT EXISTS(SELECT 1 FROM public.voice_agent_campaigns c JOIN public.voice_agents a ON a.id=c.voice_agent_id AND a.organization_id=p_org AND a.is_active
   JOIN public.comm_settings s ON s.organization_id=p_org AND s.is_active AND s.voice_agent_enabled
   WHERE c.id=p_campaign AND c.organization_id=p_org AND s.data_policy_url ~ '^https://\S+$' AND length(s.data_policy_url)<=500
    AND (s.voice_minutes_remaining IS NULL OR s.voice_minutes_remaining>0)) THEN RETURN; END IF;
  IF NOT COALESCE((SELECT numbers_in_file>0 AND valid_until>now() FROM public.voice_campaign_rne_checks
    WHERE organization_id=p_org AND campaign_id=p_campaign ORDER BY checked_at DESC,id DESC LIMIT 1),false) THEN RETURN; END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN RETURN; END IF;
  RETURN QUERY
  WITH candidatos AS (
    SELECT vac.id
      FROM public.voice_agent_calls vac
     WHERE vac.organization_id = p_org
       AND vac.campaign_id = p_campaign
       AND vac.status IN ('pending','queued')
       AND (vac.scheduled_at IS NULL OR vac.scheduled_at <= now())
     ORDER BY vac.scheduled_at NULLS FIRST, vac.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  ), reclamadas AS (
    UPDATE public.voice_agent_calls v
       SET status = 'in_progress',
           claimed_at = now(),
           locked_by = p_worker,
           attempts = v.attempts + 1,
           updated_at = now()
      FROM candidatos c
     WHERE v.id = c.id
    RETURNING v.*
  ), registradas AS (
    INSERT INTO public.voice_agent_call_attempts
      (organization_id, voice_agent_call_id, voice_agent_id, campaign_id, customer_id, attempt_no, source, worker)
    SELECT r.organization_id, r.id, r.voice_agent_id, r.campaign_id, r.customer_id, r.attempts, 'campaign', p_worker
      FROM reclamadas r
    RETURNING voice_agent_call_id
  )
  SELECT r.* FROM reclamadas r
   WHERE r.id IN (SELECT voice_agent_call_id FROM registradas);
END $function$;
revoke all on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) from public,anon,authenticated;
grant execute on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) to service_role;

CREATE OR REPLACE FUNCTION public.fn_rne_registrar_verificacion(p_org integer, p_campaign uuid, p_numeros text[], p_clientes_excluidos uuid[], p_objetivos_revisados integer, p_archivo text, p_sha256 text, p_usuario uuid, p_vigencia_dias integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_check_id uuid;
  v_ahora timestamptz := now();
  v_numeros integer;
  v_omitidas integer;
  v_excluidos integer := coalesce(array_length(p_clientes_excluidos, 1), 0);
begin
  perform public.crm_lock_comm_wallet(p_org);
  perform 1 from public.voice_agent_campaigns where id=p_campaign and organization_id=p_org and stats->>'archived_at' is null for update;
  if not found then raise exception 'campana_no_encontrada' using errcode='P0002'; end if;
  if p_vigencia_dias is null or p_vigencia_dias < 1 or p_vigencia_dias > 30 then
    raise exception 'vigencia inválida: % (1 a 30 días)', p_vigencia_dias using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.voice_agent_campaigns c
     where c.id = p_campaign and c.organization_id = p_org
  ) then
    raise exception 'La campaña no pertenece a la organización' using errcode = '42501';
  end if;

  select count(*) into v_numeros from public.crm_rne_valid_numbers(p_numeros);

  if v_numeros = 0 then
    raise exception 'rne_sin_numeros_validos' using errcode = '22023';
  end if;

  insert into public.voice_campaign_rne_checks (
    organization_id, campaign_id, checked_at, valid_until, file_name, file_sha256,
    numbers_in_file, checked_targets, excluded_targets, checked_by
  ) values (
    p_org, p_campaign, v_ahora, v_ahora + make_interval(days => p_vigencia_dias),
    left(p_archivo, 255), p_sha256,
    v_numeros, greatest(coalesce(p_objetivos_revisados, 0), 0), v_excluidos, p_usuario
  ) returning id into v_check_id;

  perform public.crm_import_rne_numbers(p_org,p_numeros,v_check_id,p_usuario);

  update public.voice_agent_calls v
     set status = 'skipped',
         error_message = 'Número inscrito en el Registro de Números Excluidos (RNE)',
         last_error_code = 'RNE',
         completed_at = v_ahora,
         locked_by = null,
         updated_at = v_ahora
   where v.organization_id = p_org
     and v.campaign_id = p_campaign
     and v.status in ('pending', 'queued')
     and v.customer_id = any(coalesce(p_clientes_excluidos, '{}'::uuid[]));
  get diagnostics v_omitidas = row_count;

  update public.voice_campaign_rne_checks set skipped_calls = v_omitidas where id = v_check_id;

  update public.voice_agent_campaigns set updated_at=clock_timestamp() where id=p_campaign and organization_id=p_org;
  return jsonb_build_object(
    'campaign_updated_at',(select updated_at from public.voice_agent_campaigns where id=p_campaign and organization_id=p_org),
    'check_id', v_check_id,
    'checked_at', v_ahora,
    'valid_until', v_ahora + make_interval(days => p_vigencia_dias),
    'numbers_in_file', v_numeros,
    'checked_targets', greatest(coalesce(p_objetivos_revisados, 0), 0),
    'excluded_targets', v_excluidos,
    'skipped_calls', v_omitidas
  );
end $function$;
revoke all on function public.fn_rne_registrar_verificacion(integer, uuid, text[], uuid[], integer, text, text, uuid, integer) from public,anon,authenticated;
grant execute on function public.fn_rne_registrar_verificacion(integer, uuid, text[], uuid[], integer, text, text, uuid, integer) to service_role;

CREATE OR REPLACE FUNCTION public.fn_stop_voice_campaign(p_org integer, p_campaign uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 perform public.crm_lock_comm_wallet(p_org);
 perform public.fn_crm_exigir_permiso(p_org,array['crm.campaigns.manage']);
 if p_reason is null or length(trim(p_reason)) not between 3 and 2000 then
  raise exception 'motivo_invalido' using errcode='22023';
 end if;
 update public.voice_agent_campaigns set emergency_stop=true,status='paused',
  stopped_reason=trim(p_reason),stopped_at=now(),updated_at=now()
 where id=p_campaign and organization_id=p_org and stats->>'archived_at' is null and status<>'completed';
 return found;
end;
$function$;
revoke all on function public.fn_stop_voice_campaign(integer, uuid, text) from public,anon,authenticated;
grant execute on function public.fn_stop_voice_campaign(integer, uuid, text) to authenticated,service_role;

create or replace function public.crm_voice_campaign_stop(p_org integer,p_campaign uuid,p_version timestamptz,p_actor uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.voice_agent_campaigns%rowtype;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_actor is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501'; end if;
 select * into v_row from public.voice_agent_campaigns where id=p_campaign and organization_id=p_org and stats->>'archived_at' is null for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002'; end if;
 if p_version is null or v_row.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001'; end if;
 if not public.fn_stop_voice_campaign(p_org,p_campaign,p_reason) then raise exception 'estado_invalido' using errcode='P0001'; end if;
 update public.voice_agent_campaigns set updated_at=clock_timestamp() where id=p_campaign and organization_id=p_org returning * into v_row;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
  values(p_org,'campaign.stopped','voice_agent_campaign',p_campaign,jsonb_build_object('actor_id',p_actor,'reason',p_reason),'processed',clock_timestamp());
 return to_jsonb(v_row);
end $$;
revoke all on function public.crm_voice_campaign_stop(integer,uuid,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.crm_voice_campaign_stop(integer,uuid,timestamptz,uuid,text) to service_role;

create or replace function public.crm_voice_campaign_rne_versioned(p_org integer,p_campaign uuid,p_version timestamptz,p_numeros text[],p_clientes_excluidos uuid[],p_objetivos_revisados integer,p_archivo text,p_sha256 text,p_usuario uuid,p_vigencia_dias integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.voice_agent_campaigns%rowtype;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_usuario is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_usuario and is_active) then
  raise exception 'actor_ajeno' using errcode='42501'; end if;
 select * into v_row from public.voice_agent_campaigns where id=p_campaign and organization_id=p_org and stats->>'archived_at' is null for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002'; end if;
 if p_version is null or v_row.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001'; end if;
 return public.fn_rne_registrar_verificacion(p_org,p_campaign,p_numeros,p_clientes_excluidos,p_objetivos_revisados,p_archivo,p_sha256,p_usuario,p_vigencia_dias);
end $$;
revoke all on function public.crm_voice_campaign_rne_versioned(integer,uuid,timestamptz,text[],uuid[],integer,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.crm_voice_campaign_rne_versioned(integer,uuid,timestamptz,text[],uuid[],integer,text,text,uuid,integer) to service_role;
