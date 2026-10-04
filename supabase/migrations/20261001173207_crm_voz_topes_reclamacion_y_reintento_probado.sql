
-- La cartera se bloquea antes de presupuesto, campaña, llamada e intento.
-- Ayudantes internos sin EXECUTE desde API.
create or replace function public.crm_voice_live_slots(p_org integer)
returns table(slot_key text,voice_agent_id uuid,campaign_id uuid)
language plpgsql stable security definer set search_path=public,pg_temp as $function$
begin
 perform public.fn_assert_acceso_org(p_org);
 return query with sources as (
  select 'vac:'||v.id as slot_key,v.voice_agent_id,v.campaign_id,2 as priority
   from public.voice_agent_calls v where v.organization_id=p_org and v.status='in_progress'
  union all
  select 'vac:'||r.voice_agent_call_id,coalesce((r.metadata->>'voice_agent_id')::uuid,v.voice_agent_id),
   (r.metadata->>'campaign_id')::uuid,1
   from public.crm_voice_credit_reservations r
   join public.voice_agent_calls v on v.id=r.voice_agent_call_id and v.organization_id=r.organization_id
   where r.organization_id=p_org and r.direction='outbound' and r.state='reserved'
    and r.submission_state<>'rejected' and r.metadata->>'terminal_status' is null and r.session_ended_at is null
  union all
  select coalesce('vac:'||r.voice_agent_call_id,'vac:'||v.id,'call:'||c.id),
   coalesce((r.metadata->>'voice_agent_id')::uuid,v.voice_agent_id,c.voice_agent_id),
   coalesce((r.metadata->>'campaign_id')::uuid,v.campaign_id),3
   from public.calls c
   left join public.crm_voice_credit_reservations r on r.call_id=c.id and r.organization_id=c.organization_id
   left join public.voice_agent_calls v on v.call_id=c.id and v.organization_id=c.organization_id
   where c.organization_id=p_org and c.status in ('dialing','ringing','in_progress')
 )
 select distinct on (s.slot_key) s.slot_key,s.voice_agent_id,s.campaign_id from sources s order by s.slot_key,s.priority;
end;$function$;
revoke all on function public.crm_voice_live_slots(integer) from public,anon,authenticated,service_role;

