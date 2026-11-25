import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import {
  composeHealthResult,
  getHealthTrend,
  getOrgHealthConfig,
  toHealthRpcRow,
  type CustomerSnapshotResult,
  type HealthCustomerInfo,
  type HealthScoreResult,
  type HealthSnapshot,
} from './healthScoreServer';
import { normalizeBand, type HealthBand, type HealthConfigJson } from './healthBands';

/**
 * Fachada de NAVEGADOR del health score (F11 r2). Solo lecturas con la sesión
 * del usuario (RLS) y el mismo cálculo que el servidor (`composeHealthResult`
 * sobre `fn_customer_health` + config). Las escrituras («Recalcular», «Medir
 * ahora») van por rutas con sesión: la organización sale de la sesión y el
 * snapshot/`customers.health_score` se escriben con la misma regla que el cron
 * (`shouldWriteSnapshot`, solo si cambió). Nada de vistas materializadas sin RLS.
 */

export type { HealthScoreResult, HealthSnapshot, CustomerSnapshotResult, HealthCustomerInfo } from './healthScoreServer';
export type { HealthBand };

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

  /** Snapshots de los últimos `meses` (ascendentes): serie de 12 semanas del detalle. */
  async getHistorialReciente(customerId: string, meses: number = 3, organizationId?: number): Promise<HealthSnapshot[]> {
    const orgId = this.getOrgId(organizationId);
    if (!orgId) return [];
    return getHealthTrend(orgId, customerId, supabase, meses);
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
      const [config, rpc, moneda] = await Promise.all([
        getOrgHealthConfig(orgId, supabase),
        supabase.rpc('fn_customer_health', { p_org_id: orgId, p_customer_id: customerId }),
        resolverContextoMoneda(supabase, orgId),
      ]);
      if (rpc.error || !rpc.data) {
        console.warn('Error en fn_customer_health (single):', rpc.error?.message);
        return null;
      }
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      if (!row) return null;
      const { data: customerData } = await supabase
        .from('customers')
        .select('full_name, company_name, trade_name, owner_id, email, phone, do_not_call')
        .eq('id', customerId)
        .eq('organization_id', orgId)
        .maybeSingle();
      const cliente = (customerData as HealthCustomerInfo | null) ?? undefined;
      const customerName = cliente?.full_name || 'Sin nombre';
      return { ...composeHealthResult(toHealthRpcRow(row as Record<string, unknown>), config, customerName, moneda), cliente };
    } catch (err) {
      console.error('Error en healthScoreService.getCustomerHealthScore:', err);
      return null;
    }
  }

  /**
   * Todos los clientes de la organización en una sola RPC (p_customer_id = NULL),
   * con los datos de `customers` que usan la lista priorizada y las acciones
   * rápidas. LANZA si la RPC falla: la pantalla distingue «error» de «sin datos».
   */
  async getPanelSalud(organizationId?: number): Promise<HealthScoreResult[]> {
    const orgId = this.getOrgId(organizationId);
    if (!orgId) return [];
    const [config, rpc, moneda] = await Promise.all([
      getOrgHealthConfig(orgId, supabase),
      supabase.rpc('fn_customer_health', { p_org_id: orgId, p_customer_id: null as unknown as string }),
      resolverContextoMoneda(supabase, orgId),
    ]);
    if (rpc.error) throw new Error(rpc.error.message);
    const rows = (Array.isArray(rpc.data) ? rpc.data : rpc.data ? [rpc.data] : []) as Record<string, unknown>[];
    if (rows.length === 0) return [];
    const customerIds = rows.map((r) => r.customer_id as string);
    const clientes = new Map<string, HealthCustomerInfo>();
    // Lotes de 300 ids: una org con miles de clientes no cabe en un `in()` de URL.
    for (let i = 0; i < customerIds.length; i += 300) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, company_name, trade_name, owner_id, email, phone, do_not_call, health_score_updated_at')
        .eq('organization_id', orgId)
        .in('id', customerIds.slice(i, i + 300));
      if (error) throw new Error(error.message);
      for (const c of (data ?? []) as Array<HealthCustomerInfo & { id: string }>) {
        const { id, ...info } = c;
        clientes.set(id, info);
      }
    }
    return rows.map((row) => {
      const rpcRow = toHealthRpcRow(row);
      const cliente = clientes.get(rpcRow.customer_id);
      return { ...composeHealthResult(rpcRow, config, cliente?.full_name || 'Sin nombre', moneda), cliente };
    });
  }

  /** Lo mismo que `getPanelSalud`, sin lanzar y ordenado de más crítico a menos. */
  async getAllHealthScores(organizationId?: number): Promise<HealthScoreResult[]> {
    try {
      const results = await this.getPanelSalud(organizationId);
      results.sort((a, b) => a.score - b.score); // más críticos primero
      return results;
    } catch (err) {
      console.error('Error en healthScoreService.getAllHealthScores:', err);
      return [];
    }
  }

  /**
   * Puntaje medio semanal de la organización (`fn_health_tendencia_org`,
   * SECURITY INVOKER: RLS de los snapshots). Semanas en la zona de la org.
   */
  async getTendenciaOrg(timezone: string, semanas: number = 12, organizationId?: number): Promise<TendenciaSemanal[]> {
    const orgId = this.getOrgId(organizationId);
    if (!orgId) return [];
    const { data, error } = await supabase.rpc('fn_health_tendencia_org', { p_org_id: orgId, p_semanas: semanas, p_tz: timezone });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ semana: string; puntaje_medio: number | string; clientes: number }>).map((r) => ({
      semana: r.semana,
      promedio: Number(r.puntaje_medio) || 0,
      clientes: Number(r.clientes) || 0,
    }));
  }

  /** Último snapshot de cada cliente con al menos `dias` de antigüedad (`fn_health_score_hace`). */
  async getScoresHace(dias: number = 30, customerId?: string | null, organizationId?: number): Promise<Map<string, ScoreHace>> {
    const orgId = this.getOrgId(organizationId);
    const out = new Map<string, ScoreHace>();
    if (!orgId) return out;
    const { data, error } = await supabase.rpc('fn_health_score_hace', { p_org_id: orgId, p_dias: dias, p_customer_id: (customerId ?? null) as unknown as string });
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ customer_id: string; score: number; band: string | null; created_at: string }>) {
      out.set(r.customer_id, { score: Number(r.score) || 0, band: normalizeBand(r.band), created_at: r.created_at });
    }
    return out;
  }

  /**
   * «Señales recientes» del detalle (Figma 1424:17): última factura y la
   * cuenta por cobrar vencida más antigua del cliente (lecturas con RLS).
   */
  async getSenalesCliente(customerId: string, organizationId?: number): Promise<SenalesCliente> {
    const orgId = this.getOrgId(organizationId);
    if (!orgId) return { ultimaFactura: null, vencida: null };
    const [factura, cartera] = await Promise.all([
      supabase
        .from('invoice_sales')
        .select('issue_date, total')
        .eq('organization_id', orgId)
        .eq('customer_id', customerId)
        .neq('status', 'void')
        .order('issue_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('accounts_receivable')
        .select('due_date, balance, days_overdue')
        .eq('organization_id', orgId)
        .eq('customer_id', customerId)
        .eq('status', 'overdue')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    const f = factura.data as { issue_date: string | null; total: number | string | null } | null;
    const c = cartera.data as { due_date: string | null; balance: number | string | null; days_overdue: number | null } | null;
    return {
      ultimaFactura: f?.issue_date ? { fecha: f.issue_date, total: Number(f.total) || 0 } : null,
      vencida: c?.due_date ? { fecha: c.due_date, saldo: Number(c.balance) || 0, dias: c.days_overdue ?? null } : null,
    };
  }

  /** Config editable + si la persona puede guardarla (GET /api/crm/health/config). */
  async getConfigSalud(): Promise<ConfigSaludRespuesta> {
    const res = await fetch('/api/crm/health/config', { credentials: 'include', cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as ApiEnvelope<ConfigSaludRespuesta>;
    if (!res.ok || !json.success || !json.data) throw new ErrorConfigSaludApi(res.status, json.error || `Error ${res.status}`, []);
    return json.data;
  }

  /** «Guardar» de Configuración de factores (PUT, solo admin; valida en el servidor). */
  async guardarConfigSalud(config: HealthConfigJson): Promise<ConfigSaludRespuesta> {
    const res = await fetch('/api/crm/health/config', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config }) });
    const json = (await res.json().catch(() => ({}))) as ApiEnvelope<ConfigSaludRespuesta> & { errores?: string[] };
    if (!res.ok || !json.success || !json.data) throw new ErrorConfigSaludApi(res.status, json.error || `Error ${res.status}`, json.errores ?? []);
    return json.data;
  }
}

export interface TendenciaSemanal {
  /** Lunes de la semana (columna `date`, sin zona). */
  semana: string;
  promedio: number;
  clientes: number;
}

export interface ScoreHace {
  score: number;
  band: HealthBand;
  created_at: string;
}

export interface SenalesCliente {
  ultimaFactura: { fecha: string; total: number } | null;
  vencida: { fecha: string; saldo: number; dias: number | null } | null;
}

export interface ConfigSaludRespuesta {
  /** Config editable (incluye indicadores apagados). */
  config: HealthConfigJson;
  /** false = no hay fila: `config` es la propuesta inicial. */
  guardada: boolean;
  activa: boolean;
  puedeEditar: boolean;
}

export class ErrorConfigSaludApi extends Error {
  constructor(public readonly status: number, message: string, public readonly errores: string[]) {
    super(message);
    this.name = 'ErrorConfigSaludApi';
  }
}

export const healthScoreService = new HealthScoreService();
export default healthScoreService;
