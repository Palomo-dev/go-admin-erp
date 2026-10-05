-- Ciclo de campañas y devolución por cancelación/baja con el monedero bloqueado primero.
set lock_timeout='2s';
create or replace function public.crm_cancel_reserved_whatsapp(p_org integer,p_reservation uuid,p_reason text,p_actor uuid default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_res public.crm_whatsapp_credit_reservations;v_message public.messages;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'motivo_invalido' using errcode='22023';end if;
 if p_actor is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then raise exception 'actor_ajeno' using errcode='42501';end if;
 select * into v_res from public.crm_whatsapp_credit_reservations where organization_id=p_org and id=p_reservation for update;
 if not found then raise exception 'reserva_no_encontrada' using errcode='P0002';end if;
 if v_res.state<>'reserved' then return false;end if;
 if v_res.message_id is null then
  if v_res.metadata->>'message_attached'='true' then return false;end if;
 else
  select * into v_message from public.messages where organization_id=p_org and id=v_res.message_id for update;
  if not found or v_message.metadata->>'credit_reservation_id' is distinct from v_res.id::text then return false;end if;
  if v_message.external_message_id is not null or v_message.metadata->>'dispatched'='true'
   or coalesce(v_message.metadata->>'dispatch_state','') not in('','deferred') then return false;end if;
  update public.messages set metadata=coalesce(metadata,'{}')||jsonb_build_object('dispatch_state','canceled','dispatch_pending',false,'canceled_reason',btrim(p_reason),'canceled_at',clock_timestamp())
   where organization_id=p_org and id=v_message.id;
  insert into public.message_events(organization_id,message_id,event_type,error_code,error_message)
   values(p_org,v_message.id,'failed','CONTACT_CANCELED',btrim(p_reason));
  update public.comm_usage_logs set status='canceled',credits_used=0 where organization_id=p_org and channel='whatsapp'
   and metadata->>'message_id'=v_message.id::text and metadata->>'credit_reservation_id'=v_res.id::text;
  update public.activities set outcome='canceled',metadata=coalesce(metadata,'{}')||jsonb_build_object('dispatch_state','canceled')
   where organization_id=p_org and message_id=v_message.id and activity_type='whatsapp';
 end if;
 update public.crm_whatsapp_credit_reservations set metadata=metadata||jsonb_build_object('safe_to_refund',true,'dispatch_confirmed',false)
  where organization_id=p_org and id=v_res.id;
 return public.crm_refund_whatsapp_credit(p_org,v_res.id,p_reason,p_actor);
end;$function$;
revoke all on function public.crm_cancel_reserved_whatsapp(integer,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.crm_cancel_reserved_whatsapp(integer,uuid,text,uuid) to service_role;

create or replace function public.crm_skip_campaign_contacts(p_org integer,p_campaign uuid,p_reason text,p_customer uuid default null,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_skipped integer;v_refunded integer:=0;v_id uuid;v_counts jsonb;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_reason is null or length(btrim(p_reason)) not between 3 and 120 then raise exception 'motivo_invalido' using errcode='22023';end if;
 if p_actor is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then raise exception 'actor_ajeno' using errcode='42501';end if;
 if not exists(select 1 from public.campaigns where organization_id=p_org and id=p_campaign) then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 update public.campaign_contacts set state='skipped',metadata=coalesce(metadata,'{}')||jsonb_build_object('state','skipped','skipped_reason',btrim(p_reason))
 where campaign_id=p_campaign and (p_customer is null or customer_id=p_customer) and sent_at is null and coalesce(state,metadata->>'state','pending') in('pending','queued');
 get diagnostics v_skipped=row_count;
 for v_id in select r.id from public.crm_whatsapp_credit_reservations r join public.campaign_contacts cc on cc.id=r.contact_id and cc.campaign_id=r.campaign_id
  where r.organization_id=p_org and r.campaign_id=p_campaign and r.state='reserved' and (p_customer is null or cc.customer_id=p_customer)
   and cc.state='skipped' and cc.metadata->>'skipped_reason'=btrim(p_reason) order by r.id
 loop
  if public.crm_cancel_reserved_whatsapp(p_org,v_id,btrim(p_reason),p_actor) then v_refunded:=v_refunded+1;end if;
 end loop;
 v_counts:=public.crm_campaign_contact_counts(p_org,p_campaign);
 update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('counts',v_counts,'pending',v_counts->'pending',
   'credits_reserved',(select count(*) from public.crm_whatsapp_credit_reservations where organization_id=p_org and campaign_id=p_campaign and state='reserved'))
 where organization_id=p_org and id=p_campaign;
 return jsonb_build_object('skipped',v_skipped,'refunded',v_refunded);
end;$function$;
revoke all on function public.crm_skip_campaign_contacts(integer,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_skip_campaign_contacts(integer,uuid,text,uuid,uuid) to service_role;

create or replace function public.crm_campaign_transition(p_org integer,p_campaign uuid,p_action text,p_version timestamptz,p_actor uuid,p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
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
end;$function$;
revoke all on function public.crm_campaign_transition(integer,uuid,text,timestamptz,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_campaign_transition(integer,uuid,text,timestamptz,uuid,jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.crm_set_contact_consent(p_org integer, p_customer uuid, p_channel text, p_status text, p_source text, p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_customer public.customers;v_consent public.contact_consents;v_meta jsonb;v_flag text;v_now timestamptz:=clock_timestamp();v_skipped integer:=0;v_changed integer:=0;v_campaign_id uuid;v_skip jsonb;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_customer is null or p_channel is null or p_channel not in('email','whatsapp','sms','voice')
  or p_status is null or p_status not in('opted_in','opted_out','unknown') or p_source is null or length(p_source) not between 1 and 120
  or jsonb_typeof(p_evidence) is distinct from 'object' or octet_length(p_evidence::text)>10000 then
  raise exception 'consentimiento_invalido' using errcode='22023';
 end if;
 select * into v_customer from public.customers where id=p_customer and organization_id=p_org for update;
 if not found then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
 if p_source='inbound_message' and p_status='opted_in' then raise exception 'opt_in_explicito_requerido' using errcode='22023';end if;
 -- Un primer mensaje conserva evidencia, pero no renueva ni borra una preferencia anterior.
 if p_status='unknown' then
  insert into public.contact_consents(organization_id,customer_id,channel,status,source,evidence,changed_at)
  values(p_org,p_customer,p_channel,p_status,p_source,p_evidence,v_now)
  on conflict(organization_id,customer_id,channel) do nothing;
  get diagnostics v_changed=row_count;
  if v_changed=1 then
   insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
   values(p_org,'contact.consent_recorded','customer',p_customer,jsonb_build_object('channel',p_channel,'status',p_status,'source',p_source,'evidence',p_evidence,'changed_by',auth.uid()),'processed',v_now);
  end if;
  return jsonb_build_object('status','unknown','skipped',0);
 end if;
 select * into v_consent from public.contact_consents where organization_id=p_org and customer_id=p_customer and channel=p_channel;
 -- Repetir el postprocesado del mismo mensaje no cambia la fecha ni deshace un evento posterior.
 if p_evidence->>'message_id' is not null and v_consent.evidence->>'message_id'=p_evidence->>'message_id'
  and v_consent.status=p_status then return jsonb_build_object('status',p_status,'skipped',0,'already_applied',true);end if;
 insert into public.contact_consents(organization_id,customer_id,channel,status,source,evidence,changed_at)
 values(p_org,p_customer,p_channel,p_status,p_source,p_evidence,v_now)
 on conflict(organization_id,customer_id,channel) do update set status=excluded.status,source=excluded.source,evidence=excluded.evidence,changed_at=excluded.changed_at;
 v_meta:=case when jsonb_typeof(v_customer.metadata)='object' then v_customer.metadata else '{}'::jsonb end;
 v_flag:=case p_channel when 'whatsapp' then 'do_not_whatsapp' when 'sms' then 'do_not_sms' when 'email' then 'do_not_email' else 'do_not_call' end;
 if p_status='opted_out' then v_meta:=v_meta||jsonb_build_object(v_flag,true,p_channel||'_optout_at',v_now);
 else v_meta:=(v_meta-v_flag)||jsonb_build_object(p_channel||'_optin_at',v_now);end if;
 update public.customers set metadata=v_meta where organization_id=p_org and id=p_customer;
 if p_status='opted_out' then
  for v_campaign_id in select distinct c.id from public.campaigns c join public.campaign_contacts cc on cc.campaign_id=c.id
   where c.organization_id=p_org and c.channel=p_channel and cc.customer_id=p_customer and cc.sent_at is null
    and coalesce(cc.state,cc.metadata->>'state','pending') in('pending','queued')
  loop
   v_skip:=public.crm_skip_campaign_contacts(p_org,v_campaign_id,'opted_out',p_customer,null);
   v_skipped:=v_skipped+coalesce((v_skip->>'skipped')::integer,0);
  end loop;
  -- Envíos individuales aún no reclamados también se cancelan por baja.
  if p_channel='whatsapp' then
   for v_campaign_id in select r.id from public.crm_whatsapp_credit_reservations r
    join public.messages m on m.id=r.message_id and m.organization_id=r.organization_id
    join public.conversations q on q.id=m.conversation_id and q.organization_id=m.organization_id
    where r.organization_id=p_org and r.campaign_id is null and r.state='reserved' and q.customer_id=p_customer
   loop perform public.crm_cancel_reserved_whatsapp(p_org,v_campaign_id,'opted_out',null);end loop;
  end if;
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'contact.consent_changed','customer',p_customer,jsonb_build_object('channel',p_channel,'status',p_status,'previous_status',v_consent.status,'source',p_source,'evidence',p_evidence,'changed_by',auth.uid(),'skipped',v_skipped),'processed',v_now);
 return jsonb_build_object('status',p_status,'skipped',v_skipped);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_apply_inbound_contact_consent(p_org integer, p_message uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_message public.messages;v_customer uuid;v_settings jsonb;v_normal text;v_keywords jsonb;v_action text:='none';v_key text;v_out boolean:=false;v_in boolean:=false;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_message from public.messages where id=p_message and organization_id=p_org for update;
 if not found then raise exception 'mensaje_no_encontrado' using errcode='P0002';end if;
 if v_message.metadata ? 'crm_consent_action' then return v_message.metadata->>'crm_consent_action';end if;
 if v_message.direction<>'inbound' or v_message.role<>'customer' or v_message.content_type<>'text' then return 'none';end if;
 select q.customer_id into v_customer from public.conversations q join public.channels c on c.id=q.channel_id and c.organization_id=q.organization_id
 where q.id=v_message.conversation_id and q.organization_id=p_org and q.channel_id=v_message.channel_id and c.type='whatsapp';
 if not found or (v_message.sender_customer_id is not null and v_message.sender_customer_id<>v_customer) then return 'none';end if;
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
 return v_action;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_message_contact_gate(p_org integer, p_message uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_message public.messages;v_customer uuid;v_type text;v_purpose text:='utility';v_template text;v_category text;v_campaign text;v_campaign_purpose text;v_template_row public.templates;v_campaign_status text;v_campaign_state text;v_campaign_schedule timestamptz;
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
  if lower(coalesce(v_message.metadata->>'category',v_message.payload->>'category',''))='marketing' then v_purpose:='marketing';end if;
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
  v_campaign:=nullif(v_message.metadata->>'campaign_id','');
  if v_campaign is not null then
   select statistics->>'purpose',status,statistics->>'state',scheduled_at into v_campaign_purpose,v_campaign_status,v_campaign_state,v_campaign_schedule from public.campaigns where organization_id=p_org and id::text=v_campaign and channel='whatsapp';
   if not found then return jsonb_build_object('allowed',false,'reason','campaign_not_found');end if;
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
