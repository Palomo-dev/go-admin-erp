import type { SupabaseClient } from '@supabase/supabase-js';
import { isOrgAdminContext, type ServerOrgContext } from '@/lib/utils/orgContext';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { JOB_STATUSES, isJobKind, type JobKind, type JobStatus, type OutboundJob } from '@/lib/jobs/types';

/**
 * Servicio CRM — observabilidad de la cola `outbound_jobs` (FASE-00 §4.1).
 *
 * Lecturas: con el cliente de sesión (RLS `outbound_jobs_select` por org) y
 * además `.eq('organization_id', orgId)` explícito.
 * Reintento: con service_role (la tabla no admite escrituras a `authenticated`)
 * tras comprobar rol admin y pertenencia del job a la org.
 */

export const PAYLOAD_PREVIEW_CHARS = 500;

/**
 * Roles (tabla `roles`, verificada 2026-09-08: 1 Super Admin, 2 Admin de
 * organización, 3 Cliente, 4 Empleado, 5 Manager).
 *  - Reintentar: admin de la org (`isOrgAdminContext`, criterio único del repo).
 *  - Ver la cola: admin o Manager (tester r1 F-7; §4.1 "admin/manager").
 */
const MANAGER_ROLE_ID = 5;
const MANAGER_ROLE_NAMES = new Set(['Manager', 'Gerente']);

type RoleCtx = Pick<ServerOrgContext, 'roleName' | 'roleId' | 'isSuperAdmin'>;

export function canRetryJobs(ctx: RoleCtx): boolean {
  return isOrgAdminContext(ctx as ServerOrgContext);
}

export function canViewJobs(ctx: RoleCtx): boolean {
  return canRetryJobs(ctx) || ctx.roleId === MANAGER_ROLE_ID || MANAGER_ROLE_NAMES.has(ctx.roleName);
}

/**
 * Redacción del payload (tester r1 F-7): solo se exponen claves inocuas
 * (`kind`, `campaign_id`, `event_type`, `entity_type`, `reason`, `resync`,
 * `scheduled_for`, `retried_from` y cualquier `*_id`). Emails, teléfonos,
 * cuerpos y tokens (F7/F16) nunca salen por `GET /api/crm/jobs`.
 */
const PREVIEW_ALLOWED_KEYS = new Set(['kind', 'campaign_id', 'event_type', 'entity_type', 'reason', 'resync', 'scheduled_for', 'retried_from']);

export function redactPayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!payload || typeof payload !== 'object') return out;
  for (const [key, value] of Object.entries(payload)) {
    if (!(PREVIEW_ALLOWED_KEYS.has(key) || /_id$/.test(key))) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = typeof value === 'string' ? value.slice(0, 120) : value;
    }
  }
  return out;
}

export interface JobListItem
  extends Pick<
    OutboundJob,
    | 'id'
    | 'kind'
    | 'status'
    | 'attempts'
    | 'max_attempts'
    | 'last_error'
    | 'run_at'
    | 'locked_at'
    | 'created_at'
    | 'updated_at'
    | 'dedupe_key'
  > {
  payload_preview: string;
}

export interface JobStats {
  byStatus: Record<JobStatus, number>;
  byKind: Partial<Record<JobKind, number>>;
  queuedOverdue: number;
}

export interface ListJobsParams {
  status?: JobStatus;
  kind?: JobKind;
  page?: number;
  pageSize?: number;
}

const SELECT_COLUMNS =
  'id, kind, status, attempts, max_attempts, last_error, run_at, locked_at, created_at, updated_at, dedupe_key, payload';

function toItem(row: OutboundJob): JobListItem {
  const { payload, ...rest } = row;
  let preview = '';
  try {
    preview = JSON.stringify(redactPayload(payload));
  } catch {
    preview = '[payload no serializable]';
  }
  return { ...rest, payload_preview: preview.slice(0, PAYLOAD_PREVIEW_CHARS) };
}

export function parseStatus(value: string | null): JobStatus | undefined {
  return value && (JOB_STATUSES as readonly string[]).includes(value) ? (value as JobStatus) : undefined;
}

export function parseKind(value: string | null): JobKind | undefined {
  return value && isJobKind(value) ? value : undefined;
}

