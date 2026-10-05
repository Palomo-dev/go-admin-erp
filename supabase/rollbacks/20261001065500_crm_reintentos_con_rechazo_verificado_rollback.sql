-- Conserva intentos, saldos y evidencia. Pausar reintentos antes de revertir consumidores.
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
CREATE OR REPLACE FUNCTION public.crm_claim_campaign_batch(p_org integer, p_campaign uuid, p_batch integer, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign public.campaigns;v_row public.campaign_contacts;v_rows jsonb:='[]';v_now timestamptz:=clock_timestamp();v_token uuid;v_res public.crm_whatsapp_credit_reservations;v_msg uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_batch is null or p_batch<1 or p_limit is null or p_limit not between 1 and 50 then raise exception 'lote_invalido' using errcode='22023';end if;
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign and channel='whatsapp' for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if v_campaign.status not in('sending','scheduled') or nullif(v_campaign.statistics->>'state','') is not null then
  return jsonb_build_object('rows',v_rows,'campaign',to_jsonb(v_campaign),'reason','inactive');end if;
 if v_campaign.scheduled_at is not null and v_campaign.scheduled_at>v_now then
  return jsonb_build_object('rows',v_rows,'campaign',to_jsonb(v_campaign),'reason','scheduled_future');end if;
 if v_campaign.status='scheduled' then
  update public.campaigns set status='sending',statistics=coalesce(statistics,'{}')||jsonb_build_object('started_at',coalesce(statistics->'started_at',to_jsonb(v_now)))
   where organization_id=p_org and id=p_campaign returning * into v_campaign;
 end if;
 -- Sin recorte de candidatos: las filas terminales no llenan la ventana.
 for v_row in select cc.* from public.campaign_contacts cc where cc.campaign_id=p_campaign and cc.sent_at is null
  and coalesce(cc.state,cc.metadata->>'state','pending') in('pending','queued')
  and public.crm_campaign_contact_ready_at(coalesce(cc.state,cc.metadata->>'state','pending'),cc.metadata)<=v_now
  order by cc.created_at,cc.id for update skip locked
 loop
  exit when jsonb_array_length(v_rows)>=p_limit;
  -- El vínculo privado también impide rescatar un envío incierto con metadata atrasada.
  select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and contact_id=v_row.id for update;
  if found and (v_res.message_id is not null or v_res.metadata->>'message_attached'='true') then continue;end if;
  if found and v_res.state<>'reserved' then
   update public.campaign_contacts set state='failed',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','failed','error_code','reservation_settled') where id=v_row.id;
   continue;
  end if;
  -- Compatibilidad con mensajes legacy: una clave estable existente tampoco se rescata.
  select id into v_msg from public.messages where organization_id=p_org and direction='outbound'
   and metadata->>'client_request_id'='campaign:'||p_campaign::text||':'||v_row.customer_id::text order by created_at,id limit 1;
  if found then
   update public.campaign_contacts set state='queued',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','queued','message_id',v_msg,'reconciliation_required',true) where id=v_row.id;
   continue;
  end if;
  if not public.fn_can_contact(p_org,v_row.customer_id,'whatsapp',coalesce(v_campaign.statistics->>'purpose','utility')) then
   perform public.crm_skip_campaign_contacts(p_org,p_campaign,'opted_out',v_row.customer_id);continue;
  end if;
  v_token:=gen_random_uuid();
  update public.campaign_contacts set state='queued',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','queued','batch_no',p_batch,
   'attempts',case when metadata->>'attempts' ~ '^[0-9]{1,6}$' then (metadata->>'attempts')::integer+1 else 1 end,
   'retry_after',null,'claim_token',v_token,'claimed_at',v_now)
  where id=v_row.id returning * into v_row;
  v_rows:=v_rows||jsonb_build_array(to_jsonb(v_row));
 end loop;
 return jsonb_build_object('rows',v_rows,'campaign',to_jsonb(v_campaign));
