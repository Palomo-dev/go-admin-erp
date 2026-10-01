-- Conserva constancias privadas; restaura el conteo anterior y el liquidado anterior.
set lock_timeout='2s';
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
end;$function$
;
CREATE OR REPLACE FUNCTION public.fn_contactos_efectivos_semana(p_org integer, p_customer uuid, p_desde timestamp with time zone, p_hasta timestamp with time zone)
 RETURNS TABLE(canal text, contactos integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Voz: llamadas salientes CONTESTADAS por una persona (humanas o del agente).
  select 'voice'::text, count(*)::integer
    from public.calls c
   where c.organization_id = p_org
     and c.customer_id = p_customer
     and public.fn_es_contacto_voz_efectivo(c.direction,c.status,c.answered_at,c.answered_by)
     and c.answered_at >= p_desde and c.answered_at < p_hasta
  union all
  -- Correo: enviados (los fallidos o rebotados no llegaron).
  select 'email'::text, count(*)::integer
    from public.email_messages e
   where e.organization_id = p_org
     and e.to_customer_id = p_customer
     and e.sent_at >= p_desde and e.sent_at < p_hasta
     and e.status in ('sent', 'delivered', 'opened', 'clicked')
  union all
  -- Mensajería: mensajes salientes que inicia la empresa. Una respuesta dentro
  -- de las 24 h siguientes a un mensaje del cliente no es un contacto nuevo:
  -- la conversación la abrió él. Un contacto por conversación y día.
  select case when ch.type = 'whatsapp' then 'whatsapp' else 'mensajeria' end,
         count(distinct (m.conversation_id, floor(extract(epoch from (m.created_at - p_desde)) / 86400)))::integer
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id and cv.organization_id = p_org
    left join public.channels ch on ch.id = cv.channel_id
   where m.organization_id = p_org
     and cv.customer_id = p_customer
     and m.direction = 'outbound'
     and m.created_at >= p_desde and m.created_at < p_hasta
     and not exists (
       select 1 from public.messages mi
        where mi.conversation_id = m.conversation_id
          and mi.direction = 'inbound'
          and mi.created_at <= m.created_at
          and mi.created_at > m.created_at - interval '24 hours'
     )
   group by 1
$function$
;
alter table public.crm_provider_message_receipts disable trigger crm_provider_receipt_effective;
revoke all on function public.crm_record_effective_dispatch(integer,uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.crm_provider_receipt_effective_trigger() from public,anon,authenticated,service_role;
