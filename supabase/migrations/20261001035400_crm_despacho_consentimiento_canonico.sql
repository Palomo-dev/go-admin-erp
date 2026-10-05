-- Una misma puerta de contacto para triggers y consumidores Edge, incluyendo fusiones.
set lock_timeout='2s';
create or replace function public.crm_message_contact_gate(p_org integer,p_message uuid)
-- VOLATILE: el trigger debe ver la fila insertada en el mismo comando.
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
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
$function$;
revoke all on function public.crm_message_contact_gate(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_message_contact_gate(integer,uuid) to service_role;

create or replace function public.trigger_channel_dispatch()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_type text;v_gate jsonb;v_secret text;
begin
 if new.direction<>'outbound' or new.role not in('agent','ai') then return new;end if;
 select type into v_type from public.channels where id=new.channel_id and organization_id=new.organization_id;
 if v_type is null or v_type not in('whatsapp','facebook','instagram') then return new;end if;
 v_gate:=public.crm_message_contact_gate(new.organization_id,new.id);
 if v_gate->>'allowed' is distinct from 'true' then
  insert into public.message_events(organization_id,message_id,event_type,error_code,error_message)
  values(new.organization_id,new.id,'failed',coalesce(v_gate->>'reason','contact_blocked'),'No se despachó: revisa el consentimiento y la configuración de esta audiencia.');
  return new;
 end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='AI_INTERNAL_SECRET' limit 1;
 perform net.http_post(url:='https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/channel-dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',coalesce(v_secret,'')),
  body:=jsonb_build_object('messageId',new.id,'conversationId',new.conversation_id,'organizationId',new.organization_id));
 return new;
end;
$function$;
revoke all on function public.trigger_channel_dispatch() from public,anon,authenticated;
grant execute on function public.trigger_channel_dispatch() to service_role;
CREATE OR REPLACE FUNCTION public.trigger_ai_auto_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_channel_ai_mode text;
  v_ai_active boolean;
  v_auto_enabled boolean;
  v_secret text;
  v_channel_type text;
  v_gate jsonb;
begin
  if NEW.direction <> 'inbound' or NEW.role <> 'customer' then
    return NEW;
  end if;

  select c.ai_mode,c.type into v_channel_ai_mode,v_channel_type
  from public.conversations conv
  join public.channels c on c.id = conv.channel_id and c.organization_id=conv.organization_id
  where conv.id = NEW.conversation_id
    and conv.organization_id = NEW.organization_id;

  if v_channel_ai_mode is null or v_channel_ai_mode = 'manual' then
    return NEW;
  end if;

  if v_channel_type='whatsapp' then
    v_gate:=public.crm_message_contact_gate(new.organization_id,new.id);
    if v_gate->>'allowed' is distinct from 'true' then return new;end if;
  end if;

  select is_active, coalesce(auto_response_enabled, true)
    into v_ai_active, v_auto_enabled
  from public.ai_settings
  where organization_id = NEW.organization_id;

  if not coalesce(v_ai_active, false) or not coalesce(v_auto_enabled, false) then
    return NEW;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'AI_INTERNAL_SECRET'
  limit 1;

  perform net.http_post(
    url := 'https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/ai-auto-response',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object(
      'conversationId', NEW.conversation_id,
      'messageId', NEW.id,
      'organizationId', NEW.organization_id
    )
  );

  return NEW;
end;
$function$

;
revoke all on function public.trigger_ai_auto_response() from public,anon,authenticated;
grant execute on function public.trigger_ai_auto_response() to service_role;
