-- Turno privado de contacto: un reservado es incertidumbre, nunca contacto efectivo.
create table if not exists public.crm_contact_legal_dispatches(
 message_id uuid primary key references public.messages(id)on delete cascade,
 organization_id integer not null references public.organizations(id)on delete cascade,
 customer_id uuid not null references public.customers(id)on delete cascade,
 channel_id uuid not null references public.channels(id)on delete cascade,
 dispatch_token uuid not null,
 phone_e164 text,
 state text not null check(state in('reserved','confirmed','released','deferred')),
 week_from timestamptz,week_until timestamptz,
 deferred_at timestamptz,job_id uuid references public.outbound_jobs(id)on delete set null,
 reason text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.crm_contact_legal_dispatches enable row level security;
revoke all on public.crm_contact_legal_dispatches from public,anon,authenticated;
grant all on public.crm_contact_legal_dispatches to service_role;
do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='public'and tablename='crm_contact_legal_dispatches'and policyname='crm_turnos_contacto_privados')then
  create policy crm_turnos_contacto_privados on public.crm_contact_legal_dispatches for all to authenticated using(false)with check(false);
 end if;
end $policy$;
create index if not exists idx_crm_legal_org_cliente on public.crm_contact_legal_dispatches(organization_id,customer_id,state);
create index if not exists idx_crm_legal_cliente_fk on public.crm_contact_legal_dispatches(customer_id);
create index if not exists idx_crm_legal_canal_fk on public.crm_contact_legal_dispatches(channel_id);
create index if not exists idx_crm_legal_job_fk on public.crm_contact_legal_dispatches(job_id);

