-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_05_funciones_cola_eventos_consent`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 0550068566f92d19d9a8b050b77e10af). No reformatear.
-- M4: funciones de cola (SECURITY DEFINER, solo service_role), outbox y consentimiento

-- ===== fn_enqueue_job =====
CREATE OR REPLACE FUNCTION public.fn_enqueue_job(
  p_org integer, p_kind text, p_payload jsonb,
  p_run_at timestamptz DEFAULT now(), p_dedupe_key text DEFAULT NULL, p_max_attempts integer DEFAULT 5)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.outbound_jobs (organization_id, kind, payload, run_at, dedupe_key, max_attempts)
  VALUES (p_org, p_kind, COALESCE(p_payload, '{}'::jsonb), COALESCE(p_run_at, now()), p_dedupe_key, COALESCE(p_max_attempts, 5))
  ON CONFLICT (organization_id, dedupe_key) WHERE status IN ('queued','running') AND dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL AND p_dedupe_key IS NOT NULL THEN
    -- tester #5: devolver el job vivo (queued/running), nunca uno done/dead
    SELECT id INTO v_id FROM public.outbound_jobs
     WHERE organization_id = p_org AND dedupe_key = p_dedupe_key AND status IN ('queued','running')
     ORDER BY created_at DESC LIMIT 1;
  END IF;
  RETURN v_id;
END $$;

-- ===== fn_claim_jobs =====
CREATE OR REPLACE FUNCTION public.fn_claim_jobs(p_kinds text[] DEFAULT NULL, p_limit integer DEFAULT 25, p_worker text DEFAULT NULL)
RETURNS SETOF public.outbound_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1) huérfanos (worker muerto > 10 min): re-encolar o matar si agotaron intentos
  UPDATE public.outbound_jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
         locked_at = NULL, locked_by = NULL,
         last_error = left(COALESCE(last_error,'') || ' [reclaimed: lock expirado]', 4000)
   WHERE status = 'running' AND locked_at < now() - interval '10 minutes'
     AND (p_kinds IS NULL OR kind = ANY (p_kinds));
  -- 2) reclamar
  RETURN QUERY
  UPDATE public.outbound_jobs j
     SET status = 'running', locked_at = now(), locked_by = COALESCE(p_worker, 'unknown'), attempts = j.attempts + 1
   WHERE j.id IN (
     SELECT id FROM public.outbound_jobs
      WHERE status = 'queued' AND run_at <= now() AND (p_kinds IS NULL OR kind = ANY (p_kinds))
      ORDER BY run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 200)))
  RETURNING j.*;
END $$;

-- ===== fn_complete_job =====
CREATE OR REPLACE FUNCTION public.fn_complete_job(p_job_id uuid, p_worker text, p_result jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.outbound_jobs
     SET status = 'done', result = p_result, locked_at = NULL, locked_by = NULL
   WHERE id = p_job_id AND status = 'running' AND locked_by = p_worker;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;

-- ===== fn_fail_job =====
-- Devuelve el estado final: 'queued' (reintento), 'dead' (agotó intentos), 'failed' (p_retry_after_seconds = -1: no reintentable), 'ignored' (guarda no cumplida)
CREATE OR REPLACE FUNCTION public.fn_fail_job(p_job_id uuid, p_worker text, p_error text, p_retry_after_seconds integer DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_attempts integer; v_max integer; v_delay interval; v_status text;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max
    FROM public.outbound_jobs
   WHERE id = p_job_id AND status = 'running' AND locked_by = p_worker
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'ignored'; END IF;

  IF p_retry_after_seconds IS NOT NULL AND p_retry_after_seconds < 0 THEN
    v_status := 'failed';
  ELSIF v_attempts >= v_max THEN
    v_status := 'dead';
  ELSE
    v_status := 'queued';
  END IF;

  IF v_status = 'queued' THEN
    -- backoff exponencial 60s * 2^attempts (máx 1h) + jitter 0-15s, o retraso explícito del handler
    v_delay := COALESCE(make_interval(secs => p_retry_after_seconds),
                        make_interval(secs => LEAST(60 * power(2, v_attempts), 3600)::integer + floor(random() * 15)::integer));
    UPDATE public.outbound_jobs
       SET status = 'queued', run_at = now() + v_delay, last_error = left(p_error, 4000), locked_at = NULL, locked_by = NULL
     WHERE id = p_job_id;
  ELSE
    UPDATE public.outbound_jobs
       SET status = v_status, last_error = left(p_error, 4000), locked_at = NULL, locked_by = NULL
     WHERE id = p_job_id;
  END IF;
  RETURN v_status;
END $$;

-- ===== fn_emit_crm_event (outbox + job) =====
CREATE OR REPLACE FUNCTION public.fn_emit_crm_event(p_org integer, p_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event_id uuid;
BEGIN
  INSERT INTO public.crm_events (organization_id, event_type, entity_type, entity_id, payload)
  VALUES (p_org, p_type, p_entity_type, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_event_id;
  -- tester #2: el outbox tiene consumidor real: job 'crm_event'
  PERFORM public.fn_enqueue_job(
    p_org, 'crm_event',
    jsonb_build_object('event_id', v_event_id, 'event_type', p_type, 'entity_type', p_entity_type, 'entity_id', p_entity_id),
    now(), 'crm_event:' || v_event_id::text, 5);
  RETURN v_event_id;
END $$;

-- ===== triggers en opportunities =====
CREATE OR REPLACE FUNCTION public.fn_opp_stage_change_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_emit_crm_event(
    NEW.organization_id, 'opportunity.stage_changed', 'opportunity', NEW.id,
    jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id,
                       'status', NEW.status, 'pipeline_id', NEW.pipeline_id,
                       'customer_id', NEW.customer_id, 'changed_by', auth.uid()));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_opp_stage_change_enqueue ON public.opportunities;
CREATE TRIGGER trg_opp_stage_change_enqueue AFTER UPDATE OF stage_id ON public.opportunities
  FOR EACH ROW WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION public.fn_opp_stage_change_enqueue();

CREATE OR REPLACE FUNCTION public.fn_opp_created_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_emit_crm_event(
    NEW.organization_id, 'opportunity.created', 'opportunity', NEW.id,
    jsonb_build_object('stage_id', NEW.stage_id, 'status', NEW.status, 'pipeline_id', NEW.pipeline_id,
                       'customer_id', NEW.customer_id, 'record_type', NEW.record_type, 'source', NEW.source,
                       'created_by', COALESCE(NEW.created_by, auth.uid())));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_opp_created_enqueue ON public.opportunities;
CREATE TRIGGER trg_opp_created_enqueue AFTER INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fn_opp_created_enqueue();

-- ===== fn_can_contact =====
CREATE OR REPLACE FUNCTION public.fn_can_contact(p_org integer, p_customer uuid, p_channel text, p_purpose text DEFAULT 'utility')
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_meta jsonb; v_consent text; v_flag text;
BEGIN
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
END $$;

-- ===== privilegios =====
REVOKE ALL ON FUNCTION public.fn_enqueue_job(integer, text, jsonb, timestamptz, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_claim_jobs(text[], integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_complete_job(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fail_job(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_emit_crm_event(integer, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_job(integer, text, jsonb, timestamptz, text, integer),
  public.fn_claim_jobs(text[], integer, text), public.fn_complete_job(uuid, text, jsonb),
  public.fn_fail_job(uuid, text, text, integer), public.fn_emit_crm_event(integer, text, text, uuid, jsonb) TO service_role;
-- fn_can_contact: usable desde UI (solo devuelve boolean, valida org)
REVOKE ALL ON FUNCTION public.fn_can_contact(integer, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_can_contact(integer, uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_unit_cost(text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_unit_cost(text, text, date) TO authenticated, service_role;

-- ===== vista de observabilidad =====
CREATE OR REPLACE VIEW public.v_outbound_jobs_failed WITH (security_invoker = true) AS
  SELECT id, organization_id, kind, status, attempts, max_attempts, last_error, run_at, locked_at, created_at, updated_at
    FROM public.outbound_jobs
   WHERE status IN ('failed','dead') OR (status = 'queued' AND attempts > 0);
GRANT SELECT ON public.v_outbound_jobs_failed TO authenticated, service_role;
REVOKE ALL ON public.v_outbound_jobs_failed FROM anon;