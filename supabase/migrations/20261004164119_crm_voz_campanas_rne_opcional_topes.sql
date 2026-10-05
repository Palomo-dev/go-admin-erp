-- CANDIDATO SIN APLICAR. Ejecución exclusiva por MCP y coordinación con Next/WS.
-- Cuatro funciones existentes; ninguna tabla, policy, fila ni saldo cambia aquí.
-- Se conserva el contrato de main: sin bloqueo RNE/lista, con bajas y consentimiento.
-- Los defaults de nuevas campañas se alinean con las columnas vigentes: 120/40/5.
-- No se elevan las cuotas de ninguna organización ni se reescriben campañas existentes.
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='4s';

DO $crm_voz_guard$
DECLARE v_expected jsonb; v_proc pg_proc; v_oid regprocedure;
BEGIN
 FOR v_expected IN SELECT value FROM jsonb_array_elements($crm_voz_manifest$
[
  {
    "signature": "crm_voice_call_claim_gate(integer,uuid)",
    "before": "3df817b3d239cf71921d2b1eab27313f",
    "after": "9bc16f16567fcc425047b9a24d394297",
    "acl": "{postgres=X/postgres}",
    "config": [
      "search_path=public, pg_temp"
    ],
    "owner": "postgres"
  },
  {
    "signature": "crm_voice_campaign_save(integer,uuid,timestamp with time zone,uuid,jsonb)",
    "before": "bef7609d5e20d8e549a720243e216c49",
    "after": "7d4c4de0098deb3df63f62d30bfac4dd",
    "acl": "{postgres=X/postgres,service_role=X/postgres}",
    "config": [
      "search_path=public, pg_temp"
    ],
    "owner": "postgres"
  },
  {
    "signature": "crm_voice_dispatch_begin(integer,uuid)",
    "before": "42cd5945aab2b81adaabcd513fa58b51",
    "after": "4041ad4a30521d84a5b14504f8ba1013",
    "acl": "{postgres=X/postgres,service_role=X/postgres}",
    "config": [
      "search_path=public, pg_temp"
    ],
    "owner": "postgres"
  },
  {
    "signature": "crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb)",
    "before": "c80e1e48133988ea6a6be46727e29177",
    "after": "46830191e7c178e88cf508677e76eede",
    "acl": "{postgres=X/postgres,service_role=X/postgres}",
    "config": [
      "search_path=public, pg_temp"
    ],
    "owner": "postgres"
  }
]
$crm_voz_manifest$::jsonb) LOOP
  v_oid:=to_regprocedure('public.'||(v_expected->>'signature'));
  IF v_oid IS NULL THEN RAISE EXCEPTION 'crm_voz_funcion_ausente' USING ERRCODE='P0001'; END IF;
  SELECT * INTO STRICT v_proc FROM pg_proc WHERE oid=v_oid;
  IF md5(v_proc.prosrc) NOT IN (v_expected->>'before',v_expected->>'after')
   OR v_proc.proacl::text IS DISTINCT FROM v_expected->>'acl'
   OR to_jsonb(v_proc.proconfig) IS DISTINCT FROM v_expected->'config'
   OR v_proc.proowner::regrole::text IS DISTINCT FROM v_expected->>'owner'
   OR NOT v_proc.prosecdef THEN
   RAISE EXCEPTION 'crm_voz_catalogo_modificado: %',v_expected->>'signature' USING ERRCODE='P0001';
  END IF;
 END LOOP;