CREATE OR REPLACE FUNCTION public.crm_message_contact_gate(p_org integer, p_message uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_message public.messages;v_customer uuid;v_type text;v_purpose text:='utility';v_template text;v_category text;v_campaign text;v_campaign_purpose text;v_template_row public.templates;v_campaign_status text;v_campaign_state text;v_campaign_schedule timestamptz;v_compliance jsonb;
begin
 perform public.fn_assert_acceso_org(p_org);
 select * into v_message from public.messages where organization_id=p_org and id=p_message;
 if not found then return jsonb_build_object('allowed',false,'reason','message_not_found');end if;
 select q.customer_id,c.type into v_customer,v_type from public.conversations q
 join public.channels c on c.id=q.channel_id and c.organization_id=q.organization_id
 where q.id=v_message.conversation_id and q.organization_id=p_org and q.channel_id=v_message.channel_id;
 if not found then return jsonb_build_object('allowed',false,'reason','conversation_not_found');end if;
 if v_type<>'whatsapp' then return jsonb_build_object('allowed',true,'purpose','utility','customer_id',v_customer);end if;
 if v_message.direction='outbound' then
  if lower(coalesce(v_message.metadata->>'category',v_message.payload->>'category',''))='marketing'
   or exists(select 1 from public.crm_whatsapp_credit_reservations r where r.organization_id=p_org and r.message_id=p_message and r.metadata->>'contact_purpose'='marketing') then v_purpose:='marketing';end if;
  v_template:=coalesce(nullif(v_message.metadata->>'template_id',''),nullif(v_message.payload->>'template_id',''));
  if v_message.content_type='template' then
   select * into v_template_row from public.templates t
    where t.organization_id=p_org and t.channel='whatsapp' and t.is_active and t.metadata->>'status'='APPROVED'
      and ((v_template is not null and t.id::text=v_template)
        or (v_template is null and t.name=v_message.payload#>>'{template,name}'
          and coalesce(t.metadata->>'language','es')=v_message.payload#>>'{template,language,code}'))
    order by t.id limit 1;
   if not found then return jsonb_build_object('allowed',false,'reason','template_not_verified');end if;
   v_category:=lower(v_template_row.metadata->>'category');
   if v_category is null or v_category not in('marketing','utility','authentication')
     or v_message.payload#>>'{template,name}' is distinct from v_template_row.name
     or v_message.payload#>>'{template,language,code}' is distinct from coalesce(v_template_row.metadata->>'language','es')
     or (nullif(v_template_row.metadata->>'channel_id','') is not null and v_template_row.metadata->>'channel_id'<>v_message.channel_id::text)
     or (v_message.payload#>>'{twilio,content_sid}' is not null
       and v_message.payload#>>'{twilio,content_sid}' is distinct from v_template_row.metadata#>>'{twilio,content_sid}') then
    return jsonb_build_object('allowed',false,'reason','template_not_verified');end if;
   if v_category='marketing' then v_purpose:='marketing';end if;
  end if;
  v_campaign:=coalesce((select r.campaign_id::text from public.crm_whatsapp_credit_reservations r where r.organization_id=p_org and r.message_id=p_message),nullif(v_message.metadata->>'campaign_id',''));
  if v_campaign is not null then
   select statistics->>'purpose',status,statistics->>'state',scheduled_at into v_campaign_purpose,v_campaign_status,v_campaign_state,v_campaign_schedule from public.campaigns where organization_id=p_org and id::text=v_campaign and channel='whatsapp';
   if not found then return jsonb_build_object('allowed',false,'reason','campaign_not_found');end if;
   v_compliance:=public.crm_campaign_compliance_snapshot(p_org,v_campaign::uuid);
   if v_compliance->>'allowed'is distinct from 'true'then return jsonb_build_object('allowed',false,'reason',v_compliance->>'reason','customer_id',v_customer,'purpose',v_purpose);end if;
   if coalesce(v_campaign_status,'') not in('sending','scheduled') or nullif(v_campaign_state,'') is not null or v_campaign_schedule>clock_timestamp() then
    return jsonb_build_object('allowed',false,'reason','campaign_not_active');end if;
   if v_campaign_purpose='marketing' then v_purpose:='marketing';end if;
  end if;
 end if;
 if not public.fn_can_contact(p_org,v_customer,'whatsapp',v_purpose) then
  return jsonb_build_object('allowed',false,'reason','consent_blocked','purpose',v_purpose,'customer_id',v_customer);
 end if;
 return jsonb_build_object('allowed',true,'purpose',v_purpose,'customer_id',v_customer);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_prepare_whatsapp_outbound(p_org integer, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_customer uuid;v_channel uuid;v_opportunity uuid;v_preferred uuid;v_conv uuid;v_actor uuid;v_member bigint;
 v_campaign uuid;v_contact uuid;v_res_id uuid;v_res public.crm_whatsapp_credit_reservations;
 v_message public.messages;v_id uuid:=gen_random_uuid();v_activity uuid;v_key text;v_client_key text;v_fingerprint text;
 v_content text;v_content_type text;v_role text;v_source text;v_payload jsonb;v_meta jsonb;v_gate jsonb;v_campaign_row public.campaigns;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>200000 then raise exception 'solicitud_invalida' using errcode='22023';end if;
 v_customer:=(p_request->>'customer_id')::uuid;v_channel:=(p_request->>'channel_id')::uuid;
 v_opportunity:=nullif(p_request->>'opportunity_id','')::uuid;v_preferred:=nullif(p_request->>'conversation_id','')::uuid;
 v_actor:=nullif(p_request->>'sender_user_id','')::uuid;v_member:=nullif(p_request->>'sender_member_id','')::bigint;
 v_campaign:=nullif(p_request->>'campaign_id','')::uuid;v_client_key:=nullif(p_request->>'client_request_id','');
 v_content:=p_request->>'content';v_content_type:=p_request->>'content_type';v_role:=coalesce(p_request->>'role','agent');
 v_source:=coalesce(p_request->>'source','crm');v_payload:=p_request->'payload';
 if v_customer is null or v_channel is null or v_content is null or length(v_content) not between 1 and 4096
  or v_content_type is null or v_content_type not in('text','template','image','file') or v_role not in('agent','ai')
  or coalesce(p_request->>'purpose','utility') not in('utility','marketing')
  or jsonb_typeof(v_payload) is distinct from 'object'
  or length(coalesce(v_client_key,''))>220 or coalesce(p_request->>'recipient','')!~'^[1-9][0-9]{9,14}$'
  or v_source not in('crm','campaign','sequence','agent','bulk','platform_send')
  or ((v_source='campaign')<>(v_campaign is not null)) then raise exception 'solicitud_invalida' using errcode='22023';end if;
 if not exists(select 1 from public.customers where organization_id=p_org and id=v_customer and status is distinct from 'merged') then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
 if not exists(select 1 from public.channels where organization_id=p_org and id=v_channel and type='whatsapp' and status='active') then raise exception 'canal_no_disponible' using errcode='P0001';end if;
 if v_actor is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=v_actor and is_active) then raise exception 'actor_ajeno' using errcode='42501';end if;
 if v_member is not null and not exists(select 1 from public.organization_members where organization_id=p_org and id=v_member and is_active and (v_actor is null or user_id=v_actor)) then raise exception 'miembro_ajeno' using errcode='42501';end if;
 if v_opportunity is not null and not exists(select 1 from public.opportunities where organization_id=p_org and id=v_opportunity and customer_id=v_customer) then raise exception 'oportunidad_no_encontrada' using errcode='P0002';end if;
 if v_preferred is not null then
  select id into v_conv from public.conversations where organization_id=p_org and id=v_preferred and channel_id=v_channel and customer_id=v_customer;
  if not found then raise exception 'conversacion_no_encontrada' using errcode='P0002';end if;
 end if;
 if v_campaign is not null then
  select * into v_campaign_row from public.campaigns where organization_id=p_org and id=v_campaign and channel='whatsapp' for update;
  if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
  if v_campaign_row.status not in('sending','scheduled') or nullif(v_campaign_row.statistics->>'state','') is not null
   or (v_campaign_row.scheduled_at is not null and v_campaign_row.scheduled_at>clock_timestamp()) then raise exception 'campana_no_activa' using errcode='P0001';end if;
  perform public.crm_require_campaign_compliance(p_org,v_campaign);
  if v_campaign_row.statistics->>'channel_id' is distinct from v_channel::text then raise exception 'canal_campana_invalido' using errcode='P0001';end if;
  select id into v_contact from public.campaign_contacts where campaign_id=v_campaign and customer_id=v_customer for update;
  if not found then raise exception 'contacto_campana_no_encontrado' using errcode='P0002';end if;
  v_key:='campaign:'||v_campaign::text||':'||v_customer::text;
  if v_client_key is distinct from v_key then raise exception 'clave_campana_invalida' using errcode='22023';end if;
 else v_key:='message:'||coalesce(v_client_key,v_id::text);
 end if;
 v_fingerprint:=md5((p_request-'window_open'-'recipient'-'campaign_claim_token')::text);
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and idempotency_key=v_key for update;
 if found and v_res.message_id is not null then
  if v_res.metadata->>'request_fingerprint' is distinct from v_fingerprint then raise exception 'clave_solicitud_conflictiva' using errcode='P0001';end if;
  select * into v_message from public.messages where organization_id=p_org and id=v_res.message_id and channel_id=v_channel
   and exists(select 1 from public.conversations c where c.organization_id=p_org and c.id=messages.conversation_id and c.customer_id=v_customer);
  if not found then raise exception 'mensaje_reserva_no_disponible' using errcode='P0001';end if;
  return jsonb_build_object('message_id',v_message.id,'conversation_id',v_message.conversation_id,'activity_id',v_res.metadata->'activity_id',
   'customer_id',v_customer,'channel_id',v_channel,'scheduled',false,'duplicate',true);
 end if;
 if found and v_res.metadata->>'message_attached'='true' then raise exception 'mensaje_reserva_no_disponible' using errcode='P0001';end if;
 -- Compatibilidad: las claves anteriores no generan un segundo mensaje ni un nuevo débito.
 if v_client_key is not null and not coalesce(v_res.state='reserved' and v_res.metadata->>'retry_receipt_id' is not null,false) then
  select * into v_message from public.messages where organization_id=p_org and direction='outbound' and metadata->>'client_request_id'=v_client_key order by created_at,id limit 1;
  if found then
   if v_message.channel_id is distinct from v_channel or not exists(select 1 from public.conversations where organization_id=p_org and id=v_message.conversation_id and customer_id=v_customer) then raise exception 'clave_solicitud_conflictiva' using errcode='P0001';end if;
   return jsonb_build_object('message_id',v_message.id,'conversation_id',v_message.conversation_id,'activity_id',null,
    'customer_id',v_customer,'channel_id',v_channel,'scheduled',false,'duplicate',true);
  end if;
 end if;
 if v_campaign is not null and not exists(select 1 from public.campaign_contacts where campaign_id=v_campaign and id=v_contact
  and state='queued' and sent_at is null and nullif(metadata->>'claim_token','') is not null
  and metadata->>'claim_token'=p_request->>'campaign_claim_token') then raise exception 'reserva_contacto_desactualizada' using errcode='P0001';end if;
 v_res_id:=public.crm_reserve_whatsapp_credit(p_org,v_key,v_campaign,v_contact,v_actor);
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and id=v_res_id for update;
 if v_res.state<>'reserved' then raise exception 'reserva_no_disponible' using errcode='P0001';end if;
 if v_conv is null then
  select id into v_conv from public.conversations where organization_id=p_org and channel_id=v_channel and customer_id=v_customer and status in('open','pending')
   order by last_message_at desc nulls last,id limit 1;
 end if;
 if v_conv is null then
  insert into public.conversations(organization_id,channel_id,customer_id,status,priority,assigned_member_id,metadata)
  values(p_org,v_channel,v_customer,'open','normal',v_member,jsonb_build_object('source','crm','opportunity_id',v_opportunity)) returning id into v_conv;
 end if;
 v_meta:=jsonb_build_object('source',v_source,'to',p_request->>'recipient','template_id',p_request->'template_id','category',case when p_request->>'purpose'='marketing' then to_jsonb('marketing'::text) else p_request->'category' end,
  'campaign_id',v_campaign,'client_request_id',v_client_key,'sent_by_user_id',v_actor,'window_open',p_request->'window_open','provider',p_request->>'provider','credit_reservation_id',v_res_id);
 insert into public.messages(id,organization_id,conversation_id,channel_id,direction,role,sender_member_id,content_type,content,payload,is_read,related_opportunity_id,metadata)
 values(v_id,p_org,v_conv,v_channel,'outbound',v_role,v_member,v_content_type,v_content,v_payload,true,v_opportunity,v_meta);
 v_gate:=public.crm_message_contact_gate(p_org,v_id);
 if v_gate->>'allowed' is distinct from 'true' then raise exception 'contacto_bloqueado:%',v_gate->>'reason' using errcode='P0001';end if;
 insert into public.activities(organization_id,activity_type,channel,outcome,user_id,notes,related_type,related_id,message_id,conversation_id,metadata)
 values(p_org,'whatsapp','whatsapp','queued',v_actor,'WhatsApp pendiente: '||left(v_content,500),case when v_opportunity is null then 'customer' else 'opportunity' end,
  coalesce(v_opportunity,v_customer),v_id,v_conv,jsonb_build_object('direction','outbound','content_type',v_content_type,'customer_id',v_customer,'campaign_id',v_campaign,'template_id',p_request->'template_id','message_id',v_id))
 returning id into v_activity;
 insert into public.comm_usage_logs(organization_id,channel,credits_used,recipient,status,direction,module,metadata)
 values(p_org,'whatsapp',0,p_request->>'recipient','queued','outbound',case when v_campaign is null then 'crm' else 'campaign' end,
  jsonb_build_object('message_id',v_id,'campaign_id',v_campaign,'category',p_request->'category','template_id',p_request->'template_id','provider',p_request->>'provider','credit_reservation_id',v_res_id));
 update public.crm_whatsapp_credit_reservations set message_id=v_id,metadata=metadata||jsonb_build_object('message_attached',true,'safe_to_refund',false,
  'dispatch_confirmed',false,'request_fingerprint',v_fingerprint,'activity_id',v_activity,'contact_purpose',case when p_request->>'purpose'='marketing' then 'marketing' else 'utility' end)
 where organization_id=p_org and id=v_res_id;
 if v_contact is not null then
  update public.campaign_contacts set state='queued',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','queued','message_id',v_id,'conversation_id',v_conv,'credit_reservation_id',v_res_id)
  where id=v_contact and campaign_id=v_campaign;
 end if;
 return jsonb_build_object('message_id',v_id,'conversation_id',v_conv,'activity_id',v_activity,'customer_id',v_customer,'channel_id',v_channel,'scheduled',false,'duplicate',false);
end;$function$
;

create or replace function public.crm_message_legal_context(p_org integer,p_message uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_row record;v_gate jsonb;v_identity text;v_settings jsonb;v_policy text;v_required boolean;
begin
 perform public.fn_assert_acceso_org(p_org);
 select m.direction,m.metadata,q.customer_id,m.channel_id,c.type,u.phone,u.timezone into v_row
 from public.messages m join public.conversations q on q.id=m.conversation_id and q.organization_id=m.organization_id and q.channel_id=m.channel_id
 join public.channels c on c.id=m.channel_id and c.organization_id=m.organization_id
 join public.customers u on u.id=q.customer_id and u.organization_id=m.organization_id
 where m.id=p_message and m.organization_id=p_org;
 if not found then raise exception 'mensaje_no_encontrado'using errcode='P0002';end if;
 v_gate:=public.crm_message_contact_gate(p_org,p_message);
 v_required:=v_row.type='whatsapp'and v_row.direction='outbound'and
  (v_gate->>'purpose'='marketing'or nullif(v_row.metadata->>'campaign_id','')is not null
   or exists(select 1 from public.crm_whatsapp_credit_reservations r where r.organization_id=p_org and r.message_id=p_message and r.campaign_id is not null));
 select nullif(identity_value,'')into v_identity from public.customer_channel_identities
 where organization_id=p_org and customer_id=v_row.customer_id and channel_id=v_row.channel_id and identity_type='whatsapp_phone'
 order by created_at desc,id limit 1;
 select settings into v_settings from public.provider_configs where organization_id=p_org and category='whatsapp'order by priority,id limit 1;
 select data_policy_url into v_policy from public.comm_settings where organization_id=p_org;
 if v_required and v_policy is null then v_gate:=jsonb_build_object('allowed',false,'reason','data_policy_required');end if;
 return jsonb_build_object('gate',v_gate,'required',coalesce(v_required,false),'customer_id',v_row.customer_id,'channel_id',v_row.channel_id,
  'phone_raw',coalesce(v_identity,v_row.phone),'identity_raw',v_identity is not null,'timezone',v_row.timezone,
  'default_country_code',v_settings->'default_country_code','allowed_hours',v_settings->'allowed_hours',
  'server_now',clock_timestamp());
end;$function$;
revoke all on function public.crm_message_legal_context(integer,uuid)from public,anon,authenticated;
grant execute on function public.crm_message_legal_context(integer,uuid)to service_role;

create or replace function public.crm_reserve_legal_contact(p_org integer,p_message uuid,p_token uuid,p_raw text,p_phone text,p_zone text,
 p_from timestamptz,p_until timestamptz,p_open timestamptz,p_close timestamptz,p_limits jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_msg public.messages;v_ctx jsonb;v_slot public.crm_contact_legal_dispatches;v_counts jsonb;v_canal integer;v_total integer;v_test boolean;
 v_now timestamptz;v_max_canal integer;v_max_total integer;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_msg from public.messages where organization_id=p_org and id=p_message for update;
 if not found then raise exception 'mensaje_no_encontrado'using errcode='P0002';end if;
 if p_token is null or v_msg.metadata->>'dispatch_token'is distinct from p_token::text or v_msg.metadata->>'dispatch_state'is distinct from 'processing'
 then raise exception 'reserva_despacho_invalida'using errcode='P0001';end if;
 v_ctx:=public.crm_message_legal_context(p_org,p_message);
 if v_ctx#>>'{gate,allowed}'is distinct from 'true'then return jsonb_build_object('allowed',false,'reason',v_ctx#>>'{gate,reason}');end if;
 if v_ctx->>'required'is distinct from 'true'then return jsonb_build_object('allowed',true,'required',false);end if;
 if v_ctx->>'phone_raw'is distinct from p_raw then return jsonb_build_object('allowed',false,'reason','recipient_changed');end if;
 if p_phone is null or p_phone!~'^[+][1-9][0-9]{7,14}$'or p_zone is null
  or not exists(select 1 from pg_timezone_names where name=p_zone)or p_from is null or p_until is null or p_open is null or p_close is null
  or not isfinite(p_from)or not isfinite(p_until)or not isfinite(p_open)or not isfinite(p_close)
  or p_open>=p_close or p_close-p_open>interval '1 day'or jsonb_typeof(p_limits)is distinct from 'object'
 then raise exception 'contexto_legal_invalido'using errcode='22023';end if;
 v_now:=clock_timestamp();
 if p_from is distinct from (date_trunc('week',v_now at time zone p_zone)at time zone p_zone)
  or p_until is distinct from ((date_trunc('week',v_now at time zone p_zone)+interval '7 days')at time zone p_zone)
  or v_now<p_open or v_now>=p_close then return jsonb_build_object('allowed',false,'reason','window_changed','server_now',v_now);end if;
 if exists(select 1 from public.crm_excluded_numbers where organization_id=p_org and phone_e164=p_phone)
 then return jsonb_build_object('allowed',false,'reason','rne_excluded');end if;
 v_max_canal:=(p_limits->>'channel')::integer;v_max_total:=(p_limits->>'total')::integer;
 if v_max_canal is null or v_max_total is null or v_max_canal not between 1 and 100 or v_max_total not between 1 and 100
 then raise exception 'topes_legales_invalidos'using errcode='22023';end if;
 select * into v_slot from public.crm_contact_legal_dispatches where organization_id=p_org and message_id=p_message for update;
 if found and v_slot.state='reserved'then
  if v_slot.dispatch_token=p_token and v_slot.phone_e164=p_phone then return jsonb_build_object('allowed',true,'duplicate',true);end if;
  return jsonb_build_object('allowed',false,'reason','dispatch_unresolved');
 end if;
 v_test:=public.fn_voz_es_numero_prueba(p_org,p_phone);
 -- Se suman turnos inciertos a la capacidad, sin incorporarlos al conteo efectivo.
 select coalesce(jsonb_object_agg(canal,n),'{}')into v_counts from(
  select canal,sum(contactos)::integer n from(
   select * from public.fn_contactos_efectivos_semana(p_org,(v_ctx->>'customer_id')::uuid,p_from,p_until)
   union all select 'whatsapp',count(*)::integer from public.crm_contact_legal_dispatches
    where organization_id=p_org and customer_id=(v_ctx->>'customer_id')::uuid and state='reserved'
  )counts group by canal
 )totals;
 v_canal:=coalesce((v_counts->>'whatsapp')::integer,0);
 select coalesce(sum(value::integer),0)into v_total from jsonb_each_text(v_counts);
 if not v_test and(v_canal>=v_max_canal or v_total>=v_max_total)
 then return jsonb_build_object('allowed',false,'reason','weekly_capacity','counts',v_counts);end if;
 insert into public.crm_contact_legal_dispatches(message_id,organization_id,customer_id,channel_id,dispatch_token,phone_e164,state,week_from,week_until)
 values(p_message,p_org,(v_ctx->>'customer_id')::uuid,(v_ctx->>'channel_id')::uuid,p_token,p_phone,'reserved',p_from,p_until)
 on conflict(message_id)do update set dispatch_token=excluded.dispatch_token,phone_e164=excluded.phone_e164,state='reserved',
  week_from=excluded.week_from,week_until=excluded.week_until,reason=null,updated_at=v_now
 where crm_contact_legal_dispatches.organization_id=excluded.organization_id and crm_contact_legal_dispatches.customer_id=excluded.customer_id
  and crm_contact_legal_dispatches.channel_id=excluded.channel_id and crm_contact_legal_dispatches.state in('released','deferred');
 if not found then raise exception 'turno_legal_conflictivo'using errcode='P0001';end if;
 return jsonb_build_object('allowed',true,'exemption',case when v_test then 'numero_prueba'end);
end;$function$;
revoke all on function public.crm_reserve_legal_contact(integer,uuid,uuid,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,jsonb)from public,anon,authenticated;
grant execute on function public.crm_reserve_legal_contact(integer,uuid,uuid,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,jsonb)to service_role;

CREATE OR REPLACE FUNCTION public.crm_record_effective_dispatch(p_org integer, p_message uuid, p_state text, p_external text, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_message public.messages;v_conv uuid;v_at timestamptz;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_state is null or p_state not in('sent','delivered','read','failed') or p_at is null
  or (p_state<>'failed' and nullif(p_external,'') is null) then raise exception 'despacho_efectivo_invalido' using errcode='22023';end if;
 select m.* into v_message from public.messages m
 join public.conversations cv on cv.id=m.conversation_id and cv.organization_id=m.organization_id and cv.channel_id=m.channel_id
 join public.channels ch on ch.id=m.channel_id and ch.organization_id=m.organization_id
 join public.customers u on u.id=cv.customer_id and u.organization_id=m.organization_id
 where m.id=p_message and m.organization_id=p_org and m.direction='outbound';
 if not found then raise exception 'mensaje_no_encontrado' using errcode='P0002';end if;
 if p_external is not null and v_message.external_message_id is distinct from p_external then raise exception 'referencia_despacho_invalida' using errcode='P0001';end if;
 -- Una fecha de proveedor anómala no permite eludir la semana vigente.
 v_at:=least(clock_timestamp(),greatest(coalesce(v_message.created_at,p_at),p_at));
 insert into public.crm_message_dispatch_receipts(message_id,organization_id,conversation_id,channel_id,provider_external_id,state,confirmed_at)
 values(p_message,p_org,v_message.conversation_id,v_message.channel_id,p_external,p_state,v_at)
 on conflict(message_id)do update set
  state=case when crm_message_dispatch_receipts.state='read' then 'read'
   when excluded.state='read' then 'read'
   when crm_message_dispatch_receipts.state='delivered' or excluded.state='delivered' then 'delivered'
   when crm_message_dispatch_receipts.state='failed' or excluded.state='failed' then 'failed' else 'sent' end,
  provider_external_id=coalesce(crm_message_dispatch_receipts.provider_external_id,excluded.provider_external_id),
  confirmed_at=least(crm_message_dispatch_receipts.confirmed_at,excluded.confirmed_at)
 where crm_message_dispatch_receipts.organization_id=excluded.organization_id
  and crm_message_dispatch_receipts.conversation_id=excluded.conversation_id and crm_message_dispatch_receipts.channel_id=excluded.channel_id;
 if not found then raise exception 'contexto_despacho_conflictivo' using errcode='P0001';end if;
end;$function$
;

create or replace function public.crm_legal_dispatch_receipt_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
begin
 perform public.crm_lock_comm_wallet(new.organization_id);
 update public.crm_contact_legal_dispatches set state=case when new.state in('sent','delivered','read')then 'confirmed'else 'released'end,updated_at=clock_timestamp()
 where organization_id=new.organization_id and message_id=new.message_id;
 return new;
end;$function$;
revoke all on function public.crm_legal_dispatch_receipt_trigger()from public,anon,authenticated;
do $trigger$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.crm_message_dispatch_receipts'::regclass and tgname='trg_crm_legal_dispatch_receipt')then
  create trigger trg_crm_legal_dispatch_receipt after insert or update on public.crm_message_dispatch_receipts
  for each row execute function public.crm_legal_dispatch_receipt_trigger();
 end if;
end $trigger$;
alter table public.crm_message_dispatch_receipts enable trigger trg_crm_legal_dispatch_receipt;

CREATE OR REPLACE FUNCTION public.crm_finish_message_dispatch(p_org integer, p_message uuid, p_token uuid, p_status text, p_channel text, p_external_id text, p_error_code text, p_error text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_message public.messages;v_now timestamptz:=clock_timestamp();v_res public.crm_whatsapp_credit_reservations;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_token is null or p_status is null or p_status not in('sent','failed','uncertain','deferred')
  or p_channel is null or length(p_channel) not between 1 and 80
  or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>200000
  or (p_status='sent' and nullif(p_external_id,'') is null) then raise exception 'resultado_despacho_invalido' using errcode='22023';end if;
 select * into v_message from public.messages where organization_id=p_org and id=p_message for update;
 if not found then raise exception 'mensaje_no_encontrado' using errcode='P0002';end if;
 if v_message.metadata->>'dispatch_token' is distinct from p_token::text then raise exception 'reserva_despacho_invalida' using errcode='P0001';end if;
 if v_message.metadata->>'dispatch_state' is distinct from 'processing' then
  if v_message.metadata->>'dispatch_state'=p_status or exists(select 1 from public.crm_whatsapp_credit_reservations r where r.organization_id=p_org and r.message_id=p_message and r.metadata->>'last_dispatch_state'=p_status and r.metadata->>'provider_dispatch_token'=p_token::text) then return jsonb_build_object('already_applied',true);end if;
  raise exception 'resultado_despacho_conflictivo' using errcode='P0001';end if;
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and message_id=p_message for update;
 if found and v_message.metadata->>'credit_reservation_id' is distinct from v_res.id::text then raise exception 'mensaje_reserva_invalido' using errcode='P0001';end if;
 if v_res.id is not null and v_res.state<>'reserved' then raise exception 'reserva_no_disponible' using errcode='P0001';end if;
 if v_res.id is null and nullif(v_message.metadata->>'credit_reservation_id','') is not null then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 if p_status<>'deferred' then
  insert into public.message_events(organization_id,message_id,event_type,provider_payload,error_code,error_message)
  values(p_org,p_message,case when p_status='sent' then 'sent' else 'failed' end,p_payload,
   case when p_status='sent' then null else left(coalesce(p_error_code,'DISPATCH_UNCERTAIN'),120) end,
   case when p_status='sent' then null else left(coalesce(p_error,'Resultado no confirmado; requiere conciliación antes de reenviar.'),1000) end);
 end if;
 update public.messages set external_message_id=coalesce(nullif(p_external_id,''),external_message_id),
  metadata=coalesce(metadata,'{}')||jsonb_build_object('dispatch_state',p_status,'dispatched',p_status='sent',
   'dispatch_pending',p_status='deferred','dispatch_channel',p_channel,'external_message_id',nullif(p_external_id,''),
   'dispatch_error',case when p_status='sent' then null else left(p_error,1000) end,
   'dispatch_error_code',case when p_status='sent' then null else left(p_error_code,120) end,'dispatched_at',v_now)
 where organization_id=p_org and id=p_message;
 if v_res.id is not null then
  update public.crm_whatsapp_credit_reservations set metadata=metadata||jsonb_build_object('dispatch_confirmed',p_status='sent','safe_to_refund',p_status='failed','last_dispatch_state',p_status,'provider_external_id',nullif(p_external_id,''),'provider_channel_id',v_message.channel_id,'provider_dispatch_token',p_token)
   where organization_id=p_org and id=v_res.id and message_id=p_message;
  if p_status='sent' then perform public.crm_consume_whatsapp_credit(p_org,v_res.id,p_message);
  elsif p_status='failed' then perform public.crm_refund_whatsapp_credit(p_org,v_res.id,coalesce(nullif(left(p_error,900),''),'Envío rechazado antes de confirmación'));
  end if;
  update public.comm_usage_logs set status=p_status,credits_used=case when p_status='sent' then 1 else 0 end,
   metadata=coalesce(metadata,'{}')||jsonb_build_object('dispatch_state',p_status,'error_code',p_error_code)
   where organization_id=p_org and channel='whatsapp' and metadata->>'credit_reservation_id'=v_res.id::text and metadata->>'message_id'=p_message::text;
  update public.activities set outcome=case when p_status='sent' then 'sent' when p_status='failed' then 'failed' else 'queued' end,
   metadata=coalesce(metadata,'{}')||jsonb_build_object('dispatch_state',p_status)
   where organization_id=p_org and message_id=p_message and activity_type='whatsapp';
  if v_res.contact_id is not null and v_res.campaign_id is not null then
   update public.campaign_contacts set state=case when p_status='sent' then 'sent' when p_status='failed' then 'failed' else 'queued' end,
    sent_at=case when p_status='sent' then coalesce(sent_at,v_now) else sent_at end,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('state',case when p_status='sent' then 'sent' when p_status='failed' then 'failed' else 'queued' end,
     'dispatch_state',p_status,'error_code',case when p_status='sent' then null else p_error_code end,'error_message',case when p_status='sent' then null else p_error end)
    where id=v_res.contact_id and campaign_id=v_res.campaign_id and metadata->>'message_id'=p_message::text;
   update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('counts',public.crm_campaign_contact_counts(p_org,v_res.campaign_id))
    where id=v_res.campaign_id and organization_id=p_org;
  end if;
 end if;
 if p_status='deferred' then update public.crm_contact_legal_dispatches set state='released',updated_at=v_now
  where organization_id=p_org and message_id=p_message and dispatch_token=p_token and state='reserved';end if;
 if p_status in('sent','failed') then perform public.crm_record_effective_dispatch(p_org,p_message,p_status,nullif(p_external_id,''),v_now);end if;
 if p_external_id is not null then perform public.crm_reconcile_provider_status(p_org,p_message,null);end if;
 return jsonb_build_object('already_applied',false,'status',p_status);
end;$function$
;

create or replace function public.crm_defer_message_legal(p_org integer,p_message uuid,p_token uuid,p_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_msg public.messages;v_ctx jsonb;v_slot public.crm_contact_legal_dispatches;v_job uuid;v_now timestamptz:=clock_timestamp();
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_msg from public.messages where organization_id=p_org and id=p_message for update;
 if not found then raise exception 'mensaje_no_encontrado'using errcode='P0002';end if;
 if p_token is null or v_msg.metadata->>'dispatch_token'is distinct from p_token::text
 then raise exception 'reserva_despacho_invalida'using errcode='P0001';end if;
 select * into v_slot from public.crm_contact_legal_dispatches where organization_id=p_org and message_id=p_message for update;
 if found and v_slot.dispatch_token=p_token and v_slot.state='deferred'and v_slot.job_id is not null
 then return jsonb_build_object('job_id',v_slot.job_id,'run_at',v_slot.deferred_at,'duplicate',true);end if;
 if p_at is null or not isfinite(p_at)or p_at<=v_now or p_at>v_now+interval '60 days'
  or p_reason is null or p_reason not in('fuera_de_horario','tope_canal_semana','tope_total_semana','outside_hours','window_changed','dispatch_unresolved')
 then raise exception 'reprogramacion_legal_invalida'using errcode='22023';end if;
 v_ctx:=public.crm_message_legal_context(p_org,p_message);
 if v_ctx->>'required'is distinct from 'true'then raise exception 'mensaje_sin_reprogramacion_legal'using errcode='P0001';end if;
 if v_slot.state='reserved'and v_slot.dispatch_token is distinct from p_token then raise exception 'turno_incierto_no_reprogramable'using errcode='P0001';end if;
 perform public.crm_finish_message_dispatch(p_org,p_message,p_token,'deferred','legal',null,p_reason,'Reprogramado a la siguiente ventana permitida','{}');
 v_job:=public.fn_enqueue_job(p_org,'whatsapp',jsonb_build_object('dispatch_message_id',p_message),p_at,'legal_dispatch:'||p_message::text||':'||p_token::text,5);
 insert into public.crm_contact_legal_dispatches(message_id,organization_id,customer_id,channel_id,dispatch_token,state,deferred_at,job_id,reason)
 values(p_message,p_org,(v_ctx->>'customer_id')::uuid,(v_ctx->>'channel_id')::uuid,p_token,'deferred',p_at,v_job,p_reason)
 on conflict(message_id)do update set dispatch_token=excluded.dispatch_token,state='deferred',deferred_at=p_at,job_id=v_job,reason=p_reason,updated_at=v_now
 where crm_contact_legal_dispatches.organization_id=excluded.organization_id and crm_contact_legal_dispatches.customer_id=excluded.customer_id
  and crm_contact_legal_dispatches.channel_id=excluded.channel_id and crm_contact_legal_dispatches.state in('released','deferred');
 if not found then raise exception 'turno_legal_conflictivo'using errcode='P0001';end if;
 update public.messages set metadata=coalesce(metadata,'{}')||jsonb_build_object('legal_next_at',p_at,'legal_reason',p_reason)
 where organization_id=p_org and id=p_message;
 return jsonb_build_object('job_id',v_job,'run_at',p_at,'duplicate',false);
end;$function$;
revoke all on function public.crm_defer_message_legal(integer,uuid,uuid,timestamptz,text)from public,anon,authenticated;
grant execute on function public.crm_defer_message_legal(integer,uuid,uuid,timestamptz,text)to service_role;

CREATE OR REPLACE FUNCTION public.crm_campaign_transition(p_org integer, p_campaign uuid, p_action text, p_version timestamp with time zone, p_actor uuid, p_options jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign public.campaigns;v_counts jsonb;v_channel uuid;v_template public.templates;v_contact record;v_batch integer;v_schedule timestamptz;v_purpose text;v_now timestamptz:=clock_timestamp();v_stats jsonb;v_status text;v_skip jsonb;v_res uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_action is null or p_action not in('launch','pause','resume','cancel') or p_version is null
  or jsonb_typeof(p_options) is distinct from 'object' or octet_length(p_options::text)>10000 then raise exception 'transicion_invalida' using errcode='22023';end if;
 if p_actor is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then raise exception 'actor_ajeno' using errcode='42501';end if;
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if v_campaign.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001';end if;
 v_stats:=coalesce(v_campaign.statistics,'{}');v_status:=coalesce(nullif(v_stats->>'state',''),v_campaign.status,'draft');
 v_batch:=greatest(coalesce((v_stats->>'next_batch_no')::integer,1),1);
 if p_action in('launch','resume')then perform public.crm_require_campaign_compliance(p_org,p_campaign);end if;
 if p_action='launch' then
  if v_status<>'draft' then raise exception 'campana_no_editable' using errcode='P0001';end if;
  if nullif(v_stats->>'materialized_at','') is null then raise exception 'audiencia_no_calculada' using errcode='P0001';end if;
  if coalesce((v_stats->>'credits_reserved')::integer,0)>0 then raise exception 'reserva_anterior_requiere_conciliacion' using errcode='P0001';end if;
  v_purpose:=coalesce(v_stats->>'purpose','utility');
  if v_purpose not in('utility','marketing') then raise exception 'proposito_invalido' using errcode='22023';end if;
  if v_campaign.channel='whatsapp' then
   v_channel:=nullif(v_stats->>'channel_id','')::uuid;
   if not exists(select 1 from public.channels where organization_id=p_org and id=v_channel and type='whatsapp' and status='active') then raise exception 'canal_no_disponible' using errcode='P0001';end if;
   if v_campaign.template_id is not null then
    select * into v_template from public.templates where organization_id=p_org and id=v_campaign.template_id and channel='whatsapp' and is_active;
    if not found or v_template.metadata->>'status' is distinct from 'APPROVED' then raise exception 'plantilla_no_aprobada' using errcode='P0001';end if;
    if lower(v_template.metadata->>'category')='marketing' then v_purpose:='marketing';end if;
   end if;
  elsif v_campaign.channel<>'email' then raise exception 'canal_campana_invalido' using errcode='22023';
  end if;
  if exists(select 1 from public.campaign_contacts cc left join public.customers u on u.id=cc.customer_id and u.organization_id=p_org
    where cc.campaign_id=p_campaign and coalesce(cc.state,cc.metadata->>'state','pending')='pending' and (u.id is null or u.status='merged')) then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
  for v_contact in select cc.id,cc.customer_id from public.campaign_contacts cc join public.customers u on u.id=cc.customer_id and u.organization_id=p_org
   where cc.campaign_id=p_campaign and coalesce(cc.state,cc.metadata->>'state','pending')='pending' order by cc.id for update of cc
  loop
   if not public.fn_can_contact(p_org,v_contact.customer_id,v_campaign.channel,v_purpose) then
    perform public.crm_skip_campaign_contacts(p_org,p_campaign,'opted_out',v_contact.customer_id,p_actor);
   elsif v_campaign.channel='whatsapp' then
    v_res:=public.crm_reserve_whatsapp_credit(p_org,'campaign:'||p_campaign::text||':'||v_contact.customer_id::text,p_campaign,v_contact.id,p_actor);
    if not exists(select 1 from public.crm_whatsapp_credit_reservations where organization_id=p_org and id=v_res and state='reserved' and message_id is null and coalesce(metadata->>'message_attached','false')='false') then raise exception 'reserva_no_disponible' using errcode='P0001';end if;
    update public.campaign_contacts set metadata=coalesce(metadata,'{}')||jsonb_build_object('credit_reservation_id',v_res) where id=v_contact.id and campaign_id=p_campaign;
   end if;
  end loop;
  v_counts:=public.crm_campaign_contact_counts(p_org,p_campaign);
  if (v_counts->>'pending')::integer<=0 then raise exception 'audiencia_sin_pendientes' using errcode='P0001';end if;
  v_schedule:=case when p_options ? 'scheduled_at' then nullif(p_options->>'scheduled_at','')::timestamptz else v_campaign.scheduled_at end;
  v_stats:=v_stats||jsonb_build_object('state',null,'launched_at',v_now,'launched_by',p_actor,'started_at',case when v_schedule>v_now then null else v_now end,
   'purpose',v_purpose,'counts',v_counts,'pending',v_counts->'pending','messaging_limit',p_options->'messaging_limit','credits_reserved',
    (select count(*) from public.crm_whatsapp_credit_reservations where organization_id=p_org and campaign_id=p_campaign and state='reserved'));
  update public.campaigns set statistics=v_stats,status=case when v_schedule>v_now then 'scheduled' else 'sending' end,scheduled_at=v_schedule where organization_id=p_org and id=p_campaign;
  perform public.fn_enqueue_job(p_org,'campaign_batch',
   jsonb_build_object('campaign_id',p_campaign,'batch_no',v_batch),greatest(coalesce(v_schedule,v_now),v_now),'campaign_batch:'||p_campaign::text||':'||v_batch::text,50);
 elsif p_action='pause' then
  if v_status not in('sending','scheduled') then raise exception 'campana_no_pausable' using errcode='P0001';end if;
  update public.campaigns set statistics=v_stats||jsonb_build_object('state','paused','paused_at',v_now,'paused_by',p_actor) where organization_id=p_org and id=p_campaign;
 elsif p_action='resume' then
  if v_status<>'paused' then raise exception 'campana_no_pausada' using errcode='P0001';end if;
  update public.campaigns set statistics=v_stats||jsonb_build_object('state',null,'paused_at',null,'resumed_at',v_now,'resumed_by',p_actor,'template_paused',false),
   status=case when scheduled_at>v_now then 'scheduled' else 'sending' end where organization_id=p_org and id=p_campaign;
  perform public.fn_enqueue_job(p_org,'campaign_batch',
   jsonb_build_object('campaign_id',p_campaign,'batch_no',v_batch),greatest(coalesce(v_campaign.scheduled_at,v_now),v_now),'campaign_batch:'||p_campaign::text||':'||v_batch::text,50);
  -- Reanudar también recupera mensajes publicados cuya compuerta todavía no inició envío.
  perform public.fn_enqueue_job(p_org,'whatsapp',jsonb_build_object('dispatch_message_id',m.id),
   greatest(coalesce(v_campaign.scheduled_at,v_now),v_now),'campaign_dispatch:'||m.id::text||':'||v_now::text,5)
  from public.crm_whatsapp_credit_reservations r join public.messages m on m.id=r.message_id and m.organization_id=r.organization_id
  where r.organization_id=p_org and r.campaign_id=p_campaign and r.state='reserved'
   and m.external_message_id is null and coalesce(m.metadata->>'dispatch_state','')in('','deferred')
   and not exists(select 1 from public.crm_message_dispatch_receipts proof where proof.organization_id=p_org and proof.message_id=m.id and proof.state in('sent','delivered','read'));
 else
  if v_status in('sent','canceled') then raise exception 'campana_no_cancelable' using errcode='P0001';end if;
  v_skip:=public.crm_skip_campaign_contacts(p_org,p_campaign,'canceled',null,p_actor);
  update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','canceled','canceled_at',v_now,'canceled_by',p_actor,'cancel_result',v_skip)
   where organization_id=p_org and id=p_campaign;
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'campaign.'||p_action,'campaign',p_campaign,jsonb_build_object('version_before',p_version,'applied_by',p_actor,'state_before',v_status,'cancel_result',v_skip),'processed',v_now);
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign;
 return to_jsonb(v_campaign);
end;$function$
;
