-- RNE de voz: evidencia privada de la audiencia y del teléfono comprobado.
-- El servidor usa el evaluador compartido de segmentos y la normalización canónica.
-- No se infiere evidencia para constancias anteriores: requieren una nueva carga.
create table if not exists public.crm_voice_rne_snapshots (
 check_id uuid primary key references public.voice_campaign_rne_checks(id) on delete restrict,
 organization_id integer not null references public.organizations(id) on delete restrict,
 campaign_id uuid not null references public.voice_agent_campaigns(id) on delete restrict,
 checked_at timestamptz not null,
 valid_until timestamptz not null,
 target_source text not null,
 target_config jsonb not null,
 checked_targets integer not null check(checked_targets>=0),
 excluded_targets integer not null check(excluded_targets>=0 and excluded_targets<=checked_targets),
 numbers_in_file integer not null check(numbers_in_file>0),
 file_sha256 text not null check(file_sha256~'^[a-f0-9]{64}$')
);
create index if not exists crm_voice_rne_snapshots_org_campaign on public.crm_voice_rne_snapshots(organization_id,campaign_id,checked_at desc,check_id desc);
create table if not exists public.crm_voice_rne_targets (
 check_id uuid not null references public.crm_voice_rne_snapshots(check_id) on delete restrict,
 organization_id integer not null references public.organizations(id) on delete restrict,
 customer_id uuid not null references public.customers(id) on delete restrict,
 customer_phone text,
 phone_e164 text check(phone_e164 is null or phone_e164~'^\+[1-9][0-9]{9,14}$'),
 excluded boolean not null,
 primary key(check_id,customer_id)
);
alter table public.crm_voice_rne_snapshots enable row level security;
alter table public.crm_voice_rne_targets enable row level security;
drop policy if exists crm_voice_rne_snapshot_own_read on public.crm_voice_rne_snapshots;
create policy crm_voice_rne_snapshot_own_read on public.crm_voice_rne_snapshots for select to authenticated
 using(exists(select 1 from public.organization_members m where m.organization_id=crm_voice_rne_snapshots.organization_id and m.user_id=(select auth.uid()) and m.is_active));
drop policy if exists crm_voice_rne_target_own_read on public.crm_voice_rne_targets;
create policy crm_voice_rne_target_own_read on public.crm_voice_rne_targets for select to authenticated
 using(exists(select 1 from public.organization_members m where m.organization_id=crm_voice_rne_targets.organization_id and m.user_id=(select auth.uid()) and m.is_active));
revoke all on public.crm_voice_rne_snapshots,public.crm_voice_rne_targets from public,anon,authenticated,service_role;
grant select on public.crm_voice_rne_snapshots,public.crm_voice_rne_targets to service_role;