END;$crm_voz_guard$;

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
ALTER FUNCTION public.crm_voice_call_claim_gate(integer,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crm_voice_call_claim_gate(integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_voice_call_claim_gate(integer,uuid) TO postgres;

CREATE OR REPLACE FUNCTION public.crm_voice_campaign_save(p_org integer, p_campaign uuid, p_version timestamp with time zone, p_actor uuid, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_previous public.voice_agent_campaigns%rowtype; v_row public.voice_agent_campaigns%rowtype;
 v_config jsonb; v_id uuid; v_ids uuid[]; v_found integer; v_cap integer;
 v_changed boolean; v_activating boolean;
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
    'max_calls_per_day',120,'max_calls_per_hour',40,'max_concurrent',5,'status','draft','emergency_stop',false)||p_values);
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
end $function$;
ALTER FUNCTION public.crm_voice_campaign_save(integer,uuid,timestamp with time zone,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crm_voice_campaign_save(integer,uuid,timestamp with time zone,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_voice_campaign_save(integer,uuid,timestamp with time zone,uuid,jsonb) TO postgres,service_role;

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
end;$function$;
ALTER FUNCTION public.crm_voice_dispatch_begin(integer,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crm_voice_dispatch_begin(integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_voice_dispatch_begin(integer,uuid) TO postgres,service_role;

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
end;$function$;
ALTER FUNCTION public.crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb) TO postgres,service_role;

DO $crm_voz_guard$
DECLARE v_expected jsonb; v_proc pg_proc; v_oid regprocedure;
BEGIN
 FOR v_expected IN SELECT value FROM jsonb_array_elements($crm_voz_manifest$
[
  {
    "signature": "crm_voice_call_claim_gate(integer,uuid)",
    "before": "3df817b3d239cf71921d2b1eab27313f",
    "after": "9bc16f16567fcc425047b9a24d394297",
    "acl": "{postgres=X/postgres}",
    "config": [
      "search_path=public, pg_temp"
    ],
    "owner": "postgres"
  },
  {
    "signature": "crm_voice_campaign_save(integer,uuid,timestamp with time zone,uuid,jsonb)",
    "before": "bef7609d5e20d8e549a720243e216c49",
    "after": "7d4c4de0098deb3df63f62d30bfac4dd",
    "acl": "{postgres=X/postgres,service_role=X/postgres}",
    "config": [
      "search_path=public, pg_temp"
    ],
    "owner": "postgres"
  },
  {
    "signature": "crm_voice_dispatch_begin(integer,uuid)",
    "before": "42cd5945aab2b81adaabcd513fa58b51",
    "after": "4041ad4a30521d84a5b14504f8ba1013",
    "acl": "{postgres=X/postgres,service_role=X/postgres}",
    "config": [
      "search_path=public, pg_temp"
    ],
    "owner": "postgres"
  },
  {
    "signature": "crm_voice_dispatch_prepare(integer,uuid,integer,text,text,boolean,jsonb)",
    "before": "c80e1e48133988ea6a6be46727e29177",
    "after": "46830191e7c178e88cf508677e76eede",
    "acl": "{postgres=X/postgres,service_role=X/postgres}",
    "config": [
      "search_path=public, pg_temp"
    ],
    "owner": "postgres"
  }
]
$crm_voz_manifest$::jsonb) LOOP
  v_oid:=to_regprocedure('public.'||(v_expected->>'signature'));
  IF v_oid IS NULL THEN RAISE EXCEPTION 'crm_voz_funcion_ausente' USING ERRCODE='P0001'; END IF;
  SELECT * INTO STRICT v_proc FROM pg_proc WHERE oid=v_oid;
  IF md5(v_proc.prosrc) NOT IN (v_expected->>'after')
   OR v_proc.proacl::text IS DISTINCT FROM v_expected->>'acl'
   OR to_jsonb(v_proc.proconfig) IS DISTINCT FROM v_expected->'config'
   OR v_proc.proowner::regrole::text IS DISTINCT FROM v_expected->>'owner'
   OR NOT v_proc.prosecdef THEN
   RAISE EXCEPTION 'crm_voz_catalogo_modificado: %',v_expected->>'signature' USING ERRCODE='P0001';
  END IF;
 END LOOP;
END;$crm_voz_guard$;
NOTIFY pgrst,'reload schema';
