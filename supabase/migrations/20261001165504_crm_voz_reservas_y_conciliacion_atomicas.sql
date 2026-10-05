-- Evidencia financiera privada por intento. No convierte banderas antiguas en débitos probados.
-- Expansión compatible: el código publicado no cambia hasta el despliegue conjunto de Node y WS.
set lock_timeout='2s';
create table if not exists public.crm_voice_credit_reservations (
 id uuid primary key default gen_random_uuid(),
 organization_id integer not null references public.organizations(id) on delete restrict,
 voice_agent_call_id uuid references public.voice_agent_calls(id) on delete restrict,
 attempt_id uuid unique references public.voice_agent_call_attempts(id) on delete restrict,
 attempt_no integer,
 call_id uuid unique references public.calls(id) on delete restrict,
 provider_call_sid text,
 direction text not null check(direction in ('inbound','outbound')),
 recipient text not null,
 state text not null default 'reserved' check(state in ('reserved','consumed','refunded')),
 submission_state text not null default 'prepared' check(submission_state in ('prepared','submitting','accepted','rejected','uncertain')),
 minutes_reserved integer not null check(minutes_reserved in (0,1)),
 debited boolean not null,
 minutes_charged integer not null default 0 check(minutes_charged>=0),
 minutes_due integer not null default 0 check(minutes_due>=0),
 session_started_at timestamptz,
 session_ended_at timestamptz,
 settled_at timestamptz,
 usage_log_id uuid unique references public.comm_usage_logs(id) on delete restrict,
 metadata jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,voice_agent_call_id,attempt_no),
 unique(organization_id,provider_call_sid),
 check((direction='outbound' and voice_agent_call_id is not null and attempt_id is not null and attempt_no is not null and attempt_no>0 and minutes_reserved=1)
    or (direction='inbound' and voice_agent_call_id is null and attempt_id is null and attempt_no is null and minutes_reserved=0)),
 check(provider_call_sid is null or provider_call_sid ~ '^CA[0-9a-fA-F]{32}$'),
 check(session_ended_at is null or (session_started_at is not null and session_ended_at>=session_started_at))
);
alter table public.crm_voice_credit_reservations enable row level security;
revoke all on public.crm_voice_credit_reservations from public,anon,authenticated,service_role;
grant select on public.crm_voice_credit_reservations to service_role;
-- Preparada para una lectura futura con pertenencia; no se concede acceso al navegador.
drop policy if exists crm_voice_credits_own_read on public.crm_voice_credit_reservations;
create policy crm_voice_credits_own_read on public.crm_voice_credit_reservations for select to authenticated
 using(exists(select 1 from public.organization_members m where m.organization_id=crm_voice_credit_reservations.organization_id
   and m.user_id=(select auth.uid()) and m.is_active));
create index if not exists crm_voice_credits_org_state_idx on public.crm_voice_credit_reservations(organization_id,state);
create index if not exists crm_voice_credits_vac_idx on public.crm_voice_credit_reservations(voice_agent_call_id);

