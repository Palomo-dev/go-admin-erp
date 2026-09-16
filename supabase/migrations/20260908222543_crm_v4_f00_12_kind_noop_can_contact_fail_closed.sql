-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_12_kind_noop_can_contact_fail_closed`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 e91a2ba23cd9d2ea771c66f140d1a438). No reformatear.
-- P1 (tester F1): admitir 'noop' en outbound_jobs.kind (pruebas del runner). Idempotente.
ALTER TABLE public.outbound_jobs DROP CONSTRAINT IF EXISTS outbound_jobs_kind_check;
ALTER TABLE public.outbound_jobs ADD CONSTRAINT outbound_jobs_kind_check CHECK (kind IN (
  'email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze',
  'recording_fetch','recording_cleanup','campaign_batch','crm_event','maintenance','noop'));

-- P2 (tester F2): fn_can_contact fail-closed con canal inválido/NULL. Mismo cuerpo; conserva SECDEF,
-- search_path y grants (CREATE OR REPLACE mantiene la ACL: authenticated + service_role).
CREATE OR REPLACE FUNCTION public.fn_can_contact(p_org integer, p_customer uuid, p_channel text, p_purpose text DEFAULT 'utility'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_meta jsonb; v_consent text; v_flag text;
BEGIN
  -- fail-closed: canal desconocido o NULL => no contactar
  IF p_channel IS NULL OR p_channel NOT IN ('email','whatsapp','sms','voice') THEN RETURN false; END IF;
  -- p_purpose se ignora explicitamente en F0 (reservado para reglas marketing/utility/transactional)
  SELECT metadata INTO v_meta FROM public.customers WHERE id = p_customer AND organization_id = p_org;
  IF NOT FOUND THEN RETURN false; END IF;
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

REVOKE EXECUTE ON FUNCTION public.fn_can_contact(integer, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_can_contact(integer, uuid, text, text) TO authenticated, service_role;