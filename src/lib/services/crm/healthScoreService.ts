import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para calcular y gestionar el health score de clientes (FASE 4 - Post-venta).
 * Calcula score 0-100 desde mv_customer_health + health_score_configs.
 *
 * Tablas: mv_customer_health, health_score_configs, health_score_snapshots, customers
 */

export type HealthBand = 'green' | 'yellow' | 'red';

export interface HealthThreshold {
  min?: number;
  max?: number;
  score: number;
}

export interface HealthIndicator {
  key: string;
  label: string;
  weight: number;
  direction: 'higher_better' | 'lower_better';
  thresholds: HealthThreshold[];
}

export interface HealthBands {
  green: number;
  yellow: number;
  red: number;
}

export interface HealthScoreConfig {
  id?: string;
  organization_id?: number;
  indicators: HealthIndicator[];
  bands: HealthBands;
  refresh_interval_hours?: number;
  is_active?: boolean;
}

export interface CustomerHealth {
  customer_id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  organization_id: number;
  purchases_90d: number;
  revenue_90d: number;
  ltv_total: number;
  avg_ticket: number;
  recency_days: number | null;
  total_purchases: number;
}

export interface HealthScoreResult {
  customer_id: string;
  customer_name: string;
  score: number;
  band: HealthBand;
  indicators: {
    key: string;
    label: string;
    weight: number;
    value: number;
    score: number;
    weightedScore: number;
  }[];
}

export interface HealthSnapshot {
  id: string;
  customer_id: string;
  score: number;
  band: HealthBand;
  indicators: Record<string, number>;
  created_at: string;
}

// Configuración por defecto si no existe en BD
const DEFAULT_HEALTH_CONFIG: HealthScoreConfig = {
  indicators: [
    {
      key: 'recency',
      label: 'Recencia (días sin comprar)',
      weight: 30,
      direction: 'lower_better',
      thresholds: [
        { max: 7, score: 100 },
        { max: 30, score: 70 },
        { max: 60, score: 40 },
        { max: 999, score: 10 },
      ],
    },
    {
      key: 'frequency',
      label: 'Frecuencia (compras 90d)',
      weight: 25,
      direction: 'higher_better',
      thresholds: [
        { min: 10, score: 100 },
        { min: 5, score: 75 },
        { min: 2, score: 50 },
        { min: 1, score: 25 },
        { min: 0, score: 0 },
      ],
    },
    {
      key: 'ltv',
      label: 'LTV total',
      weight: 25,
      direction: 'higher_better',
      thresholds: [
        { min: 1000000, score: 100 },
        { min: 500000, score: 75 },
        { min: 100000, score: 50 },
        { min: 0, score: 20 },
      ],
    },
    {
      key: 'avg_ticket',
      label: 'Ticket promedio',
      weight: 20,
      direction: 'higher_better',
      thresholds: [
        { min: 100000, score: 100 },
        { min: 50000, score: 70 },
        { min: 20000, score: 40 },
        { min: 0, score: 10 },
      ],
    },
  ],
  bands: { green: 70, yellow: 40, red: 0 },
  refresh_interval_hours: 24,
  is_active: true,
};

class HealthScoreService {
  private getOrgId(override?: number): number {
    if (override && override > 0) return override;
    return getOrganizationId();
  }

  /**
   * Obtiene la configuración de health score de la organización.
   * Si no existe, retorna la configuración por defecto.
   */
  async getConfig(organizationId?: number): Promise<HealthScoreConfig> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return DEFAULT_HEALTH_CONFIG;

