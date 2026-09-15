-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_01_do_not_call_column_and_consent_gate`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 fac3ccb0cf3db0a9eac4f8214cf5ed4d). No reformatear.
-- FASE 06 · F6-01: la columna de "no llamar" existe de verdad y se respeta en todo el camino de marcación.
-- Decision: `customers.do_not_call` pasa a ser columna real (consultable/indexable para cumplimiento,
-- Ley 1581 de 2012), y `fn_can_contact` sigue siendo la UNICA puerta: para el canal 'voice' comprueba
-- la columna, el flag historico `metadata->>'do_not_call'` (patron F0 usado por F7/F16) y `contact_consents`.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers.do_not_call IS
  'F6: baja voluntaria de llamadas (voz). Respetada por fn_can_contact(...,''voice'') y por el despachador del agente IA.';

-- Backfill desde el flag historico en metadata (fuente que ya usaba fn_can_contact).
UPDATE public.customers
   SET do_not_call = true
 WHERE do_not_call = false
   AND COALESCE(metadata ->> 'do_not_call', 'false') IN ('true', '1');

-- Backfill desde consentimientos ya registrados.
UPDATE public.customers c
   SET do_not_call = true
  FROM public.contact_consents cc
 WHERE cc.customer_id = c.id
   AND cc.organization_id = c.organization_id
   AND cc.channel = 'voice'
   AND cc.status = 'opted_out'
   AND c.do_not_call = false;

CREATE INDEX IF NOT EXISTS idx_customers_do_not_call
  ON public.customers (organization_id)
  WHERE do_not_call = true;

-- fn_can_contact: se mantiene la firma y el comportamiento para email/whatsapp/sms;
-- para 'voice' se añade la columna como fuente adicional. Fail-closed en canal desconocido.
CREATE OR REPLACE FUNCTION public.fn_can_contact(
  p_org integer,
  p_customer uuid,
  p_channel text,
  p_purpose text DEFAULT 'utility'::text
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta jsonb;
  v_dnc boolean;
  v_consent text;
  v_flag text;
BEGIN
  -- fail-closed: canal desconocido o NULL => no contactar
  IF p_channel IS NULL OR p_channel NOT IN ('email','whatsapp','sms','voice') THEN RETURN false; END IF;
  -- p_purpose se ignora explicitamente en F0 (reservado para reglas marketing/utility/transactional)
  SELECT metadata, do_not_call INTO v_meta, v_dnc
    FROM public.customers WHERE id = p_customer AND organization_id = p_org;
  IF NOT FOUND THEN RETURN false; END IF;

  -- F6: columna real de "no llamar" (solo aplica al canal de voz)
  IF p_channel = 'voice' AND COALESCE(v_dnc, false) THEN RETURN false; END IF;

  SELECT status INTO v_consent FROM public.contact_consents
   WHERE organization_id = p_org AND customer_id = p_customer AND channel = p_channel;
  IF v_consent = 'opted_out' THEN RETURN false; END IF;

  v_flag := CASE p_channel
              WHEN 'email' THEN 'do_not_email'
              WHEN 'whatsapp' THEN 'do_not_whatsapp'
              WHEN 'sms' THEN 'do_not_sms'
              WHEN 'voice' THEN 'do_not_call'
              ELSE NULL END;
  IF v_flag IS NOT NULL AND COALESCE(v_meta ->> v_flag, 'false') IN ('true','1') THEN RETURN false; END IF;
  RETURN true;
END $function$;

-- Baja voluntaria atomica: contact_consents + metadata + columna, en una sola operacion.
CREATE OR REPLACE FUNCTION public.fn_log_consent_opt_out(
  p_org integer,
  p_customer uuid,
  p_channel text,
  p_source text DEFAULT 'ai_voice_agent',
  p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_flag text;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('email','whatsapp','sms','voice') THEN
    RAISE EXCEPTION 'canal invalido: %', p_channel USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer AND organization_id = p_org) THEN
    RETURN false;
  END IF;

  INSERT INTO public.contact_consents (organization_id, customer_id, channel, status, source, evidence, changed_at)
  VALUES (p_org, p_customer, p_channel, 'opted_out', p_source, COALESCE(p_evidence, '{}'::jsonb), now())
  ON CONFLICT (organization_id, customer_id, channel)
  DO UPDATE SET status = 'opted_out', source = EXCLUDED.source,
                evidence = EXCLUDED.evidence, changed_at = now();

  v_flag := CASE p_channel
              WHEN 'email' THEN 'do_not_email'
              WHEN 'whatsapp' THEN 'do_not_whatsapp'
              WHEN 'sms' THEN 'do_not_sms'
              WHEN 'voice' THEN 'do_not_call' END;

  UPDATE public.customers
     SET metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(v_flag, true, p_channel || '_optout_at', now()),
         do_not_call = CASE WHEN p_channel = 'voice' THEN true ELSE do_not_call END
   WHERE id = p_customer AND organization_id = p_org;

  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.fn_log_consent_opt_out(integer, uuid, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_log_consent_opt_out(integer, uuid, text, text, jsonb) TO authenticated, service_role;