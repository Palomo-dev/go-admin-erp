-- Conserva mensajes, consentimiento, actividades y constancias privadas.
-- Revertir el consumidor junto con esta función para impedir doble postprocesado.
set lock_timeout='2s';
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
revoke all on function public.crm_process_whatsapp_inbound(integer,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
