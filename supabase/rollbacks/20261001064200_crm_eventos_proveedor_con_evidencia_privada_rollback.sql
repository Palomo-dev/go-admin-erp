-- Conserva constancias, saldos y estados. Revertir también el consumidor Node.
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
  if v_message.metadata->>'dispatch_state'=p_status then return jsonb_build_object('already_applied',true);end if;
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
  update public.crm_whatsapp_credit_reservations set metadata=metadata||jsonb_build_object('dispatch_confirmed',p_status='sent','safe_to_refund',p_status='failed','last_dispatch_state',p_status)
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
 return jsonb_build_object('already_applied',false,'status',p_status);
end;$function$;
revoke all on function public.crm_record_provider_status(integer,uuid,jsonb,numeric),public.crm_apply_provider_receipt(integer,uuid),public.crm_reconcile_provider_status(integer,uuid,uuid) from public,anon,authenticated,service_role;
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
