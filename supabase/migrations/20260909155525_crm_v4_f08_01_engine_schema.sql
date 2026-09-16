-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f08_01_engine_schema`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 7d617a0c7b795834bb50aa2d26103cce). No reformatear.
-- FASE-08 §3.1 — columnas, CHECKs, índices y políticas del motor único de
-- automatizaciones y secuencias. Idempotente.

-- ── automation_rules ────────────────────────────────────────────────────────
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS event text,
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.stages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS run_once_per_opportunity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cooldown_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS runs_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_cooldown_check;
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_cooldown_check CHECK (cooldown_hours >= 0 AND cooldown_hours <= 8760);

CREATE INDEX IF NOT EXISTS idx_ar_org_event_stage ON public.automation_rules (organization_id, event, stage_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_ar_pipeline ON public.automation_rules (pipeline_id) WHERE pipeline_id IS NOT NULL;

-- ── automation_runs ─────────────────────────────────────────────────────────
ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.crm_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actions_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rule_version integer,
  ADD COLUMN IF NOT EXISTS skip_reason text;

ALTER TABLE public.automation_runs DROP CONSTRAINT IF EXISTS automation_runs_status_check;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_status_check
  CHECK (status IN ('pending','running','completed','failed','skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_aruns_rule_event ON public.automation_runs (automation_rule_id, event_id)
  WHERE event_id IS NOT NULL AND dry_run = false;
CREATE INDEX IF NOT EXISTS idx_aruns_opp ON public.automation_runs (opportunity_id, created_at DESC);

-- ── outbound_jobs: kind horario (F8 §4.4) ───────────────────────────────────
ALTER TABLE public.outbound_jobs DROP CONSTRAINT IF EXISTS outbound_jobs_kind_check;
ALTER TABLE public.outbound_jobs ADD CONSTRAINT outbound_jobs_kind_check CHECK (kind IN (
  'email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze',
  'recording_fetch','recording_cleanup','campaign_batch','crm_event','maintenance','noop','time_events'));

-- ── sequences ───────────────────────────────────────────────────────────────
ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pause_on_reply boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.sequences DROP CONSTRAINT IF EXISTS sequences_trigger_type_check;
ALTER TABLE public.sequences ADD CONSTRAINT sequences_trigger_type_check
  CHECK (trigger_type IN ('manual','lead_capture','stage_change','event','custom'));
ALTER TABLE public.sequences DROP CONSTRAINT IF EXISTS sequences_exit_conditions_check;
ALTER TABLE public.sequences ADD CONSTRAINT sequences_exit_conditions_check CHECK (jsonb_typeof(exit_conditions) = 'array');

-- ── sequence_steps ──────────────────────────────────────────────────────────
ALTER TABLE public.sequence_steps
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS delay_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_step_on_true uuid,
  ADD COLUMN IF NOT EXISTS next_step_on_false uuid,
  ADD COLUMN IF NOT EXISTS condition jsonb,
  ADD COLUMN IF NOT EXISTS continue_on_error boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.sequence_steps DROP CONSTRAINT IF EXISTS sequence_steps_delay_days_check;
ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_delay_days_check CHECK (delay_days >= 0 AND delay_days <= 3650);
ALTER TABLE public.sequence_steps DROP CONSTRAINT IF EXISTS sequence_steps_delay_hours_check;
ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_delay_hours_check CHECK (delay_hours >= 0 AND delay_hours <= 23);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sequence_steps_branch_fk_true') THEN
    ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_branch_fk_true
      FOREIGN KEY (next_step_on_true) REFERENCES public.sequence_steps(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sequence_steps_branch_fk_false') THEN
    ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_branch_fk_false
      FOREIGN KEY (next_step_on_false) REFERENCES public.sequence_steps(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── sequence_enrollments ────────────────────────────────────────────────────
ALTER TABLE public.sequence_enrollments
  ADD COLUMN IF NOT EXISTS current_step_id uuid REFERENCES public.sequence_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrolled_by uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS steps_done integer NOT NULL DEFAULT 0;

-- Una sola inscripción viva (active|paused) por secuencia+oportunidad; se puede
-- reinscribir a quien ya salió (completed|exited) porque el índice es parcial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_enroll_active_unique
  ON public.sequence_enrollments (sequence_id, opportunity_id)
  WHERE status IN ('active','paused') AND opportunity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_enroll_active_customer_unique
  ON public.sequence_enrollments (sequence_id, customer_id)
  WHERE status IN ('active','paused') AND opportunity_id IS NULL AND customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enroll_next_run ON public.sequence_enrollments (organization_id, next_run_at) WHERE status = 'active';

-- ── sequence_step_runs ──────────────────────────────────────────────────────
ALTER TABLE public.sequence_step_runs
  ADD COLUMN IF NOT EXISTS job_id uuid,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_taken boolean;

CREATE INDEX IF NOT EXISTS idx_ssr_running ON public.sequence_step_runs (organization_id, executed_at) WHERE status = 'running';

-- ── RLS: políticas DELETE que faltaban (§3.1) ───────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sequence_step_runs','automation_runs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))',
      t||'_delete', t);
  END LOOP;
END $$;