import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmSesion } from './crmRouteSupport';
import { CrmHttpError, exigirUuid } from './crmErrors';
import { DEFAULT_HEALTH_CONFIG, healthFactorConfigSchema, type HealthFactorSettings } from './healthFactorConfig';
import type { HealthBand } from './healthBands';

export interface MedicionSalud {
  customer_id: string;
  score: number;
  band: HealthBand;
  indicators: Record<string, number | null>;
  write_snapshot: boolean;
  expected_snapshot_id: string | null;
}
export interface ResultadoMediciones { snapshots_written: number; customers_updated: number; skipped_unchanged: number }
export interface BaseMedicionSalud {
  customer_id: string;
  last_snapshot: { id: string; score: number; created_at: string } | null;
}

/** Lectura por clave e índice: los snapshots no tienen relación FK con customers. */
export async function leerBaseMedicionesSalud(sb: SupabaseClient, org: number, ids: readonly string[]): Promise<Map<string, BaseMedicionSalud>> {
  const r = await sb.rpc('fn_crm_salud_base', { p_org: org, p_customers: ids });
  if (r.error) throw r.error;
  if (!Array.isArray(r.data) || r.data.length !== ids.length) throw new Error('Respuesta incompleta al leer última medición de salud');
  return new Map((r.data as BaseMedicionSalud[]).map(row => [row.customer_id, row]));
}

/** Sólo servidor/worker: la RPC permite service_role y conserva ambos cambios en la misma transacción. */
export async function guardarMedicionesSalud(sb: SupabaseClient, org: number, rows: readonly MedicionSalud[], configStamp: string | null, now: Date): Promise<ResultadoMediciones> {
  if (!rows.length) return { snapshots_written: 0, customers_updated: 0, skipped_unchanged: 0 };
  const { data, error } = await sb.rpc('fn_crm_guardar_mediciones_salud', { p_org: org, p_rows: rows, p_config_stamp: configStamp, p_now: now.toISOString() });
  if (error) throw error;
  if (!data || typeof data.snapshots_written !== 'number' || typeof data.customers_updated !== 'number' || typeof data.skipped_unchanged !== 'number') throw new Error('Respuesta incompleta al guardar salud');
  return data as ResultadoMediciones;
}

/** Cada medición manual exige edición y acceso de sucursal antes de usar el escritor privilegiado. */
export async function exigirClienteMedible(ctx: CrmSesion, id: string): Promise<void> {
  exigirUuid(id, 'cliente');
  const { CRM_PERMISOS, exigirPermisoCrm } = await import('./crmRouteSupport');
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesEditar], 'POST /api/crm/health/customer');
  const c = await ctx.supabase.from('customers').select('id, branch_id, lifecycle_stage').eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle();
  if (c.error) throw c.error;
  if (!c.data || c.data.lifecycle_stage !== 'customer') throw new CrmHttpError(404, 'cliente_no_encontrado', 'La salud se mide sólo para clientes de tu organización');
  const branch = await ctx.supabase.rpc('app_branch_access', { p_branch_id: c.data.branch_id ?? null });
  if (branch.error) throw branch.error;
  if (branch.data !== true) throw new CrmHttpError(403, 'sin_permiso', 'No tienes acceso a la sucursal del cliente');
}

export async function leerConfiguracionSalud(org: number, sb: SupabaseClient): Promise<HealthFactorSettings> {
  const r = await sb.from('health_score_configs').select('config, updated_at, refresh_interval_hours, is_active').eq('organization_id', org).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) return { config: DEFAULT_HEALTH_CONFIG, updated_at: null, refresh_interval_hours: 24, is_active: true };
  const parsed = healthFactorConfigSchema.safeParse(r.data.config);
  if (!parsed.success) throw new CrmHttpError(409, 'salud_config_invalida', 'La configuración de salud requiere revisión');
  return { config: parsed.data, updated_at: r.data.updated_at ?? null, refresh_interval_hours: r.data.refresh_interval_hours ?? 24, is_active: r.data.is_active !== false };
}

export interface SaludEncolada { queued: true; event_id: string; job_id: string }
export async function encolarSalud(org: number, sb: SupabaseClient): Promise<SaludEncolada> {
  const r = await sb.rpc('fn_crm_encolar_salud', { p_org: org });
  if (r.error) throw r.error;
  if (!r.data?.event_id || !r.data?.job_id) throw new Error('Respuesta incompleta al encolar salud');
  return r.data as SaludEncolada;
}
