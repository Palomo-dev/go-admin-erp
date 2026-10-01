-- GO-1510 rollback: Revierte fn_log_consent_opt_out a la versión sin 'all'

SET search_path TO public;

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