      const { data, error } = await supabase
        .from('health_score_configs')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return DEFAULT_HEALTH_CONFIG;
      }

      const row = data as {
        id: string;
        organization_id: number;
        config: HealthScoreConfig;
        refresh_interval_hours: number;
        is_active: boolean;
      };

      const config = row.config;
      return {
        id: row.id,
        organization_id: row.organization_id,
        indicators: config?.indicators || DEFAULT_HEALTH_CONFIG.indicators,
        bands: config?.bands || DEFAULT_HEALTH_CONFIG.bands,
        refresh_interval_hours: row.refresh_interval_hours,
        is_active: row.is_active,
      };
    } catch (err) {
      console.warn('Error en healthScoreService.getConfig:', err);
      return DEFAULT_HEALTH_CONFIG;
    }
  }

  /**
   * Obtiene los datos de salud de un cliente desde mv_customer_health.
   * @param customerId - ID del cliente
   */
  async getCustomerHealth(customerId: string): Promise<CustomerHealth | null> {
    try {
      const { data, error } = await supabase
        .from('mv_customer_health')
        .select(`
          *,
          customer:customers(id, full_name, email, phone)
        `)
        .eq('customer_id', customerId)
        .maybeSingle();

      if (error || !data) return null;

      const row = data as Record<string, unknown>;
      const customer = row.customer as {
        id: string;
        full_name: string;
        email?: string | null;
        phone?: string | null;
      } | null;

      return {
        customer_id: row.customer_id as string,
        customer_name: customer?.full_name || 'Sin nombre',
        customer_email: customer?.email || null,
        customer_phone: customer?.phone || null,
        organization_id: row.organization_id as number,
        purchases_90d: Number(row.purchases_90d) || 0,
        revenue_90d: Number(row.revenue_90d) || 0,
        ltv_total: Number(row.ltv_total) || 0,
        avg_ticket: Number(row.avg_ticket) || 0,
        recency_days: row.recency_days !== null ? Number(row.recency_days) : null,
        total_purchases: Number(row.total_purchases) || 0,
      };
    } catch (err) {
      console.error('Error en healthScoreService.getCustomerHealth:', err);
      return null;
    }
  }

  /**
   * Calcula el score de un indicador individual según sus thresholds.
   * @param indicator - Configuración del indicador
   * @param value - Valor actual del indicador
   * @returns Score 0-100
   */
  private calculateIndicatorScore(indicator: HealthIndicator, value: number): number {
    for (const threshold of indicator.thresholds) {
      if (indicator.direction === 'lower_better') {
        // Para lower_better: usar max como límite superior
        if (threshold.max !== undefined && value <= threshold.max) {
          return threshold.score;
        }
      } else {
        // Para higher_better: usar min como límite inferior
        if (threshold.min !== undefined && value >= threshold.min) {
          return threshold.score;
        }
      }
    }
    return 0;
  }

  /**
   * Calcula el health score de un cliente (0-100).
   * @param customerId - ID del cliente
   * @returns Resultado del score con detalles por indicador
   */
  async calculateHealthScore(customerId: string, organizationId?: number): Promise<HealthScoreResult | null> {
    try {
      const health = await this.getCustomerHealth(customerId);
      if (!health) return null;

      const config = await this.getConfig(organizationId);

      // Mapear valores de mv_customer_health a keys de indicadores
      const valueMap: Record<string, number> = {
        recency: health.recency_days ?? 999,
        frequency: health.purchases_90d,
        ltv: health.ltv_total,
        avg_ticket: health.avg_ticket,
        revenue_90d: health.revenue_90d,
        total_purchases: health.total_purchases,
      };

      const indicatorResults: HealthScoreResult['indicators'] = [];
      let totalWeight = 0;
      let totalWeightedScore = 0;

      for (const indicator of config.indicators) {
        const value = valueMap[indicator.key] ?? 0;
        const score = this.calculateIndicatorScore(indicator, value);
        const weightedScore = (score / 100) * indicator.weight;

        indicatorResults.push({
          key: indicator.key,
          label: indicator.label,
          weight: indicator.weight,
          value,
          score,
          weightedScore,
        });

        totalWeight += indicator.weight;
        totalWeightedScore += weightedScore;
      }

      const finalScore = totalWeight > 0
        ? Math.round((totalWeightedScore / totalWeight) * 100)
        : 0;

      const band = this.deriveBand(finalScore, config.bands);

      return {
        customer_id: customerId,
        customer_name: health.customer_name,
        score: finalScore,
        band,
        indicators: indicatorResults,
      };
    } catch (err) {
      console.error('Error en healthScoreService.calculateHealthScore:', err);
      return null;
    }
  }

  /**
   * Deriva la banda (green/yellow/red) desde el score.
   * @param score - Score 0-100
   * @param bands - Bandas configuradas
   */
  deriveBand(score: number, bands: HealthBands): HealthBand {
    if (score >= bands.green) return 'green';
    if (score >= bands.yellow) return 'yellow';
    return 'red';
  }

  /**
   * Guarda un snapshot del health score del cliente.
   * @param customerId - ID del cliente
   * @returns Snapshot creado o null si falla
   */
  async snapshotHealthScore(customerId: string, organizationId?: number): Promise<HealthSnapshot | null> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return null;

      const result = await this.calculateHealthScore(customerId, organizationId);
      if (!result) return null;

      // Construir objeto de indicadores para el snapshot
      const indicators: Record<string, number> = {};
      for (const ind of result.indicators) {
        indicators[ind.key] = ind.value;
      }

      const { data, error } = await supabase
        .from('health_score_snapshots')
        .insert({
          organization_id: orgId,
          customer_id: customerId,
          score: result.score,
          band: result.band,
          indicators: indicators as unknown as Record<string, unknown>,
        })
        .select('id, customer_id, score, band, indicators, created_at')
        .single();

      if (error) throw error;

      const row = data as {
        id: string;
        customer_id: string;
        score: number;
        band: HealthBand;
        indicators: Record<string, number>;
        created_at: string;
      };

      return {
        id: row.id,
        customer_id: row.customer_id,
        score: row.score,
        band: row.band,
        indicators: row.indicators,
        created_at: row.created_at,
      };
    } catch (err) {
      console.error('Error en healthScoreService.snapshotHealthScore:', err);
      return null;
    }
  }

  /**
   * Obtiene el historial de snapshots de health score de un cliente.
   * @param customerId - ID del cliente
   * @param limit - Número máximo de snapshots (default: 30)
   * @returns Lista de snapshots ordenados del más antiguo al más reciente
   */
  async getHealthHistory(customerId: string, limit: number = 30): Promise<HealthSnapshot[]> {
    try {
      const { data, error } = await supabase
        .from('health_score_snapshots')
        .select('id, customer_id, score, band, indicators, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error || !data) return [];

      return (data as Array<{
        id: string;
        customer_id: string;
        score: number;
        band: HealthBand;
        indicators: Record<string, number>;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        customer_id: row.customer_id,
        score: row.score,
        band: row.band,
        indicators: row.indicators,
        created_at: row.created_at,
      }));
    } catch (err) {
      console.error('Error en healthScoreService.getHealthHistory:', err);
      return [];
    }
  }

  /**
   * Obtiene clientes con score rojo (< 40) para panel de alertas.
   * @returns Lista de clientes en alerta roja
   */
  async getRedAlerts(organizationId?: number): Promise<HealthScoreResult[]> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return [];

      // Obtener el snapshot más reciente por cliente con band='red'
      const { data, error } = await supabase
        .from('health_score_snapshots')
        .select(`
          id,
          customer_id,
          score,
          band,
          indicators,
          created_at,
          customer:customers(id, full_name, email, phone)
        `)
        .eq('organization_id', orgId)
        .eq('band', 'red')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error || !data) return [];

      // Deduplicar por customer_id (quedarse con el más reciente)
      const seen = new Set<string>();
      const results: HealthScoreResult[] = [];

      for (const row of data as Array<Record<string, unknown>>) {
        const customerId = row.customer_id as string;
        if (seen.has(customerId)) continue;
        seen.add(customerId);

        const customer = row.customer as {
          id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
        } | null;

        results.push({
          customer_id: customerId,
          customer_name: customer?.full_name || 'Sin nombre',
          score: row.score as number,
          band: 'red',
          indicators: [],
        });
      }

      // Ordenar por score ascendente (más críticos primero)
      results.sort((a, b) => a.score - b.score);

      return results;
    } catch (err) {
      console.error('Error en healthScoreService.getRedAlerts:', err);
      return [];
    }
  }

  /**
   * Recalcula los scores de todos los clientes usando fn_customer_health RPC en batch.
   * Actualiza customers.health_score y health_score_updated_at en una sola pasada.
   * @returns Número de clientes recalculados
   */
  async refreshAllHealthScores(organizationId?: number): Promise<number> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return 0;

      // Una sola RPC calcula scores para todos los clientes con lifecycle_stage='customer'
      const { data, error } = await supabase
        .rpc('fn_customer_health', {
          p_org_id: orgId,
          p_customer_id: null as unknown as string,
        });

      if (error || !data) {
        console.warn('Error en fn_customer_health batch (refresh):', error?.message);
        return 0;
      }

      const rows = Array.isArray(data) ? data : [data];
      if (!rows || rows.length === 0) return 0;

      const bandMap: Record<string, HealthBand> = {
        healthy: 'green',
        at_risk: 'yellow',
        critical: 'red',
      };

      let count = 0;
      const now = new Date().toISOString();

      // Actualizar customers.health_score en lote (una update por cliente)
      for (const row of rows as Array<Record<string, unknown>>) {
        const customerId = row.customer_id as string;
        const score = Number(row.score) || 0;
        const bandStr = (row.band as string) || 'critical';
        const band = bandMap[bandStr] || 'red';

        // Actualizar customers.health_score
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            health_score: score,
            health_score_updated_at: now,
          })
          .eq('id', customerId)
          .eq('organization_id', orgId);

        if (updateError) {
          console.warn(`Error actualizando health_score para ${customerId}:`, updateError.message);
          continue;
        }

        // Guardar snapshot
        await supabase
          .from('health_score_snapshots')
          .insert({
            organization_id: orgId,
            customer_id: customerId,
            score,
            band,
            indicators: {
              invoices_12m: Number(row.invoices_12m) || 0,
              revenue_12m: Number(row.revenue_12m) || 0,
              days_since_last_invoice: row.days_since_last_invoice,
              days_since_last_activity: row.days_since_last_activity,
              overdue_balance: Number(row.overdue_balance) || 0,
              overdue_ratio: Number(row.overdue_ratio) || 0,
            } as unknown as Record<string, unknown>,
          });

        count++;
      }

      return count;
    } catch (err) {
      console.error('Error en healthScoreService.refreshAllHealthScores:', err);
      return 0;
    }
  }

  /**
   * Obtiene el health score de un cliente específico usando la misma RPC
   * fn_customer_health que getAllHealthScores, garantizando consistencia
   * entre el score mostrado en la lista y el drawer de detalle.
   * @param customerId - ID del cliente
   * @param organizationId - ID de la organización (opcional)
   */
  async getCustomerHealthScore(customerId: string, organizationId?: number): Promise<HealthScoreResult | null> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return null;

      const { data, error } = await supabase
        .rpc('fn_customer_health', {
          p_org_id: orgId,
          p_customer_id: customerId,
        });

      if (error || !data) {
        console.warn('Error en fn_customer_health (single):', error?.message);
        return null;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;

      const result = row as Record<string, unknown>;

      const bandMap: Record<string, HealthBand> = {
        healthy: 'green',
        at_risk: 'yellow',
        critical: 'red',
        green: 'green',
        yellow: 'yellow',
        red: 'red',
      };

      const score = Number(result.score) || 0;
      const bandStr = (result.band as string) || 'critical';
      const band = bandMap[bandStr] || 'red';

      // Obtener nombre del cliente
      const { data: customerData } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', customerId)
        .maybeSingle();

      const customerName = (customerData as { full_name?: string } | null)?.full_name || 'Sin nombre';

      // Construir indicadores desde los campos de la RPC
      const indicators: HealthScoreResult['indicators'] = [
        {
          key: 'invoices_12m',
          label: 'Facturas (12m)',
          weight: 0,
          value: Number(result.invoices_12m) || 0,
          score: 0,
          weightedScore: 0,
        },
        {
          key: 'revenue_12m',
          label: 'Ingresos (12m)',
          weight: 0,
          value: Number(result.revenue_12m) || 0,
          score: 0,
          weightedScore: 0,
        },
        {
          key: 'days_since_last_invoice',
          label: 'Días última factura',
          weight: 0,
          value: result.days_since_last_invoice !== null ? Number(result.days_since_last_invoice) : -1,
          score: 0,
          weightedScore: 0,
        },
        {
          key: 'days_since_last_activity',
          label: 'Días última actividad',
          weight: 0,
          value: result.days_since_last_activity !== null ? Number(result.days_since_last_activity) : -1,
          score: 0,
          weightedScore: 0,
        },
        {
          key: 'overdue_balance',
          label: 'Saldo vencido',
          weight: 0,
          value: Number(result.overdue_balance) || 0,
          score: 0,
          weightedScore: 0,
        },
        {
          key: 'overdue_ratio',
          label: 'Ratio vencido',
          weight: 0,
          value: Number(result.overdue_ratio) || 0,
          score: 0,
          weightedScore: 0,
        },
      ];

      return {
        customer_id: customerId,
        customer_name: customerName,
        score,
        band,
        indicators,
      };
    } catch (err) {
      console.error('Error en healthScoreService.getCustomerHealthScore:', err);
      return null;
    }
  }

  /**
   * Obtiene el health score actual de todos los clientes de la organización.
   * Usa fn_customer_health RPC en modo batch (p_customer_id = NULL) para calcular
   * todos los scores en una sola consulta server-side, evitando N+1 queries.
   * @returns Lista de scores de clientes
   */
  async getAllHealthScores(organizationId?: number): Promise<HealthScoreResult[]> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return [];

      // Una sola RPC calcula scores para todos los clientes con lifecycle_stage='customer'
      const { data, error } = await supabase
        .rpc('fn_customer_health', {
          p_org_id: orgId,
          p_customer_id: null as unknown as string,
        });

      if (error || !data) {
        console.warn('Error en fn_customer_health batch:', error?.message);
        return [];
      }

      const rows = Array.isArray(data) ? data : [data];
      if (!rows || rows.length === 0) return [];

      // Mapear bandas de la RPC (healthy/at_risk/critical) a bandas del frontend (green/yellow/red)
      const bandMap: Record<string, HealthBand> = {
        healthy: 'green',
        at_risk: 'yellow',
        critical: 'red',
      };

      // Obtener nombres de clientes en una sola query
      const customerIds = rows.map((r: Record<string, unknown>) => r.customer_id as string);
      const { data: customersData } = await supabase
        .from('customers')
        .select('id, full_name')
        .in('id', customerIds);

      const nameMap = new Map<string, string>();
      for (const c of (customersData || []) as Array<{ id: string; full_name: string }>) {
        nameMap.set(c.id, c.full_name || 'Sin nombre');
      }

      const results: HealthScoreResult[] = rows.map((row: Record<string, unknown>) => {
        const score = Number(row.score) || 0;
        const bandStr = (row.band as string) || 'critical';
        return {
          customer_id: row.customer_id as string,
          customer_name: nameMap.get(row.customer_id as string) || 'Sin nombre',
          score,
          band: bandMap[bandStr] || 'red',
          indicators: [],
        };
      });

      // Ordenar por score ascendente (más críticos primero)
      results.sort((a, b) => a.score - b.score);

      return results;
    } catch (err) {
      console.error('Error en healthScoreService.getAllHealthScores:', err);
      return [];
    }
  }
}

