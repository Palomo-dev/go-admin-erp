-- Eventos verificados: constancia privada, estados monótonos y liquidación única.
set lock_timeout='2s';
create table public.crm_provider_message_receipts(
 id uuid primary key default gen_random_uuid(),
 organization_id integer not null references public.organizations(id) on delete cascade,
 channel_id uuid not null references public.channels(id) on delete cascade,
 provider text not null check(provider='meta'),
 external_message_id text not null check(length(external_message_id) between 1 and 500),
 event_key text not null,
 event_type text not null check(event_type in('sent','delivered','read','failed')),
 occurred_at timestamptz not null,
 error_code text,error_message text,
 provider_payload jsonb not null default '{}',
 unit_cost numeric check(unit_cost is null or unit_cost>=0),
 message_id uuid references public.messages(id) on delete set null,
 applied_at timestamptz,
 result jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,channel_id,event_key)
);
alter table public.crm_provider_message_receipts enable row level security;
revoke all on public.crm_provider_message_receipts from public,anon,authenticated;
grant select on public.crm_provider_message_receipts to service_role;
create policy crm_provider_receipt_org on public.crm_provider_message_receipts for select to authenticated
 using(exists(select 1 from public.organization_members m where m.organization_id=crm_provider_message_receipts.organization_id and m.user_id=(select auth.uid()) and m.is_active));
create index crm_provider_receipt_pending on public.crm_provider_message_receipts(organization_id,channel_id,external_message_id,occurred_at,id) where applied_at is null;
create index crm_provider_receipt_message on public.crm_provider_message_receipts(organization_id,message_id,occurred_at,id) where message_id is not null;

