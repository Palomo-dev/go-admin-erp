-- Reversión de 20261113221114_chat_contactos_bloqueados.
--
-- Restaura `update_conversation_last_message` y `trigger_ai_auto_response` con
-- el cuerpo EXACTO que tenían antes (leído por MCP el 2026-11-13), quita el
-- trigger que marca los mensajes y borra la tabla.
--
-- Advertencia de datos: borrar `chat_contactos_bloqueados` pierde la historia
-- de bloqueos. Los mensajes que entraron bloqueados conservan
-- metadata.contacto_bloqueado = true e is_read = true (no se restauran: no
-- había un valor anterior que recuperar). El código que lee la tabla
-- (route `/api/chat/conversaciones/[id]/bloqueo`, `useConversacion`) también
-- hay que revertirlo, o la Bandeja mostrará error al bloquear.

drop trigger if exists trg_messages_contacto_bloqueado on public.messages;
drop function if exists public.fn_messages_marcar_contacto_bloqueado();

CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE conversations
  SET
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' AND NEW.role = 'customer' THEN unread_count + 1
      ELSE unread_count
    END,
    last_agent_message_at = CASE
      WHEN NEW.role = 'agent' THEN NEW.created_at
      ELSE last_agent_message_at
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$function$;

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
    url := 'https://taqjemqjtumhwptchcxk.supabase.co/functions/v1/ai-auto-response',
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
$function$;

drop table if exists public.chat_contactos_bloqueados;
