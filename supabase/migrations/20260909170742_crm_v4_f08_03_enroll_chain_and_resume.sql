-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f08_03_enroll_chain_and_resume`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 43db146040f6d1cd03fbb32023d4e2bd). No reformatear.
-- FASE-08 ronda 2 — corrige el hallazgo N1 del tester (empate de `run_at` entre
-- pasos con retardo cero) y el N3 (pausar sin poder reanudar).
--
-- N1: `fn_enroll_in_sequence` creaba TODOS los `sequence_step_runs` y encolaba
-- un job por cada uno con el MISMO `run_at`. `fn_claim_jobs` ordena solo por
-- `run_at`, así que con empate el orden es arbitrario y el paso `email` podía
-- ejecutarse antes que el paso `condition` que debía bloquearlo.
-- Ahora la programación es ENCADENADA: se crean todos los `step_runs` (para que
-- la inscripción siga siendo atómica y visible), pero solo se encola el job del
-- PRIMER paso. `processStepRun` encola el siguiente cuando el anterior termina.
--
-- N2: se siembra además un job `time_events` (barrido de respaldo por
-- organización, singleton por `dedupe_key`), que rescata los pasos cuyo job
-- murió tras agotar intentos.
--
-- N3: `fn_resume_sequence_enrollment` reanuda una inscripción `paused`,
-- reprograma el siguiente paso pendiente y vuelve a encolarlo.

CREATE OR REPLACE FUNCTION public.fn_enroll_in_sequence(
  p_org integer,
  p_sequence_id uuid,
  p_opportunity_id uuid DEFAULT NULL::uuid,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_source text DEFAULT 'manual'::text,
  p_enrolled_by uuid DEFAULT NULL::uuid,
  p_start_at timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_seq         record;
  v_customer    uuid := p_customer_id;
  v_existing    uuid;
  v_enrollment  uuid;
  v_steps       integer := 0;
  v_first       timestamptz;
  v_first_step  uuid;
  v_first_run   uuid;
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

    v_steps := v_steps + 1;

    -- Solo el PRIMER paso (por step_number) se encola aquí: el resto lo encola
    -- `processStepRun` al terminar el anterior (programación encadenada, N1).
    IF v_first_run IS NULL THEN
      v_first_run  := v_run_id;
      v_first      := v_sched;
      v_first_step := r.id;
    END IF;
  END LOOP;

  v_job_id := fn_enqueue_job(p_org, 'sequence_step',
                             jsonb_build_object('step_run_id', v_first_run, 'enrollment_id', v_enrollment),
                             v_first, 'seqrun:' || v_first_run::text, 3);
  UPDATE sequence_step_runs SET job_id = v_job_id WHERE id = v_first_run;

  -- Barrido de respaldo por organización (N2): singleton por dedupe_key.
  PERFORM fn_enqueue_job(p_org, 'time_events',
                         jsonb_build_object('scope', 'sequences'),
                         now() + interval '15 minutes',
                         'time_events:' || p_org::text, 3);

  UPDATE sequence_enrollments
     SET next_run_at = v_first, current_step_id = v_first_step
   WHERE id = v_enrollment;

  RETURN jsonb_build_object('created', true, 'enrollment_id', v_enrollment, 'steps', v_steps, 'first_run_at', v_first);
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- N3: reanudar una inscripción pausada (`pause_on_reply` la dejaba muerta).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_resume_sequence_enrollment(
  p_org integer,
  p_enrollment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enroll   record;
  v_next     record;
  v_sched    timestamptz;
  v_job_id   uuid;
BEGIN
  IF p_org IS NULL OR p_enrollment_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_members om
     WHERE om.user_id = auth.uid() AND om.organization_id = p_org AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'forbidden_org' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, status INTO v_enroll FROM sequence_enrollments
   WHERE id = p_enrollment_id AND organization_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_enroll.status <> 'paused' THEN
    RETURN jsonb_build_object('resumed', false, 'reason', 'not_paused', 'status', v_enroll.status);
  END IF;

  SELECT sr.id, sr.scheduled_at, s.id AS step_id
    INTO v_next
    FROM sequence_step_runs sr
    JOIN sequence_steps s ON s.id = sr.step_id
   WHERE sr.enrollment_id = p_enrollment_id
     AND sr.organization_id = p_org
     AND sr.status = 'pending'
   ORDER BY s.step_number
   LIMIT 1;

  IF NOT FOUND THEN
    UPDATE sequence_enrollments
       SET status = 'completed', paused_reason = NULL, paused_at = NULL,
           exited_at = now(), exit_reason = 'all_steps_completed'
     WHERE id = p_enrollment_id AND organization_id = p_org;
    RETURN jsonb_build_object('resumed', false, 'reason', 'no_pending_steps', 'status', 'completed');
  END IF;

  -- Un paso cuya hora ya pasó se reprograma a ahora (no se dispara "en el pasado").
  v_sched := GREATEST(v_next.scheduled_at, now());
  UPDATE sequence_step_runs SET scheduled_at = v_sched
   WHERE id = v_next.id AND organization_id = p_org;

  UPDATE sequence_enrollments
     SET status = 'active', paused_reason = NULL, paused_at = NULL,
         next_run_at = v_sched, current_step_id = v_next.step_id
   WHERE id = p_enrollment_id AND organization_id = p_org;

  v_job_id := fn_enqueue_job(p_org, 'sequence_step',
                             jsonb_build_object('step_run_id', v_next.id, 'enrollment_id', p_enrollment_id),
                             v_sched, 'seqrun:' || v_next.id::text, 3);
  UPDATE sequence_step_runs SET job_id = v_job_id WHERE id = v_next.id AND organization_id = p_org;

  PERFORM fn_enqueue_job(p_org, 'time_events',
                         jsonb_build_object('scope', 'sequences'),
                         now() + interval '15 minutes',
                         'time_events:' || p_org::text, 3);

  RETURN jsonb_build_object('resumed', true, 'enrollment_id', p_enrollment_id,
                            'step_run_id', v_next.id, 'next_run_at', v_sched, 'status', 'active');
END $function$;

REVOKE ALL ON FUNCTION public.fn_resume_sequence_enrollment(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_resume_sequence_enrollment(integer, uuid) TO authenticated, service_role;