create or replace function public.crm_voice_call_claim_gate(p_org integer,p_vac uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_vac public.voice_agent_calls;v_agent public.voice_agents;v_campaign public.voice_agent_campaigns;v_settings public.comm_settings;
 v_tz text;v_day timestamptz;v_hour timestamptz;v_unpaid integer;
begin
 perform public.fn_assert_acceso_org(p_org);
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=p_vac;
 if not found or v_vac.status not in ('pending','queued') or (v_vac.scheduled_at is not null and v_vac.scheduled_at>clock_timestamp()) then return false;end if;
 select * into v_agent from public.voice_agents where organization_id=p_org and id=v_vac.voice_agent_id and is_active for share;
 if not found then return false;end if;
 select * into v_settings from public.comm_settings where organization_id=p_org and is_active and voice_agent_enabled for share;
 if not found or v_settings.data_policy_url is null or v_settings.data_policy_url !~ '^https://\S+$' or length(v_settings.data_policy_url)>500 then return false;end if;
 if v_vac.customer_id is null or not public.fn_can_contact(p_org,v_vac.customer_id,'voice','utility') then return false;end if;
 if v_vac.campaign_id is not null then
  select * into v_campaign from public.voice_agent_campaigns where organization_id=p_org and id=v_vac.campaign_id for update;
  if not found or v_campaign.stats->>'archived_at' is not null or v_campaign.status<>'running' or v_campaign.emergency_stop or v_campaign.voice_agent_id<>v_vac.voice_agent_id then return false;end if;
  if not exists(select 1 from (select numbers_in_file,checked_targets,valid_until from public.voice_campaign_rne_checks
    where organization_id=p_org and campaign_id=v_campaign.id order by checked_at desc,id desc limit 1) r
     where r.numbers_in_file>0 and r.checked_targets>0 and r.valid_until>clock_timestamp()) then return false;end if;
 end if;
 if exists(select 1 from public.crm_voice_credit_reservations where organization_id=p_org and voice_agent_call_id=p_vac and state='reserved') then return false;end if;
 if v_settings.voice_minutes_remaining is not null then
  select count(*) into v_unpaid from public.voice_agent_calls v where v.organization_id=p_org and v.status='in_progress' and v.credits_reserved=0
   and not exists(select 1 from public.crm_voice_credit_reservations r where r.organization_id=p_org and r.voice_agent_call_id=v.id and r.attempt_no=v.attempts);
  if v_settings.voice_minutes_remaining<=v_unpaid then return false;end if;
 end if;
 if (select count(*) from public.crm_voice_live_slots(p_org))>=v_settings.voice_max_concurrent_calls then return false;end if;
 if v_vac.campaign_id is not null and (select count(*) from public.crm_voice_live_slots(p_org) s where s.campaign_id=v_vac.campaign_id)>=v_campaign.max_concurrent then return false;end if;
 select coalesce(timezone,'America/Bogota') into v_tz from public.organizations where id=p_org;
 v_day:=date_trunc('day',clock_timestamp() at time zone v_tz) at time zone v_tz;
 v_hour:=clock_timestamp()-interval '1 hour';
 if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_day)>=v_agent.max_calls_per_day
  or (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_hour)>=v_agent.max_calls_per_hour
  or (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and customer_id=v_vac.customer_id and attempted_at>=v_day)>=2 then return false;end if;
 if v_vac.campaign_id is not null and (
  (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_vac.campaign_id and attempted_at>=v_day)>=v_campaign.max_calls_per_day
  or (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_vac.campaign_id and attempted_at>=v_hour)>=v_campaign.max_calls_per_hour) then return false;end if;
 return true;
end;$function$;
revoke all on function public.crm_voice_call_claim_gate(integer,uuid) from public,anon,authenticated,service_role;

create or replace function public.fn_claim_voice_agent_call_one(p_org integer,p_call uuid,p_worker text)
returns setof public.voice_agent_calls language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_vac public.voice_agent_calls;v_campaign uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select campaign_id into v_campaign from public.voice_agent_calls where organization_id=p_org and id=p_call;
 if v_campaign is not null then perform 1 from public.voice_agent_campaigns where organization_id=p_org and id=v_campaign for update;end if;
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=p_call and status in ('pending','queued') for update skip locked;
 if not found or not public.crm_voice_call_claim_gate(p_org,p_call) then return;end if;
 update public.voice_agent_calls set status='in_progress',claimed_at=clock_timestamp(),locked_by=p_worker,attempts=attempts+1,updated_at=clock_timestamp()
  where organization_id=p_org and id=p_call returning * into v_vac;
 insert into public.voice_agent_call_attempts(organization_id,voice_agent_call_id,voice_agent_id,campaign_id,customer_id,attempt_no,source,worker)
  values(p_org,v_vac.id,v_vac.voice_agent_id,v_vac.campaign_id,v_vac.customer_id,v_vac.attempts,'manual',p_worker);
 return next v_vac;
end;$function$;
revoke all on function public.fn_claim_voice_agent_call_one(integer,uuid,text) from public,anon,authenticated;
grant execute on function public.fn_claim_voice_agent_call_one(integer,uuid,text) to service_role;

