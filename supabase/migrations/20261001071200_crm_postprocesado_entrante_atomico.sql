-- Consentimiento y postprocesado entrante idempotentes con evidencia privada.
set lock_timeout='2s';
create table public.crm_inbound_message_receipts(
 id uuid primary key default gen_random_uuid(),
 organization_id integer not null references public.organizations(id) on delete cascade,
 message_id uuid not null references public.messages(id) on delete cascade,
 channel_id uuid not null references public.channels(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 consent_action text check(consent_action in('none','opted_in','opted_out')),
 consent_at timestamptz,processed_at timestamptz,
 result jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,message_id)
);
alter table public.crm_inbound_message_receipts enable row level security;
revoke all on public.crm_inbound_message_receipts from public,anon,authenticated;
grant select on public.crm_inbound_message_receipts to service_role;
create policy crm_inbound_receipts_own_read on public.crm_inbound_message_receipts for select to authenticated
 using(exists(select 1 from public.organization_members m where m.organization_id=crm_inbound_message_receipts.organization_id and m.user_id=(select auth.uid()) and m.is_active));
create index crm_inbound_receipts_message_fk on public.crm_inbound_message_receipts(message_id,organization_id);
create index crm_inbound_receipts_channel_fk on public.crm_inbound_message_receipts(channel_id,organization_id);
create index crm_inbound_receipts_customer_fk on public.crm_inbound_message_receipts(customer_id,organization_id);
CREATE OR REPLACE FUNCTION public.crm_apply_inbound_contact_consent(p_org integer, p_message uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_message public.messages;v_customer uuid;v_settings jsonb;v_normal text;v_keywords jsonb;v_action text:='none';v_key text;v_out boolean:=false;v_in boolean:=false;v_receipt public.crm_inbound_message_receipts;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_message from public.messages where id=p_message and organization_id=p_org for update;
 if not found then raise exception 'mensaje_no_encontrado' using errcode='P0002';end if;

 if v_message.direction<>'inbound' or v_message.role<>'customer' or v_message.content_type<>'text' then return 'none';end if;
 select q.customer_id into v_customer from public.conversations q join public.channels c on c.id=q.channel_id and c.organization_id=q.organization_id
 where q.id=v_message.conversation_id and q.organization_id=p_org and q.channel_id=v_message.channel_id and c.type='whatsapp';
 if not found or (v_message.sender_customer_id is not null and v_message.sender_customer_id<>v_customer) then return 'none';end if;
 select * into v_receipt from public.crm_inbound_message_receipts where organization_id=p_org and message_id=p_message for update;
 if found and v_receipt.consent_at is not null then return v_receipt.consent_action;end if;
 insert into public.crm_inbound_message_receipts(organization_id,message_id,channel_id,customer_id)
 values(p_org,p_message,v_message.channel_id,v_customer) on conflict(organization_id,message_id) do nothing;
 select settings into v_settings from public.provider_configs where organization_id=p_org and category='whatsapp' order by priority,id limit 1;
 v_normal:=public.crm_normalize_contact_keyword(v_message.content);
 v_keywords:=v_settings->'optout_keywords';
 if jsonb_typeof(v_keywords) is distinct from 'array' then v_keywords:='[]';end if;
 if jsonb_array_length(v_keywords)=0 then v_keywords:='["STOP","BAJA","CANCELAR","NO MAS","NO MÁS","UNSUBSCRIBE","SALIR","DETENER"]';end if;
 for v_key in select jsonb_array_elements_text(v_keywords) loop
  if v_normal<>'' and public.crm_normalize_contact_keyword(v_key)=v_normal then v_out:=true;exit;end if;
 end loop;
 v_keywords:=v_settings->'optin_keywords';
 if jsonb_typeof(v_keywords) is distinct from 'array' then v_keywords:='[]';end if;
 if jsonb_array_length(v_keywords)=0 then v_keywords:='["START","ALTA","VOLVER","INICIAR"]';end if;
 for v_key in select jsonb_array_elements_text(v_keywords) loop
  if v_normal<>'' and public.crm_normalize_contact_keyword(v_key)=v_normal then v_in:=true;exit;end if;
 end loop;
 if v_out then v_action:='opted_out';elsif v_in then v_action:='opted_in';end if;
 perform public.crm_set_contact_consent(p_org,v_customer,'whatsapp',case when v_action='none' then 'unknown' else v_action end,
  case when v_action='none' then 'inbound_message' else 'inbound_keyword' end,jsonb_build_object('message_id',v_message.id,'text',left(v_message.content,500)));
 update public.messages set metadata=coalesce(metadata,'{}')||jsonb_build_object('crm_consent_action',v_action)
 where organization_id=p_org and id=p_message;
 update public.crm_inbound_message_receipts set consent_action=v_action,consent_at=clock_timestamp() where organization_id=p_org and message_id=p_message;
 return v_action;
end;
$function$
;
create or replace function public.crm_process_whatsapp_inbound(p_org integer,p_message uuid,p_channel uuid,p_conversation uuid,p_customer uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_message public.messages;v_customer public.customers;v_receipt public.crm_inbound_message_receipts;v_contact public.campaign_contacts;
 v_campaign uuid;v_opportunity public.opportunities;v_opportunity_id uuid;v_activity uuid;v_notification uuid;v_salesperson uuid;v_outbound public.messages;v_consent text;v_result jsonb;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_message from public.messages where organization_id=p_org and id=p_message for update;
 if not found then raise exception 'mensaje_no_encontrado' using errcode='P0002';end if;
 if v_message.direction<>'inbound' or v_message.role<>'customer' or v_message.channel_id is distinct from p_channel or v_message.conversation_id is distinct from p_conversation then raise exception 'contexto_entrante_invalido' using errcode='22023';end if;
 if not exists(select 1 from public.conversations q join public.channels c on c.id=q.channel_id and c.organization_id=q.organization_id
  where q.organization_id=p_org and q.id=p_conversation and q.channel_id=p_channel and q.customer_id=p_customer and c.type='whatsapp')
  or (v_message.sender_customer_id is not null and v_message.sender_customer_id<>p_customer) then raise exception 'contexto_entrante_invalido' using errcode='22023';end if;
 select * into v_customer from public.customers where organization_id=p_org and id=p_customer;
 if not found then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
 select * into v_receipt from public.crm_inbound_message_receipts where organization_id=p_org and message_id=p_message for update;
 if found and v_receipt.processed_at is not null then return v_receipt.result||jsonb_build_object('already_applied',true);end if;
 v_consent:=case when v_message.content_type='text' then public.crm_apply_inbound_contact_consent(p_org,p_message) else 'none' end;
 insert into public.crm_inbound_message_receipts(organization_id,message_id,channel_id,customer_id,consent_action,consent_at)
 values(p_org,p_message,p_channel,p_customer,v_consent,clock_timestamp()) on conflict(organization_id,message_id) do nothing;
 -- El contacto efectivo debe pertenecer al mismo canal, cliente y organización.
 select cc.* into v_contact from public.campaign_contacts cc join public.campaigns ca on ca.id=cc.campaign_id and ca.organization_id=p_org and ca.channel='whatsapp'
  join public.messages m on m.id::text=cc.metadata->>'message_id' and m.organization_id=p_org and m.channel_id=p_channel and m.direction='outbound' and m.external_message_id is not null
  join public.conversations q on q.id=m.conversation_id and q.organization_id=p_org and q.channel_id=p_channel and q.customer_id=p_customer
  where cc.customer_id=p_customer and cc.sent_at>=v_message.created_at-interval '72 hours' and cc.sent_at<=v_message.created_at and cc.replied_at is null
   and cc.state in('sent','delivered','read','opened','clicked')
  order by cc.sent_at desc,cc.id limit 1 for update of cc;
 if found then
  v_campaign:=v_contact.campaign_id;
  select * into v_outbound from public.messages where organization_id=p_org and id::text=v_contact.metadata->>'message_id';
  v_opportunity_id:=v_outbound.related_opportunity_id;
  if v_opportunity_id is null and v_contact.metadata->>'opportunity_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then v_opportunity_id:=(v_contact.metadata->>'opportunity_id')::uuid;end if;
  update public.campaign_contacts set state='replied',replied_at=coalesce(replied_at,v_message.created_at),metadata=coalesce(metadata,'{}')||jsonb_build_object('state','replied','reply_message_id',p_message)
   where campaign_id=v_campaign and id=v_contact.id;
  update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('counts',public.crm_campaign_contact_counts(p_org,v_campaign),
   'replied_count',(select count(*) from public.campaign_contacts where campaign_id=v_campaign and replied_at is not null))
   where organization_id=p_org and id=v_campaign;
 end if;
 if v_message.related_opportunity_id is not null and exists(select 1 from public.opportunities where organization_id=p_org and id=v_message.related_opportunity_id and customer_id=p_customer) then v_opportunity_id:=v_message.related_opportunity_id;end if;
 if v_opportunity_id is not null then
  select * into v_opportunity from public.opportunities where organization_id=p_org and id=v_opportunity_id and customer_id=p_customer;
  if not found then v_opportunity_id:=null;end if;
 end if;
 if v_opportunity_id is null then
  select * into v_opportunity from public.opportunities where organization_id=p_org and customer_id=p_customer and status='open' order by updated_at desc,id limit 1;
  v_opportunity_id:=v_opportunity.id;
 end if;
 if v_opportunity_id is not null and exists(select 1 from public.organization_members where organization_id=p_org and user_id=v_opportunity.salesperson_id and is_active) then v_salesperson:=v_opportunity.salesperson_id;end if;
 update public.messages set related_opportunity_id=v_opportunity_id,
  metadata=coalesce(metadata,'{}')||case when v_campaign is null then '{}'::jsonb else jsonb_build_object('campaign_id',v_campaign,'campaign_reply',true) end
  where organization_id=p_org and id=p_message;
 update public.conversations set status='open' where organization_id=p_org and id=p_conversation and channel_id=p_channel and customer_id=p_customer;
 select id into v_activity from public.activities where organization_id=p_org and message_id=p_message and activity_type='whatsapp' order by created_at,id limit 1;
 if v_activity is null then
  insert into public.activities(organization_id,activity_type,channel,outcome,user_id,notes,related_type,related_id,occurred_at,message_id,conversation_id,metadata)
  values(p_org,'whatsapp','whatsapp','received',v_salesperson,'WhatsApp de '||coalesce(nullif(v_customer.full_name,''),'cliente')||': '||left(v_message.content,500),
   case when v_opportunity_id is null then 'customer' else 'opportunity' end,coalesce(v_opportunity_id,p_customer),v_message.created_at,p_message,p_conversation,
   jsonb_build_object('direction','inbound','content_type',v_message.content_type,'customer_id',p_customer,'campaign_id',v_campaign,'message_id',p_message))
  returning id into v_activity;
 end if;
 if v_salesperson is not null then
  v_notification:=public.fn_create_org_notification(p_org,v_salesperson,'app','whatsapp_reply','WhatsApp de '||coalesce(nullif(v_customer.full_name,''),'cliente'),left(v_message.content,140),
   jsonb_build_object('conversation_id',p_conversation,'opportunity_id',v_opportunity_id,'message_id',p_message,'customer_id',p_customer,'campaign_id',v_campaign));
 end if;
 v_result:=jsonb_build_object('consent',v_consent,'campaign_id',v_campaign,'opportunity_id',v_opportunity_id,'activity_id',v_activity,'notified_user_id',v_salesperson,'notification_id',v_notification);
 update public.crm_inbound_message_receipts set result=v_result,processed_at=clock_timestamp() where organization_id=p_org and message_id=p_message;
 return v_result;
end;$function$;
revoke all on function public.crm_process_whatsapp_inbound(integer,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_process_whatsapp_inbound(integer,uuid,uuid,uuid,uuid) to service_role;
