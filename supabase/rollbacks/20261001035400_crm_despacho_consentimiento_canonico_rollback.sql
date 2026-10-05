-- Restaura los disparadores anteriores; conserva mensajes y eventos registrados.
-- El despacho anterior solo comprobaba la baja directa del principal.
CREATE OR REPLACE FUNCTION public.trigger_channel_dispatch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_channel_type text;
  v_customer_id  uuid;
  v_opted_out    boolean;
BEGIN
  IF NEW.direction <> 'outbound' OR NEW.role NOT IN ('agent', 'ai') THEN
    RETURN NEW;
  END IF;

  SELECT type INTO v_channel_type
  FROM channels
  WHERE id = NEW.channel_id;

  IF v_channel_type NOT IN ('whatsapp', 'facebook', 'instagram') THEN
    RETURN NEW;
  END IF;

  -- Puerta de consentimiento (solo whatsapp: ver nota de la migración).
  IF v_channel_type = 'whatsapp' THEN
    SELECT c.customer_id INTO v_customer_id
    FROM conversations c
    WHERE c.id = NEW.conversation_id;

    IF v_customer_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM contact_consents cc
        WHERE cc.organization_id = NEW.organization_id
          AND cc.customer_id     = v_customer_id
          AND cc.channel         = 'whatsapp'
          AND cc.status          = 'opted_out'
      ) INTO v_opted_out;

      IF v_opted_out THEN
        INSERT INTO message_events (organization_id, message_id, event_type, error_code, error_message)
        VALUES (
          NEW.organization_id,
          NEW.id,
          'failed',
          'consent_opted_out',
          'No se despachó: el contacto pidió la baja de WhatsApp (Ley 1581 de 2012).'
        );
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  PERFORM net.http_post(
    url := 'https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/channel-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'messageId', NEW.id,
      'conversationId', NEW.conversation_id,
      'organizationId', NEW.organization_id
    )
  );

  RETURN NEW;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.trigger_ai_auto_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions', 'vault'
AS $function$
declare
  v_channel_ai_mode text;
  v_ai_active boolean;
  v_auto_enabled boolean;
  v_secret text;
begin
  if NEW.direction <> 'inbound' or NEW.role <> 'customer' then
    return NEW;
  end if;

  select c.ai_mode into v_channel_ai_mode
  from conversations conv
  join channels c on c.id = conv.channel_id
  where conv.id = NEW.conversation_id
    and conv.organization_id = NEW.organization_id;

  if v_channel_ai_mode is null or v_channel_ai_mode = 'manual' then
    return NEW;
  end if;

  select is_active, coalesce(auto_response_enabled, true)
    into v_ai_active, v_auto_enabled
  from ai_settings
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
revoke all on function public.crm_message_contact_gate(integer,uuid) from public,anon,authenticated,service_role;
