-- GO-1510: Consentimiento de grabación explícito (Ley 1581 de 2012)
--
-- 1. Amplía fn_log_consent_opt_out para soportar channel:'all'
-- 2. No modifica el esquema de comm_settings: voice_agent_config ya es jsonb
--    y puede llevar modo_sin_datos sin ALTER TABLE
--
-- El resto de cambios (route.ts, buildGreeting, herramientas) son código.

SET search_path TO public;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. fn_log_consent_opt_out con soporte para channel:'all'
-- ───────────────────────────────────────────────────────────────────────────

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
DECLARE
  v_flag text;
  v_ch text;
BEGIN
  -- GO-1510: Si p_channel es 'all', se aplica a los 4 canales
  IF p_channel = 'all' THEN
    -- Registrar baja en cada canal
    FOR v_ch IN SELECT unnest(ARRAY['email', 'whatsapp', 'sms', 'voice']) LOOP
      PERFORM public.fn_log_consent_opt_out(p_org, p_customer, v_ch, p_source, p_evidence);
    END LOOP;
    RETURN true;
  END IF;

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

COMMENT ON FUNCTION public.fn_log_consent_opt_out(integer, uuid, text, text, jsonb) IS
'GO-1510: Registra baja voluntaria del cliente en uno o todos los canales. Con channel=''all'' marca voice+email+whatsapp+sms.';

-- ───────────────────────────────────────────────────────────────────────────
-- Fin
-- ───────────────────────────────────────────────────────────────────────────
