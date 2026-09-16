-- ============================================================
-- ROLLBACK de 20260909155525_crm_v4_f08_01_engine_schema
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Deshace §3.1 de F8: políticas DELETE, índices, columnas y CHECKs de las 6
-- tablas del motor, y quita 'time_events' del CHECK de outbound_jobs.kind.
-- Los CHECK previos de automation_runs.status, sequences.trigger_type y
-- sequence_steps.delay_days no quedaron registrados: se recrean con los valores
-- que la migración conserva sin los añadidos. f08_02/03/04 van antes.
--
-- SOBRE LOS DATOS: restaura la estructura, no los datos: se pierde todo lo escrito en las columnas nuevas del motor (reglas por evento/etapa, inscripciones encadenadas, ramas de pasos). Si hay jobs time_events o filas con estados/tipos nuevos, los ADD CONSTRAINT fallan: limpiarlas antes.
-- ============================================================

begin;
drop policy if exists automation_runs_delete on public.automation_runs;
drop policy if exists sequence_step_runs_delete on public.sequence_step_runs;

drop index if exists public.idx_ssr_running;
alter table public.sequence_step_runs
  drop column if exists branch_taken, drop column if exists task_id, drop column if exists email_message_id,
  drop column if exists attempts, drop column if exists job_id;

drop index if exists public.idx_enroll_next_run;
drop index if exists public.idx_enroll_active_customer_unique;
drop index if exists public.idx_enroll_active_unique;
alter table public.sequence_enrollments
  drop column if exists steps_done, drop column if exists timezone, drop column if exists source, drop column if exists enrolled_by,
  drop column if exists paused_at, drop column if exists paused_reason, drop column if exists next_run_at, drop column if exists current_step_id;

alter table public.sequence_steps drop constraint if exists sequence_steps_branch_fk_false;
alter table public.sequence_steps drop constraint if exists sequence_steps_branch_fk_true;
alter table public.sequence_steps drop constraint if exists sequence_steps_delay_hours_check;
alter table public.sequence_steps drop constraint if exists sequence_steps_delay_days_check;
alter table public.sequence_steps add constraint sequence_steps_delay_days_check check (delay_days >= 0);
alter table public.sequence_steps
  drop column if exists updated_at, drop column if exists continue_on_error, drop column if exists condition,
  drop column if exists next_step_on_false, drop column if exists next_step_on_true, drop column if exists delay_hours, drop column if exists name;

alter table public.sequences drop constraint if exists sequences_exit_conditions_check;
alter table public.sequences drop constraint if exists sequences_trigger_type_check;
alter table public.sequences add constraint sequences_trigger_type_check check (trigger_type in ('manual','lead_capture','stage_change'));
alter table public.sequences
  drop column if exists stats, drop column if exists created_by, drop column if exists template_key,
  drop column if exists pause_on_reply, drop column if exists stage_id, drop column if exists pipeline_id;

alter table public.outbound_jobs drop constraint if exists outbound_jobs_kind_check;
alter table public.outbound_jobs add constraint outbound_jobs_kind_check check (kind in (
  'email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze',
  'recording_fetch','recording_cleanup','campaign_batch','crm_event','maintenance','noop'));

drop index if exists public.idx_aruns_opp;
drop index if exists public.idx_aruns_rule_event;
alter table public.automation_runs drop constraint if exists automation_runs_status_check;
alter table public.automation_runs add constraint automation_runs_status_check check (status in ('pending','running','completed','failed'));
alter table public.automation_runs
  drop column if exists skip_reason, drop column if exists rule_version, drop column if exists dry_run,
  drop column if exists actions_plan, drop column if exists event_id, drop column if exists opportunity_id;

drop index if exists public.idx_ar_pipeline;
drop index if exists public.idx_ar_org_event_stage;
alter table public.automation_rules drop constraint if exists automation_rules_cooldown_check;
alter table public.automation_rules
  drop column if exists runs_count, drop column if exists last_run_at, drop column if exists updated_by, drop column if exists created_by,
  drop column if exists template_key, drop column if exists version, drop column if exists cooldown_hours,
  drop column if exists run_once_per_opportunity, drop column if exists stage_id, drop column if exists pipeline_id, drop column if exists event;
commit;
