-- El testigo vigente es obligatorio al publicar el primer mensaje de campaña.
set lock_timeout='2s';
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
 if v_client_key is not null then
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
  'dispatch_confirmed',false,'request_fingerprint',v_fingerprint,'activity_id',v_activity)
 where organization_id=p_org and id=v_res_id;
 if v_contact is not null then
  update public.campaign_contacts set state='queued',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','queued','message_id',v_id,'conversation_id',v_conv,'credit_reservation_id',v_res_id)
  where id=v_contact and campaign_id=v_campaign;
 end if;
 return jsonb_build_object('message_id',v_id,'conversation_id',v_conv,'activity_id',v_activity,'customer_id',v_customer,'channel_id',v_channel,'scheduled',false,'duplicate',false);
end;$function$
;
revoke all on function public.crm_prepare_whatsapp_outbound(integer,jsonb) from public,anon,authenticated;
grant execute on function public.crm_prepare_whatsapp_outbound(integer,jsonb) to service_role;
