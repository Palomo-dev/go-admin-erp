-- No elimina constancias ni teléfonos comprobados. Revertir antes consumidores Node.
-- Se niega a borrar la evidencia si existe cualquier verificación nueva.
do $$begin
 if exists(select 1 from public.crm_voice_rne_snapshots) then raise exception 'rne_evidencia_existente';end if;
end $$;
CREATE OR REPLACE FUNCTION public.crm_voice_call_claim_gate(p_org integer, p_vac uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end;$function$
;
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
end $function$
;
drop function if exists public.crm_voice_campaign_rne_status(integer,uuid);
drop function if exists public.crm_voice_campaign_rne_snapshot(integer,uuid,timestamptz,text[],jsonb,text,text,uuid,integer);
drop function if exists public.crm_voice_rne_target_valid(integer,uuid,uuid,text);
drop table if exists public.crm_voice_rne_targets;
drop table if exists public.crm_voice_rne_snapshots;