export async function listJobs(
  sb: SupabaseClient,
  orgId: number,
  params: ListJobsParams = {},
): Promise<{ items: JobListItem[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(params.pageSize ?? 50, 200));
  const from = (page - 1) * pageSize;

  let query = sb
    .from('outbound_jobs')
    .select(SELECT_COLUMNS, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (params.status) query = query.eq('status', params.status);
  if (params.kind) query = query.eq('kind', params.kind);

  const { data, error, count } = await query;
  if (error) throw new Error(`listJobs: ${error.message}`);
  return { items: ((data ?? []) as unknown as OutboundJob[]).map(toItem), total: count ?? 0, page, pageSize };
}

export async function listRecentFailed(sb: SupabaseClient, orgId: number, limit = 50): Promise<JobListItem[]> {
  const { data, error } = await sb
    .from('outbound_jobs')
    .select(SELECT_COLUMNS)
    .eq('organization_id', orgId)
    .or('status.in.(failed,dead),and(status.eq.queued,attempts.gt.0)')
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error) throw new Error(`listRecentFailed: ${error.message}`);
  return ((data ?? []) as unknown as OutboundJob[]).map(toItem);
}

/**
 * Conteos por estado/kind. Se calculan en memoria sobre `kind,status,run_at`
 * (limitado a 5 000 filas recientes: suficiente para la UI y sin RPC nueva).
 */
export async function getJobStats(sb: SupabaseClient, orgId: number): Promise<JobStats> {
  const { data, error } = await sb
    .from('outbound_jobs')
    .select('kind, status, run_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw new Error(`getJobStats: ${error.message}`);

  const byStatus: Record<JobStatus, number> = { queued: 0, running: 0, done: 0, failed: 0, dead: 0 };
  const byKind: Partial<Record<JobKind, number>> = {};
  let queuedOverdue = 0;
  const now = Date.now();
  for (const row of (data ?? []) as Pick<OutboundJob, 'kind' | 'status' | 'run_at'>[]) {
    if (row.status in byStatus) byStatus[row.status] += 1;
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
    if (row.status === 'queued' && new Date(row.run_at).getTime() < now - 2 * 60 * 1000) queuedOverdue += 1;
  }
  return { byStatus, byKind, queuedOverdue };
}

export class JobRetryError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'JobRetryError';
    this.statusCode = statusCode;
  }
}

/**
 * Re-encola un job `dead|failed` de la org como un job NUEVO (mismo kind,
 * payload y max_attempts).
 *
 * Dedupe (tester r1, riesgo "2 jobs vivos por evento"): si el original tenía
 * `dedupe_key` se REUTILIZA (el índice parcial solo cubre queued|running y el
 * original es terminal, así que la clave está libre; si el resync de
 * `maintenance` ya encoló `crm_event:{id}`, la RPC devuelve ese job y no se
 * duplica). Sin `dedupe_key` → `job:{id}:retry:{attempts}`.
 * El original queda intacto salvo una nota en `last_error`.
 */
export async function retryJob(
  serviceSb: SupabaseClient,
  orgId: number,
  jobId: string,
  requestedBy: string,
): Promise<{ jobId: string; status: 'queued' }> {
  const { data: job, error } = await serviceSb
    .from('outbound_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('organization_id', orgId)
    .maybeSingle<OutboundJob>();
  if (error) throw new JobRetryError(`retryJob: ${error.message}`, 500);
  if (!job) throw new JobRetryError('Job no encontrado', 404);
  if (job.status !== 'dead' && job.status !== 'failed') {
    throw new JobRetryError(`Solo se pueden reintentar jobs dead|failed (estado actual: ${job.status})`, 409);
  }

  const dedupeKey = job.dedupe_key ?? `job:${job.id}:retry:${job.attempts}`;
  const newId = await enqueueJob({
    organizationId: orgId,
    kind: job.kind,
    payload: { ...job.payload, retried_from: job.id },
    dedupeKey,
    maxAttempts: job.max_attempts,
    supabase: serviceSb,
  });

  await serviceSb
    .from('outbound_jobs')
    .update({ last_error: `${job.last_error ?? ''} [retried as ${newId} by ${requestedBy}]`.slice(0, 4000) })
    .eq('id', job.id)
    .eq('organization_id', orgId);

  return { jobId: newId, status: 'queued' };
}
