/**
 * F8 — Suite adversaria (automatizaciones y secuencias).
 *
 * Origen: la escribió el tester en la ronda 1 con 55 casos que AFIRMABAN el
 * comportamiento defectuoso. En la ronda 1 del builder se conservan escenario,
 * datos e identificadores de cada caso y se cambia lo que afirman: ahora fijan
 * el comportamiento CORRECTO. Los casos que ya pasaban se mantienen tal cual.
 *
 * El doble de BD replica lo que Postgres hace de verdad (verificado contra
 * `information_schema.columns` / `pg_constraint` del proyecto
 * jgmgphmzusbluqhuqihj, incluidas las migraciones
 * `crm_v4_f08_01_engine_schema` y `crm_v4_f08_02_enroll_rpc`):
 *  - columna inexistente      -> error 42703
 *  - literal fuera de CHECK   -> error 23514
 *  - NOT NULL sin valor       -> error 23502
 *  - DEFAULT de columna       -> se rellena en el INSERT y vuelve en el .select()
 *  - `fn_enroll_in_sequence`  -> inscripción + step_runs + jobs en una sola
 *    operación, con índice único parcial de inscripciones vivas.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from '@supabase/supabase-js';

// `sendEmail` real arrastra Resend + F7 entero: se dobla para contar envíos.
const sendEmailMock = jest.fn();
jest.mock('@/lib/services/crm/emailService', () => ({
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));

import {
  executeAutomationRule,
  validateUpdateField,
  UPDATE_FIELD_ALLOWLIST,
} from '@/lib/services/crm/automationService';
import {
  enrollInSequence,
  createSequence,
  processStepRun,
  processPendingStepRuns,
  checkExitConditions,
  resumeEnrollment,
  validateSequenceSteps,
  MAX_DELAY_DAYS,
} from '@/lib/services/crm/sequenceService';

// ─────────────────────────────────────────────────────────────────────────────
// Esquema REAL (columnas, DEFAULT, NOT NULL y CHECK verificados en la BD)
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS: Record<string, string[]> = {
  // tasks: NO tiene related_id ni related_type (sí related_to_id / related_to_type)
  tasks: [
    'id', 'organization_id', 'title', 'description', 'due_date', 'assigned_to', 'priority',
    'status', 'created_at', 'updated_at', 'created_by', 'start_time', 'related_to_id',
    'related_to_type', 'remind_before_minutes', 'remind_email', 'remind_push', 'type',
    'completed_at', 'completed_by', 'cancellation_reason', 'customer_id', 'parent_task_id',
    'project_id', 'milestone_id', 'goal_id', 'estimated_hours', 'actual_hours', 'tags', 'key_result_id',
  ],
  activities: [
    'id', 'organization_id', 'activity_type', 'user_id', 'notes', 'related_type', 'related_id',
    'occurred_at', 'created_at', 'updated_at', 'metadata', 'channel', 'outcome',
    'duration_seconds', 'branch_id', 'call_id', 'email_message_id', 'message_id', 'conversation_id',
  ],
  automation_rules: [
    'id', 'organization_id', 'name', 'description', 'trigger_type', 'trigger_config',
    'conditions', 'actions', 'is_active', 'priority', 'created_at', 'updated_at',
    // crm_v4_f08_01_engine_schema
    'event', 'pipeline_id', 'stage_id', 'run_once_per_opportunity', 'cooldown_hours', 'version',
    'template_key', 'created_by', 'updated_by', 'last_run_at', 'runs_count',
  ],
  automation_runs: [
    'id', 'organization_id', 'automation_rule_id', 'trigger_type', 'trigger_payload', 'status',
    'started_at', 'completed_at', 'result', 'error_message', 'created_at',
    // crm_v4_f08_01_engine_schema
    'opportunity_id', 'event_id', 'actions_plan', 'dry_run', 'rule_version', 'skip_reason',
  ],
  sequences: [
    'id', 'organization_id', 'name', 'description', 'trigger_type', 'trigger_config',
    'exit_conditions', 'is_active', 'created_at', 'updated_at',
    'pipeline_id', 'stage_id', 'pause_on_reply', 'template_key', 'created_by', 'stats',
  ],
  sequence_steps: [
    'id', 'organization_id', 'sequence_id', 'step_number', 'delay_days', 'channel',
    'template_id', 'action_config', 'is_active', 'created_at',
    'name', 'delay_hours', 'next_step_on_true', 'next_step_on_false', 'condition',
    'continue_on_error', 'updated_at',
  ],
  sequence_enrollments: [
    'id', 'organization_id', 'sequence_id', 'opportunity_id', 'customer_id', 'status',
    'enrolled_at', 'exited_at', 'exit_reason', 'created_at',
    'current_step_id', 'next_run_at', 'paused_reason', 'paused_at', 'enrolled_by', 'source',
    'timezone', 'steps_done',
  ],
  sequence_step_runs: [
    'id', 'organization_id', 'enrollment_id', 'step_id', 'status', 'scheduled_at',
    'executed_at', 'result', 'error_message', 'created_at',
    'job_id', 'attempts', 'email_message_id', 'task_id', 'branch_taken',
  ],
  opportunities: [
    'id', 'organization_id', 'pipeline_id', 'stage_id', 'customer_id', 'name', 'amount',
    'status', 'temperature', 'next_contact_at', 'next_action', 'expected_close_date',
    'recontact_at', 'source', 'deal_type', 'updated_at', 'salesperson_id', 'created_by',
  ],
  customers: [
    'id', 'organization_id', 'email', 'phone', 'full_name', 'first_name', 'last_name',
    'lifecycle_stage', 'tags', 'metadata', 'updated_at',
  ],
};

/** DEFAULT reales (los que el INSERT rellena y devuelve el `.select()`). */
const DEFAULTS: Record<string, () => Record<string, unknown>> = {
  sequences: () => ({ trigger_config: {}, exit_conditions: [], is_active: true, pause_on_reply: true, stats: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  sequence_steps: () => ({ delay_days: 0, delay_hours: 0, action_config: {}, is_active: true, continue_on_error: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  sequence_enrollments: () => ({ status: 'active', source: 'manual', steps_done: 0, enrolled_at: new Date().toISOString(), created_at: new Date().toISOString() }),
  sequence_step_runs: () => ({ status: 'pending', attempts: 0, created_at: new Date().toISOString() }),
  automation_rules: () => ({ trigger_config: {}, conditions: [], actions: [], is_active: true, priority: 100, run_once_per_opportunity: false, cooldown_hours: 0, version: 1, runs_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  automation_runs: () => ({ status: 'pending', actions_plan: [], dry_run: false, created_at: new Date().toISOString() }),
  tasks: () => ({ status: 'open', tags: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  activities: () => ({ occurred_at: new Date().toISOString(), metadata: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
};

/** Columnas NOT NULL sin DEFAULT: si el código no las manda, Postgres da 23502. */
const NOT_NULL: Record<string, string[]> = {
  sequences: ['organization_id', 'name', 'trigger_type'],
  sequence_steps: ['organization_id', 'sequence_id', 'step_number', 'channel'],
  sequence_enrollments: ['organization_id', 'sequence_id'],
  sequence_step_runs: ['organization_id', 'enrollment_id', 'step_id', 'scheduled_at'],
  automation_rules: ['organization_id', 'name', 'trigger_type'],
  automation_runs: ['organization_id', 'automation_rule_id', 'trigger_type'],
  tasks: ['organization_id', 'title'],
  activities: ['organization_id', 'activity_type'],
};

const CHECKS: Record<string, Record<string, string[]>> = {
  tasks: {
    status: ['open', 'in_progress', 'done', 'canceled'],
    priority: ['low', 'med', 'high', 'critical'],
  },
  activities: {
    activity_type: ['call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'note', 'system', 'ai_call', 'task'],
  },
  automation_rules: { trigger_type: ['stage_change', 'field_change', 'schedule', 'event', 'manual'] },
  // crm_v4_f08_01_engine_schema añadió 'skipped'
  automation_runs: { status: ['pending', 'running', 'completed', 'failed', 'skipped'] },
  sequence_enrollments: { status: ['active', 'paused', 'completed', 'exited'] },
  sequence_step_runs: { status: ['pending', 'running', 'completed', 'failed', 'skipped'] },
  // crm_v4_f08_01_engine_schema añadió 'event'
  sequences: { trigger_type: ['manual', 'lead_capture', 'stage_change', 'event', 'custom'] },
  sequence_steps: { channel: ['email', 'whatsapp', 'sms', 'call', 'task', 'wait', 'condition'] },
};

/** CHECK de `outbound_jobs.kind` tal cual está hoy en la BD (con `time_events`). */
const OUTBOUND_JOB_KINDS = [
  'email', 'whatsapp', 'sms', 'ai_call', 'sequence_step', 'automation', 'transcribe', 'analyze',
  'recording_fetch', 'recording_cleanup', 'campaign_batch', 'crm_event', 'maintenance', 'noop', 'time_events',
];

interface PgError { message: string; code: string; details: string | null; hint: string | null }

function unknownColumn(table: string, col: string): PgError {
  return { message: `column "${col}" of relation "${table}" does not exist`, code: '42703', details: null, hint: null };
}
function checkViolation(table: string, col: string): PgError {
  return { message: `new row for relation "${table}" violates check constraint "${table}_${col}_check"`, code: '23514', details: null, hint: null };
}
function notNullViolation(table: string, col: string): PgError {
  return { message: `null value in column "${col}" of relation "${table}" violates not-null constraint`, code: '23502', details: null, hint: null };
}
function raisedException(message: string): PgError {
  return { message, code: 'P0001', details: null, hint: null };
}

/** Aplica los DEFAULT de la tabla a las columnas que el INSERT no trae. */
function withDefaults(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const def = DEFAULTS[table]?.() ?? {};
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(def)) {
    if (out[k] === undefined) out[k] = v;
  }
  return out;
}

function validateRow(table: string, row: Record<string, unknown>, mode: 'insert' | 'update' = 'insert'): PgError | null {
  const cols = COLUMNS[table];
  if (cols) {
    for (const k of Object.keys(row)) {
      if (!cols.includes(k)) return unknownColumn(table, k);
    }
  }
  if (mode === 'insert') {
    for (const col of NOT_NULL[table] ?? []) {
      if (row[col] === undefined || row[col] === null) return notNullViolation(table, col);
    }
  }
  const checks = CHECKS[table];
  if (checks) {
    for (const [col, allowed] of Object.entries(checks)) {
      const v = row[col];
      if (v !== undefined && v !== null && !allowed.includes(String(v))) return checkViolation(table, col);
    }
  }
  // `crm_v4_f08_04_condition_step_fail_closed` (ronda 3, N10/N11):
  //   sequence_steps_condition_required_chk    — un paso `condition` sin
  //     condición no se puede guardar (evaluaba a VERDADERO y dejaba pasar).
  //   sequence_steps_condition_no_continue_chk — y no puede continuar ante
  //     error (mandaba el correo sin haber evaluado nada).
  if (table === 'sequence_steps' && mode === 'insert' && String(row.channel) === 'condition') {
    const cond = row.condition;
    const empty = cond === undefined || cond === null
      || (Array.isArray(cond) ? cond.length === 0
        : typeof cond === 'object' ? Object.keys(cond as object).length === 0 : true);
    if (empty) return checkViolation('sequence_steps', 'condition_required');
    if (row.continue_on_error === true) return checkViolation('sequence_steps', 'condition_no_continue');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Doble de Supabase con escritura + RPC
// ─────────────────────────────────────────────────────────────────────────────

interface DbOpts {
  /** Fuerza un error en el UPDATE n-ésimo de una tabla (simula caída a media). */
  failUpdate?: (table: string, patch: Record<string, unknown>, n: number) => PgError | null;
  /**
   * Fuerza un error en el SELECT n-ésimo de una tabla. Hace falta para el
   * aislamiento del barrido (ronda 3, N9): `processStepRun` lanza ante
   * cualquier error de lectura y antes eso envenenaba el lote entero.
   */
  failSelect?: (table: string, n: number) => PgError | null;
}

function makeDb(tables: Record<string, Record<string, any>[]>, opts: DbOpts = {}) {
  let seq = 0;
  const nextId = () => `id-${String(++seq).padStart(4, '0')}`;
  const updateCounts: Record<string, number> = {};
  const selectCounts: Record<string, number> = {};
  const all = (table: string) => (tables[table] ??= []);

  const from = (table: string) => {
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let single = false;
    let pending: Record<string, unknown>[] = [];
    let patch: Record<string, unknown> = {};
    const preds: Array<(r: any) => boolean> = [];
    let limitN: number | null = null;
    let sortCol: string | null = null;
    let sortAsc = true;
    let error: PgError | null = null;

    const matched = () => all(table).filter((r) => preds.every((p) => p(r)));

    const resolve = (): { data: any; error: PgError | null } => {
      if (error) return { data: null, error };
      if (mode === 'insert') {
        const created: any[] = [];
        for (const raw of pending) {
          const row = withDefaults(table, raw);
          const err = validateRow(table, row, 'insert');
          if (err) return { data: null, error: err };
          const withId = { id: nextId(), ...row };
          all(table).push(withId);
          created.push(withId);
        }
        return { data: single ? created[0] ?? null : created, error: null };
      }
      if (mode === 'update') {
        const n = (updateCounts[table] = (updateCounts[table] ?? 0) + 1);
        const forced = opts.failUpdate?.(table, patch, n) ?? null;
        if (forced) return { data: null, error: forced };
        const err = validateRow(table, patch, 'update');
        if (err) return { data: null, error: err };
        const rows = matched();
        for (const r of rows) Object.assign(r, patch);
        return { data: single ? rows[0] ?? null : rows, error: null };
      }
      if (mode === 'delete') {
        const rows = matched();
        tables[table] = all(table).filter((r) => !rows.includes(r));
        return { data: rows, error: null };
      }
      const selectN = (selectCounts[table] = (selectCounts[table] ?? 0) + 1);
      const forcedSelect = opts.failSelect?.(table, selectN) ?? null;
      if (forcedSelect) return { data: null, error: forcedSelect };
      let rows = matched();
      if (sortCol) {
        const c = sortCol;
        rows = [...rows].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0));
        if (!sortAsc) rows.reverse();
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: single ? rows[0] ?? null : rows, error: null };
    };

    const b: any = {
      select: (_c?: string, o?: { count?: string }) => { if (mode === 'select' && o) { /* count */ } return b; },
      insert: (rows: any) => { mode = 'insert'; pending = Array.isArray(rows) ? rows : [rows]; return b; },
      update: (p: any) => { mode = 'update'; patch = p; return b; },
      delete: () => { mode = 'delete'; return b; },
      eq: (c: string, v: unknown) => { preds.push((r) => r[c] === v); return b; },
      neq: (c: string, v: unknown) => { preds.push((r) => r[c] !== v); return b; },
      in: (c: string, list: unknown[]) => { preds.push((r) => list.includes(r[c])); return b; },
      lte: (c: string, v: string) => { preds.push((r) => r[c] != null && String(r[c]) <= String(v)); return b; },
      gte: (c: string, v: string) => { preds.push((r) => r[c] != null && String(r[c]) >= String(v)); return b; },
      order: (c: string, o?: { ascending?: boolean }) => { sortCol = c; sortAsc = o?.ascending !== false; return b; },
      limit: (n: number) => { limitN = n; return b; },
      range: (a2: number, z: number) => { limitN = z - a2 + 1; return b; },
      maybeSingle: () => { single = true; return b; },
      single: () => { single = true; return b; },
      then: (res: (v: any) => void) => res(resolve()),
    };
    return b;
  };

  /** Emula `fn_enroll_in_sequence` (crm_v4_f08_02_enroll_rpc). */
  const enrollRpc = (p: Record<string, any>): { data: any; error: PgError | null } => {
    const org = p.p_org as number;
    const seqRow = all('sequences').find((s) => s.id === p.p_sequence_id && s.organization_id === org);
    if (!seqRow) return { data: null, error: raisedException('sequence_not_found') };
    if (seqRow.is_active === false) return { data: null, error: raisedException('sequence_inactive') };

    let customerId: string | null = p.p_customer_id ?? null;
    if (p.p_opportunity_id) {
      const opp = all('opportunities').find((o) => o.id === p.p_opportunity_id && o.organization_id === org);
      if (!opp) return { data: null, error: raisedException('opportunity_not_found') };
      customerId = opp.customer_id ?? customerId ?? null;
    } else if (customerId) {
      const cust = all('customers').find((c) => c.id === customerId && c.organization_id === org);
      if (!cust) return { data: null, error: raisedException('customer_not_found') };
    } else {
      return { data: null, error: raisedException('opportunity_or_customer_required') };
    }

    // Índice único parcial: una sola inscripción viva por secuencia+oportunidad.
    const live = all('sequence_enrollments').find((e) =>
      e.sequence_id === p.p_sequence_id
      && e.organization_id === org
      && ['active', 'paused'].includes(e.status)
      && (p.p_opportunity_id ? e.opportunity_id === p.p_opportunity_id : e.opportunity_id == null && e.customer_id === customerId));
    if (live) {
      return { data: { created: false, reason: 'already_active', enrollment_id: live.id, steps: 0 }, error: null };
    }

    const steps = all('sequence_steps')
      .filter((s) => s.sequence_id === p.p_sequence_id && s.organization_id === org && s.is_active !== false)
      .sort((a, b2) => a.step_number - b2.step_number);
    if (steps.length === 0) return { data: null, error: raisedException('sequence_has_no_active_steps') };

    const startAt = new Date(p.p_start_at ?? new Date().toISOString());
    const enrollmentRow = withDefaults('sequence_enrollments', {
      organization_id: org,
      sequence_id: p.p_sequence_id,
      opportunity_id: p.p_opportunity_id ?? null,
      customer_id: customerId,
      status: 'active',
      enrolled_at: startAt.toISOString(),
      source: p.p_source ?? 'manual',
      enrolled_by: p.p_enrolled_by ?? null,
    });
    const enrollErr = validateRow('sequence_enrollments', enrollmentRow, 'insert');
    if (enrollErr) return { data: null, error: enrollErr };
    const enrollment = { id: nextId(), ...enrollmentRow };

    // La transacción se valida ENTERA antes de publicar nada (atomicidad).
    const runs: any[] = [];
    let first: string | null = null;
    for (const step of steps) {
      const scheduled = new Date(startAt.getTime());
      scheduled.setDate(scheduled.getDate() + (step.delay_days ?? 0));
      scheduled.setHours(scheduled.getHours() + (step.delay_hours ?? 0));
      const runRow = withDefaults('sequence_step_runs', {
        organization_id: org,
        enrollment_id: enrollment.id,
        step_id: step.id,
        status: 'pending',
        scheduled_at: Number.isNaN(scheduled.getTime()) ? null : scheduled.toISOString(),
      });
      const runErr = validateRow('sequence_step_runs', runRow, 'insert');
      if (runErr) return { data: null, error: runErr }; // rollback: nada se publicó
      const run: any = { id: nextId(), ...runRow };
      runs.push(run);
      if (!first || String(run.scheduled_at) < first) first = String(run.scheduled_at);
    }

    all('sequence_enrollments').push(enrollment);
    for (const run of runs) all('sequence_step_runs').push(run);

    // Programación ENCADENADA (crm_v4_f08_03_enroll_chain_and_resume, tester r2
    // N1): solo se encola el job del PRIMER paso; el resto los encola
    // `processStepRun` al terminar el anterior. Antes se encolaba uno por paso,
    // todos con el mismo `run_at`.
    const firstRun = runs[0];
    const jobId = enqueueRpc({
      p_org: org,
      p_kind: 'sequence_step',
      p_payload: { step_run_id: firstRun.id, enrollment_id: enrollment.id },
      p_run_at: firstRun.scheduled_at,
      p_dedupe_key: `seqrun:${firstRun.id}`,
      p_max_attempts: 3,
    }).data as string;
    firstRun.job_id = jobId;

    // Siembra del barrido de respaldo por organización (tester r2 N2).
    enqueueRpc({
      p_org: org,
      p_kind: 'time_events',
      p_payload: { scope: 'sequences' },
      p_run_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      p_dedupe_key: `time_events:${org}`,
      p_max_attempts: 3,
    });

    (enrollment as any).next_run_at = firstRun.scheduled_at;
    (enrollment as any).current_step_id = firstRun.step_id;

    return {
      data: { created: true, enrollment_id: enrollment.id, steps: runs.length, first_run_at: first },
      error: null,
    };
  };

  /** Emula `fn_enqueue_job` (índice parcial único por dedupe_key vivo). */
  const enqueueRpc = (p: Record<string, any>): { data: any; error: PgError | null } => {
    if (!OUTBOUND_JOB_KINDS.includes(String(p.p_kind))) {
      return { data: null, error: checkViolation('outbound_jobs', 'kind') };
    }
    const dedupe = p.p_dedupe_key ?? null;
    if (dedupe) {
      const live = all('outbound_jobs').find((j) =>
        j.organization_id === p.p_org && j.dedupe_key === dedupe && ['queued', 'running'].includes(j.status));
      if (live) return { data: live.id, error: null };
    }
    const id = nextId();
    all('outbound_jobs').push({
      id,
      organization_id: p.p_org,
      kind: p.p_kind,
      payload: p.p_payload ?? {},
      status: 'queued',
      run_at: p.p_run_at ?? new Date().toISOString(),
      dedupe_key: dedupe,
      attempts: 0,
      max_attempts: p.p_max_attempts ?? 5,
    });
    return { data: id, error: null };
  };

  /** Emula `fn_resume_sequence_enrollment` (crm_v4_f08_03, tester r2 N3). */
  const resumeRpc = (p: Record<string, any>): { data: any; error: PgError | null } => {
    const org = p.p_org as number;
    const enrollment = all('sequence_enrollments').find((e) => e.id === p.p_enrollment_id && e.organization_id === org);
    if (!enrollment) return { data: null, error: raisedException('enrollment_not_found') };
    if (enrollment.status !== 'paused') {
      return { data: { resumed: false, reason: 'not_paused', status: enrollment.status }, error: null };
    }
    const pending = all('sequence_step_runs')
      .filter((r) => r.enrollment_id === enrollment.id && r.organization_id === org && r.status === 'pending')
      .map((r) => ({ r, n: all('sequence_steps').find((st) => st.id === r.step_id)?.step_number ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b2) => a.n - b2.n);

    if (pending.length === 0) {
      enrollment.status = 'completed';
      enrollment.paused_reason = null;
      enrollment.paused_at = null;
      enrollment.exited_at = new Date().toISOString();
      enrollment.exit_reason = 'all_steps_completed';
      return { data: { resumed: false, reason: 'no_pending_steps', status: 'completed' }, error: null };
    }

    const next = pending[0].r;
    const sched = new Date(Math.max(new Date(next.scheduled_at).getTime(), Date.now())).toISOString();
    next.scheduled_at = sched;
    enrollment.status = 'active';
    enrollment.paused_reason = null;
    enrollment.paused_at = null;
    enrollment.next_run_at = sched;
    enrollment.current_step_id = next.step_id;
    next.job_id = enqueueRpc({
      p_org: org,
      p_kind: 'sequence_step',
      p_payload: { step_run_id: next.id, enrollment_id: enrollment.id },
      p_run_at: sched,
      p_dedupe_key: `seqrun:${next.id}`,
      p_max_attempts: 3,
    }).data;
    return {
      data: { resumed: true, enrollment_id: enrollment.id, step_run_id: next.id, next_run_at: sched, status: 'active' },
      error: null,
    };
  };

  const rpc = (name: string, params: Record<string, any>) => {
    const result = name === 'fn_enroll_in_sequence'
      ? enrollRpc(params)
      : name === 'fn_enqueue_job'
        ? enqueueRpc(params)
        : name === 'fn_resume_sequence_enrollment'
          ? resumeRpc(params)
          : name === 'fn_create_org_notification'
            ? { data: nextId(), error: null }
            : name === 'fn_pause_sequences_on_reply'
              ? { data: 0, error: null }
              : { data: null, error: { message: `function public.${name} does not exist`, code: '42883', details: null, hint: null } };
    return { then: (res: (v: any) => void) => res(result) } as any;
  };

  return { client: { from, rpc } as unknown as SupabaseClient, tables };
}

const ORG = 125;
const OTHER_ORG = 999;

const readSrc = (file: string) =>
  require('fs').readFileSync(require('path').join(process.cwd(), 'src/lib/services/crm', file), 'utf8') as string;

function baseTables() {
  return {
    automation_rules: [] as any[],
    automation_runs: [] as any[],
    sequences: [] as any[],
    sequence_steps: [] as any[],
    sequence_enrollments: [] as any[],
    sequence_step_runs: [] as any[],
    outbound_jobs: [] as any[],
    tasks: [] as any[],
    activities: [] as any[],
    opportunities: [
      { id: 'opp-1', organization_id: ORG, customer_id: 'cus-1', status: 'open', temperature: 'warm', stage_id: 'stg-1', amount: 1000 },
      { id: 'opp-other', organization_id: OTHER_ORG, customer_id: 'cus-other', status: 'open' },
    ],
    customers: [
      { id: 'cus-1', organization_id: ORG, full_name: 'Cliente Uno', email: 'cliente@ejemplo.com', phone: '+573001112233', metadata: { do_not_email: true } },
      { id: 'cus-other', organization_id: OTHER_ORG, full_name: 'Otra Org', email: 'otra@ejemplo.com', phone: null },
    ],
  };
}

function addRule(t: any, actions: any[], extra: Partial<Record<string, unknown>> = {}) {
  const rule = {
    id: 'rule-1', organization_id: ORG, name: 'R', description: null, trigger_type: 'manual',
    trigger_config: {}, conditions: [], actions, is_active: true, priority: 100,
    run_once_per_opportunity: false, cooldown_hours: 0, version: 1, runs_count: 0, ...extra,
  };
  t.automation_rules.push(rule);
  return rule;
}

function addSequence(t: any, steps: any[], seqExtra: Partial<Record<string, unknown>> = {}) {
  const seq = { id: 'seq-1', organization_id: ORG, name: 'S', trigger_type: 'manual', trigger_config: {}, exit_conditions: [], is_active: true, pause_on_reply: true, ...seqExtra };
  t.sequences.push(seq);
  steps.forEach((s, i) => t.sequence_steps.push({
    id: `step-${i + 1}`, organization_id: ORG, sequence_id: seq.id, step_number: i + 1,
    delay_days: 0, delay_hours: 0, channel: 'email', template_id: null, action_config: {}, is_active: true, ...s,
  }));
  return seq;
}

/**
 * Drena la cola como el runner de producción: reclama los jobs `sequence_step`
 * vencidos ordenando SOLO por `run_at` —igual que `fn_claim_jobs`, que no
 * desempata— y ejecuta `processStepRun`.
 *
 * Con `lastOnTie` se elige el ÚLTIMO job del empate, que es el orden MÁS
 * ADVERSO posible: el que hacía salir el correo antes de evaluar la condición
 * (tester r2 N1). El caso E4 no cubría este camino porque ejercita el barrido
 * secuencial, que respeta el orden de inserción del doble.
 */
async function drainQueue(
  client: SupabaseClient,
  tables: Record<string, any[]>,
  orgId: number,
  opts: { lastOnTie?: boolean; maxTicks?: number } = {},
): Promise<{ stepRunId: string; status: string }[]> {
  const done: { stepRunId: string; status: string }[] = [];
  const maxTicks = opts.maxTicks ?? 25;
  for (let tick = 0; tick < maxTicks; tick++) {
    const due = (tables.outbound_jobs ?? []).filter(
      (j) => j.kind === 'sequence_step' && j.status === 'queued'
        && j.organization_id === orgId
        && new Date(j.run_at).getTime() <= Date.now(),
    );
    if (due.length === 0) break;
    const minRunAt = due.reduce((m, j) => (String(j.run_at) < m ? String(j.run_at) : m), String(due[0].run_at));
    const tied = due.filter((j) => String(j.run_at) === minRunAt);
    const job = opts.lastOnTie ? tied[tied.length - 1] : tied[0];
    job.status = 'running';
    const run = await processStepRun(job.payload.step_run_id, orgId, client);
    job.status = 'done';
    done.push({ stepRunId: job.payload.step_run_id, status: run.status });
  }
  return done;
}

/** Logger mudo para los handlers de la cola. */
const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };

/** Encolador falso: evita tocar la cola real en los pasos de WhatsApp. */
function fakeEnqueue() {
  const calls: any[] = [];
  const fn = jest.fn(async (input: any) => { calls.push(input); return `job-${calls.length}`; });
  return { fn: fn as any, calls };
}

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(async () => ({ id: `email-${Math.random().toString(16).slice(2, 8)}` }));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// 0. Fidelidad del doble contra el esquema real (si esto falla, nada más vale)
// ═════════════════════════════════════════════════════════════════════════════

describe('0. El doble reproduce el esquema real', () => {
  it('0a: sequence_enrollments.enrolled_at tiene DEFAULT now() y vuelve en el INSERT ... select()', async () => {
    const { client, tables } = makeDb(baseTables());
    const before = Date.now();
    await client.from('sequence_enrollments').insert({ organization_id: ORG, sequence_id: 'seq-1', status: 'active' }).select().single();
    const row = tables.sequence_enrollments[0];
    expect(typeof row.enrolled_at).toBe('string');
    expect(new Date(row.enrolled_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.status).toBe('active');
  });

  it('0b: sequence_steps.delay_days tiene DEFAULT 0 (nunca llega null al cálculo)', async () => {
    const { client, tables } = makeDb(baseTables());
    await client.from('sequence_steps').insert({ organization_id: ORG, sequence_id: 'seq-1', step_number: 1, channel: 'email' });
    expect(tables.sequence_steps[0].delay_days).toBe(0);
  });

  it('0c: NOT NULL sin default -> 23502 (sequence_step_runs.scheduled_at)', async () => {
    const { client } = makeDb(baseTables());
    const { error } = await client.from('sequence_step_runs').insert({ organization_id: ORG, enrollment_id: 'e', step_id: 's' });
    expect(error).toEqual(expect.objectContaining({ code: '23502' }));
  });

  it('0d: el canal `task` SÍ está permitido por sequence_steps_channel_check', () => {
    expect(CHECKS.sequence_steps.channel).toContain('task');
    expect(validateRow('sequence_steps', { organization_id: ORG, sequence_id: 's', step_number: 1, channel: 'task' })).toBeNull();
    expect(validateRow('sequence_steps', { organization_id: ORG, sequence_id: 's', step_number: 1, channel: 'ai_call' }))
      .toEqual(expect.objectContaining({ code: '23514' }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A. Dos trabajadores reclamando el mismo trabajo
// ═════════════════════════════════════════════════════════════════════════════

describe('A. Concurrencia: dos trabajadores sobre el mismo step_run', () => {
  function seedOneRun() {
    const t = baseTables();
    addSequence(t, [{}]);
    t.sequence_enrollments.push({ id: 'enr-1', organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-1', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    return makeDb(t);
  }

  it('A1: dos llamadas concurrentes a processStepRun envían el correo UNA sola vez (reclamo atómico)', async () => {
    const { client, tables } = seedOneRun();
    await Promise.all([
      processStepRun('run-1', ORG, client),
      processStepRun('run-1', ORG, client),
    ]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(tables.sequence_step_runs[0].status).toBe('completed');
  });

  it('A2: dos ejecuciones solapadas del cron (processPendingStepRuns) no duplican el envío', async () => {
    const { client } = seedOneRun();
    await Promise.all([
      processPendingStepRuns(ORG, client),
      processPendingStepRuns(ORG, client),
    ]);
    expect(sendEmailMock.mock.calls.length).toBe(1);
  });

  it('A3: el UPDATE a running lleva guarda .eq(status,pending): el segundo worker no entra', () => {
    const src = readSrc('sequenceService.ts');
    const claim = src.slice(src.indexOf('export async function claimStepRun'), src.indexOf('export async function reclaimStaleStepRuns'));
    expect(claim).toContain("status: 'running'");
    expect(claim).toContain(".eq('status', 'pending')");
    expect(claim).toContain(".eq('organization_id', orgId)");
  });

  it('A4: un step_run que quedó en running tras una caída lo recupera el barrido', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    t.sequence_enrollments.push({ id: 'enr-1', organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-1', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-1', status: 'running', executed_at: new Date(Date.now() - 3 * 3600_000).toISOString(), scheduled_at: new Date(Date.now() - 4 * 3600_000).toISOString() });
    const { client, tables } = makeDb(t);
    const r = await processPendingStepRuns(ORG, client);
    expect(r.reclaimed).toBe(1);
    expect(r.processed).toBe(1);
    expect(tables.sequence_step_runs[0].status).toBe('completed'); // ya no se queda atascado
  });

  it('A5: los kinds `automation` y `sequence_step` tienen handler registrado (motor conectado a la cola)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
    require('@/lib/jobs/handlers');
    // Registro de F8 (el índice compartido solo tiene que importar este módulo).
    require('@/lib/jobs/handlers/f8Automations');
    const { getJobHandler } = require('@/lib/jobs/registry');
    expect(OUTBOUND_JOB_KINDS).toEqual(expect.arrayContaining(['automation', 'sequence_step']));
    expect(getJobHandler('automation')).toBeDefined();
    expect(getJobHandler('sequence_step')).toBeDefined();
    expect(getJobHandler('crm_event')).toBeDefined();
  });

  it('A6: el motor de F8 encola en `outbound_jobs` y escucha el outbox `crm_events`', () => {
    const engine = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/services/crm/automation/automationEngine.ts'), 'utf8') as string;
    expect(engine).toMatch(/onCrmEvent/);
    expect(engine).toMatch(/enqueueJob/);
    expect(engine).toMatch(/evaluateTrigger/);
    // El servicio de secuencias también encola (paso de WhatsApp).
    expect(readSrc('sequenceService.ts')).toMatch(/enqueueJob/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. Regla que se dispara sin tope / en cascada consigo misma
// ═════════════════════════════════════════════════════════════════════════════

describe('B. Reglas: interruptor, idempotencia y run_once', () => {
  it('B1: una regla DESACTIVADA no se ejecuta desde /trigger (run `skipped`, sin envío)', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', to: 'a@b.com', subject: 's', html: '<p>x</p>' }], { is_active: false });
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, {}, client);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('skipped');
    expect(tables.automation_runs[0].skip_reason).toBe('rule_inactive');
  });

  it('B2: 5 disparos del mismo evento con run_once = 1 correo (los demás quedan `skipped`)', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', subject: 's', html: '<p>x</p>' }], { run_once_per_opportunity: true });
    const { client, tables } = makeDb(t);
    for (let i = 0; i < 5; i++) {
      await executeAutomationRule('rule-1', ORG, { event_id: 'evt-1', opportunity_id: 'opp-1' }, client);
    }
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(tables.automation_runs).toHaveLength(5);
    expect(tables.automation_runs.filter((r: any) => r.status === 'skipped')).toHaveLength(4);
    expect(tables.automation_runs.filter((r: any) => r.skip_reason === 'run_once_per_opportunity')).toHaveLength(4);
  });

  it('B3: cascada — enroll_sequence 4 veces deja UNA inscripción viva y sus pasos una sola vez', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2 }]);
    addRule(t, [{ type: 'enroll_sequence', sequence_id: 'seq-1' }]);
    const { client, tables } = makeDb(t);
    for (let i = 0; i < 4; i++) {
      await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);
    }
    expect(tables.sequence_enrollments).toHaveLength(1);
    expect(tables.sequence_step_runs).toHaveLength(2); // 1 inscripción × 2 pasos
    await processPendingStepRuns(ORG, client);
    expect(sendEmailMock.mock.calls.length).toBe(2);
  });

  it('B4: el servicio implementa run_once y cooldown como guardas reales', () => {
    const src = readSrc('automationService.ts');
    expect(src).toMatch(/run_once_per_opportunity/);
    expect(src).toMatch(/cooldown_hours/);
    expect(src).toMatch(/alreadyRan/);
  });

  it('B5 (PASA): update_field respeta la allow-list y rechaza tabla/columna arbitraria', async () => {
    expect(() => validateUpdateField('users', 'password', 'x')).toThrow(/entidad no permitida/);
    expect(() => validateUpdateField('opportunities', 'stage_id', 'stg-2')).toThrow(/columna no permitida/);
    expect(() => validateUpdateField('opportunities', 'organization_id', 1)).toThrow(/columna no permitida/);
    expect(() => validateUpdateField('opportunities', 'temperature', 'nuclear')).toThrow(/temperature debe ser/);
    expect(Object.keys(UPDATE_FIELD_ALLOWLIST).sort()).toEqual(['customers', 'opportunities', 'tasks']);
  });

  it('B6 (PASA): update_field escribe con .eq(organization_id) — no cruza organizaciones', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'update_field', entity: 'opportunities', entity_id: 'opp-other', field_name: 'temperature', field_value: 'hot' }]);
    const { client, tables } = makeDb(t);
    await executeAutomationRule('rule-1', ORG, {}, client);
    expect(tables.opportunities.find((o: any) => o.id === 'opp-other')!.temperature).toBeUndefined();
  });

  it('B7: las 6 rutas de F8 exigen rol de administrador para mutar', () => {
    const fs = require('fs');
    const path = require('path');
    const routes = [
      'src/app/api/crm/automation-rules/route.ts',
      'src/app/api/crm/automation-rules/[id]/route.ts',
      'src/app/api/crm/automation-rules/[id]/trigger/route.ts',
      'src/app/api/crm/sequences/route.ts',
      'src/app/api/crm/sequences/[id]/route.ts',
      'src/app/api/crm/sequences/[id]/enroll/route.ts',
    ];
    for (const r of routes) {
      const src = fs.readFileSync(path.join(process.cwd(), r), 'utf8') as string;
      expect(src).toContain('getServerOrgContext');
      expect(src).toMatch(/requireOrgAdmin\(ctx\)/);
    }
    expect(fs.readFileSync(path.join(process.cwd(), 'src/lib/utils/orgContext.ts'), 'utf8')).toContain('requireOrgAdmin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. Reintento tras un envío ya entregado / errores tragados
// ═════════════════════════════════════════════════════════════════════════════

describe('C. Reintentos y errores visibles', () => {
  it('C1: el correo sale y el UPDATE final falla -> el paso queda recuperable y el error se reporta', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    t.sequence_enrollments.push({ id: 'enr-1', organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-1', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    const { client, tables } = makeDb(t, {
      failUpdate: (table, patch) =>
        table === 'sequence_step_runs' && patch.status === 'completed'
          ? { message: 'network', code: '08006', details: null, hint: null }
          : null,
    });
    const result = await processStepRun('run-1', ORG, client);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // El error de persistencia NO se traga: viaja en el resultado devuelto.
    expect(result.error_message).toMatch(/persist_error/);
    // La fila sigue `running` y el barrido la recupera (no se pierde el paso).
    expect(tables.sequence_step_runs[0].status).toBe('running');
    // Y el envío llevaba clave de idempotencia: un reintento no duplica el correo.
    expect(sendEmailMock.mock.calls[0][1].idempotency_key).toBe('seqrun:run-1');
  });

  it('C2: reintentar un run ya ejecutado no vuelve a enviar (reclamo) y conserva la idempotencia', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2, delay_days: 7 }]);
    t.sequence_enrollments.push({ id: 'enr-1', organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-1', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    t.sequence_step_runs.push({ id: 'run-2', organization_id: ORG, enrollment_id: 'enr-1', step_id: 'step-2', status: 'pending', scheduled_at: new Date(Date.now() + 7 * 86400_000).toISOString() });
    const { client, tables } = makeDb(t);
    await processStepRun('run-1', ORG, client);
    expect(tables.sequence_step_runs[0].status).toBe('completed');
    expect(tables.sequence_step_runs[0].result).toEqual(expect.objectContaining({ channel: 'email' }));

    // "Reintentar" el mismo job: el reclamo falla porque ya no está `pending`.
    const again = await processStepRun('run-1', ORG, client);
    expect(again.status).toBe('completed');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('C3: una acción que falla marca el run como `failed` con su error_message', async () => {
    const t = baseTables();
    addRule(t, [
      { type: 'create_task', title: 'T', due_in_days: 3 },
      { type: 'send_sms', text: 'hola' },
    ]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);
    expect(run.status).toBe('failed');
    const results = (tables.automation_runs[0].result as any).results as any[];
    expect(results[0]).toEqual(expect.objectContaining({ type: 'create_task', status: 'ok' }));
    expect(results[1]).toEqual(expect.objectContaining({ type: 'send_sms', status: 'failed', code: 'action_not_implemented' }));
    expect(tables.automation_runs[0].error_message).toMatch(/action_not_implemented/);
  });

  it('C4: un tipo de acción desconocido se reporta como FALLO, no como éxito', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_carrier_pigeon' as any, to: '+57300' }]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, {}, client);
    expect(run.status).toBe('failed');
    expect((tables.automation_runs[0].result as any).results[0]).toEqual(
      expect.objectContaining({ status: 'failed', code: 'unknown_action' }),
    );
  });

  it('C5: los errores de BD ya no se tragan en console.warn: los servicios lanzan', () => {
    const auto = readSrc('automationService.ts');
    const seqs = readSrc('sequenceService.ts');
    expect(auto).not.toContain('console.warn(');
    expect(seqs).not.toContain('console.warn(');
    expect(auto).toMatch(/throw new Error\(`getAutomationRules/);
    expect(seqs).toMatch(/throw new Error\(`getSequences/);
  });

  it('C6: si el INSERT de step_runs falla, NO queda inscripción huérfana (todo o nada)', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    (t.sequence_steps as any[])[0].id = null; // step sin id -> step_id null -> 23502
    const { client, tables } = makeDb(t);
    await expect(enrollInSequence(ORG, 'seq-1', 'opp-1', client)).rejects.toThrow(/step_id|23502|null value/);
    expect(tables.sequence_step_runs).toHaveLength(0);
    expect(tables.sequence_enrollments).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. Inscripción doble en la misma secuencia
// ═════════════════════════════════════════════════════════════════════════════

describe('D. Inscripciones duplicadas y validación de la inscripción', () => {
  it('D1: inscribir dos veces la misma oportunidad deja UNA inscripción y sus pasos una vez', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2, delay_days: 3 }]);
    const { client, tables } = makeDb(t);
    const first = await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const second = await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.reason).toBe('already_active');
    expect(second.id).toBe(first.id);
    expect(tables.sequence_enrollments).toHaveLength(1);
    expect(tables.sequence_step_runs).toHaveLength(2);
  });

  it('D1b: 20 inscripciones seguidas = 1 correo al cliente en el primer tick', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    for (let i = 0; i < 20; i++) await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    expect(tables.sequence_enrollments).toHaveLength(1);
    await processPendingStepRuns(ORG, client, 100);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const destinos = new Set(sendEmailMock.mock.calls.map((c: any[]) => c[1].to));
    expect(destinos).toEqual(new Set(['cliente@ejemplo.com']));
  });

  it('D2: NO se puede inscribir en una secuencia desactivada', async () => {
    const t = baseTables();
    addSequence(t, [{}], { is_active: false });
    const { client, tables } = makeDb(t);
    await expect(enrollInSequence(ORG, 'seq-1', 'opp-1', client)).rejects.toThrow(/sequence_inactive/);
    expect(tables.sequence_enrollments).toHaveLength(0);
    await processPendingStepRuns(ORG, client);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('D3: inscribir una oportunidad de OTRA organización falla y no crea nada', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await expect(enrollInSequence(ORG, 'seq-1', 'opp-other', client)).rejects.toThrow(/opportunity_not_found/);
    expect(tables.sequence_enrollments).toHaveLength(0);
  });

  it('D4: una secuencia sin pasos no admite inscripción (nada de inscritos fantasma)', async () => {
    const t = baseTables();
    addSequence(t, []);
    const { client, tables } = makeDb(t);
    await expect(enrollInSequence(ORG, 'seq-1', 'opp-1', client)).rejects.toThrow(/sequence_has_no_active_steps/);
    expect(tables.sequence_enrollments).toHaveLength(0);
  });

  it('D5: processStepRun filtra por organización: no toca la inscripción de otra org', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'wait' }]);
    // enrollment de OTRA org, referenciado por un run de la nuestra
    t.sequence_enrollments.push({ id: 'enr-x', organization_id: OTHER_ORG, sequence_id: 'seq-1', opportunity_id: null, customer_id: null, status: 'active', enrolled_at: new Date().toISOString() });
    t.sequence_step_runs.push({ id: 'run-x', organization_id: ORG, enrollment_id: 'enr-x', step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    const { client, tables } = makeDb(t);
    const run = await processStepRun('run-x', ORG, client);
    expect(run.status).toBe('skipped');
    expect((run.result as any).reason).toBe('enrollment_not_found');
    expect(tables.sequence_enrollments.find((e: any) => e.id === 'enr-x')!.status).toBe('active');
    const src = readSrc('sequenceService.ts');
    const exit = src.slice(
      src.indexOf('export async function checkExitConditions'),
      src.indexOf('export async function processPendingStepRuns'),
    );
    expect(exit.length).toBeGreaterThan(500);
    expect(exit).toMatch(/organization_id/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E. Contacto dado de baja / consentimiento
// ═════════════════════════════════════════════════════════════════════════════

describe('E. Consentimiento y destinatario', () => {
  it('E1: send_email ignora el destinatario del payload de la petición', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', subject: 's', html: '<p>x</p>' }]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, { customer_email: 'atacante@dominio-externo.com' }, client);
    // Sin cliente en el contexto no hay a quién escribir: la acción falla.
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('failed');
    expect((tables.automation_runs[0].result as any).results[0]).toEqual(
      expect.objectContaining({ type: 'send_email', code: 'no_recipient' }),
    );
  });

  it('E1b: con oportunidad, el destinatario es su cliente y viaja con to_customer_id e idempotencia', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', subject: 's', html: '<p>x</p>' }]);
    const { client } = makeDb(t);
    await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1', customer_email: 'atacante@dominio-externo.com' }, client);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][1].to).toBe('cliente@ejemplo.com');
    expect(sendEmailMock.mock.calls[0][1].to_customer_id).toBe('cus-1');
    expect(sendEmailMock.mock.calls[0][1].idempotency_key).toMatch(/^rule:rule-1:run:/);
  });

  it('E2: F8 delega el consentimiento en F7/F16 pero SIEMPRE identifica al cliente', () => {
    const actions = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/services/crm/automation/actions.ts'), 'utf8') as string;
    expect(actions).toMatch(/to_customer_id/);
    expect(actions).toMatch(/idempotency_key/);
    // El envío de WhatsApp pasa por F16 (opt-out + ventana de 24 h) vía la cola.
    expect(actions).toMatch(/kind: 'whatsapp'/);
    expect(readSrc('sequenceService.ts')).toMatch(/to_customer_id: customer\.id/);
  });

  it('E2b (PASA): el paso `email` de una secuencia pasa to_customer_id, así que F7 aplica consentimiento', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(sendEmailMock.mock.calls[0][1].to_customer_id).toBe('cus-1');
    expect(sendEmailMock.mock.calls[0][1].sequence_step_run_id).toBeDefined();
  });

  it('E3: el paso whatsapp encola un envío real en F16 (ventana 24 h y opt-out incluidos allí)', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'whatsapp', action_config: { text: 'hola' } }]);
    const { client, tables } = makeDb(t);
    const enqueue = fakeEnqueue();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client, 50, { enqueue: enqueue.fn });
    const run = tables.sequence_step_runs[0];
    expect(run.status).toBe('completed');
    expect(run.result).toEqual(expect.objectContaining({ channel: 'whatsapp', queued: true }));
    expect(enqueue.calls[0]).toEqual(expect.objectContaining({ kind: 'whatsapp', organizationId: ORG }));
    expect(enqueue.calls[0].payload.message_request).toEqual(expect.objectContaining({ customerId: 'cus-1' }));
  });

  it('E4: el paso `condition` se evalúa de verdad: condición falsa corta la secuencia', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'condition', action_config: { condition: { field: 'opportunity.amount', operator: 'gte', value: 999999999 } } }, { step_number: 2, channel: 'email' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(tables.sequence_step_runs[0].result).toEqual(expect.objectContaining({ channel: 'condition', branch: false }));
    expect(sendEmailMock).not.toHaveBeenCalled(); // la condición era falsa: no se envía
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].status).toBe('exited');
    expect(tables.sequence_enrollments[0].exit_reason).toBe('condition_false');
  });

  it('E5: el paso `call` crea una tarea de llamada para el vendedor', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'call', action_config: { title: 'Llamar', script: 'Guion' } }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(tables.sequence_step_runs[0].status).toBe('completed');
    expect(tables.sequence_step_runs[0].result).toEqual(expect.objectContaining({ channel: 'call' }));
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0]).toEqual(expect.objectContaining({ type: 'call', status: 'open', related_to_id: 'opp-1' }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F. Salto de reloj y trabajos programados en el pasado
// ═════════════════════════════════════════════════════════════════════════════

describe('F. Programación temporal', () => {
  it('F1: delay_days negativo se rechaza al crear la secuencia (no se programa en el pasado)', async () => {
    const t = baseTables();
    const { client, tables } = makeDb(t);
    await expect(createSequence(ORG, {
      name: 'Con retardo negativo',
      steps: [{ step_number: 1, delay_days: -30, channel: 'email' }],
    }, client)).rejects.toThrow(/delay_days/);
    expect(tables.sequences).toHaveLength(0);
    expect(validateSequenceSteps([{ step_number: 1, delay_days: -30, channel: 'email' }])).toHaveLength(1);
  });

  it('F2: 6 pasos con delay_days 0 se programan al mismo instante (ráfaga configurada por el usuario)', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2 }, { step_number: 3 }, { step_number: 4 }, { step_number: 5 }, { step_number: 6 }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const times = new Set(tables.sequence_step_runs.map((r: any) => r.scheduled_at));
    expect(times.size).toBe(1);
    await processPendingStepRuns(ORG, client);
    expect(sendEmailMock).toHaveBeenCalledTimes(6);
  });

  it('F3: delay_days extremo se rechaza antes de tocar la BD (nada de inscritos con 0 pasos)', async () => {
    const t = baseTables();
    const { client, tables } = makeDb(t);
    await expect(createSequence(ORG, {
      name: 'Retardo imposible',
      steps: [{ step_number: 1, delay_days: 2147483647, channel: 'email' }],
    }, client)).rejects.toThrow(/delay_days/);
    expect(tables.sequences).toHaveLength(0);
    expect(tables.sequence_enrollments).toHaveLength(0);
    expect(MAX_DELAY_DAYS).toBe(3650);
  });

  it('F3b: la validación existe en el servicio Y en la ruta; la inscripción es una sola operación', () => {
    const fs = require('fs');
    const path = require('path');
    const src = readSrc('sequenceService.ts');
    expect(src).toMatch(/MAX_DELAY_DAYS/);
    expect(src).toMatch(/entero entre 0 y \$\{MAX_DELAY_DAYS\}/);
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/crm/sequences/route.ts'), 'utf8') as string;
    expect(route).toContain('validateSequenceInput');
    // enrollInSequence delega en la RPC transaccional (no hay 3 escrituras sueltas).
    expect(src).toContain("rpc('fn_enroll_in_sequence'");
  });

  it('F4: el cálculo de scheduled_at vive en la RPC; ventana de envío y zona horaria siguen pendientes', () => {
    const src = readSrc('sequenceService.ts');
    expect(src).not.toContain('scheduledAt.setDate(scheduledAt.getDate() + step.delay_days)');
    expect(src).toMatch(/delay_hours/);
    // Documentado como pendiente en el doc de fase (§13): send_window / business_days / tz.
    expect(src).not.toMatch(/send_window|business_days_only|send_at_local_time/);
  });

  it('F5 (PASA): un run programado en el futuro no se toma (comparación ISO en `lte`)', async () => {
    const t = baseTables();
    addSequence(t, [{ delay_days: 10 }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    expect(new Date(tables.sequence_step_runs[0].scheduled_at).getTime()).toBeGreaterThan(Date.now());
    const r = await processPendingStepRuns(ORG, client);
    expect(r.processed).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G. Fallo del proveedor a mitad de un lote
// ═════════════════════════════════════════════════════════════════════════════

describe('G. Fallo del proveedor a mitad de lote', () => {
  function seedBatch() {
    const t = baseTables();
    addSequence(t, [{}]);
    for (let i = 1; i <= 3; i++) {
      t.sequence_enrollments.push({ id: `enr-${i}`, organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1', customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString() });
      t.sequence_step_runs.push({ id: `run-${i}`, organization_id: ORG, enrollment_id: `enr-${i}`, step_id: 'step-1', status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString() });
    }
    return makeDb(t);
  }

  it('G1: el lote continúa tras el fallo del proveedor y el run fallido queda visible con su error', async () => {
    const { client, tables } = seedBatch();
    let n = 0;
    sendEmailMock.mockImplementation(async () => {
      n++;
      if (n === 2) throw new Error('Resend 503');
      return { id: `email-${n}` };
    });
    const r1 = await processPendingStepRuns(ORG, client);
    expect(r1).toEqual({ processed: 3, completed: 2, failed: 1, skipped: 0, reclaimed: 0, errors: 0, first_error: null });
    const r2 = await processPendingStepRuns(ORG, client);
    expect(r2.processed).toBe(0);
    const failed = tables.sequence_step_runs.filter((x: any) => x.status === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].error_message).toMatch(/Resend 503/);
  });

  it('G2: la inscripción del run fallido no se queda `active` para siempre', async () => {
    const { client, tables } = seedBatch();
    sendEmailMock.mockImplementation(async () => { throw new Error('Resend 503'); });
    await processPendingStepRuns(ORG, client);
    expect(tables.sequence_enrollments.every((e: any) => e.status !== 'active')).toBe(true);
  });

  it('G3: un cliente sin email hace fallar el paso con un motivo explícito', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    (t.customers[0] as any).email = null;
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(tables.sequence_step_runs[0].status).toBe('failed');
    expect(tables.sequence_step_runs[0].error_message).toBe('Customer no tiene email');
    expect(tables.sequence_enrollments[0].status).not.toBe('active');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H. Escritura contra el esquema REAL
// ═════════════════════════════════════════════════════════════════════════════

describe('H. Literales y columnas contra el esquema real', () => {
  it('H1: la acción create_task escribe `related_to_id` y la tarea se crea', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'create_task', title: 'T', due_in_days: 2 }]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);
    expect(run.status).toBe('completed');
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0]).toEqual(expect.objectContaining({
      related_to_id: 'opp-1', related_to_type: 'opportunity', status: 'open', title: 'T',
    }));
  });

  it('H2: el paso `task` de una secuencia crea la tarea y la inscripción avanza', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    await processPendingStepRuns(ORG, client);
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0].status).toBe('open');
    expect(tables.sequence_step_runs[0].status).toBe('completed');
    expect(tables.sequence_enrollments[0].status).toBe('completed');
  });

  it('H2b: los INSERT de tarea comparten un solo helper con el nombre correcto de columna', () => {
    const actions = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/services/crm/automation/actions.ts'), 'utf8') as string;
    expect(actions).toMatch(/export async function insertAutomationTask/);
    // Cuerpo del único INSERT en `tasks` de toda la fase.
    const helper = actions.slice(
      actions.indexOf('export async function insertAutomationTask'),
      actions.indexOf('function ownerOf'),
    );
    expect(helper).toMatch(/related_to_id/);
    expect(helper).toMatch(/related_to_type/);
    expect(helper).not.toMatch(/related_id:/);
    // Ni el servicio de reglas ni el de secuencias insertan en `tasks` por su cuenta.
    for (const src of [readSrc('automationService.ts'), readSrc('sequenceService.ts')]) {
      expect(src).not.toMatch(/from\('tasks'\)\s*\.insert/);
    }
  });

  it('H3: las tareas se crean con `status: open` (el CHECK real no admite `pending`)', () => {
    expect(validateRow('tasks', { organization_id: ORG, title: 'T', status: 'pending', related_to_id: 'x', related_to_type: 'opportunity' }))
      .toEqual(expect.objectContaining({ code: '23514' }));
    expect(validateRow('tasks', { organization_id: ORG, title: 'T', status: 'open', related_to_id: 'x', related_to_type: 'opportunity' }))
      .toBeNull();
    const actions = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/services/crm/automation/actions.ts'), 'utf8') as string;
    const helper = actions.slice(
      actions.indexOf('export async function insertAutomationTask'),
      actions.indexOf('function ownerOf'),
    );
    expect(helper).toMatch(/status: 'open'/);
    expect(helper).not.toMatch(/status:\s*'pending'/);
  });

  it('H4: create_activity rechaza un activity_type fuera del CHECK antes de escribir', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'create_activity', activity_type: 'follow_up', notes: 'x' }]);
    const { client, tables } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, {}, client);
    expect(tables.activities).toHaveLength(0);
    expect(run.status).toBe('failed');
    expect((tables.automation_runs[0].result as any).results[0]).toEqual(
      expect.objectContaining({ code: 'invalid_activity_type' }),
    );
  });

  it('H4b (PASA): con un activity_type válido la actividad se crea', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'create_activity', activity_type: 'system', notes: 'x' }]);
    const { client, tables } = makeDb(t);
    await executeAutomationRule('rule-1', ORG, {}, client);
    expect(tables.activities).toHaveLength(1);
    expect(tables.activities[0].activity_type).toBe('system');
  });

  it('H5: `automation_runs.status` ya admite `skipped` (migración crm_v4_f08_01)', () => {
    expect(CHECKS.automation_runs.status).toContain('skipped');
    expect(validateRow('automation_runs', { organization_id: ORG, automation_rule_id: 'r', trigger_type: 'manual', status: 'skipped' }))
      .toBeNull();
  });

  it('H6: `sequence_steps.channel` sigue sin `ai_call` (pendiente F6); `sequences.trigger_type` ya admite `event`', () => {
    expect(CHECKS.sequence_steps.channel).not.toContain('ai_call');
    expect(CHECKS.sequences.trigger_type).toContain('event');
  });

  it('H7: automation_rules / sequence_* ya tienen las columnas del plan', () => {
    for (const c of ['pipeline_id', 'stage_id', 'event', 'run_once_per_opportunity', 'cooldown_hours', 'version', 'template_key']) {
      expect(COLUMNS.automation_rules).toContain(c);
    }
    for (const c of ['delay_hours', 'next_step_on_true', 'next_step_on_false', 'condition']) {
      expect(COLUMNS.sequence_steps).toContain(c);
    }
    for (const c of ['current_step_id', 'next_run_at', 'paused_reason', 'timezone', 'source']) {
      expect(COLUMNS.sequence_enrollments).toContain(c);
    }
    for (const c of ['opportunity_id', 'event_id', 'actions_plan', 'dry_run', 'rule_version']) {
      expect(COLUMNS.automation_runs).toContain(c);
    }
  });

  it('H8 (PASA): update_field sobre `customers` escribe updated_at — la columna existe', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'update_field', entity: 'customers', entity_id: 'cus-1', field_name: 'lifecycle_stage', field_value: 'customer' }]);
    const { client, tables } = makeDb(t);
    await executeAutomationRule('rule-1', ORG, {}, client);
    expect(tables.customers[0].lifecycle_stage).toBe('customer');
  });

  it('H9: el kind `time_events` ya está en el CHECK real; `agent_orchestration` sigue sin estar (F6)', () => {
    expect(OUTBOUND_JOB_KINDS).toContain('time_events');
    expect(OUTBOUND_JOB_KINDS).not.toContain('agent_orchestration');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// N. Hallazgos nuevos de la ronda 2 del tester (N1-N8)
// ═════════════════════════════════════════════════════════════════════════════

describe('N. Ronda 2: orden de pasos, barrido, reanudar y residuos', () => {
  const FALSE_CONDITION = { field: 'opportunity.amount', operator: 'gte', value: 999999999 };

  function seedConditionThenEmail() {
    const t = baseTables();
    addSequence(t, [
      { channel: 'condition', action_config: { condition: FALSE_CONDITION } },
      { step_number: 2, channel: 'email' },
    ]);
    return makeDb(t);
  }

  it('N1a: POR LA COLA — condición falsa y correo en el mismo instante: el correo NO sale', async () => {
    const { client, tables } = seedConditionThenEmail();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    // Programación encadenada: un solo job vivo, y es el del paso 1.
    const seqJobs = tables.outbound_jobs.filter((j: any) => j.kind === 'sequence_step');
    expect(seqJobs).toHaveLength(1);
    const firstRun = tables.sequence_step_runs.find((r: any) => r.id === seqJobs[0].payload.step_run_id)!;
    const firstStep = tables.sequence_steps.find((st: any) => st.id === firstRun.step_id)!;
    expect(firstStep.step_number).toBe(1);

    const processed = await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(processed).toEqual([{ stepRunId: firstRun.id, status: 'completed' }]);
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].status).toBe('exited');
    expect(tables.sequence_enrollments[0].exit_reason).toBe('condition_false');
  });

  it('N1b: POR LA COLA — con un job duplicado del paso 2 empatado en run_at, la guarda lo frena', async () => {
    const { client, tables } = seedConditionThenEmail();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    // Se fabrica el job que la RPC encolaba antes de la ronda 2: mismo run_at.
    const second = tables.sequence_step_runs[1];
    tables.outbound_jobs.push({
      id: 'job-empatado',
      organization_id: ORG,
      kind: 'sequence_step',
      payload: { step_run_id: second.id, enrollment_id: second.enrollment_id },
      status: 'queued',
      run_at: second.scheduled_at,
      dedupe_key: 'seqrun-legacy',
    });

    // `lastOnTie` hace que el job del CORREO se reclame primero.
    await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].status).toBe('exited');
    // El paso frenado se reencoló con una clave propia (no pisa `seqrun:{id}`).
    expect(tables.outbound_jobs.some((j: any) => String(j.dedupe_key).includes(':wait:'))).toBe(true);
  });

  it('N1c: la guarda devuelve el paso a `pending` con motivo, sin ejecutarlo', async () => {
    const { client, tables } = seedConditionThenEmail();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const second = tables.sequence_step_runs[1];

    const run = await processStepRun(second.id, ORG, client);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('pending');
    expect(run.result).toEqual(expect.objectContaining({ reason: 'waiting_previous_step', waits: 1 }));
    expect(tables.sequence_step_runs[1].status).toBe('pending');
  });

  it('N1d: superado el tope de esperas el paso se marca `skipped`, nunca se envía adelantado', async () => {
    const { client, tables } = seedConditionThenEmail();
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const second = tables.sequence_step_runs[1];
    second.result = { reason: 'waiting_previous_step', waits: 999 };

    const run = await processStepRun(second.id, ORG, client);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('skipped');
    expect((run.result as any).reason).toBe('waiting_previous_step_timeout');
  });

  it('N1e: la cadena avanza sola — 3 pasos, 3 ejecuciones, un solo job vivo cada vez', async () => {
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2, channel: 'task' }, { step_number: 3, channel: 'wait' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    expect(tables.outbound_jobs.filter((j: any) => j.kind === 'sequence_step')).toHaveLength(1);
    const processed = await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(processed.map((x) => x.status)).toEqual(['completed', 'completed', 'completed']);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(tables.tasks).toHaveLength(1);
    expect(tables.sequence_enrollments[0].status).toBe('completed');
  });

  it('N2a: el kind `time_events` tiene handler real y la inscripción siembra su barrido', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
    require('@/lib/jobs/handlers/f8Automations');
    const { getJobHandler, hasRealJobHandler } = require('@/lib/jobs/registry');
    expect(getJobHandler('time_events')).toBeDefined();
    expect(hasRealJobHandler('time_events')).toBe(true);

    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const sweeps = tables.outbound_jobs.filter((j: any) => j.kind === 'time_events');
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0].dedupe_key).toBe(`time_events:${ORG}`);
  });

  it('N2b: el barrido rescata el paso cuyo job murió y se reprograma solo', async () => {
    const { timeEventsJobHandler } = require('@/lib/jobs/handlers/timeEvents');
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    // El job del paso agota intentos y queda `dead`: sin barrido, ese paso no
    // se ejecuta jamás y la inscripción se queda viva para siempre (tester N2).
    const job = tables.outbound_jobs.find((j: any) => j.kind === 'sequence_step')!;
    job.status = 'dead';
    tables.outbound_jobs = tables.outbound_jobs.filter((j: any) => j.kind !== 'time_events');

    const out: any = await timeEventsJobHandler({
      job: { id: 'sweep-1', organization_id: ORG, kind: 'time_events', payload: {} } as any,
      supabase: client,
      orgId: ORG,
      log: silentLog as any,
      signal: new AbortController().signal,
    });

    expect(out.processed).toBe(1);
    expect(out.completed).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(tables.sequence_enrollments[0].status).toBe('completed');
    // Sin inscripciones vivas la cadena de barridos se apaga sola.
    expect(out.live_enrollments).toBe(false);
    expect(tables.outbound_jobs.filter((j: any) => j.kind === 'time_events')).toHaveLength(0);
  });

  it('N2c: con inscripciones vivas el barrido vuelve a programarse (singleton por org)', async () => {
    const { timeEventsJobHandler } = require('@/lib/jobs/handlers/timeEvents');
    const t = baseTables();
    addSequence(t, [{}, { step_number: 2, delay_days: 5, channel: 'task' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    tables.outbound_jobs = tables.outbound_jobs.filter((j: any) => j.kind !== 'time_events');

    const out: any = await timeEventsJobHandler({
      job: { id: 'sweep-1', organization_id: ORG, kind: 'time_events', payload: {} } as any,
      supabase: client, orgId: ORG, log: silentLog as any, signal: new AbortController().signal,
    });

    expect(out.live_enrollments).toBe(true);
    const sweeps = tables.outbound_jobs.filter((j: any) => j.kind === 'time_events');
    expect(sweeps).toHaveLength(1);
    expect(new Date(sweeps[0].run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('N3a: una inscripción PAUSADA no consume sus pasos (antes los marcaba `skipped`)', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    tables.sequence_enrollments[0].status = 'paused';
    tables.sequence_enrollments[0].paused_reason = 'customer_replied_whatsapp';

    const run = await processStepRun(tables.sequence_step_runs[0].id, ORG, client);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('pending');
    expect((run.result as any).reason).toBe('enrollment_paused');
    expect(tables.sequence_step_runs[0].status).toBe('pending');
  });

  it('N3b: reanudar devuelve la inscripción a `active` y reencola el siguiente paso', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const enrollmentId = tables.sequence_enrollments[0].id;
    tables.sequence_enrollments[0].status = 'paused';
    tables.sequence_enrollments[0].paused_reason = 'customer_replied_email';
    tables.outbound_jobs = [];

    const result = await resumeEnrollment(ORG, enrollmentId, client);

    expect(result.resumed).toBe(true);
    expect(tables.sequence_enrollments[0].status).toBe('active');
    expect(tables.sequence_enrollments[0].paused_reason).toBeNull();
    const jobs = tables.outbound_jobs.filter((j: any) => j.kind === 'sequence_step');
    expect(jobs).toHaveLength(1);

    await drainQueue(client, tables, ORG);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('N3c: reanudar una inscripción que no está pausada no hace nada y lo dice', async () => {
    const t = baseTables();
    addSequence(t, [{}]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    const result = await resumeEnrollment(ORG, tables.sequence_enrollments[0].id, client);
    expect(result.resumed).toBe(false);
    expect(result.reason).toBe('not_paused');
  });

  it('N3d: la ruta de inscripciones expone PATCH resume y exige rol de administrador', () => {
    const fs = require('fs');
    const path = require('path');
    const route = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/crm/sequences/[id]/enrollments/route.ts'), 'utf8') as string;
    expect(route).toContain('export async function PATCH');
    expect(route).toContain('resumeEnrollment');
    const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'));
    expect(patch).toContain('requireOrgAdmin(ctx)');
    expect(patch).toContain("action !== 'resume'");
  });

  it('N4: un `to` fijo que no es cliente de la organización se RECHAZA (se saltaba el consentimiento)', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', to: 'externo@dominio-ajeno.com', subject: 's', html: '<p>x</p>' }]);
    const { client, tables } = makeDb(t);

    const run = await executeAutomationRule('rule-1', ORG, {}, client);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(run.status).toBe('failed');
    expect(tables.automation_runs[0].error_message).toMatch(/recipient_not_a_customer/);
  });

  it('N4b: con allow_non_customer el administrador puede mandar el aviso interno', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', to: 'avisos@interno.com', allow_non_customer: true, subject: 's', html: '<p>x</p>' }]);
    const { client } = makeDb(t);
    const run = await executeAutomationRule('rule-1', ORG, {}, client);
    expect(run.status).toBe('completed');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][1].to).toBe('avisos@interno.com');
  });

  it('N5: `force` ya no existe: una regla desactivada NO se ejecuta ni forzándola', async () => {
    const t = baseTables();
    addRule(t, [{ type: 'send_email', subject: 's', html: '<p>x</p>' }], { is_active: false });
    const { client, tables } = makeDb(t);

    await expect(
      executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client, { force: true } as any),
    ).rejects.toThrow(/force/);
    expect(sendEmailMock).not.toHaveBeenCalled();

    const run = await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);
    expect(run.status).toBe('skipped');
    expect(tables.automation_runs[0].skip_reason).toBe('rule_inactive');

    const fs = require('fs');
    const path = require('path');
    const route = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/crm/automation-rules/[id]/trigger/route.ts'), 'utf8') as string;
    expect(route).toContain('FORCE_REMOVED');
    expect(route).not.toContain('force: body.force === true');
  });

  it('N6: `finishRun` de reglas actualiza filtrando también por organización', () => {
    const src = readSrc('automationService.ts');
    const finish = src.slice(src.indexOf('async function finishRun'), src.indexOf('async function alreadyRan'));
    expect(finish).toContain(".eq('id', runId)");
    expect(finish).toContain(".eq('organization_id', orgId)");
  });

  it('N7: inscribir ya no es pegar un UUID: hay selector, previsualización y confirmación', () => {
    const fs = require('fs');
    const path = require('path');
    const page = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/secuencias/SecuenciasPage.tsx'), 'utf8') as string;
    expect(page).not.toContain('Id de la oportunidad');
    expect(page).toContain('EnrollDialog');

    const dialog = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/secuencias/EnrollDialog.tsx'), 'utf8') as string;
    expect(dialog).toContain('Confirmar inscripción');
    expect(dialog).toContain('Buscar por nombre de la oportunidad');
    expect(dialog).toMatch(/steps\.map/);

    expect(fs.existsSync(
      path.join(process.cwd(), 'src/app/api/crm/sequences/[id]/enroll/preview/route.ts'))).toBe(true);
  });

  it('N8: el HTML llega a F7 SIN sustituir: quien renderiza es quien escapa', async () => {
    const t = baseTables();
    (t.customers[0] as any).full_name = '<b>Acme</b>';
    addRule(t, [{ type: 'send_email', subject: 'Hola {{customer_name}}', html: '<p>Hola {{customer_name}}</p>' }]);
    const { client } = makeDb(t);

    await executeAutomationRule('rule-1', ORG, { opportunity_id: 'opp-1' }, client);

    const payload = sendEmailMock.mock.calls[0][1];
    expect(payload.html).toBe('<p>Hola {{custom.customer_name}}</p>');
    expect(payload.subject).toBe('Hola {{custom.customer_name}}');
    expect(payload.html).not.toContain('<b>Acme</b>');
    expect(payload.template_variables.customer_name).toBe('<b>Acme</b>');
  });

  it('N8b: las variables ya cualificadas de F7 no se tocan', () => {
    const { qualifyVarsForEmail } = require('@/lib/services/crm/automation/ruleContext');
    const vars = { customer_name: 'Ana', amount: '100' };
    expect(qualifyVarsForEmail('{{contact.first_name}}', vars)).toBe('{{contact.first_name}}');
    expect(qualifyVarsForEmail('{{org.name}}', vars)).toBe('{{org.name}}');
    // El `|defecto` se conserva tal cual (F7 recorta los espacios de cada tramo).
    expect(qualifyVarsForEmail('{{ customer_name | cliente }}', vars)).toBe('{{custom.customer_name| cliente }}');
    expect(qualifyVarsForEmail('{{desconocida}}', vars)).toBe('{{desconocida}}');
  });

  it('N-UI: la vista del pipeline solo enlaza la página si el menú la habilita', () => {
    const fs = require('fs');
    const path = require('path');
    const view = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/pipeline/AutomationsView.tsx'), 'utf8') as string;
    expect(view).toContain('AUTOMATIONS_PAGE_ENABLED');
    expect(view).toContain("CRM_NAV");
    // Ningún <Link> queda fuera de la guarda.
    const links = view.split('<Link href="/app/crm/automatizaciones"').length - 1;
    expect(links).toBe(2);
    expect(view.split('AUTOMATIONS_PAGE_ENABLED').length - 1).toBeGreaterThanOrEqual(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// O. Hallazgos de la ronda 3 del tester (N9–N14)
// ══════════════════════════════════════════════════════════════════════════════

describe('O. Ronda 3: condición configurable y fail-closed, y el barrido que no puede morir', () => {
  const REAL_CONDITION = { field: 'opportunity.amount', operator: 'gte', value: 1 };

  // ── N10: la condición vacía ya no pasa ─────────────────────────────────────

  it('N10a: `isEmptyConditionTree` distingue "sin condición" de "condición"', () => {
    const { isEmptyConditionTree, evaluateConditionTree, countConditionRules } =
      require('@/lib/services/crm/automation/conditionsDsl');
    for (const empty of [null, undefined, {}, [], 'lo que sea', 42, { op: 'and', rules: [] },
      { op: 'and', rules: [{ op: 'or', rules: [] }] }]) {
      expect(isEmptyConditionTree(empty)).toBe(true);
    }
    expect(isEmptyConditionTree(REAL_CONDITION)).toBe(false);
    expect(isEmptyConditionTree({ op: 'and', rules: [REAL_CONDITION] })).toBe(false);
    expect(countConditionRules({ op: 'or', rules: [REAL_CONDITION, REAL_CONDITION] })).toBe(2);

    // Y NO se toca la semántica de las reglas de automatización: una regla sin
    // condiciones sigue ejecutándose siempre.
    const ctx = {
      orgId: ORG, now: new Date(), opportunity: null, customer: null,
      stage: null, pipeline: null, consent: {}, event: null,
    };
    expect(evaluateConditionTree(null, ctx).result).toBe(true);
  });

  it('N10b: guardar un paso `condition` sin reglas se rechaza (antes evaluaba a VERDADERO)', () => {
    const issues = validateSequenceSteps([{ step_number: 1, delay_days: 0, channel: 'condition' }]);
    expect(issues.join(' ')).toMatch(/condición necesita al menos una regla/);

    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: { op: 'and', rules: [] } },
    ])).not.toHaveLength(0);
    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: 'basura' },
    ])).not.toHaveLength(0);

    // Con una regla de verdad, pasa.
    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: { op: 'and', rules: [REAL_CONDITION] } },
    ])).toHaveLength(0);

    // Y el campo de la regla sigue validado contra la allow-list.
    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: { field: 'customers.password', operator: 'eq', value: 1 } },
    ]).join(' ')).toMatch(/field no permitido/);

    // Un paso de condición no puede declarar que continúa ante error (N11).
    expect(validateSequenceSteps([
      { step_number: 1, delay_days: 0, channel: 'condition', condition: REAL_CONDITION, continue_on_error: true },
    ]).join(' ')).toMatch(/no puede continuar ante error/);
  });

  it('N10c: `createSequence` no escribe una condición vacía, y la BD tampoco la aceptaría', async () => {
    const { client, tables } = makeDb(baseTables());
    await expect(createSequence(ORG, {
      name: 'Con condición vacía',
      steps: [{ step_number: 1, delay_days: 0, channel: 'condition' } as any],
    } as any, client)).rejects.toThrow(/condición necesita al menos una regla/);
    expect(tables.sequences).toHaveLength(0);

    // El CHECK de BD (`sequence_steps_condition_required_chk`) es el respaldo:
    // aunque alguien saltase la validación, el INSERT falla con 23514.
    const direct = await client.from('sequence_steps').insert({
      organization_id: ORG, sequence_id: 'seq-x', step_number: 1, channel: 'condition', condition: null,
    });
    expect((direct as any).error?.code).toBe('23514');
  });

  it('N10d: `createSequence` guarda la condición y fuerza `continue_on_error: false`', async () => {
    const { client, tables } = makeDb(baseTables());
    await createSequence(ORG, {
      name: 'Con condición',
      steps: [
        { step_number: 1, delay_days: 0, channel: 'condition', condition: { op: 'and', rules: [REAL_CONDITION] } },
        { step_number: 2, delay_days: 0, channel: 'email' },
      ],
    } as any, client);

    const conditionStep = tables.sequence_steps.find((s: any) => s.channel === 'condition')!;
    expect(conditionStep.condition).toEqual({ op: 'and', rules: [REAL_CONDITION] });
    expect(conditionStep.continue_on_error).toBe(false);
    // Los demás canales conservan el valor por defecto de la BD.
    expect(tables.sequence_steps.find((s: any) => s.channel === 'email')!.continue_on_error).toBe(true);
  });

  it('N10e: en ejecución, una condición vacía CORTA la secuencia; el correo no sale', async () => {
    const t = baseTables();
    // Fila heredada: se escribió antes de que existieran la validación y el CHECK.
    addSequence(t, [
      { channel: 'condition', condition: null, continue_on_error: true },
      { step_number: 2, channel: 'email' },
    ]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(tables.sequence_step_runs[0].status).toBe('failed');
    expect(String(tables.sequence_step_runs[0].error_message)).toContain('condition_not_configured');
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].status).toBe('exited');
    expect(tables.sequence_enrollments[0].exit_reason).toBe('condition_unevaluable');
  });

  it('N10f: la interfaz tiene editor de condición y bloquea guardar sin reglas', () => {
    const fs = require('fs');
    const path = require('path');
    const editorPath = path.join(process.cwd(), 'src/components/crm/secuencias/ConditionEditor.tsx');
    expect(fs.existsSync(editorPath)).toBe(true);
    const editor = fs.readFileSync(editorPath, 'utf8') as string;
    expect(editor).toContain('CONDITION_FIELDS');
    expect(editor).toContain('OPERATORS');

    const dialog = fs.readFileSync(
      path.join(process.cwd(), 'src/components/crm/secuencias/SequenceFormDialog.tsx'), 'utf8') as string;
    expect(dialog).toContain('<ConditionEditor');
    expect(dialog).toContain('isEmptyConditionTree');
  });

  // ── N11: una condición que no se puede evaluar corta ───────────────────────

  it('N11: `continue_on_error: true` NO hace avanzar un paso `condition` que falla', async () => {
    const t = baseTables();
    addSequence(t, [
      { channel: 'condition', condition: { op: 'and', rules: [REAL_CONDITION] }, continue_on_error: true },
      { step_number: 2, channel: 'email' },
    ]);
    // El contexto de la condición no se puede leer: `loadRuleContext` propaga.
    const { client, tables } = makeDb(t, {
      failSelect: (table: string, n: number) => (table === 'opportunities' && n === 1
        ? { message: 'conexión perdida', code: '08006', details: null, hint: null } : null),
    });
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(tables.sequence_step_runs[0].status).toBe('failed');
    expect(tables.sequence_step_runs[1].status).toBe('skipped');
    expect(tables.sequence_enrollments[0].exit_reason).toBe('condition_unevaluable');
  });

  it('N11b: en un paso que NO es condición, `continue_on_error` sigue mandando', async () => {
    const t = baseTables();
    // `sms` no tiene proveedor: el paso falla siempre.
    addSequence(t, [{ channel: 'sms', continue_on_error: true }, { step_number: 2, channel: 'task' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await drainQueue(client, tables, ORG, { lastOnTie: true });

    expect(tables.sequence_step_runs[0].status).toBe('failed');
    expect(tables.sequence_step_runs[1].status).toBe('completed');
    expect(tables.tasks).toHaveLength(1);
  });

  // ── N9: el barrido no puede quedarse muerto ────────────────────────────────

  it('N9a: un run defectuoso ya no envenena el lote: los demás se ejecutan', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }]);
    // Dos inscripciones INDEPENDIENTES vencidas y sin job vivo (los perdió la
    // cola): el barrido es su única red.
    for (const n of [1, 2]) {
      t.sequence_enrollments.push({
        id: `enr-${n}`, organization_id: ORG, sequence_id: 'seq-1', opportunity_id: 'opp-1',
        customer_id: 'cus-1', status: 'active', enrolled_at: new Date().toISOString(),
      });
      t.sequence_step_runs.push({
        id: `run-${n}`, organization_id: ORG, enrollment_id: `enr-${n}`, step_id: 'step-1',
        status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString(),
      });
    }
    let fired = false;
    const { client, tables } = makeDb(t, {
      // Revienta la lectura del paso del PRIMER run del barrido, y solo esa.
      // Antes de la ronda 3 eso abortaba el lote entero: el segundo run no se
      // ejecutaba, el job agotaba sus 3 intentos y la organización se quedaba
      // sin barrido para siempre.
      failSelect: (table: string) => {
        if (fired || table !== 'sequence_steps') return null;
        fired = true;
        return { message: 'lectura caída', code: '08006', details: null, hint: null };
      },
    });

    const out = await processPendingStepRuns(ORG, client, 50);

    expect(out.processed).toBe(2);
    expect(out.errors).toBe(1);
    expect(String(out.first_error)).toContain('lectura');
    expect(out.completed).toBe(1);
    expect(tables.tasks).toHaveLength(1);
  });

  it('N9b: el barrido se REPROGRAMA aunque el lote falle, y el fallo se propaga', async () => {
    const { timeEventsJobHandler } = require('@/lib/jobs/handlers/timeEvents');
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }]);
    let armed = false;
    const { client, tables } = makeDb(t, {
      // Revienta `reclaimStaleStepRuns`: el barrido entero lanza, no un run.
      failUpdate: (table: string, patch: Record<string, unknown>) => (
        armed && table === 'sequence_step_runs' && patch.status === 'pending'
          ? { message: 'barrido caído', code: '08006', details: null, hint: null }
          : null),
    });
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    tables.outbound_jobs = tables.outbound_jobs.filter((j: any) => j.kind !== 'time_events');
    armed = true;

    await expect(timeEventsJobHandler({
      job: { id: 'sweep-1', organization_id: ORG, kind: 'time_events', payload: {} } as any,
      supabase: client, orgId: ORG, log: silentLog as any, signal: new AbortController().signal,
    })).rejects.toThrow(/barrido/);

    // Lo importante: el sucesor existe. Antes la reprogramación vivía en el
    // camino feliz y tres fallos dejaban la organización sin barrido para siempre.
    expect(tables.outbound_jobs.filter((j: any) => j.kind === 'time_events')).toHaveLength(1);
  });

  it('N9c: el barrido en curso retiene su propia clave y AUN ASÍ deja sucesor', async () => {
    const { timeEventsJobHandler } = require('@/lib/jobs/handlers/timeEvents');
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }, { step_number: 2, delay_days: 5, channel: 'task' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    // El job del barrido está `running` mientras corre su handler, así que
    // retiene `time_events:{org}`: `fn_enqueue_job` deduplica sobre
    // (queued, running) y devolvía el id del PROPIO job, sin crear nada.
    const sweep = tables.outbound_jobs.find((j: any) => j.kind === 'time_events')!;
    sweep.status = 'running';

    const out: any = await timeEventsJobHandler({
      job: sweep as any, supabase: client, orgId: ORG, log: silentLog as any, signal: new AbortController().signal,
    });

    expect(out.live_enrollments).toBe(true);
    expect(out.next_job_id).toBeTruthy();
    expect(out.next_job_id).not.toBe(sweep.id);
    const successors = tables.outbound_jobs.filter((j: any) => j.kind === 'time_events' && j.status === 'queued');
    expect(successors).toHaveLength(1);
    expect(new Date(successors[0].run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('N9d: si la cadena no puede encolar el paso siguiente, se siembra el barrido', async () => {
    const t = baseTables();
    addSequence(t, [{ channel: 'task' }, { step_number: 2, channel: 'email' }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);
    tables.outbound_jobs = [];

    const failingEnqueue = jest.fn(async () => { throw new Error('cola no disponible'); });
    await processStepRun(tables.sequence_step_runs[0].id, ORG, client, { enqueue: failingEnqueue as any });

    expect(tables.sequence_step_runs[1].status).toBe('pending');
    expect(String((tables.sequence_step_runs[1].result as any).chain_error)).toContain('cola no disponible');
    // La red tiene red: el barrido queda sembrado para recogerlo.
    expect(tables.outbound_jobs.filter((j: any) => j.kind === 'time_events')).toHaveLength(1);
  });

  // ── N12 y N14 ──────────────────────────────────────────────────────────────

  it('N12: el paso `email` de secuencia cualifica sus variables como el de reglas', async () => {
    const t = baseTables();
    (t.customers[0] as any).full_name = '<b>Acme</b>';
    addSequence(t, [{
      channel: 'email',
      action_config: { subject: 'Hola {{customer_name}}', html: '<p>Hola {{customer_name}}</p>' },
    }]);
    const { client, tables } = makeDb(t);
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await processStepRun(tables.sequence_step_runs[0].id, ORG, client);

    const payload = sendEmailMock.mock.calls[0][1];
    expect(payload.html).toBe('<p>Hola {{custom.customer_name}}</p>');
    expect(payload.subject).toBe('Hola {{custom.customer_name}}');
    expect(payload.template_variables.customer_name).toBe('<b>Acme</b>');
  });

  it('N14: los pasos restantes se marcan ANTES de cerrar la condición como completada', async () => {
    const order: string[] = [];
    const t = baseTables();
    addSequence(t, [
      { channel: 'condition', condition: { field: 'opportunity.amount', operator: 'gte', value: 999999999 } },
      { step_number: 2, channel: 'email' },
    ]);
    const { client, tables } = makeDb(t, {
      failUpdate: (table: string, patch: Record<string, unknown>) => {
        if (table === 'sequence_step_runs' && typeof patch.status === 'string') order.push(String(patch.status));
        return null;
      },
    });
    await enrollInSequence(ORG, 'seq-1', 'opp-1', client);

    await processStepRun(tables.sequence_step_runs[0].id, ORG, client);

    // running (reclamo) → skipped (paso 2) → completed (la condición).
    expect(order).toContain('skipped');
    expect(order.indexOf('skipped')).toBeLessThan(order.lastIndexOf('completed'));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
