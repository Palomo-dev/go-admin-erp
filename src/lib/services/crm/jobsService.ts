import type { SupabaseClient } from '@supabase/supabase-js';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { STAGE_MANAGER_ROLE_IDS } from './stagePermissions';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { DRAIN_INTERVAL_MIN } from '@/lib/jobs/schedule';
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
 * Permisos de la cola (F0-JOBS r4, QA r3 punto 3). Un solo criterio, el del
 * resto del CRM, sin constantes propias:
 *
 *  - Reintentar (`canRetryJobs`): `hasOrgAdminOrPermission(ctx)` — super
 *    admin, `role_id` ∈ `ORG_ADMIN_ROLE_IDS` (1, 2) o, consultando
 *    `check_user_permission` con el usuario y la organización DE LA SESIÓN, el
 *    permiso `admin.full_access` concedido por rol o por cargo
 *    (`job_position_permissions`). Un error de la RPC deniega (fail-closed).
 *  - Ver la cola (`canViewJobs`): lo anterior ∪ `STAGE_MANAGER_ROLE_IDS`
 *    (1, 2, 5: la misma jefatura comercial que contratos, comisiones, F12 y el
 *    dashboard; `stagePermissions.ts`). Manager (5) ve sin consultar la RPC.
 *
 * Regla 6 (CLAUDE.md): todo sale de `getServerOrgContext` (`role_id`,
 * `is_super_admin`, `user_id`, `organization_id`); `roleName` NO participa.
 * Decisión provisional del orquestador: no existe un código de permiso propio
 * (`crm.jobs.view`) en `permissions`; hasta que el dueño lo cree, un cargo
 * solo entra con `admin.full_access` (mismo criterio que `withOrg({admin})`).
 */
export type JobsPermissionContext = Pick<ServerOrgContext, 'roleId' | 'isSuperAdmin'> &
  Partial<Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase' | 'roleName'>>;

/** Adapta el contexto parcial al sujeto que espera `hasOrgAdminOrPermission` (sin sesión completa ⇒ solo el criterio síncrono). */
function permissionSubject(ctx: JobsPermissionContext): Parameters<typeof hasOrgAdminOrPermission>[0] {
  return {
    roleId: ctx.roleId,
    isSuperAdmin: ctx.isSuperAdmin === true,
    userId: ctx.userId ?? '',
    organizationId: ctx.organizationId ?? 0,
    supabase: ctx.supabase as SupabaseClient,
  };
}

export async function canRetryJobs(ctx: JobsPermissionContext): Promise<boolean> {
  return hasOrgAdminOrPermission(permissionSubject(ctx));
}

export async function canViewJobs(ctx: JobsPermissionContext): Promise<boolean> {
  if (ctx.isSuperAdmin === true || STAGE_MANAGER_ROLE_IDS.includes(ctx.roleId)) return true;
  return hasOrgAdminOrPermission(permissionSubject(ctx));
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

/** Un `queued` cuyo `run_at` lleva más de un ciclo de drenaje sin reclamarse (`queuedOverdue`). */
const QUEUED_OVERDUE_MS = DRAIN_INTERVAL_MIN * 60 * 1000;

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
    if (row.status === 'queued' && new Date(row.run_at).getTime() < now - QUEUED_OVERDUE_MS) queuedOverdue += 1;
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
  // `retried_from` apunta SIEMPRE al job raíz (r4, tester r3 T-2 bis): un retry
  // de un retry hereda la raíz, así la clave de idempotencia de `whatsapp`
  // (`job:{raíz}`) es la misma en todas las generaciones.
  const retriedFrom = typeof job.payload?.retried_from === 'string' && job.payload.retried_from ? job.payload.retried_from : job.id;
  const newId = await enqueueJob({
    organizationId: orgId,
    kind: job.kind,
    payload: { ...job.payload, retried_from: retriedFrom },
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
