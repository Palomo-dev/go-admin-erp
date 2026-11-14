-- Corrección de chat_contactos_bloqueados (mismo archivo 20261113221114, versión final).
create or replace function public.update_conversation_last_message()
 returns trigger
 language plpgsql
as $function$
declare
  -- coalesce: sin la clave, la comparación da NULL y `not NULL` dejaba de
  -- sumar los no leídos de TODOS los mensajes (lo atrapó la prueba en
  -- begin/rollback; se corrigió con `chat_contactos_bloqueados_correccion`).
  v_bloqueado boolean := coalesce((new.metadata->>'contacto_bloqueado') = 'true', false);
begin
  update conversations
  set
    last_message_at = case when v_bloqueado then last_message_at else new.created_at end,
    message_count = message_count + 1,
    unread_count = case
      when new.direction = 'inbound' and new.role = 'customer' and not v_bloqueado then unread_count + 1
      else unread_count
    end,
    last_agent_message_at = case
      when new.role = 'agent' then new.created_at
      else last_agent_message_at
    end,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$function$;