export const healthScoreService = new HealthScoreService();
export default healthScoreService;

// ─── Funciones server-side (F11) — usa fn_customer_health RPC ────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CustomerHealthRpcResult {
  customer_id: string;
  invoices_12m: number;
  revenue_12m: number;
  days_since_last_invoice: number | null;
  days_since_last_activity: number | null;
  overdue_balance: number;
  overdue_ratio: number;
  score: number;
  band: string;
}

export interface HealthScoreServerResult {
  customer_id: string;
  score: number;
  band: HealthBand;
  indicators: {
    invoices_12m: number;
    revenue_12m: number;
    days_since_last_invoice: number | null;
    days_since_last_activity: number | null;
    overdue_balance: number;
    overdue_ratio: number;
  };
  calculated_at: string;
}

export interface HealthSnapshotRow {
  id: string;
  customer_id: string;
  score: number;
  band: HealthBand;
  indicators: Record<string, number>;
  created_at: string;
}

/**
 * Calcula el health score de un cliente usando fn_customer_health RPC.
 * Actualiza customers.health_score y health_score_updated_at.
 */
export async function calculateHealthScore(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<HealthScoreServerResult | null> {
  const { data, error } = await supabase
    .rpc('fn_customer_health', {
      p_org_id: orgId,
      p_customer_id: customerId,
    });

  if (error || !data) {
    console.warn('[healthScoreService.calculateHealthScore] RPC error:', error?.message);
    return null;
  }

  // fn_customer_health retorna una tabla con una fila
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const result = row as Record<string, unknown>;

  const score = Number(result.score) || 0;
  const bandStr = (result.band as string) || 'red';
  const band: HealthBand = bandStr === 'green' ? 'green' : bandStr === 'yellow' ? 'yellow' : 'red';

  // Actualizar customers.health_score y health_score_updated_at
  await supabase
    .from('customers')
    .update({
      health_score: score,
      health_score_updated_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .eq('organization_id', orgId);

  return {
    customer_id: customerId,
    score,
    band,
    indicators: {
      invoices_12m: Number(result.invoices_12m) || 0,
      revenue_12m: Number(result.revenue_12m) || 0,
      days_since_last_invoice: result.days_since_last_invoice !== null ? Number(result.days_since_last_invoice) : null,
      days_since_last_activity: result.days_since_last_activity !== null ? Number(result.days_since_last_activity) : null,
      overdue_balance: Number(result.overdue_balance) || 0,
      overdue_ratio: Number(result.overdue_ratio) || 0,
    },
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Obtiene el health score actual de un cliente (desde customers.health_score).
 */
export async function getHealthScore(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<{ customer_id: string; score: number | null; band: HealthBand | null; updated_at: string | null } | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, health_score, health_score_updated_at')
    .eq('id', customerId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data) {
    console.warn('[healthScoreService.getHealthScore] customer not found:', customerId);
    return null;
  }

  const row = data as { id: string; health_score: number | null; health_score_updated_at: string | null };

  let band: HealthBand | null = null;
  if (row.health_score !== null) {
    const score = row.health_score;
    band = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';
  }

  return {
    customer_id: customerId,
    score: row.health_score,
    band,
    updated_at: row.health_score_updated_at,
  };
}

/**
 * Guarda un snapshot del health score en health_score_snapshots.
 * Primero calcula el score via RPC, luego guarda el snapshot.
 */
export async function saveHealthSnapshot(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<HealthSnapshotRow | null> {
  const result = await calculateHealthScore(orgId, customerId, supabase);
  if (!result) return null;

  const indicators: Record<string, number> = {
    invoices_12m: result.indicators.invoices_12m,
    revenue_12m: result.indicators.revenue_12m,
    days_since_last_invoice: result.indicators.days_since_last_invoice ?? -1,
    days_since_last_activity: result.indicators.days_since_last_activity ?? -1,
    overdue_balance: result.indicators.overdue_balance,
    overdue_ratio: result.indicators.overdue_ratio,
  };

  const { data, error } = await supabase
    .from('health_score_snapshots')
    .insert({
      organization_id: orgId,
      customer_id: customerId,
      score: result.score,
      band: result.band,
      indicators: indicators as unknown as Record<string, unknown>,
    })
    .select('id, customer_id, score, band, indicators, created_at')
    .single();

  if (error) {
    console.error('[healthScoreService.saveHealthSnapshot] error:', error.message);
    return null;
  }

  const row = data as {
    id: string;
    customer_id: string;
    score: number;
    band: HealthBand;
    indicators: Record<string, number>;
    created_at: string;
  };

  return {
    id: row.id,
    customer_id: row.customer_id,
    score: row.score,
    band: row.band,
    indicators: row.indicators,
    created_at: row.created_at,
  };
}

/**
 * Obtiene la tendencia del health score de un cliente desde snapshots.
 * @param months - Número de meses hacia atrás (default: 6)
 */
export async function getHealthTrend(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient,
  months: number = 6
): Promise<HealthSnapshotRow[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data, error } = await supabase
    .from('health_score_snapshots')
    .select('id, customer_id, score, band, indicators, created_at')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error || !data) {
    console.warn('[healthScoreService.getHealthTrend] error:', error?.message);
    return [];
  }

  return (data as Array<{
    id: string;
    customer_id: string;
    score: number;
    band: HealthBand;
    indicators: Record<string, number>;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    score: row.score,
    band: row.band,
    indicators: row.indicators,
    created_at: row.created_at,
  }));
}
