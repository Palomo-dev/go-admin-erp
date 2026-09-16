-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f08_02_enroll_rpc`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 5446ca2428e9057b380768671ac23d07). No reformatear.
-- FASE-08 §4.2 — inscripción atómica: enrollment + step_runs + jobs de la cola
-- en UNA sola transacción. Sustituye al camino en tres pasos de
-- sequenceService.enrollInSequence (inscrito fantasma, tester r1 #3).
CREATE OR REPLACE FUNCTION public.fn_enroll_in_sequence(
  p_org integer,
  p_sequence_id uuid,
  p_opportunity_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_enrolled_by uuid DEFAULT NULL,
  p_start_at timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq         record;
  v_customer    uuid := p_customer_id;
  v_existing    uuid;
  v_enrollment  uuid;
  v_steps       integer := 0;
  v_first       timestamptz;
  v_first_step  uuid;
  r             record;
  v_run_id      uuid;
  v_job_id      uuid;
  v_sched       timestamptz;
BEGIN
  IF p_org IS NULL OR p_sequence_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;
  IF p_opportunity_id IS NULL AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'opportunity_or_customer_required' USING ERRCODE = 'P0001';
  END IF;

  -- Con sesión de usuario (auth.uid()) exigimos membresía activa: la función es
  -- SECURITY DEFINER y salta RLS. Con service_role auth.uid() es NULL.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_members om
     WHERE om.user_id = auth.uid() AND om.organization_id = p_org AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'forbidden_org' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, is_active INTO v_seq FROM sequences
   WHERE id = p_sequence_id AND organization_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sequence_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_seq.is_active THEN
    RAISE EXCEPTION 'sequence_inactive' USING ERRCODE = 'P0001';
  END IF;

  IF p_opportunity_id IS NOT NULL THEN
    SELECT customer_id INTO v_customer FROM opportunities
     WHERE id = p_opportunity_id AND organization_id = p_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'opportunity_not_found' USING ERRCODE = 'P0001';
    END IF;
    v_customer := COALESCE(v_customer, p_customer_id);
  ELSE
    PERFORM 1 FROM customers WHERE id = p_customer_id AND organization_id = p_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Inscripción viva (active|paused) ya existente -> no duplicar.
  SELECT id INTO v_existing FROM sequence_enrollments
   WHERE sequence_id = p_sequence_id
     AND organization_id = p_org
     AND status IN ('active','paused')
     AND ((p_opportunity_id IS NOT NULL AND opportunity_id = p_opportunity_id)
       OR (p_opportunity_id IS NULL AND opportunity_id IS NULL AND customer_id = p_customer_id))
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'already_active', 'enrollment_id', v_existing, 'steps', 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sequence_steps
     WHERE sequence_id = p_sequence_id AND organization_id = p_org AND is_active = true
  ) THEN
    RAISE EXCEPTION 'sequence_has_no_active_steps' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO sequence_enrollments (organization_id, sequence_id, opportunity_id, customer_id, status, enrolled_at, source, enrolled_by)
  VALUES (p_org, p_sequence_id, p_opportunity_id, v_customer, 'active', COALESCE(p_start_at, now()), COALESCE(p_source,'manual'), p_enrolled_by)
  RETURNING id INTO v_enrollment;

  FOR r IN
    SELECT id, step_number, delay_days, delay_hours
      FROM sequence_steps
     WHERE sequence_id = p_sequence_id AND organization_id = p_org AND is_active = true
     ORDER BY step_number
  LOOP
    v_sched := COALESCE(p_start_at, now())
             + make_interval(days => COALESCE(r.delay_days, 0), hours => COALESCE(r.delay_hours, 0));

    INSERT INTO sequence_step_runs (organization_id, enrollment_id, step_id, status, scheduled_at)
    VALUES (p_org, v_enrollment, r.id, 'pending', v_sched)
    RETURNING id INTO v_run_id;

    v_job_id := fn_enqueue_job(p_org, 'sequence_step',
                               jsonb_build_object('step_run_id', v_run_id, 'enrollment_id', v_enrollment),
                               v_sched, 'seqrun:' || v_run_id::text, 3);
    UPDATE sequence_step_runs SET job_id = v_job_id WHERE id = v_run_id;

    v_steps := v_steps + 1;
    IF v_first IS NULL OR v_sched < v_first THEN
      v_first := v_sched;
      v_first_step := r.id;
    END IF;
  END LOOP;

  UPDATE sequence_enrollments
     SET next_run_at = v_first, current_step_id = v_first_step
   WHERE id = v_enrollment;

  RETURN jsonb_build_object('created', true, 'enrollment_id', v_enrollment, 'steps', v_steps, 'first_run_at', v_first);
END $$;

REVOKE ALL ON FUNCTION public.fn_enroll_in_sequence(integer, uuid, uuid, uuid, text, uuid, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_enroll_in_sequence(integer, uuid, uuid, uuid, text, uuid, timestamptz) TO authenticated, service_role;

-- Pausa automática de secuencias cuando el cliente responde (§3.1). Idempotente.
CREATE OR REPLACE FUNCTION public.fn_pause_sequences_on_reply(
  p_org integer, p_opportunity_id uuid, p_customer_id uuid, p_channel text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE sequence_enrollments e
     SET status = 'paused', paused_reason = 'customer_replied_' || COALESCE(p_channel,'unknown'), paused_at = now()
    FROM sequences s
   WHERE e.sequence_id = s.id
     AND e.organization_id = p_org
     AND e.status = 'active'
     AND s.pause_on_reply
     AND ((p_opportunity_id IS NOT NULL AND e.opportunity_id = p_opportunity_id)
       OR (p_opportunity_id IS NULL AND p_customer_id IS NOT NULL AND e.customer_id = p_customer_id));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_pause_sequences_on_reply(integer, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_pause_sequences_on_reply(integer, uuid, uuid, text) TO service_role;