create or replace function public.fn_claim_voice_agent_calls(p_org integer,p_campaign uuid,p_limit integer,p_worker text)
returns setof public.voice_agent_calls language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_vac public.voice_agent_calls;
begin
 perform public.crm_lock_comm_wallet(p_org);
 perform 1 from public.voice_agent_campaigns where organization_id=p_org and id=p_campaign and stats->>'archived_at' is null
   and status='running' and not emergency_stop for update;
 if not found or p_limit is null or p_limit<=0 then return;end if;
 for v_vac in select * from public.voice_agent_calls where organization_id=p_org and campaign_id=p_campaign and status in ('pending','queued')
   and (scheduled_at is null or scheduled_at<=clock_timestamp()) order by scheduled_at nulls first,created_at,id limit least(p_limit,500) for update skip locked loop
  if not public.crm_voice_call_claim_gate(p_org,v_vac.id) then continue;end if;
  update public.voice_agent_calls set status='in_progress',claimed_at=clock_timestamp(),locked_by=p_worker,attempts=attempts+1,updated_at=clock_timestamp()
   where organization_id=p_org and id=v_vac.id returning * into v_vac;
  insert into public.voice_agent_call_attempts(organization_id,voice_agent_call_id,voice_agent_id,campaign_id,customer_id,attempt_no,source,worker)
   values(p_org,v_vac.id,v_vac.voice_agent_id,v_vac.campaign_id,v_vac.customer_id,v_vac.attempts,'campaign',p_worker);
  return next v_vac;
 end loop;