create or replace function public.crm_voice_campaign_rne_snapshot(
 p_org integer,p_campaign uuid,p_version timestamptz,p_numeros text[],p_targets jsonb,
 p_archivo text,p_sha256 text,p_usuario uuid,p_vigencia_dias integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_campaign public.voice_agent_campaigns;v_result jsonb;v_count integer;v_excluded uuid[];v_check uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 perform public.fn_crm_exigir_permiso(p_org,array['crm.campaigns.manage']);
 if p_usuario is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_usuario and is_active) then
  raise exception 'actor_ajeno' using errcode='42501';end if;
 select * into v_campaign from public.voice_agent_campaigns where organization_id=p_org and id=p_campaign and stats->>'archived_at' is null for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if p_version is null or v_campaign.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001';end if;
 if jsonb_typeof(p_targets) is distinct from 'array' or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then
  raise exception 'rne_evidencia_invalida' using errcode='22023';end if;
 -- Bloqueo estable: un cambio de teléfono concurrente no publica una prueba vieja.
 perform c.id from public.customers c join jsonb_to_recordset(p_targets) as t(customer_id uuid,phone text,phone_e164 text)
  on c.id=t.customer_id and c.organization_id=p_org order by c.id for share of c;
 select count(*) into v_count from jsonb_to_recordset(p_targets) as t(customer_id uuid,phone text,phone_e164 text)
  join public.customers c on c.id=t.customer_id and c.organization_id=p_org
  where c.status is distinct from 'merged' and c.phone is not distinct from t.phone
   and (t.phone_e164 is null or t.phone_e164~'^\+[1-9][0-9]{9,14}$');
 if v_count<>jsonb_array_length(p_targets) or v_count<>(select count(distinct customer_id) from jsonb_to_recordset(p_targets) as t(customer_id uuid)) then
  raise exception 'rne_audiencia_modificada' using errcode='P0001';end if;
 -- La pertenencia al archivo se calcula aquí; no se acepta un indicador del cliente.
 select coalesce(array_agg(t.customer_id),'{}'::uuid[]) into v_excluded
  from jsonb_to_recordset(p_targets) as t(customer_id uuid,phone_e164 text)
  join public.crm_rne_valid_numbers(p_numeros) n on n.phone_e164=t.phone_e164;
 v_result:=public.fn_rne_registrar_verificacion(p_org,p_campaign,p_numeros,v_excluded,v_count,p_archivo,p_sha256,p_usuario,p_vigencia_dias);
 v_check:=(v_result->>'check_id')::uuid;
 insert into public.crm_voice_rne_snapshots(check_id,organization_id,campaign_id,checked_at,valid_until,target_source,target_config,checked_targets,excluded_targets,numbers_in_file,file_sha256)
 values(v_check,p_org,p_campaign,(v_result->>'checked_at')::timestamptz,(v_result->>'valid_until')::timestamptz,
  v_campaign.target_source,v_campaign.target_config,v_count,cardinality(v_excluded),(v_result->>'numbers_in_file')::integer,p_sha256);
 insert into public.crm_voice_rne_targets(check_id,organization_id,customer_id,customer_phone,phone_e164,excluded)
 select v_check,p_org,t.customer_id,t.phone,t.phone_e164,t.customer_id=any(v_excluded)
  from jsonb_to_recordset(p_targets) as t(customer_id uuid,phone text,phone_e164 text);
 return v_result;
