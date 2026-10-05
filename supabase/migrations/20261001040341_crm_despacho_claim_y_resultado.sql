-- Reserva exclusiva y resultado atómico. Una respuesta ambigua nunca se reenvía sola.
set lock_timeout='2s';
create or replace function public.crm_claim_message_dispatch(p_org integer,p_message uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_message public.messages;v_gate jsonb;v_token uuid:=gen_random_uuid();
begin
 perform public.fn_assert_acceso_org(p_org);
 select * into v_message from public.messages where organization_id=p_org and id=p_message for update;
 if not found then return jsonb_build_object('claimed',false,'reason','message_not_found');end if;
 if v_message.direction<>'outbound' or v_message.role not in('agent','ai') then return jsonb_build_object('claimed',false,'reason','not_outbound');end if;
 if v_message.external_message_id is not null or v_message.metadata->>'dispatched'='true'
   or coalesce(v_message.metadata->>'dispatch_state','') not in('','deferred') then
  return jsonb_build_object('claimed',false,'reason','already_claimed');end if;
 if not exists(select 1 from public.conversations q join public.channels c on c.id=q.channel_id and c.organization_id=q.organization_id
   join public.customers u on u.id=q.customer_id and u.organization_id=q.organization_id
   where q.organization_id=p_org and q.id=v_message.conversation_id and q.channel_id=v_message.channel_id
    and c.type in('whatsapp','facebook','instagram') and c.status='active' and u.status is distinct from 'merged') then
  return jsonb_build_object('claimed',false,'reason','channel_or_customer_not_available');end if;
 v_gate:=public.crm_message_contact_gate(p_org,p_message);
 if v_gate->>'allowed' is distinct from 'true' then return jsonb_build_object('claimed',false,'reason',v_gate->>'reason');end if;
 update public.messages set metadata=coalesce(metadata,'{}')||jsonb_build_object('dispatch_state','processing','dispatch_token',v_token,'dispatch_started_at',clock_timestamp())
 where organization_id=p_org and id=p_message;
 return jsonb_build_object('claimed',true,'token',v_token);
end;$function$;
revoke all on function public.crm_claim_message_dispatch(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_claim_message_dispatch(integer,uuid) to service_role;

create or replace function public.crm_finish_message_dispatch(
 p_org integer,p_message uuid,p_token uuid,p_status text,p_channel text,p_external_id text,p_error_code text,p_error text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_message public.messages;v_now timestamptz:=clock_timestamp();
begin
 perform public.fn_assert_acceso_org(p_org);
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
 return jsonb_build_object('already_applied',false,'status',p_status);
end;$function$;
revoke all on function public.crm_finish_message_dispatch(integer,uuid,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_finish_message_dispatch(integer,uuid,uuid,text,text,text,text,text,jsonb) to service_role;