create or replace function public.crm_apply_provider_receipt(p_org integer,p_receipt uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
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
end;$function$;
revoke all on function public.crm_apply_provider_receipt(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_apply_provider_receipt(integer,uuid) to service_role;

create or replace function public.crm_record_provider_status(p_org integer,p_channel uuid,p_status jsonb,p_unit_cost numeric default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_type text;v_external text;v_timestamp text;v_at timestamptz;v_error text;v_error_message text;v_key text;v_id uuid;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if jsonb_typeof(p_status) is distinct from 'object' or octet_length(p_status::text)>200000
   or (p_unit_cost is not null and (p_unit_cost<0 or p_unit_cost>1000000)) then raise exception 'evento_proveedor_invalido' using errcode='22023';end if;
 if not exists(select 1 from public.channels where organization_id=p_org and id=p_channel and type='whatsapp') then raise exception 'canal_no_encontrado' using errcode='P0002';end if;
 v_type:=p_status->>'status';v_external:=p_status->>'id';v_timestamp:=p_status->>'timestamp';
 if v_type is null or v_type not in('sent','delivered','read','failed') or v_external is null or length(v_external) not between 1 and 500
  or v_timestamp is null or v_timestamp!~'^[0-9]{1,11}$' then raise exception 'evento_proveedor_invalido' using errcode='22023';end if;
 v_at:=to_timestamp(v_timestamp::bigint);
 if v_at>clock_timestamp()+interval '1 day' or v_at<timestamptz '2000-01-01T00:00:00Z' then raise exception 'fecha_proveedor_invalida' using errcode='22023';end if;
 v_error:=left(p_status#>>'{errors,0,code}',120);v_error_message:=left(p_status#>>'{errors,0,title}',1000);
 v_key:=md5(jsonb_build_array(v_external,v_type,v_timestamp,v_error)::text);
 insert into public.crm_provider_message_receipts(organization_id,channel_id,provider,external_message_id,event_key,event_type,occurred_at,error_code,error_message,provider_payload,unit_cost)
 values(p_org,p_channel,'meta',v_external,v_key,v_type,v_at,v_error,v_error_message,p_status,p_unit_cost)
 on conflict(organization_id,channel_id,event_key) do nothing returning id into v_id;
 if v_id is null then
  update public.crm_provider_message_receipts set unit_cost=coalesce(unit_cost,p_unit_cost) where organization_id=p_org and channel_id=p_channel and event_key=v_key returning id into v_id;
 end if;
 return public.crm_apply_provider_receipt(p_org,v_id)||jsonb_build_object('receipt_id',v_id);
end;$function$;
revoke all on function public.crm_record_provider_status(integer,uuid,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.crm_record_provider_status(integer,uuid,jsonb,numeric) to service_role;

create or replace function public.crm_reconcile_provider_status(p_org integer,p_message uuid default null,p_campaign uuid default null)
returns integer language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_id uuid;v_applied integer:=0;v_result jsonb;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if (p_message is null)=(p_campaign is null) then raise exception 'contexto_conciliacion_invalido' using errcode='22023';end if;
 if p_message is not null and not exists(select 1 from public.messages where organization_id=p_org and id=p_message) then raise exception 'mensaje_no_encontrado' using errcode='P0002';end if;
 if p_campaign is not null and not exists(select 1 from public.campaigns where organization_id=p_org and id=p_campaign) then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 for v_id in
  select r.id from public.crm_provider_message_receipts r
   where r.organization_id=p_org and r.applied_at is null and exists(
    select 1 from public.messages m where m.organization_id=p_org and m.channel_id=r.channel_id and m.external_message_id=r.external_message_id
     and ((p_message is not null and m.id=p_message) or (p_campaign is not null and exists(
      select 1 from public.campaign_contacts cc where cc.campaign_id=p_campaign and cc.metadata->>'message_id'=m.id::text))))
   order by r.occurred_at,r.id
 loop
  v_result:=public.crm_apply_provider_receipt(p_org,v_id);
  if v_result->>'applied'='true' then v_applied:=v_applied+1;end if;
 end loop;
 return v_applied;
end;$function$;
revoke all on function public.crm_reconcile_provider_status(integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_reconcile_provider_status(integer,uuid,uuid) to service_role;
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
 if p_external_id is not null then perform public.crm_reconcile_provider_status(p_org,p_message,null);end if;
 return jsonb_build_object('already_applied',false,'status',p_status);
end;$function$;
CREATE OR REPLACE FUNCTION public.fn_can_contact(p_org integer, p_customer uuid, p_channel text, p_purpose text DEFAULT 'utility'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_channel text := lower(btrim(p_channel));
  v_purpose text := lower(btrim(p_purpose));
  v_customer public.customers;
  v_identity public.customers;
  v_ids uuid[];
  v_flag text;
  v_consent text;
  v_changed timestamptz;
begin
  if v_channel is null or v_channel not in ('email','whatsapp','sms','voice')
    or v_purpose is null or v_purpose not in ('utility','marketing','transactional') then return false; end if;
  if auth.role()='authenticated' and not exists (
    select 1 from public.organization_members om where om.organization_id=p_org
      and om.user_id=(select auth.uid()) and om.is_active
  ) then return false; end if;
  select * into v_customer from public.customers where organization_id=p_org and id=p_customer;
  if not found or v_customer.status='merged' then return false; end if;
  v_ids := array[p_customer] || coalesce((
    select array_agg(m.secondary_customer_id) from public.customer_merges m
      join public.customers s on s.id=m.secondary_customer_id and s.organization_id=p_org and s.status='merged'
    where m.organization_id=p_org and m.primary_customer_id=p_customer and m.undone_at is null
  ), array[]::uuid[]);
  v_flag := case v_channel when 'email' then 'do_not_email' when 'whatsapp' then 'do_not_whatsapp'
    when 'sms' then 'do_not_sms' when 'voice' then 'do_not_call' end;
  -- Una baja del cliente fusionado no se pierde al elegir otro dato principal.
  for v_identity in select * from public.customers where organization_id=p_org and id=any(v_ids) loop
    if v_channel='voice' and coalesce(v_identity.do_not_call,false) then return false; end if;
    if lower(coalesce(v_identity.metadata->>v_flag,'false')) in ('true','1') then return false; end if;
  end loop;
  if exists (select 1 from public.contact_consents where organization_id=p_org
    and customer_id=any(v_ids) and channel=v_channel and status='opted_out') then return false; end if;
  if v_channel='whatsapp' and v_purpose='marketing' and exists(
    select 1 from public.crm_provider_message_receipts r join public.messages m on m.id=r.message_id and m.organization_id=r.organization_id
      join public.conversations c on c.id=m.conversation_id and c.organization_id=m.organization_id and c.channel_id=m.channel_id
    where r.organization_id=p_org and c.customer_id=any(v_ids) and r.event_type='failed' and r.error_code in('131049','131048')
      and r.result->>'applied'='true' and r.occurred_at>clock_timestamp()-interval '24 hours'
  ) then return false;end if;
  if v_channel='whatsapp' and v_purpose='marketing' then
    select status,changed_at into v_consent,v_changed from public.contact_consents
      where organization_id=p_org and customer_id=p_customer and channel=v_channel;
    if v_consent is distinct from 'opted_in' then return false; end if;
    -- Un opt-in anterior para el número original no autoriza el número sustituido.
    if exists (select 1 from public.customer_merges m where m.organization_id=p_org
      and m.primary_customer_id=p_customer and m.undone_at is null
      and m.snapshot->'before'->'primary'->>'phone' is distinct from v_customer.phone
      and (v_changed is null or v_changed<m.merged_at)) then return false; end if;
  end if;
  return true;
end;
$function$;