end;$function$;
revoke all on function public.fn_claim_voice_agent_calls(integer,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.fn_claim_voice_agent_calls(integer,uuid,integer,text) to service_role;

-- Solo un rechazo verificado, devuelto y todavía propio puede producir el siguiente intento.
create or replace function public.crm_voice_retry_rejected(p_org integer,p_reservation uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_voice_credit_reservations;v_vac public.voice_agent_calls;v_campaign uuid;v_policy jsonb;
 v_max integer:=1;v_backoff numeric:=60;v_run_at timestamptz;v_job uuid;v_existing public.voice_agent_calls;
 v_agent public.voice_agents;v_campaign_row public.voice_agent_campaigns;v_tz text;v_day timestamptz;v_next_day timestamptz;v_wait timestamptz;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation;
 if not found then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 v_campaign:=(v_res.metadata->>'campaign_id')::uuid;
 if v_campaign is not null then
  select * into v_campaign_row from public.voice_agent_campaigns where organization_id=p_org and id=v_campaign and status='running' and not emergency_stop and stats->>'archived_at' is null for update;
  if not found then return jsonb_build_object('requeued',false,'reason','campaign_stopped');end if;
 end if;
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id for update;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if v_res.metadata->>'retry_job_id' is not null then
  return jsonb_build_object('requeued',true,'applied',false,'job_id',v_res.metadata->>'retry_job_id','run_at',v_res.metadata->>'retry_run_at');end if;
 if v_res.direction<>'outbound' or v_res.state<>'refunded' or v_res.submission_state<>'rejected'
  or v_res.metadata->>'rejection_provider_code' is null then return jsonb_build_object('requeued',false,'reason','rejection_not_verified');end if;
 if v_vac.attempts<>v_res.attempt_no or v_vac.call_id is distinct from v_res.call_id or v_vac.status<>'failed' or v_vac.credits_settled_at is null
  or v_vac.campaign_id is distinct from v_campaign then return jsonb_build_object('requeued',false,'reason','attempt_changed');end if;
 select * into v_agent from public.voice_agents where organization_id=p_org and id=v_vac.voice_agent_id and is_active for share;
 if not found then return jsonb_build_object('requeued',false,'reason','agent_inactive');end if;
 v_policy:=v_agent.retry_policy;
 if coalesce(v_policy->>'max_attempts','') ~ '^-?[0-9]+(\.[0-9]+)?$' then v_max:=greatest(1,least(5,ceil((v_policy->>'max_attempts')::numeric)))::integer;end if;
 if coalesce(v_policy->>'backoff_minutes','') ~ '^-?[0-9]+(\.[0-9]+)?$' then
  if (v_policy->>'backoff_minutes')::numeric<>0 then v_backoff:=greatest(5,least(1440,(v_policy->>'backoff_minutes')::numeric));end if;
 end if;
 if v_vac.attempts>=v_max then return jsonb_build_object('requeued',false,'reason','attempt_limit');end if;
 select * into v_existing from public.voice_agent_calls where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id
  and customer_id=v_vac.customer_id and id<>v_vac.id and status in ('pending','queued','in_progress') order by created_at,id limit 1 for update;
 if found then return jsonb_build_object('requeued',false,'reason','another_live_call');end if;
 v_run_at:=clock_timestamp()+make_interval(secs=>(v_backoff*60)::double precision);
 select coalesce(timezone,'America/Bogota') into v_tz from public.organizations where id=p_org;
 v_day:=date_trunc('day',clock_timestamp() at time zone v_tz) at time zone v_tz;
 v_next_day:=(date_trunc('day',clock_timestamp() at time zone v_tz)+interval '1 day') at time zone v_tz;
 if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and customer_id=v_vac.customer_id and attempted_at>=v_day)>=2
  or (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_day)>=v_agent.max_calls_per_day
  or (v_campaign is not null and (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_campaign and attempted_at>=v_day)>=v_campaign_row.max_calls_per_day) then
  v_run_at:=greatest(v_run_at,v_next_day);end if;
 select attempted_at+interval '1 hour 1 second' into v_wait from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id
  and attempted_at>=clock_timestamp()-interval '1 hour' order by attempted_at desc,id desc offset (v_agent.max_calls_per_hour-1) limit 1;
 if found then v_run_at:=greatest(v_run_at,v_wait);end if;
 if v_campaign is not null then
  select attempted_at+interval '1 hour 1 second' into v_wait from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_campaign
   and attempted_at>=clock_timestamp()-interval '1 hour' order by attempted_at desc,id desc offset (v_campaign_row.max_calls_per_hour-1) limit 1;
  if found then v_run_at:=greatest(v_run_at,v_wait);end if;
 end if;
 update public.voice_agent_calls set status='pending',claimed_at=null,locked_by=null,completed_at=null,started_at=null,duration_seconds=null,outcome=null,scheduled_at=v_run_at,updated_at=clock_timestamp()
  where organization_id=p_org and id=v_vac.id;
 v_job:=public.fn_enqueue_job(p_org,'ai_call',jsonb_build_object('voice_agent_id',v_vac.voice_agent_id,'customer_id',v_vac.customer_id,
   'opportunity_id',v_vac.opportunity_id,'voice_agent_call_id',v_vac.id,'retry_reservation_id',v_res.id),v_run_at,'ai_call:voice_retry:'||v_res.id,5);
 if v_job is null then raise exception 'trabajo_no_creado' using errcode='P0001';end if;
 update public.crm_voice_credit_reservations set metadata=metadata||jsonb_build_object('retry_job_id',v_job,'retry_run_at',v_run_at),updated_at=clock_timestamp()
  where organization_id=p_org and id=v_res.id;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
  values(p_org,'communication.voice_retry_scheduled','voice_credit_reservation',v_res.id,jsonb_build_object('job_id',v_job,'run_at',v_run_at),'processed',clock_timestamp());
 return jsonb_build_object('requeued',true,'applied',true,'job_id',v_job,'run_at',v_run_at);
end;$function$;
revoke all on function public.crm_voice_retry_rejected(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_voice_retry_rejected(integer,uuid) to service_role;

-- Revalidación definitiva del destinatario y ventana móvil antes de gastar.
CREATE OR REPLACE FUNCTION public.crm_voice_dispatch_prepare(p_org integer, p_vac uuid, p_attempt integer, p_from text, p_to text, p_recording boolean, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_vac public.voice_agent_calls;v_campaign public.voice_agent_campaigns;v_agent public.voice_agents;
 v_settings public.comm_settings;v_attempt public.voice_agent_call_attempts;v_res public.crm_voice_credit_reservations;
 v_call uuid;v_id uuid;v_campaign_id uuid;v_tz text;v_day timestamptz;v_hour timestamptz;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_vac is null or p_attempt is null or p_attempt<1 or p_from is null or p_to is null
   or p_from !~ '^\+[1-9][0-9]{6,14}$' or p_to !~ '^\+[1-9][0-9]{6,14}$'
   or p_recording is null or jsonb_typeof(p_metadata) is distinct from 'object' or octet_length(p_metadata::text)>10000 then
  raise exception 'preparacion_voz_invalida' using errcode='22023';end if;
 select campaign_id into v_campaign_id from public.voice_agent_calls where organization_id=p_org and id=p_vac;
 if v_campaign_id is not null then
  select * into v_campaign from public.voice_agent_campaigns where organization_id=p_org and id=v_campaign_id for update;
  if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 end if;
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=p_vac for update;
 if not found then raise exception 'llamada_no_encontrada' using errcode='P0002';end if;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and voice_agent_call_id=p_vac and attempt_no=p_attempt for update;
 if found then return jsonb_build_object('reservation_id',v_res.id,'call_id',v_res.call_id,'state',v_res.state,'submission_state',v_res.submission_state,'created',false);end if;
 if v_vac.status<>'in_progress' or v_vac.attempts<>p_attempt or v_vac.claimed_at is null then
  raise exception 'intento_voz_no_reclamado' using errcode='P0001';end if;
 if v_vac.credits_reserved>0 and v_vac.credits_settled_at is null then
  raise exception 'reserva_voz_sin_evidencia' using errcode='P0001';end if;
 if exists(select 1 from public.crm_voice_credit_reservations where organization_id=p_org and voice_agent_call_id=p_vac and state='reserved') then
  raise exception 'creditos_pendientes' using errcode='P0001';end if;
 select * into v_attempt from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_call_id=p_vac
  and attempt_no=p_attempt and voice_agent_id=v_vac.voice_agent_id and campaign_id is not distinct from v_vac.campaign_id
  and customer_id is not distinct from v_vac.customer_id order by attempted_at desc,id desc limit 1 for update;
 if not found then raise exception 'intento_voz_no_encontrado' using errcode='P0002';end if;
 select * into v_agent from public.voice_agents where organization_id=p_org and id=v_vac.voice_agent_id and is_active for share;
 if not found then raise exception 'agente_no_encontrado' using errcode='P0002';end if;
 if v_vac.customer_id is null or not exists(select 1 from public.customers where organization_id=p_org and id=v_vac.customer_id and status is distinct from 'merged')
  or (v_vac.opportunity_id is not null and not exists(select 1 from public.opportunities where organization_id=p_org and id=v_vac.opportunity_id
   and customer_id=v_vac.customer_id)) then raise exception 'objetivo_voz_ajeno' using errcode='P0002';end if;
 if not public.fn_can_contact(p_org,v_vac.customer_id,'voice','utility') then raise exception 'contacto_no_autorizado' using errcode='P0001';end if;
 select * into v_settings from public.comm_settings where organization_id=p_org and is_active for update;
 if not found or not coalesce(v_settings.voice_agent_enabled,false) then raise exception 'canal_voz_inactivo' using errcode='P0001';end if;
 if v_settings.data_policy_url is null or v_settings.data_policy_url !~ '^https://\S+$' or length(v_settings.data_policy_url)>500 then
  raise exception 'politica_datos_pendiente' using errcode='P0001';end if;
 if v_campaign_id is not null then
  if v_campaign.stats->>'archived_at' is not null or v_campaign.status<>'running' or v_campaign.emergency_stop
   or v_campaign.voice_agent_id<>v_vac.voice_agent_id then raise exception 'campana_no_ejecutable' using errcode='P0001';end if;
  if not exists(select 1 from (select numbers_in_file,checked_targets,valid_until from public.voice_campaign_rne_checks where organization_id=p_org
    and campaign_id=v_campaign_id order by checked_at desc,id desc limit 1) r where r.numbers_in_file>0 and r.checked_targets>0 and r.valid_until>clock_timestamp()) then
   raise exception 'rne_pendiente' using errcode='P0001';end if;
 end if;
 -- La llamada física incluye reservas inciertas: no se libera capacidad por un timeout.
 if (select count(*) from public.crm_voice_live_slots(p_org))>v_settings.voice_max_concurrent_calls then
  raise exception 'concurrencia_voz' using errcode='P0001';end if;
 if v_campaign_id is not null and (select count(*) from public.crm_voice_live_slots(p_org) s where s.campaign_id=v_campaign_id)>v_campaign.max_concurrent then
  raise exception 'concurrencia_voz' using errcode='P0001';end if;
 select coalesce(timezone,'America/Bogota') into v_tz from public.organizations where id=p_org;
 v_day:=date_trunc('day',clock_timestamp() at time zone v_tz) at time zone v_tz;
 v_hour:=clock_timestamp()-interval '1 hour';
 if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_day)>v_agent.max_calls_per_day
  or (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_hour)>v_agent.max_calls_per_hour then
  raise exception 'tope_intentos_voz' using errcode='P0001';end if;
 if v_campaign_id is not null and ((select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_campaign_id and attempted_at>=v_day)>v_campaign.max_calls_per_day
  or (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_campaign_id and attempted_at>=v_hour)>v_campaign.max_calls_per_hour) then
  raise exception 'tope_intentos_voz' using errcode='P0001';end if;
 if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id
   and customer_id=v_vac.customer_id and attempted_at>=v_day)>2 then raise exception 'tope_cliente_voz' using errcode='P0001';end if;
 if jsonb_typeof(p_metadata->'expected_customer_phone') is distinct from 'string' or not (p_metadata ? 'expected_customer_timezone')
  or not exists(select 1 from public.customers where organization_id=p_org and id=v_vac.customer_id
   and phone is not distinct from p_metadata->>'expected_customer_phone' and timezone is not distinct from p_metadata->>'expected_customer_timezone') then
  raise exception 'destinatario_voz_modificado' using errcode='P0001';end if;
 if not public.deduct_comm_credits(p_org,'voice',1) then raise exception 'creditos_insuficientes' using errcode='P0001';end if;
 insert into public.calls(organization_id,provider,direction,mode,from_number,to_number,status,customer_id,opportunity_id,voice_agent_id,recording_enabled,consent_given,duration_source,metadata)
 values(p_org,'twilio','outbound','ai_agent',p_from,p_to,'dialing',v_vac.customer_id,v_vac.opportunity_id,v_vac.voice_agent_id,p_recording,false,'provider',
  (p_metadata-'expected_customer_phone'-'expected_customer_timezone')||jsonb_build_object('source','voice_agent_campaign','campaign_id',v_campaign_id,'voice_agent_call_id',p_vac,'attempt_no',p_attempt)) returning id into v_call;
 insert into public.crm_voice_credit_reservations(organization_id,voice_agent_call_id,attempt_id,attempt_no,call_id,direction,recipient,minutes_reserved,debited,minutes_charged,metadata)
 values(p_org,p_vac,v_attempt.id,p_attempt,v_call,'outbound',p_to,1,v_settings.voice_minutes_remaining is not null,1,
  jsonb_build_object('balance_before',v_settings.voice_minutes_remaining,'campaign_id',v_campaign_id,'voice_agent_id',v_vac.voice_agent_id,
   'customer_phone',p_metadata->>'expected_customer_phone','customer_timezone',p_metadata->>'expected_customer_timezone')) returning id into v_id;
 update public.voice_agent_calls set call_id=v_call,provider_call_sid=null,started_at=null,completed_at=null,duration_seconds=null,outcome=null,
  credits_reserved=1,credits_settled_at=null,updated_at=clock_timestamp() where organization_id=p_org and id=p_vac;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.voice_credit_reserved','voice_credit_reservation',v_id,jsonb_build_object('units',1,'call_id',v_call,'attempt_no',p_attempt),'processed',clock_timestamp());
 return jsonb_build_object('reservation_id',v_id,'call_id',v_call,'state','reserved','submission_state','prepared','created',true);
end;$function$
;
CREATE OR REPLACE FUNCTION public.crm_voice_dispatch_begin(p_org integer, p_reservation uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_res public.crm_voice_credit_reservations;v_vac public.voice_agent_calls;v_campaign public.voice_agent_campaigns;v_cap integer;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation;
 if not found then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 select campaign_id into v_vac.campaign_id from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id;
 if v_vac.campaign_id is not null then
  select * into v_campaign from public.voice_agent_campaigns where organization_id=p_org and id=v_vac.campaign_id for update;
  if not found or v_campaign.stats->>'archived_at' is not null or v_campaign.status<>'running' or v_campaign.emergency_stop then
   raise exception 'campana_no_ejecutable' using errcode='P0001';end if;
  if not exists(select 1 from (select numbers_in_file,checked_targets,valid_until from public.voice_campaign_rne_checks where organization_id=p_org
    and campaign_id=v_vac.campaign_id order by checked_at desc,id desc limit 1) r where r.numbers_in_file>0 and r.checked_targets>0 and r.valid_until>clock_timestamp()) then
   raise exception 'rne_pendiente' using errcode='P0001';end if;
 end if;
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id for update;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if v_res.direction<>'outbound' or v_res.state<>'reserved' or v_res.submission_state<>'prepared' then return false;end if;
 if not exists(select 1 from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id
  and attempts=v_res.attempt_no and call_id=v_res.call_id and status='in_progress') then raise exception 'intento_voz_modificado' using errcode='P0001';end if;
 if not exists(select 1 from public.calls c where c.organization_id=p_org and c.id=v_res.call_id
   and c.customer_id is not distinct from v_vac.customer_id and c.voice_agent_id=v_vac.voice_agent_id
   and c.opportunity_id is not distinct from v_vac.opportunity_id)
  or v_vac.campaign_id is distinct from (v_res.metadata->>'campaign_id')::uuid then raise exception 'intento_voz_modificado' using errcode='P0001';end if;
 if not exists(select 1 from public.customers where organization_id=p_org and id=v_vac.customer_id
   and phone is not distinct from v_res.metadata->>'customer_phone' and timezone is not distinct from v_res.metadata->>'customer_timezone') then
  raise exception 'destinatario_voz_modificado' using errcode='P0001';end if;
 if not exists(select 1 from public.voice_agents where organization_id=p_org and id=v_vac.voice_agent_id and is_active)
  or not exists(select 1 from public.comm_settings where organization_id=p_org and is_active and voice_agent_enabled
    and data_policy_url ~ '^https://\S+$' and length(data_policy_url)<=500)
  or not public.fn_can_contact(p_org,v_vac.customer_id,'voice','utility') then raise exception 'contacto_no_autorizado' using errcode='P0001';end if;
 select voice_max_concurrent_calls into v_cap from public.comm_settings where organization_id=p_org and is_active for share;
 if v_cap is null or (select count(*) from public.crm_voice_live_slots(p_org))>v_cap
  or (v_vac.campaign_id is not null and (select count(*) from public.crm_voice_live_slots(p_org) s where s.campaign_id=v_vac.campaign_id)>v_campaign.max_concurrent) then raise exception 'concurrencia_voz' using errcode='P0001';end if;
 update public.crm_voice_credit_reservations set submission_state='submitting',updated_at=clock_timestamp() where organization_id=p_org and id=p_reservation;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.voice_submission_started','voice_credit_reservation',v_res.id,jsonb_build_object('attempt_no',v_res.attempt_no),'processed',clock_timestamp());
 return true;
end;$function$
;
