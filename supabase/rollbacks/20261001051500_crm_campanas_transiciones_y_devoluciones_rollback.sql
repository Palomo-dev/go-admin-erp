-- Restaura preferencias/puerta anteriores y revoca transiciones. Conserva auditorías, mensajes y saldos.
CREATE OR REPLACE FUNCTION public.crm_apply_inbound_contact_consent(p_org integer, p_message uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_message public.messages;v_customer uuid;v_settings jsonb;v_normal text;v_keywords jsonb;v_action text:='none';v_key text;v_out boolean:=false;v_in boolean:=false;
begin
 perform public.fn_assert_acceso_org(p_org);
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
declare v_message public.messages;v_customer uuid;v_type text;v_purpose text:='utility';v_template text;v_category text;v_campaign text;v_campaign_purpose text;v_template_row public.templates;
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
   select statistics->>'purpose' into v_campaign_purpose from public.campaigns where organization_id=p_org and id::text=v_campaign and channel='whatsapp';
   if not found then return jsonb_build_object('allowed',false,'reason','campaign_not_found');end if;
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
CREATE OR REPLACE FUNCTION public.crm_set_contact_consent(p_org integer, p_customer uuid, p_channel text, p_status text, p_source text, p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_customer public.customers;v_consent public.contact_consents;v_meta jsonb;v_flag text;v_now timestamptz:=clock_timestamp();v_skipped integer:=0;v_changed integer:=0;
begin
 perform public.fn_assert_acceso_org(p_org);
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
  update public.campaign_contacts cc set state='skipped',metadata=coalesce(cc.metadata,'{}')||jsonb_build_object('state','skipped','skipped_reason','opted_out')
  from public.campaigns c where c.id=cc.campaign_id and c.organization_id=p_org and c.channel=p_channel
   and cc.customer_id=p_customer and cc.sent_at is null and coalesce(cc.state,cc.metadata->>'state','pending') in('pending','queued');
  get diagnostics v_skipped=row_count;
 end if;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'contact.consent_changed','customer',p_customer,jsonb_build_object('channel',p_channel,'status',p_status,'previous_status',v_consent.status,'source',p_source,'evidence',p_evidence,'changed_by',auth.uid(),'skipped',v_skipped),'processed',v_now);
 return jsonb_build_object('status',p_status,'skipped',v_skipped);
end;
$function$
;
revoke all on function public.crm_cancel_reserved_whatsapp(integer,uuid,text,uuid),public.crm_skip_campaign_contacts(integer,uuid,text,uuid,uuid),public.crm_campaign_transition(integer,uuid,text,timestamptz,uuid,jsonb) from public,anon,authenticated,service_role;
