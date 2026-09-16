-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_29_fix_customer_channel_identity_trigger`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 b1fa3c050c660077069d1c06228a58b2). No reformatear.
-- F0 r4 · Tarea 1 (CRÍTICA): ningún mensaje entrante de la Cloud API podía
-- persistirse. `fn_update_customer_channel_identity` (AFTER INSERT ON messages)
-- escribía `identity_type = channels.type` ('whatsapp'|'website'|'instagram'|
-- 'facebook'), valores que `customer_channel_identities_identity_type_check`
-- NO admite (widget_anon|widget_identified|whatsapp_phone|instagram_user|
-- facebook_psid), y además usaba `external_message_id` (un `wamid.*`) como
-- valor de identidad. Al ser un trigger AFTER en la misma transacción, el
-- CHECK revertía el INSERT del mensaje entero.
--
-- Se corrige el TRIGGER, no el CHECK: todo el código lector usa ya los valores
-- del CHECK (channelService.ts:188, channel-dispatch/index.ts:173,
-- metaMessagingService.ts:31-34, whatsappCloudService.ts:633,
-- whatsappQrService.ts:502). Ampliar el CHECK crearía identidades que ningún
-- lector consulta.
--
-- Cambios:
--   1. mapeo channels.type -> identity_type válido.
--   2. NUNCA se usa external_message_id como identidad (es el id del mensaje
--      del proveedor, no del cliente).
--   3. valor de identidad por canal, con teléfono normalizado a dígitos
--      (igual que normalizePhoneDigits en channelService.ts).
--   4. bloque EXCEPTION: una identidad no registrada NUNCA puede tumbar el
--      INSERT del mensaje; se deja WARNING en el log.
--   5. SET search_path = public (era SECURITY DEFINER con search_path mutable).
CREATE OR REPLACE FUNCTION public.fn_update_customer_channel_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_channel_type   text;
  v_identity_type  text;
  v_identity_value text;
BEGIN
  IF NEW.direction IS DISTINCT FROM 'inbound' OR NEW.sender_customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.type INTO v_channel_type FROM channels c WHERE c.id = NEW.channel_id;
  IF v_channel_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_channel_type = 'whatsapp' THEN
    v_identity_type  := 'whatsapp_phone';
    v_identity_value := NULLIF(regexp_replace(
      COALESCE(NEW.payload->>'phone',    NEW.payload->>'wa_id',
               NEW.payload->>'whatsapp_id',
               NEW.metadata->>'phone',   NEW.metadata->>'wa_id', ''),
      '[^0-9]', '', 'g'), '');

  ELSIF v_channel_type = 'instagram' THEN
    v_identity_type  := 'instagram_user';
    v_identity_value := NULLIF(COALESCE(
      NEW.payload->>'sender_id', NEW.payload->>'igsid',
      NEW.payload->>'instagram_id', NEW.metadata->>'sender_id', ''), '');

  ELSIF v_channel_type = 'facebook' THEN
    v_identity_type  := 'facebook_psid';
    v_identity_value := NULLIF(COALESCE(
      NEW.payload->>'sender_id', NEW.payload->>'psid',
      NEW.metadata->>'sender_id', ''), '');

  ELSIF v_channel_type = 'website' THEN
    v_identity_value := NULLIF(COALESCE(NEW.payload->>'email', NEW.metadata->>'email'), '');
    IF v_identity_value IS NOT NULL THEN
      v_identity_type := 'widget_identified';
    ELSE
      v_identity_type  := 'widget_anon';
      v_identity_value := NULLIF(COALESCE(
        NEW.payload->>'visitor_id',  NEW.payload->>'session_id',
        NEW.metadata->>'visitor_id', NEW.metadata->>'session_id', ''), '');
    END IF;

  ELSE
    -- tipo de canal desconocido: no se inventa un identity_type
    RETURN NEW;
  END IF;

  IF v_identity_value IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO customer_channel_identities (
    organization_id, customer_id, channel_id,
    identity_type, identity_value, verified,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    NEW.organization_id, NEW.sender_customer_id, NEW.channel_id,
    v_identity_type, v_identity_value, false,
    now(), now(), now(), now()
  )
  ON CONFLICT (customer_id, channel_id, identity_value)
  DO UPDATE SET last_seen_at = now(), updated_at = now();

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Nunca revertir el mensaje entrante por un problema de identidad
  -- (p. ej. la misma identity_value ya asignada a otro customer del canal).
  RAISE WARNING 'fn_update_customer_channel_identity: identidad no registrada (channel=%, type=%, value=%): %',
    NEW.channel_id, v_identity_type, v_identity_value, SQLERRM;
  RETURN NEW;
END;
$function$;