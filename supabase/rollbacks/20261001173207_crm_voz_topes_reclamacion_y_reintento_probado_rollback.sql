-- Restaura cuatro definiciones previas y elimina solo las nuevas RPC; no modifica filas ni saldos.
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
  if not exists(select 1 from (select checked_targets,valid_until from public.voice_campaign_rne_checks where organization_id=p_org
    and campaign_id=v_campaign_id order by checked_at desc,id desc limit 1) r where r.checked_targets>0 and r.valid_until>clock_timestamp()) then
   raise exception 'rne_pendiente' using errcode='P0001';end if;
 end if;
 -- La llamada física incluye reservas inciertas: no se libera capacidad por un timeout.
 if (select count(*) from public.calls where organization_id=p_org and status in ('dialing','ringing','in_progress'))>=v_settings.voice_max_concurrent_calls then
  raise exception 'concurrencia_voz' using errcode='P0001';end if;
 if v_campaign_id is not null and (select count(*) from public.calls where organization_id=p_org and status in ('dialing','ringing','in_progress')
   and metadata->>'campaign_id'=v_campaign_id::text)>=v_campaign.max_concurrent then
  raise exception 'concurrencia_voz' using errcode='P0001';end if;
 select coalesce(timezone,'America/Bogota') into v_tz from public.organizations where id=p_org;
 v_day:=date_trunc('day',clock_timestamp() at time zone v_tz) at time zone v_tz;
 v_hour:=date_trunc('hour',clock_timestamp() at time zone v_tz) at time zone v_tz;
 if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_day)>v_agent.max_calls_per_day
  or (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_hour)>v_agent.max_calls_per_hour then
  raise exception 'tope_intentos_voz' using errcode='P0001';end if;
 if v_campaign_id is not null and ((select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_campaign_id and attempted_at>=v_day)>v_campaign.max_calls_per_day
  or (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_campaign_id and attempted_at>=v_hour)>v_campaign.max_calls_per_hour) then
  raise exception 'tope_intentos_voz' using errcode='P0001';end if;
 if not public.deduct_comm_credits(p_org,'voice',1) then raise exception 'creditos_insuficientes' using errcode='P0001';end if;
 insert into public.calls(organization_id,provider,direction,mode,from_number,to_number,status,customer_id,opportunity_id,voice_agent_id,recording_enabled,consent_given,duration_source,metadata)
 values(p_org,'twilio','outbound','ai_agent',p_from,p_to,'dialing',v_vac.customer_id,v_vac.opportunity_id,v_vac.voice_agent_id,p_recording,false,'provider',
  p_metadata||jsonb_build_object('source','voice_agent_campaign','campaign_id',v_campaign_id,'voice_agent_call_id',p_vac,'attempt_no',p_attempt)) returning id into v_call;
 insert into public.crm_voice_credit_reservations(organization_id,voice_agent_call_id,attempt_id,attempt_no,call_id,direction,recipient,minutes_reserved,debited,minutes_charged,metadata)
 values(p_org,p_vac,v_attempt.id,p_attempt,v_call,'outbound',p_to,1,v_settings.voice_minutes_remaining is not null,1,
  jsonb_build_object('balance_before',v_settings.voice_minutes_remaining,'campaign_id',v_campaign_id)) returning id into v_id;
 update public.voice_agent_calls set call_id=v_call,provider_call_sid=null,started_at=null,completed_at=null,duration_seconds=null,outcome=null,
  credits_reserved=1,credits_settled_at=null,updated_at=clock_timestamp() where organization_id=p_org and id=p_vac;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.voice_credit_reserved','voice_credit_reservation',v_id,jsonb_build_object('units',1,'call_id',v_call,'attempt_no',p_attempt),'processed',clock_timestamp());
 return jsonb_build_object('reservation_id',v_id,'call_id',v_call,'state','reserved','submission_state','prepared','created',true);
end;$function$
;
revoke all on function public.crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb) to service_role;
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
END $function$
;
revoke all on function public.fn_claim_voice_agent_call_one(integer,uuid,text) from public,anon,authenticated;
grant execute on function public.fn_claim_voice_agent_call_one(integer,uuid,text) to service_role;
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
END $function$
;
revoke all on function public.fn_claim_voice_agent_calls(integer,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.fn_claim_voice_agent_calls(integer,uuid,integer,text) to service_role;
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
  if not exists(select 1 from (select checked_targets,valid_until from public.voice_campaign_rne_checks where organization_id=p_org
    and campaign_id=v_vac.campaign_id order by checked_at desc,id desc limit 1) r where r.checked_targets>0 and r.valid_until>clock_timestamp()) then
   raise exception 'rne_pendiente' using errcode='P0001';end if;
 end if;
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id for update;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if v_res.direction<>'outbound' or v_res.state<>'reserved' or v_res.submission_state<>'prepared' then return false;end if;
 if not exists(select 1 from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id
  and attempts=v_res.attempt_no and call_id=v_res.call_id and status='in_progress') then raise exception 'intento_voz_modificado' using errcode='P0001';end if;
 if not exists(select 1 from public.voice_agents where organization_id=p_org and id=v_vac.voice_agent_id and is_active)
  or not exists(select 1 from public.comm_settings where organization_id=p_org and is_active and voice_agent_enabled
    and data_policy_url ~ '^https://\S+$' and length(data_policy_url)<=500)
  or not public.fn_can_contact(p_org,v_vac.customer_id,'voice','utility') then raise exception 'contacto_no_autorizado' using errcode='P0001';end if;
 select voice_max_concurrent_calls into v_cap from public.comm_settings where organization_id=p_org and is_active for share;
 if v_cap is null or (select count(*) from public.calls where organization_id=p_org and status in ('dialing','ringing','in_progress'))>v_cap
  or (v_vac.campaign_id is not null and (select count(*) from public.calls where organization_id=p_org and status in ('dialing','ringing','in_progress')
    and metadata->>'campaign_id'=v_vac.campaign_id::text)>v_campaign.max_concurrent) then raise exception 'concurrencia_voz' using errcode='P0001';end if;
 update public.crm_voice_credit_reservations set submission_state='submitting',updated_at=clock_timestamp() where organization_id=p_org and id=p_reservation;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.voice_submission_started','voice_credit_reservation',v_res.id,jsonb_build_object('attempt_no',v_res.attempt_no),'processed',clock_timestamp());
 return true;
end;$function$
;
revoke all on function public.crm_voice_dispatch_begin(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_voice_dispatch_begin(integer,uuid) to service_role;
drop function if exists public.crm_voice_retry_rejected(integer,uuid);
drop function if exists public.crm_voice_call_claim_gate(integer,uuid);
drop function if exists public.crm_voice_live_slots(integer);
