-- Solo los despachos confirmados cuentan para la compuerta semanal compartida.
set lock_timeout='2s';
create table if not exists public.crm_message_dispatch_receipts(
 message_id uuid primary key references public.messages(id) on delete cascade,
 organization_id integer not null references public.organizations(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 channel_id uuid not null references public.channels(id) on delete cascade,
 provider_external_id text,
 state text not null check(state in('sent','delivered','read','failed')),
 confirmed_at timestamptz not null
);
alter table public.crm_message_dispatch_receipts enable row level security;
revoke all on table public.crm_message_dispatch_receipts from public,anon,authenticated;
grant all on table public.crm_message_dispatch_receipts to service_role;
create index if not exists crm_dispatch_receipts_org_time on public.crm_message_dispatch_receipts(organization_id,confirmed_at);
create index if not exists crm_dispatch_receipts_conversation on public.crm_message_dispatch_receipts(conversation_id);
create index if not exists crm_dispatch_receipts_channel on public.crm_message_dispatch_receipts(channel_id);

create or replace function public.crm_record_effective_dispatch(p_org integer,p_message uuid,p_state text,p_external text,p_at timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_message public.messages;v_conv uuid;v_at timestamptz;
begin
 perform public.fn_assert_acceso_org(p_org);
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
end;$function$;
revoke all on function public.crm_record_effective_dispatch(integer,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_record_effective_dispatch(integer,uuid,text,text,timestamptz) to service_role;

create or replace function public.crm_provider_receipt_effective_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
begin
 if new.applied_at is not null and new.message_id is not null
  and (new.result->>'applied'='true' or new.event_type in('delivered','read')) then
  perform public.crm_record_effective_dispatch(new.organization_id,new.message_id,new.event_type,new.external_message_id,new.occurred_at);
 end if;
 return new;
end;$function$;
revoke all on function public.crm_provider_receipt_effective_trigger() from public,anon,authenticated;
grant execute on function public.crm_provider_receipt_effective_trigger() to service_role;
do $migration$begin
 if not exists(select 1 from pg_trigger where tgrelid='public.crm_provider_message_receipts'::regclass and tgname='crm_provider_receipt_effective')then
  create trigger crm_provider_receipt_effective after insert or update on public.crm_provider_message_receipts
  for each row execute function public.crm_provider_receipt_effective_trigger();
 end if;
end;$migration$;
alter table public.crm_provider_message_receipts enable trigger crm_provider_receipt_effective;

create or replace function public.fn_contactos_efectivos_semana(p_org integer,p_customer uuid,p_desde timestamptz,p_hasta timestamptz)
returns table(canal text,contactos integer)
language plpgsql stable security definer set search_path=public,pg_temp as $function$
begin
 perform public.fn_assert_acceso_org(p_org);
 if not exists(select 1 from public.customers where organization_id=p_org and id=p_customer)then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
 if p_desde is null or p_hasta is null or not isfinite(p_desde) or not isfinite(p_hasta) or p_hasta<=p_desde or p_hasta-p_desde>interval '8 days' then raise exception 'semana_invalida' using errcode='22023';end if;
 return query
 select 'voice'::text,count(*)::integer from public.calls c
  where c.organization_id=p_org and c.customer_id=p_customer
   and public.fn_es_contacto_voz_efectivo(c.direction,c.status,c.answered_at,c.answered_by)
   and c.answered_at>=p_desde and c.answered_at<p_hasta
 union all
 select 'email'::text,count(*)::integer from public.email_messages e
  where e.organization_id=p_org and e.to_customer_id=p_customer and e.sent_at>=p_desde and e.sent_at<p_hasta
   and e.status in('sent','delivered','opened','clicked')
 union all
 select case when ch.type='whatsapp' then 'whatsapp' else 'mensajeria' end,
  count(distinct(r.conversation_id,floor(extract(epoch from(r.confirmed_at-p_desde))/86400)))::integer
 from public.crm_message_dispatch_receipts r
 join public.conversations cv on cv.id=r.conversation_id and cv.organization_id=r.organization_id and cv.channel_id=r.channel_id
 join public.channels ch on ch.id=r.channel_id and ch.organization_id=r.organization_id
 where r.organization_id=p_org and cv.customer_id=p_customer and r.state in('sent','delivered','read')
  and r.confirmed_at>=p_desde and r.confirmed_at<p_hasta
  and not exists(select 1 from public.messages mi where mi.organization_id=p_org and mi.conversation_id=r.conversation_id
    and mi.channel_id=r.channel_id and mi.direction='inbound' and mi.created_at<=r.confirmed_at and mi.created_at>r.confirmed_at-interval '24 hours')
 group by 1;
end;$function$;
revoke all on function public.fn_contactos_efectivos_semana(integer,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.fn_contactos_efectivos_semana(integer,uuid,timestamptz,timestamptz) to authenticated,service_role;
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
 if p_status in('sent','failed') then perform public.crm_record_effective_dispatch(p_org,p_message,p_status,nullif(p_external_id,''),v_now);end if;
 if p_external_id is not null then perform public.crm_reconcile_provider_status(p_org,p_message,null);end if;
 return jsonb_build_object('already_applied',false,'status',p_status);
end;$function$
;
