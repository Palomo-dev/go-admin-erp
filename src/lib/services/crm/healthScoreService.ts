import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';
import {
  composeHealthResult,
  getOrgHealthConfig,
  toHealthRpcRow,
  type CustomerSnapshotResult,
  type HealthScoreResult,
  type HealthSnapshot,
} from './healthScoreServer';

/**
 * Fachada de NAVEGADOR del health score (F11 r2). Solo lecturas con la sesión
 * del usuario (RLS) y el mismo cálculo que el servidor (`composeHealthResult`
 * sobre `fn_customer_health` + config). Las escrituras («Recalcular», «Medir
 * ahora») van por rutas con sesión: la organización sale de la sesión y el
 * snapshot/`customers.health_score` se escriben con la misma regla que el cron
 * (`shouldWriteSnapshot`, solo si cambió). Nada de vistas materializadas sin RLS.
 */

export type { HealthBand, HealthScoreResult, HealthSnapshot, CustomerSnapshotResult } from './healthScoreServer';

export interface RefreshHealthResult {
  org_id: number;
  customers: number;
  snapshots_written: number;
  skipped_unchanged: number;
  customers_updated: number;
  reason?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
  return json.data as T;
}

class HealthScoreService {
  private getOrgId(override?: number): number {
    if (override && override > 0) return override;
    return getOrganizationId();
  }

  /** Historial de snapshots de un cliente (ascendente). */
  async getHealthHistory(customerId: string, limit: number = 30): Promise<HealthSnapshot[]> {
    try {
      const { data, error } = await supabase
        .from('health_score_snapshots')
        .select('id, customer_id, score, band, indicators, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error || !data) return [];
      return (data as HealthSnapshot[]).map((row) => ({ id: row.id, customer_id: row.customer_id, score: row.score, band: row.band, indicators: row.indicators, created_at: row.created_at }));
    } catch (err) {
      console.error('Error en healthScoreService.getHealthHistory:', err);
      return [];
    }
  }

  /** «Recalcular» (SaludView): POST /api/crm/health/refresh con sesión. */
  async refreshAllHealthScores(): Promise<RefreshHealthResult> {
    return postJson<RefreshHealthResult>('/api/crm/health/refresh');
  }

  /** «Medir ahora» (detalle): POST /api/crm/health/[customerId]/snapshot con sesión. */
  async snapshotHealthScore(customerId: string): Promise<CustomerSnapshotResult> {
    return postJson<CustomerSnapshotResult>(`/api/crm/health/${encodeURIComponent(customerId)}/snapshot`);
  }

  /** Facturas no anuladas del cliente en la organización (ficha de un lead con facturas). */
  async countInvoices(customerId: string, organizationId?: number): Promise<number> {
    const orgId = this.getOrgId(organizationId);
    if (!orgId) return 0;
    const { count, error } = await supabase
      .from('invoice_sales')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('customer_id', customerId)
      .neq('status', 'void');
    if (error) return 0;
    return count ?? 0;
  }

  /** Score de un cliente con la MISMA RPC + config que la lista y el cron. */
  async getCustomerHealthScore(customerId: string, organizationId?: number): Promise<HealthScoreResult | null> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return null;
      const [config, rpc] = await Promise.all([
        getOrgHealthConfig(orgId, supabase),
        supabase.rpc('fn_customer_health', { p_org_id: orgId, p_customer_id: customerId }),
      ]);
      if (rpc.error || !rpc.data) {
        console.warn('Error en fn_customer_health (single):', rpc.error?.message);
        return null;
      }
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      if (!row) return null;
      const { data: customerData } = await supabase.from('customers').select('full_name').eq('id', customerId).eq('organization_id', orgId).maybeSingle();
      const customerName = (customerData as { full_name?: string } | null)?.full_name || 'Sin nombre';
      return composeHealthResult(toHealthRpcRow(row as Record<string, unknown>), config, customerName);
    } catch (err) {
      console.error('Error en healthScoreService.getCustomerHealthScore:', err);
      return null;
    }
  }

  /** Todos los clientes de la organización en una sola RPC (p_customer_id = NULL). */
  async getAllHealthScores(organizationId?: number): Promise<HealthScoreResult[]> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return [];
      const [config, rpc] = await Promise.all([
        getOrgHealthConfig(orgId, supabase),
        supabase.rpc('fn_customer_health', { p_org_id: orgId, p_customer_id: null as unknown as string }),
      ]);
      if (rpc.error || !rpc.data) {
        console.warn('Error en fn_customer_health batch:', rpc.error?.message);
        return [];
      }
      const rows = (Array.isArray(rpc.data) ? rpc.data : [rpc.data]) as Record<string, unknown>[];
      if (rows.length === 0) return [];
      const customerIds = rows.map((r) => r.customer_id as string);
      const { data: customersData } = await supabase.from('customers').select('id, full_name').eq('organization_id', orgId).in('id', customerIds);
      const nameMap = new Map<string, string>();
      for (const c of (customersData || []) as Array<{ id: string; full_name: string }>) nameMap.set(c.id, c.full_name || 'Sin nombre');
      const results = rows.map((row) => {
        const rpcRow = toHealthRpcRow(row);
        return composeHealthResult(rpcRow, config, nameMap.get(rpcRow.customer_id) || 'Sin nombre');
      });
      results.sort((a, b) => a.score - b.score); // más críticos primero
      return results;
    } catch (err) {
      console.error('Error en healthScoreService.getAllHealthScores:', err);
      return [];
    }
  }
}

export const healthScoreService = new HealthScoreService();
export default healthScoreService;