-- Ayudante interno sin EXECUTE para service_role: solo las transiciones comprobadas lo llaman.
-- El abono probado no se limita al cupo mensual: puede haber minutos comprados por encima del plan.
create or replace function public.crm_voice_credit_return_reserved(p_org integer,p_reservation uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_voice_credit_reservations;v_settings public.comm_settings;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if not found or v_res.state<>'reserved' or v_res.minutes_reserved<>1 or v_res.direction<>'outbound' then
  raise exception 'reserva_no_reembolsable' using errcode='P0001';end if;
 if v_res.debited then
  select * into v_settings from public.comm_settings where organization_id=p_org and is_active for update;
  if not found then raise exception 'reembolso_no_disponible' using errcode='P0001';end if;
  if v_settings.voice_minutes_remaining is not null then
   update public.comm_settings set voice_minutes_remaining=voice_minutes_remaining+v_res.minutes_reserved,updated_at=clock_timestamp()
    where organization_id=p_org and id=v_settings.id;
  end if;
 end if;
 update public.crm_voice_credit_reservations set state='refunded',minutes_charged=0,settled_at=clock_timestamp(),updated_at=clock_timestamp()
  where organization_id=p_org and id=p_reservation;
end;$function$;
revoke all on function public.crm_voice_credit_return_reserved(integer,uuid) from public,anon,authenticated,service_role;

-- Reserva, llamada física y correlación se crean juntas; una repetición devuelve el mismo intento.
create or replace function public.crm_voice_dispatch_prepare(p_org integer,p_vac uuid,p_attempt integer,p_from text,p_to text,p_recording boolean,p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
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
end;$function$;

-- Solo el ganador puede enviar al proveedor. El token de reserva identifica el intento en los callbacks.
create or replace function public.crm_voice_dispatch_begin(p_org integer,p_reservation uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
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
end;$function$;

-- Cancelación segura antes de enviar: también limpia una reserva cuando falla la última compuerta.
create or replace function public.crm_voice_dispatch_cancel_prepared(p_org integer,p_reservation uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_voice_credit_reservations;v_campaign uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation;
 if not found then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 select campaign_id into v_campaign from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id;
 if v_campaign is not null then perform 1 from public.voice_agent_campaigns where organization_id=p_org and id=v_campaign for update;end if;
 perform 1 from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id for update;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if v_res.direction<>'outbound' or v_res.state<>'reserved' or v_res.submission_state<>'prepared' then return false;end if;
 perform public.crm_voice_credit_return_reserved(p_org,v_res.id);
 update public.crm_voice_credit_reservations set state='refunded',submission_state='rejected',minutes_charged=0,settled_at=clock_timestamp(),
  metadata=metadata||jsonb_build_object('refund_reason','not_submitted'),updated_at=clock_timestamp() where organization_id=p_org and id=p_reservation;
 update public.calls set status='canceled',ended_at=clock_timestamp(),updated_at=clock_timestamp() where organization_id=p_org and id=v_res.call_id;
 update public.voice_agent_calls set status='canceled',completed_at=clock_timestamp(),locked_by=null,credits_reserved=0,credits_settled_at=clock_timestamp(),
  updated_at=clock_timestamp() where organization_id=p_org and id=v_res.voice_agent_call_id and attempts=v_res.attempt_no and call_id=v_res.call_id;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.voice_credit_refunded','voice_credit_reservation',v_res.id,jsonb_build_object('units',v_res.minutes_reserved,'reason','not_submitted','debited',v_res.debited),'processed',clock_timestamp());
 return true;
end;$function$;

-- La respuesta REST y el webhook firmado usan la misma correlación privada.
create or replace function public.crm_voice_dispatch_accept(p_org integer,p_reservation uuid,p_sid text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_voice_credit_reservations;v_vac public.voice_agent_calls;v_campaign uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_sid is null or p_sid !~ '^CA[0-9a-fA-F]{32}$' then raise exception 'sid_voz_invalido' using errcode='22023';end if;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation;
 if not found or v_res.direction<>'outbound' then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 select campaign_id into v_campaign from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id;
 if v_campaign is not null then perform 1 from public.voice_agent_campaigns where organization_id=p_org and id=v_campaign for update;end if;
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id for update;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if v_res.provider_call_sid is not null and v_res.provider_call_sid<>p_sid then raise exception 'sid_voz_conflictivo' using errcode='P0001';end if;
 if v_res.submission_state not in ('submitting','uncertain','accepted') then raise exception 'envio_voz_no_iniciado' using errcode='P0001';end if;
 if v_res.provider_call_sid is null then
  insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
  values(p_org,'communication.voice_submission_accepted','voice_credit_reservation',v_res.id,jsonb_build_object('call_sid',p_sid),'processed',clock_timestamp());
 end if;
 update public.crm_voice_credit_reservations set provider_call_sid=p_sid,submission_state='accepted',updated_at=clock_timestamp() where organization_id=p_org and id=p_reservation;
 update public.calls set provider_call_sid=p_sid,updated_at=clock_timestamp() where organization_id=p_org and id=v_res.call_id;
 if v_vac.attempts=v_res.attempt_no and v_vac.call_id=v_res.call_id then
  update public.voice_agent_calls set provider_call_sid=p_sid,started_at=coalesce(started_at,clock_timestamp()),updated_at=clock_timestamp() where organization_id=p_org and id=v_vac.id;
 end if;
 return jsonb_build_object('reservation_id',v_res.id,'call_id',v_res.call_id,'voice_agent_call_id',v_res.voice_agent_call_id,'attempt_no',v_res.attempt_no);
end;$function$;

-- Sin respuesta concluyente NO hay devolución ni liberación de la llamada.
create or replace function public.crm_voice_dispatch_failure(p_org integer,p_reservation uuid,p_http_status integer,p_provider_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_voice_credit_reservations;v_rejected boolean;v_campaign uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation;
 if not found or v_res.direction<>'outbound' then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 select campaign_id into v_campaign from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id;
 if v_campaign is not null then perform 1 from public.voice_agent_campaigns where organization_id=p_org and id=v_campaign for update;end if;
 perform 1 from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id for update;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if v_res.state<>'reserved' or v_res.submission_state in ('accepted','rejected') then
  return jsonb_build_object('refunded',v_res.state='refunded','uncertain',v_res.submission_state='uncertain','applied',false);end if;
 if v_res.submission_state not in ('submitting','uncertain') then raise exception 'envio_voz_no_iniciado' using errcode='P0001';end if;
 v_rejected:=coalesce(p_http_status between 400 and 499 and p_http_status<>408 and p_provider_code ~ '^[0-9]{5}$',false);
 if not v_rejected then
  if v_res.submission_state<>'uncertain' then
   insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
   values(p_org,'communication.voice_submission_uncertain','voice_credit_reservation',v_res.id,'{}','processed',clock_timestamp());
  end if;
  update public.crm_voice_credit_reservations set submission_state='uncertain',metadata=metadata||jsonb_build_object('reconciliation_required',true),updated_at=clock_timestamp()
   where organization_id=p_org and id=p_reservation;
  return jsonb_build_object('refunded',false,'uncertain',true,'applied',true);
 end if;
 if v_res.provider_call_sid is not null or v_res.session_started_at is not null then raise exception 'llamada_aceptada' using errcode='P0001';end if;
 perform public.crm_voice_credit_return_reserved(p_org,v_res.id);
 update public.crm_voice_credit_reservations set state='refunded',submission_state='rejected',minutes_charged=0,settled_at=clock_timestamp(),
  metadata=metadata||jsonb_build_object('rejection_http_status',p_http_status,'rejection_provider_code',p_provider_code),updated_at=clock_timestamp() where organization_id=p_org and id=p_reservation;
 update public.calls set status='failed',ended_at=clock_timestamp(),updated_at=clock_timestamp() where organization_id=p_org and id=v_res.call_id;
 update public.voice_agent_calls set status='failed',completed_at=clock_timestamp(),locked_by=null,credits_reserved=0,credits_settled_at=clock_timestamp(),
  last_error_code=p_provider_code,updated_at=clock_timestamp() where organization_id=p_org and id=v_res.voice_agent_call_id and attempts=v_res.attempt_no and call_id=v_res.call_id;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.voice_credit_refunded','voice_credit_reservation',v_res.id,jsonb_build_object('units',v_res.minutes_reserved,'reason','provider_rejected','debited',v_res.debited),'processed',clock_timestamp());
 return jsonb_build_object('refunded',true,'uncertain',false,'applied',true);
end;$function$;

-- Apertura autenticada por el servidor WS: crea UNA traza y fija el inicio para todos los cierres.
create or replace function public.crm_voice_session_open(p_org integer,p_sid text,p_vac uuid,p_started_at timestamptz,p_recipient text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_voice_credit_reservations;v_usage uuid;v_id uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_sid is null or p_sid !~ '^CA[0-9a-fA-F]{32}$' or p_started_at is null or p_started_at>clock_timestamp()+interval '5 seconds'
  or p_started_at<clock_timestamp()-interval '1 day' or p_recipient is null or length(p_recipient) not between 1 and 100 then
  raise exception 'sesion_voz_invalida' using errcode='22023';end if;
 if p_vac is not null then perform 1 from public.voice_agent_calls where organization_id=p_org and id=p_vac for update;end if;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and provider_call_sid=p_sid for update;
 if found then
  if v_res.voice_agent_call_id is distinct from p_vac then raise exception 'sesion_voz_ajena' using errcode='P0001';end if;
  if v_res.state='refunded' then raise exception 'reserva_reembolsada' using errcode='P0001';end if;
  if v_res.session_started_at is not null then return v_res.id;end if;
  v_id:=v_res.id;
 elsif p_vac is not null then raise exception 'reserva_voz_sin_evidencia' using errcode='P0001';
 else
  if not exists(select 1 from public.comm_settings where organization_id=p_org and is_active and voice_agent_enabled
    and (voice_minutes_remaining is null or voice_minutes_remaining>0)) then raise exception 'creditos_insuficientes' using errcode='P0001';end if;
  insert into public.crm_voice_credit_reservations(organization_id,provider_call_sid,direction,recipient,submission_state,minutes_reserved,debited)
   values(p_org,p_sid,'inbound',p_recipient,'accepted',0,false) returning id into v_id;
 end if;
 insert into public.comm_usage_logs(organization_id,channel,credits_used,twilio_message_sid,recipient,status,direction,module,metadata)
 values(p_org,'voice',0,p_sid,case when p_vac is null then p_recipient else v_res.recipient end,'in_progress',case when p_vac is null then 'inbound' else 'outbound' end,'voice_agent',
  jsonb_build_object('type','conversation_relay_session','startedAt',p_started_at,'voice_agent_call_id',p_vac,'credit_reservation_id',v_id)) returning id into v_usage;
 update public.crm_voice_credit_reservations set session_started_at=p_started_at,usage_log_id=v_usage,updated_at=clock_timestamp() where organization_id=p_org and id=v_id;
 return v_id;
end;$function$;

-- Duración fijada en el primer cierre. Un saldo insuficiente conserva la deuda, sin sello falso.
create or replace function public.crm_voice_session_settle(p_org integer,p_sid text,p_ended_at timestamptz,p_message_count integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_voice_credit_reservations;v_end timestamptz;v_minutes integer;v_total integer;v_extra integer;v_paid boolean;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_message_count is null or p_message_count not between 0 and 100000 or p_ended_at is null or p_ended_at>clock_timestamp()+interval '5 seconds' then
  raise exception 'cierre_voz_invalido' using errcode='22023';end if;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and provider_call_sid=p_sid;
 if not found then raise exception 'sesion_voz_no_encontrada' using errcode='P0002';end if;
 if v_res.voice_agent_call_id is not null then perform 1 from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id for update;end if;
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=v_res.id for update;
 if v_res.session_started_at is null or p_ended_at<v_res.session_started_at or p_ended_at>v_res.session_started_at+interval '1 day' then
  raise exception 'cierre_voz_invalido' using errcode='22023';end if;
 if v_res.state<>'reserved' then return jsonb_build_object('settled',v_res.state='consumed','applied',false,'minutes_charged',v_res.minutes_charged,'minutes_due',v_res.minutes_due);end if;
 v_end:=coalesce(v_res.session_ended_at,p_ended_at);
 v_minutes:=ceil(extract(epoch from v_end-v_res.session_started_at)/60)::integer;
 v_total:=greatest(v_res.minutes_reserved,v_minutes);v_extra:=greatest(0,v_total-v_res.minutes_reserved);
 v_paid:=v_extra=0 or public.deduct_comm_credits(p_org,'voice',v_extra);
 update public.crm_voice_credit_reservations set session_ended_at=v_end,minutes_due=case when v_paid then 0 else v_extra end,
  state=case when v_paid then 'consumed' else 'reserved' end,settled_at=case when v_paid then clock_timestamp() else null end,
  minutes_charged=case when v_paid then v_total else minutes_charged end,
  metadata=metadata||jsonb_build_object('duration_minutes',v_minutes,'message_count',p_message_count,'settlement_pending',not v_paid),updated_at=clock_timestamp()
  where organization_id=p_org and id=v_res.id;
 if v_paid and v_res.voice_agent_call_id is not null then
  update public.voice_agent_calls set credits_settled_at=clock_timestamp(),updated_at=clock_timestamp() where organization_id=p_org and id=v_res.voice_agent_call_id
   and attempts=v_res.attempt_no and call_id=v_res.call_id;
 end if;
 update public.comm_usage_logs set status=case when v_paid then 'completed' else 'settlement_pending' end,
  credits_used=case when v_paid then v_total else v_res.minutes_charged end,
  metadata=coalesce(metadata,'{}')||jsonb_build_object('endedAt',v_end,'durationMinutes',v_minutes,'creditsReserved',v_res.minutes_reserved,
   'creditsChargedAtHangup',case when v_paid then v_extra else 0 end,'creditsDue',case when v_paid then 0 else v_extra end,'messageCount',p_message_count)
  where organization_id=p_org and id=v_res.usage_log_id;
 if v_paid then
  insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
  values(p_org,'communication.voice_credit_consumed','voice_credit_reservation',v_res.id,jsonb_build_object('units',v_total,'extra_units',v_extra,'call_sid',p_sid),'processed',clock_timestamp());
 end if;
 return jsonb_build_object('settled',v_paid,'applied',true,'minutes_charged',case when v_paid then v_total else v_res.minutes_charged end,'minutes_due',case when v_paid then 0 else v_extra end);
end;$function$;

-- Callback firmado y AccountSid comprobado por Node. El token y el SID atan el estado al intento.
create or replace function public.crm_voice_callback_apply(p_org integer,p_reservation uuid,p_sid text,p_status text,p_duration integer,p_outcome text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_voice_credit_reservations;v_vac public.voice_agent_calls;v_refund boolean:=false;v_terminal boolean;v_physical text;v_current boolean;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_status is null or p_status not in ('in_progress','completed','failed','transferred','no_answer','voicemail','canceled')
  or (p_duration is not null and p_duration not between 0 and 86400) or length(coalesce(p_outcome,''))>500 then
  raise exception 'estado_voz_invalido' using errcode='22023';end if;
 perform public.crm_voice_dispatch_accept(p_org,p_reservation,p_sid);
 select * into v_res from public.crm_voice_credit_reservations where organization_id=p_org and id=p_reservation for update;
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=v_res.voice_agent_call_id for update;
 v_current:=v_vac.attempts=v_res.attempt_no and v_vac.call_id=v_res.call_id;
 if v_res.metadata->>'terminal_status' is not null then
  return jsonb_build_object('applied',false,'refunded',v_res.state='refunded','current_attempt',v_current);end if;
 v_terminal:=p_status in ('completed','failed','transferred','no_answer','voicemail','canceled');
 v_refund:=p_status in ('failed','no_answer','voicemail','canceled') and v_res.session_started_at is null and v_res.state='reserved';
 if v_refund then
  perform public.crm_voice_credit_return_reserved(p_org,v_res.id);
  update public.crm_voice_credit_reservations set state='refunded',minutes_charged=0,settled_at=clock_timestamp(),updated_at=clock_timestamp() where organization_id=p_org and id=v_res.id;
  insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
  values(p_org,'communication.voice_credit_refunded','voice_credit_reservation',v_res.id,jsonb_build_object('units',v_res.minutes_reserved,'reason',p_status,'debited',v_res.debited),'processed',clock_timestamp());
 end if;
 if v_terminal then update public.crm_voice_credit_reservations set metadata=metadata||jsonb_build_object('terminal_status',p_status),updated_at=clock_timestamp() where organization_id=p_org and id=v_res.id;end if;
 if v_current then
  update public.voice_agent_calls set status=p_status,completed_at=case when v_terminal then clock_timestamp() else completed_at end,
   locked_by=case when v_terminal then null else locked_by end,duration_seconds=coalesce(p_duration,duration_seconds),outcome=coalesce(p_outcome,outcome),
   credits_reserved=case when v_refund then 0 else credits_reserved end,credits_settled_at=case when v_refund then clock_timestamp() else credits_settled_at end,
   updated_at=clock_timestamp() where organization_id=p_org and id=v_res.voice_agent_call_id;
 end if;
 v_physical:=case when p_status='transferred' then 'completed' else p_status end;
 update public.calls set status=v_physical,duration_seconds=coalesce(p_duration,duration_seconds),ended_at=case when v_terminal then clock_timestamp() else ended_at end,
  updated_at=clock_timestamp() where organization_id=p_org and id=v_res.call_id;
 return jsonb_build_object('applied',true,'refunded',v_refund,'current_attempt',v_current);
end;$function$;

revoke all on function public.crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.crm_voice_dispatch_begin(integer,uuid) from public,anon,authenticated;
revoke all on function public.crm_voice_dispatch_cancel_prepared(integer,uuid) from public,anon,authenticated;
revoke all on function public.crm_voice_dispatch_accept(integer,uuid,text) from public,anon,authenticated;
revoke all on function public.crm_voice_dispatch_failure(integer,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.crm_voice_session_open(integer,text,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.crm_voice_session_settle(integer,text,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.crm_voice_callback_apply(integer,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb) to service_role;
grant execute on function public.crm_voice_dispatch_begin(integer,uuid) to service_role;
grant execute on function public.crm_voice_dispatch_cancel_prepared(integer,uuid) to service_role;
grant execute on function public.crm_voice_dispatch_accept(integer,uuid,text) to service_role;
grant execute on function public.crm_voice_dispatch_failure(integer,uuid,integer,text) to service_role;
grant execute on function public.crm_voice_session_open(integer,text,uuid,timestamptz,text) to service_role;
grant execute on function public.crm_voice_session_settle(integer,text,timestamptz,integer) to service_role;
grant execute on function public.crm_voice_callback_apply(integer,uuid,text,text,integer,text) to service_role;