end;$function$;
revoke all on function public.crm_voice_campaign_rne_snapshot(integer,uuid,timestamptz,text[],jsonb,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.crm_voice_campaign_rne_snapshot(integer,uuid,timestamptz,text[],jsonb,text,text,uuid,integer) to service_role;

-- Privada: los reclamadores y el despacho consultan la misma prueba.
create or replace function public.crm_voice_rne_target_valid(p_org integer,p_campaign uuid,p_customer uuid,p_recipient text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_phone text;
begin
 perform public.fn_assert_acceso_org(p_org);
 select phone into v_phone from public.customers where organization_id=p_org and id=p_customer and status is distinct from 'merged' for share;
 if not found then return false;end if;
 return exists(
  select 1 from (select * from public.voice_campaign_rne_checks
   where organization_id=p_org and campaign_id=p_campaign order by checked_at desc,id desc limit 1) r
  join public.crm_voice_rne_snapshots s on s.check_id=r.id and s.organization_id=p_org and s.campaign_id=p_campaign
  join public.voice_agent_campaigns c on c.id=p_campaign and c.organization_id=p_org
  join public.crm_voice_rne_targets t on t.check_id=s.check_id and t.organization_id=p_org and t.customer_id=p_customer
  where s.valid_until>clock_timestamp() and s.checked_targets>0 and s.numbers_in_file>0
   and s.checked_at=r.checked_at and s.valid_until=r.valid_until and s.checked_targets=r.checked_targets
   and s.excluded_targets=r.excluded_targets and s.numbers_in_file=r.numbers_in_file
   and s.target_source=c.target_source and s.target_config=c.target_config
   and t.customer_phone is not distinct from v_phone and t.phone_e164 is not null and not t.excluded
   and not exists(select 1 from public.crm_excluded_numbers e where e.organization_id=p_org and e.phone_e164=t.phone_e164)
   and (p_recipient is null or p_recipient=t.phone_e164));
end;$function$;
revoke all on function public.crm_voice_rne_target_valid(integer,uuid,uuid,text) from public,anon,authenticated,service_role;

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
 if v_vac.campaign_id is not null and not public.crm_voice_rne_target_valid(p_org,v_vac.campaign_id,v_vac.customer_id) then return false;end if;
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
 if v_campaign_id is not null and not public.crm_voice_rne_target_valid(p_org,v_campaign_id,v_vac.customer_id,p_to) then
  raise exception 'rne_pendiente' using errcode='P0001';end if;
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
 if v_vac.campaign_id is not null and not public.crm_voice_rne_target_valid(p_org,v_vac.campaign_id,v_vac.customer_id,v_res.recipient) then
  raise exception 'rne_pendiente' using errcode='P0001';end if;
 update public.crm_voice_credit_reservations set submission_state='submitting',updated_at=clock_timestamp() where organization_id=p_org and id=p_reservation;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'communication.voice_submission_started','voice_credit_reservation',v_res.id,jsonb_build_object('attempt_no',v_res.attempt_no),'processed',clock_timestamp());
 return true;
end;$function$
;

-- El panel comunica la misma evidencia que bloquea el despacho, sin exponer teléfonos.
create or replace function public.crm_voice_campaign_rne_status(p_org integer,p_campaign uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_row public.voice_campaign_rne_checks;v_snapshot public.crm_voice_rne_snapshots;v_campaign public.voice_agent_campaigns;
 v_changed integer;v_available boolean;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view','crm.campaigns.manage']);
 select * into v_campaign from public.voice_agent_campaigns where organization_id=p_org and id=p_campaign and stats->>'archived_at' is null;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 select * into v_row from public.voice_campaign_rne_checks where organization_id=p_org and campaign_id=p_campaign order by checked_at desc,id desc limit 1;
 if not found then return null;end if;
 select * into v_snapshot from public.crm_voice_rne_snapshots where organization_id=p_org and campaign_id=p_campaign and check_id=v_row.id;
 v_available:=found and v_snapshot.checked_at=v_row.checked_at and v_snapshot.valid_until=v_row.valid_until
  and v_snapshot.checked_targets=v_row.checked_targets and v_snapshot.excluded_targets=v_row.excluded_targets
  and v_snapshot.numbers_in_file=v_row.numbers_in_file;
 select count(*) into v_changed from public.crm_voice_rne_targets t left join public.customers c
  on c.organization_id=p_org and c.id=t.customer_id and c.status is distinct from 'merged'
  where t.organization_id=p_org and t.check_id=v_row.id and (c.id is null or c.phone is distinct from t.customer_phone);
 return jsonb_build_object('id',v_row.id,'checked_at',v_row.checked_at,'valid_until',v_row.valid_until,'file_name',v_row.file_name,
  'numbers_in_file',v_row.numbers_in_file,'checked_targets',v_row.checked_targets,'excluded_targets',v_row.excluded_targets,'skipped_calls',v_row.skipped_calls,
  'evidence_available',coalesce(v_available,false),'changed_targets',v_changed,
  'audience_unchanged',coalesce(v_available and v_changed=0 and v_snapshot.target_source=v_campaign.target_source and v_snapshot.target_config=v_campaign.target_config,false));
end;$function$;
revoke all on function public.crm_voice_campaign_rne_status(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_voice_campaign_rne_status(integer,uuid) to authenticated,service_role;

-- Orden real de verificaciones sucesivas dentro de una transacción.
CREATE OR REPLACE FUNCTION public.fn_rne_registrar_verificacion(p_org integer, p_campaign uuid, p_numeros text[], p_clientes_excluidos uuid[], p_objetivos_revisados integer, p_archivo text, p_sha256 text, p_usuario uuid, p_vigencia_dias integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_check_id uuid;
  v_ahora timestamptz := clock_timestamp();
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
