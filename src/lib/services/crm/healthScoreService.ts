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
   * Refresca mv_customer_health y recalcula los scores de todos los clientes.
   * @returns Número de clientes recalculados
   */
  async refreshAllHealthScores(organizationId?: number): Promise<number> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return 0;

      // Refrescar la vista materializada
      const { error: refreshError } = await supabase.rpc('refresh_mv_customer_health');

      if (refreshError) {
        console.warn('Advertencia refrescando mv_customer_health:', refreshError.message);
        // Continuar aunque el refresh falle — los datos pueden estar desactualizados pero disponibles
      }

      // Obtener todos los clientes de la organización con datos en mv_customer_health
      const { data: healthData, error } = await supabase
        .from('mv_customer_health')
        .select('customer_id')
        .eq('organization_id', orgId);

      if (error || !healthData || healthData.length === 0) return 0;

      let count = 0;
      // Recalcular y snapshotear cada cliente
      for (const row of healthData as Array<{ customer_id: string }>) {
        const snapshot = await this.snapshotHealthScore(row.customer_id);
        if (snapshot) count++;
      }

      return count;
    } catch (err) {
      console.error('Error en healthScoreService.refreshAllHealthScores:', err);
      return 0;
    }
  }

  /**
   * Obtiene el health score actual de todos los clientes de la organización.
   * Usa el snapshot más reciente de cada cliente.
   * @returns Lista de scores de clientes
   */
  async getAllHealthScores(organizationId?: number): Promise<HealthScoreResult[]> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return [];

      // Obtener todos los clientes de la organización
      const { data: customers, error: custError } = await supabase
        .from('customers')
        .select('id, full_name, email, phone')
        .eq('organization_id', orgId)
        .order('full_name');

      if (custError || !customers) return [];

      const results: HealthScoreResult[] = [];

      for (const customer of customers as Array<{
        id: string;
        full_name: string;
        email?: string | null;
        phone?: string | null;
      }>) {
        // Obtener snapshot más reciente
        const { data: snapshot } = await supabase
          .from('health_score_snapshots')
          .select('score, band')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (snapshot) {
          const snap = snapshot as { score: number; band: HealthBand };
          results.push({
            customer_id: customer.id,
            customer_name: customer.full_name,
            score: snap.score,
            band: snap.band,
            indicators: [],
          });
        } else {
          // Sin snapshot — calcular en vivo
          const calculated = await this.calculateHealthScore(customer.id);
          if (calculated) {
            results.push(calculated);
          }
        }
      }

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