end;$function$
;
CREATE OR REPLACE FUNCTION public.crm_apply_provider_receipt(p_org integer, p_receipt uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_receipt public.crm_provider_message_receipts;v_message public.messages;v_res public.crm_whatsapp_credit_reservations;
 v_contact public.campaign_contacts;v_customer uuid;v_count integer;v_previous text;v_rank integer;v_next_rank integer;
 v_state text;v_reason text;v_apply boolean:=true;v_opportunity uuid;v_campaign uuid;v_result jsonb;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_receipt from public.crm_provider_message_receipts where organization_id=p_org and id=p_receipt for update;
 if not found then raise exception 'constancia_no_encontrada' using errcode='P0002';end if;
 if v_receipt.applied_at is not null then
  if v_receipt.result->>'applied'='true' and v_receipt.event_type in('delivered','read') and v_receipt.unit_cost is not null then
   update public.campaign_contacts cc set metadata=coalesce(cc.metadata,'{}')||jsonb_build_object('cost_amount',v_receipt.unit_cost)
    where cc.metadata->>'message_id'=v_receipt.message_id::text and nullif(cc.metadata->>'cost_amount','') is null
     and exists(select 1 from public.campaigns ca where ca.id=cc.campaign_id and ca.organization_id=p_org and ca.channel='whatsapp');
   update public.comm_usage_logs set cost_amount=coalesce(cost_amount,v_receipt.unit_cost)
    where organization_id=p_org and channel='whatsapp' and metadata->>'message_id'=v_receipt.message_id::text;
   update public.campaigns ca set statistics=coalesce(ca.statistics,'{}')||jsonb_build_object('counts',public.crm_campaign_contact_counts(p_org,ca.id))
    where ca.organization_id=p_org and exists(select 1 from public.campaign_contacts cc where cc.campaign_id=ca.id and cc.metadata->>'message_id'=v_receipt.message_id::text);
  end if;
  return v_receipt.result||jsonb_build_object('already_applied',true);
 end if;
 select count(*) into v_count from public.messages m join public.conversations c on c.id=m.conversation_id and c.organization_id=m.organization_id and c.channel_id=m.channel_id
 where m.organization_id=p_org and m.channel_id=v_receipt.channel_id and m.external_message_id=v_receipt.external_message_id and m.direction='outbound';
 if v_count=0 then return jsonb_build_object('applied',false,'pending',true,'reason','message_not_available');end if;
 if v_count<>1 then raise exception 'identificador_proveedor_ambiguo' using errcode='P0001';end if;
 select m.* into v_message from public.messages m where m.organization_id=p_org and m.channel_id=v_receipt.channel_id and m.external_message_id=v_receipt.external_message_id and m.direction='outbound' for update;
 select customer_id into v_customer from public.conversations where organization_id=p_org and id=v_message.conversation_id and channel_id=v_receipt.channel_id;
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and message_id=v_message.id for update;
 -- El vínculo financiero se prueba en la reserva privada, nunca desde message_events.
 if v_res.id is not null and (v_res.metadata->>'provider_external_id' is distinct from v_receipt.external_message_id
   or v_res.metadata->>'provider_channel_id' is distinct from v_receipt.channel_id::text) then
  return jsonb_build_object('applied',false,'pending',true,'reason','dispatch_proof_not_available');
 end if;
 if v_res.id is null and nullif(v_message.metadata->>'credit_reservation_id','') is not null then
  v_apply:=false;v_reason:='stale_reservation_message';
 end if;
 select event_type into v_previous from public.crm_provider_message_receipts where organization_id=p_org and message_id=v_message.id and applied_at is not null and result->>'applied'='true'
 order by case event_type when 'read' then 3 when 'delivered' then 2 when 'failed' then 4 else 1 end desc,occurred_at desc,id desc limit 1;
 v_previous:=coalesce(v_res.metadata->>'provider_state',case when v_res.state='refunded' or v_res.metadata->>'last_dispatch_state'='failed' then 'failed' end,v_previous);
 v_rank:=case v_previous when 'read' then 3 when 'delivered' then 2 when 'sent' then 1 when 'failed' then -1 else 0 end;
 v_next_rank:=case v_receipt.event_type when 'read' then 3 when 'delivered' then 2 when 'sent' then 1 else -1 end;
 if v_receipt.event_type='failed' and v_rank>=2 then v_apply:=false;v_reason:='delivery_already_proven';
 elsif v_rank=-1 and v_next_rank>=2 then
  v_apply:=false;v_reason:='provider_result_conflict';
  if v_res.id is not null then
   update public.crm_whatsapp_credit_reservations set metadata=metadata||jsonb_build_object('reconciliation_required',true) where organization_id=p_org and id=v_res.id;
   update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state','paused','pause_reason','provider_result_conflict')
    where organization_id=p_org and id=v_res.campaign_id and status in('sending','scheduled');
  end if;
 elsif (v_rank=-1 and v_next_rank<=1) or (v_next_rank>=0 and v_next_rank<=v_rank) then v_apply:=false;v_reason:='state_already_applied';
 end if;
 insert into public.message_events(organization_id,message_id,event_type,provider_payload,error_code,error_message,created_at,correlation_id)
 values(p_org,v_message.id,v_receipt.event_type,v_receipt.provider_payload||jsonb_build_object('event_time',v_receipt.occurred_at,'verified_receipt_id',v_receipt.id),
 v_receipt.error_code,v_receipt.error_message,v_receipt.occurred_at,v_receipt.id);
 if v_apply then
  if v_res.id is not null then
   update public.crm_whatsapp_credit_reservations set metadata=metadata||jsonb_build_object('provider_state',v_receipt.event_type,'provider_receipt_id',v_receipt.id,
    'dispatch_confirmed',v_receipt.event_type<>'failed','safe_to_refund',v_receipt.event_type='failed') where organization_id=p_org and id=v_res.id;
  end if;
  update public.messages set read_at=case when v_receipt.event_type='read' then coalesce(read_at,v_receipt.occurred_at) else read_at end,
   metadata=coalesce(metadata,'{}')||jsonb_build_object('provider_state',v_receipt.event_type,'provider_receipt_id',v_receipt.id,
    'dispatched',v_receipt.event_type<>'failed','dispatch_state',case when v_receipt.event_type='failed' then 'failed' else 'sent' end)
   where organization_id=p_org and id=v_message.id;
  if v_res.id is not null then
   if v_receipt.event_type='failed' then perform public.crm_refund_whatsapp_credit(p_org,v_res.id,'Rechazo confirmado por el proveedor');
   elsif v_res.state='reserved' then perform public.crm_consume_whatsapp_credit(p_org,v_res.id,v_message.id);
   end if;
  end if;
  if v_res.contact_id is not null then
   select cc.* into v_contact from public.campaign_contacts cc join public.campaigns ca on ca.id=cc.campaign_id and ca.organization_id=p_org
    where cc.id=v_res.contact_id and cc.campaign_id=v_res.campaign_id and cc.customer_id=v_customer for update of cc;
  elsif v_res.id is null and v_apply then
   select cc.* into v_contact from public.campaign_contacts cc join public.campaigns ca on ca.id=cc.campaign_id and ca.organization_id=p_org and ca.channel='whatsapp'
    where cc.customer_id=v_customer and cc.metadata->>'message_id'=v_message.id::text order by cc.created_at,cc.id limit 1 for update of cc;
  end if;
  if v_contact.id is not null and v_contact.metadata->>'message_id'=v_message.id::text then
   v_state:=case when v_contact.replied_at is not null or v_contact.state='replied' then 'replied'
    when v_receipt.event_type='failed' and v_receipt.error_code in('131049','131048') then 'skipped' else v_receipt.event_type end;
   update public.campaign_contacts set state=v_state,
    sent_at=case when v_receipt.event_type='failed' then sent_at else coalesce(sent_at,v_receipt.occurred_at) end,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('state',v_state,'provider_receipt_id',v_receipt.id)
     ||case when v_receipt.event_type in('delivered','read') then jsonb_build_object('delivered_at',coalesce(nullif(metadata->'delivered_at','null'::jsonb),to_jsonb(v_receipt.occurred_at))) else '{}'::jsonb end
     ||case when v_receipt.event_type='read' then jsonb_build_object('read_at',coalesce(nullif(metadata->'read_at','null'::jsonb),to_jsonb(v_receipt.occurred_at))) else '{}'::jsonb end
     ||case when v_receipt.unit_cost is not null and v_receipt.event_type in('delivered','read') then jsonb_build_object('cost_amount',coalesce(nullif(metadata->'cost_amount','null'::jsonb),to_jsonb(v_receipt.unit_cost))) else '{}'::jsonb end
     ||case when v_receipt.event_type='failed' then jsonb_build_object('error_code',v_receipt.error_code,'error_message',v_receipt.error_message,'failed_at',v_receipt.occurred_at,
        'skipped_reason',case when v_state='skipped' then 'rate_limited_24h' else null end) else '{}'::jsonb end
    where id=v_contact.id and campaign_id=v_contact.campaign_id;
   update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('counts',public.crm_campaign_contact_counts(p_org,v_contact.campaign_id),
     'error_summary',coalesce((select jsonb_object_agg(error_code,total) from(
      select cc.metadata->>'error_code' error_code,count(*) total from public.campaign_contacts cc
       where cc.campaign_id=v_contact.campaign_id and nullif(cc.metadata->>'error_code','') is not null
       and cc.state in('failed','skipped','bounced') group by cc.metadata->>'error_code')x),'{}'::jsonb))
    where organization_id=p_org and id=v_contact.campaign_id;
  end if;
  update public.activities set outcome=case when v_receipt.event_type='failed' then 'failed' else 'sent' end,
   metadata=coalesce(metadata,'{}')||jsonb_build_object('provider_state',v_receipt.event_type)
   where organization_id=p_org and message_id=v_message.id and activity_type='whatsapp';
  update public.comm_usage_logs set status=v_receipt.event_type,
   credits_used=case when v_receipt.event_type='failed' then 0 when v_res.id is not null then 1 else credits_used end,
   cost_amount=case when v_receipt.unit_cost is not null and v_receipt.event_type in('delivered','read') then coalesce(cost_amount,v_receipt.unit_cost) else cost_amount end,
   metadata=coalesce(metadata,'{}')||jsonb_build_object('provider_state',v_receipt.event_type,'error_code',v_receipt.error_code)
   where organization_id=p_org and channel='whatsapp' and metadata->>'message_id'=v_message.id::text;
 end if;
 -- El precio puede llegar en una entrega atrasada después de la lectura.
 if not v_apply and v_reason='state_already_applied' and v_receipt.event_type in('delivered','read') and v_rank>=2 and v_receipt.unit_cost is not null then
  update public.campaign_contacts cc set metadata=coalesce(cc.metadata,'{}')||jsonb_build_object('cost_amount',v_receipt.unit_cost)
   where cc.metadata->>'message_id'=v_message.id::text and nullif(cc.metadata->>'cost_amount','') is null
    and exists(select 1 from public.campaigns ca where ca.id=cc.campaign_id and ca.organization_id=p_org and ca.channel='whatsapp');
  update public.comm_usage_logs set cost_amount=coalesce(cost_amount,v_receipt.unit_cost)
   where organization_id=p_org and channel='whatsapp' and metadata->>'message_id'=v_message.id::text;
  update public.campaigns ca set statistics=coalesce(ca.statistics,'{}')||jsonb_build_object('counts',public.crm_campaign_contact_counts(p_org,ca.id))
   where ca.organization_id=p_org and exists(select 1 from public.campaign_contacts cc where cc.campaign_id=ca.id and cc.metadata->>'message_id'=v_message.id::text);
 end if;
 v_result:=jsonb_build_object('applied',v_apply,'pending',false,'state',coalesce(v_state,v_receipt.event_type),'reason',v_reason,'message_id',v_message.id);
 update public.crm_provider_message_receipts set message_id=v_message.id,applied_at=clock_timestamp(),result=v_result where organization_id=p_org and id=v_receipt.id;
 return v_result;
end;$function$
;
revoke all on function public.crm_retry_verified_campaign_rejection(integer,uuid),public.crm_retry_pending_campaign_receipts(integer,uuid) from public,anon,authenticated,service_role;
