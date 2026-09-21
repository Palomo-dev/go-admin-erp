/**
 * F8 — doble de base de datos FIEL para automatizaciones y secuencias.
 *
 * Replica lo que Postgres hace de verdad (verificado contra
 * `information_schema.columns` / `pg_constraint` del proyecto
 * jgmgphmzusbluqhuqihj, incluidas las migraciones
 * `crm_v4_f08_01_engine_schema` y `crm_v4_f08_02_enroll_rpc`):
 *  - columna inexistente      -> error 42703
 *  - literal fuera de CHECK   -> error 23514
 *  - NOT NULL sin valor       -> error 23502
 *  - DEFAULT de columna       -> se rellena en el INSERT y vuelve en el .select()
 *  - `fn_enroll_in_sequence`  -> inscripción + step_runs + jobs en una sola
 *    operación, con índice único parcial de inscripciones vivas.
 *
 * Origen: suite adversaria de F8 (`f8Adversarial`, tester r1 + builder r1–r3),
 * extraído como fake compartido al consolidar el 2026-09-21. Lo usan los
 * `f8.*.stable.test.ts` de este directorio. Cada test file debe mockear
 * `@/lib/services/crm/emailService` por su cuenta (jest.mock se iza por archivo).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from '@supabase/supabase-js';
import { processStepRun } from '@/lib/services/crm/sequenceService';

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

export {
  COLUMNS, DEFAULTS, NOT_NULL, CHECKS, OUTBOUND_JOB_KINDS,
  unknownColumn, checkViolation, notNullViolation, raisedException, withDefaults, validateRow,
  makeDb, ORG, OTHER_ORG, readSrc, baseTables, addRule, addSequence, drainQueue, silentLog, fakeEnqueue,
};
export type { PgError, DbOpts };
