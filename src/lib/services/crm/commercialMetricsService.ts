import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM - Métricas comerciales avanzadas (FASE 5).
 *
 * Calcula:
 * - Win rate (tasa de cierre)
 * - Cycle length (tiempo medio de ciclo de venta)
 * - ARPA (Average Revenue Per Account)
 * - Pipeline coverage (cobertura del pipeline)
 * - Proyección de ingresos
 *
 * Reusa RPCs existentes:
 * - fn_reporte_crm_funnel
 * - fn_reporte_crm_ranking_vendedores
 *
 * Tabla: opportunity_stage_history (opportunity_id, stage_id, entered_at, exited_at)
 * Tabla: opportunities (id, organization_id, status, amount, currency, created_at, closed_at)
 */

// ============== Tipos ==============

export type Period = '7d' | '30d' | '90d' | 'ytd' | 'all';

export interface CommercialMetrics {
  win_rate: number;
  cycle_length_days: number;
  arpa: number;
  pipeline_coverage: number;
  projection: number;
  total_won: number;
  total_lost: number;
  total_open: number;
  total_won_amount: number;
  total_open_amount: number;
  period: Period;
}

export interface VendorBreakdown {
  salesperson_id: string;
  salesperson_name: string;
  open_count: number;
  won_count: number;
  lost_count: number;
  won_amount: number;
  win_rate: number;
  avg_cycle_days: number;
}

export interface FunnelStageMetric {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  position: number;
  probability: number;
  current_count: number;
  current_amount: number;
  entered_count: number;
  exited_count: number;
  conversion_rate: number;
  avg_days_in_stage: number;
  bottleneck_score: number;
}

export interface FunnelMetrics {
  stages: FunnelStageMetric[];
  total_pipeline: number;
  forecast: number;
  overall_conversion: number;
}

// ============== Servicio ==============

class CommercialMetricsService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Calcula el rango de fechas para un periodo dado.
   */
  private getPeriodRange(period: Period): { from: string; to: string } {
    const to = new Date();
    const from = new Date();

    switch (period) {
      case '7d':
        from.setDate(from.getDate() - 7);
        break;
      case '30d':
        from.setDate(from.getDate() - 30);
        break;
      case '90d':
        from.setDate(from.getDate() - 90);
        break;
      case 'ytd':
        from.setMonth(0, 1);
        from.setHours(0, 0, 0, 0);
        break;
      case 'all':
      default:
        from.setFullYear(2000, 0, 1);
        break;
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  /**
   * Obtiene métricas comerciales avanzadas para un periodo.
   */
  async getMetrics(period: Period = '30d'): Promise<CommercialMetrics> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) {
        return this.emptyMetrics(period);
      }

      const { from, to } = this.getPeriodRange(period);

      // 1. Obtener oportunidades del periodo
      const { data: opps, error } = await supabase
        .from('opportunities')
        .select('id, status, amount, currency, created_at, closed_at, salesperson_id')
        .eq('organization_id', orgId)
        .or(`created_at.gte.${from},closed_at.gte.${from}`);

      if (error || !opps) {
        console.warn('Advertencia obteniendo oportunidades para métricas:', error?.message);
        return this.emptyMetrics(period);
      }

      const won = opps.filter((o: Record<string, unknown>) => o.status === 'won');
      const lost = opps.filter((o: Record<string, unknown>) => o.status === 'lost');
      const open = opps.filter((o: Record<string, unknown>) => o.status === 'open');

      const totalWon = won.length;
      const totalLost = lost.length;
      const totalOpen = open.length;
      const totalWonAmount = won.reduce(
        (sum: number, o: Record<string, unknown>) => sum + ((o.amount as number) || 0),
        0
      );
      const totalOpenAmount = open.reduce(
        (sum: number, o: Record<string, unknown>) => sum + ((o.amount as number) || 0),
        0
      );

      // Win rate
      const closedDeals = totalWon + totalLost;
      const winRate = closedDeals > 0 ? (totalWon / closedDeals) * 100 : 0;

      // ARPA (Average Revenue Per Account)
      const arpa = totalWon > 0 ? totalWonAmount / totalWon : 0;

      // Cycle length: calcular desde opportunity_stage_history
      const cycleLengthDays = await this.calculateCycleLength(orgId, from, to);

      // Pipeline coverage: total open / total won (ratio)
      const pipelineCoverage = totalWonAmount > 0 ? totalOpenAmount / totalWonAmount : 0;

      // Proyección: forecast ponderado del pipeline abierto
      const projection = await this.calculateProjection(orgId);

      return {
        win_rate: Math.round(winRate * 10) / 10,
        cycle_length_days: cycleLengthDays,
        arpa: Math.round(arpa),
        pipeline_coverage: Math.round(pipelineCoverage * 100) / 100,
        projection: Math.round(projection),
        total_won: totalWon,
        total_lost: totalLost,
        total_open: totalOpen,
        total_won_amount: totalWonAmount,
        total_open_amount: totalOpenAmount,
        period,
      };
    } catch (err) {
      console.error('Error en commercialMetricsService.getMetrics:', err);
      return this.emptyMetrics(period);
    }
  }

  /**
   * Dashboard por vendedor: oportunidades, montos, win rate, cycle length.
   */
  async getVendorBreakdown(period: Period = '30d'): Promise<VendorBreakdown[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const { from, to } = this.getPeriodRange(period);

      // Usar RPC existente para ranking de vendedores
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'fn_reporte_crm_ranking_vendedores',
        {
          p_organization_id: orgId,
          p_from: from,
          p_to: to,
        }
      );

      if (rpcError) {
        console.warn('RPC fn_reporte_crm_ranking_vendedores no disponible:', rpcError.message);
        // Fallback: calcular manualmente
        return await this.calculateVendorBreakdownManual(orgId, from, to);
      }

      const ranking = ((rpcData as Record<string, unknown>)?.ranking as Array<Record<string, unknown>>) || [];

      return ranking.map((row) => ({
        salesperson_id: (row.vendedor_id as string) || 'N/A',
        salesperson_name: (row.vendedor_nombre as string) || (row.vendedor_id as string) || 'N/A',
        open_count: Number(row.abiertas) || 0,
        won_count: Number(row.ganadas) || 0,
        lost_count: Number(row.perdidas) || 0,
        won_amount: Number(row.monto_ganado) || 0,
        win_rate: Number(row.tasa_cierre) || 0,
        avg_cycle_days: Number(row.ciclo_promedio_dias) || 0,
      }));
    } catch (err) {
      console.error('Error en commercialMetricsService.getVendorBreakdown:', err);
      return [];
    }
  }

  /**
   * Métricas de funnel: conversión por etapa con tiempos.
   * Reusa fn_reporte_crm_funnel + opportunity_stage_history.
   */
  async getFunnelMetrics(): Promise<FunnelMetrics> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) {
        return { stages: [], total_pipeline: 0, forecast: 0, overall_conversion: 0 };
      }

      // 1. Obtener etapas del pipeline
      const { data: stageData, error: stageError } = await supabase
        .from('stages')
        .select('id, name, color, position, probability, sla_days, pipeline_id')
        .order('position');

      if (stageError || !stageData || stageData.length === 0) {
        return { stages: [], total_pipeline: 0, forecast: 0, overall_conversion: 0 };
      }

      // Filtrar etapas de la organización via pipelines
      const { data: pipelines } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', orgId);

      const pipelineIds = new Set((pipelines || []).map((p: Record<string, unknown>) => (p as { id: string }).id));
      const orgStages = stageData.filter((s: Record<string, unknown>) =>
        pipelineIds.has((s as { pipeline_id: string }).pipeline_id)
      );

      if (orgStages.length === 0) {
        return { stages: [], total_pipeline: 0, forecast: 0, overall_conversion: 0 };
      }

      const stageIds = orgStages.map((s: Record<string, unknown>) => (s as { id: string }).id);

      // 2. Oportunidades actuales por etapa
      const { data: oppData } = await supabase
        .from('opportunities')
        .select('stage_id, status, amount, currency')
        .eq('organization_id', orgId)
        .in('stage_id', stageIds)
        .eq('status', 'open');

      const currentByStage: Record<string, { count: number; amount: number }> = {};
      for (const opp of (oppData || []) as Array<Record<string, unknown>>) {
        const sid = opp.stage_id as string;
        if (!currentByStage[sid]) currentByStage[sid] = { count: 0, amount: 0 };
        currentByStage[sid].count++;
        currentByStage[sid].amount += (opp.amount as number) || 0;
      }

      // 3. Historial de etapas
      let historyData: Array<Record<string, unknown>> = [];
      try {
        const { data: histData, error: histError } = await supabase
          .from('opportunity_stage_history')
          .select('opportunity_id, stage_id, entered_at, exited_at')
          .in('stage_id', stageIds);

        if (!histError && histData) {
          historyData = histData as Array<Record<string, unknown>>;
        }
      } catch {
        // Tabla no existe — usar aproximación
      }

      // 4. Calcular métricas por etapa
      const stages: FunnelStageMetric[] = orgStages.map((stageRow: Record<string, unknown>) => {
        const stage = stageRow as {
          id: string;
          name: string;
          color: string;
          position: number;
          probability: number;
          sla_days: number | null;
        };

        const current = currentByStage[stage.id] || { count: 0, amount: 0 };
        const stageHistory = historyData.filter((h) => h.stage_id === stage.id);
        const enteredCount = stageHistory.length;
        const exitedCount = stageHistory.filter((h) => h.exited_at !== null).length;
        const conversionRate = enteredCount > 0 ? (exitedCount / enteredCount) * 100 : 0;

        let totalDays = 0;
        let completedEntries = 0;
        for (const h of stageHistory) {
          const enteredAt = h.entered_at as string;
          const exitedAt = h.exited_at as string | null;
          if (enteredAt && exitedAt) {
            totalDays += Math.floor(
              (new Date(exitedAt).getTime() - new Date(enteredAt).getTime()) /
                (1000 * 60 * 60 * 24)
            );
            completedEntries++;
          }
        }
        const avgDaysInStage =
          completedEntries > 0 ? Math.round(totalDays / completedEntries) : 0;

        const slaDays = stage.sla_days;
        const bottleneckScore =
          slaDays && avgDaysInStage > 0 ? avgDaysInStage / slaDays : 0;

        return {
          stage_id: stage.id,
          stage_name: stage.name,
          stage_color: stage.color,
          position: stage.position,
          probability: stage.probability,
          current_count: current.count,
          current_amount: current.amount,
          entered_count: enteredCount,
          exited_count: exitedCount,
          conversion_rate: Math.round(conversionRate * 10) / 10,
          avg_days_in_stage: avgDaysInStage,
          bottleneck_score: Math.round(bottleneckScore * 100) / 100,
        };
      });

      const totalPipeline = stages.reduce((sum: number, s: FunnelStageMetric) => sum + s.current_amount, 0);
      const forecast = stages.reduce(
        (sum: number, s: FunnelStageMetric) => sum + (s.current_amount * s.probability) / 100,
        0
      );
      const totalEntered = stages.reduce((sum: number, s: FunnelStageMetric) => sum + s.entered_count, 0);
      const totalExited = stages.reduce((sum: number, s: FunnelStageMetric) => sum + s.exited_count, 0);
      const overallConversion =
        totalEntered > 0 ? (totalExited / totalEntered) * 100 : 0;

      return {
        stages,
        total_pipeline: totalPipeline,
        forecast: Math.round(forecast),
        overall_conversion: Math.round(overallConversion * 10) / 10,
      };
    } catch (err) {
      console.error('Error en commercialMetricsService.getFunnelMetrics:', err);
      return { stages: [], total_pipeline: 0, forecast: 0, overall_conversion: 0 };
    }
  }

  // ============== Helpers internos ==============

  private emptyMetrics(period: Period): CommercialMetrics {
    return {
      win_rate: 0,
      cycle_length_days: 0,
      arpa: 0,
      pipeline_coverage: 0,
      projection: 0,
      total_won: 0,
      total_lost: 0,
      total_open: 0,
      total_won_amount: 0,
      total_open_amount: 0,
      period,
    };
  }

  /**
   * Calcula el ciclo de venta medio desde opportunity_stage_history.
   * Mide el tiempo desde que una oportunidad entra en la primera etapa
   * hasta que se cierra (won/lost).
   */
  private async calculateCycleLength(
    orgId: number,
    from: string,
    to: string
  ): Promise<number> {
    try {
      // Obtener oportunidades cerradas en el periodo [from, to]
      const { data: closedOpps } = await supabase
        .from('opportunities')
        .select('id, created_at, closed_at, status')
        .eq('organization_id', orgId)
        .in('status', ['won', 'lost'])
        .gte('closed_at', from)
        .lte('closed_at', to);

      if (!closedOpps || closedOpps.length === 0) return 0;

      let totalDays = 0;
      let count = 0;

      for (const opp of closedOpps as Array<Record<string, unknown>>) {
        const createdAt = opp.created_at as string;
        const closedAt = opp.closed_at as string;
        if (createdAt && closedAt) {
          totalDays += Math.floor(
            (new Date(closedAt).getTime() - new Date(createdAt).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          count++;
        }
      }

      return count > 0 ? Math.round(totalDays / count) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Calcula la proyección de ingresos: forecast ponderado del pipeline abierto.
   */
  private async calculateProjection(orgId: number): Promise<number> {
    try {
      // Usar RPC existente fn_reporte_crm_funnel
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const { data, error } = await supabase.rpc('fn_reporte_crm_funnel', {
        p_organization_id: orgId,
        p_from: yearStart.toISOString(),
        p_to: now.toISOString(),
      });

      if (error || !data) return 0;

      const forecast = (data as Record<string, unknown>)?.forecast as number;
      return Number(forecast) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Fallback: calcula el breakdown por vendedor manualmente si la RPC no está disponible.
   */
  private async calculateVendorBreakdownManual(
    orgId: number,
    from: string,
    to: string
  ): Promise<VendorBreakdown[]> {
    try {
      const { data: opps } = await supabase
        .from('opportunities')
        .select('id, status, amount, salesperson_id, created_at, closed_at')
        .eq('organization_id', orgId)
        .or(`created_at.gte.${from},closed_at.gte.${from}`)
        .lte('created_at', to);

      if (!opps || opps.length === 0) return [];

      const byVendor: Record<string, VendorBreakdown> = {};

      for (const opp of opps as Array<Record<string, unknown>>) {
        const vendorId = (opp.salesperson_id as string) || 'unassigned';
        if (!byVendor[vendorId]) {
          byVendor[vendorId] = {
            salesperson_id: vendorId,
            salesperson_name: vendorId === 'unassigned' ? 'Sin asignar' : vendorId.substring(0, 8),
            open_count: 0,
            won_count: 0,
            lost_count: 0,
            won_amount: 0,
            win_rate: 0,
            avg_cycle_days: 0,
          };
        }

        const status = opp.status as string;
        const amount = (opp.amount as number) || 0;

        if (status === 'open') byVendor[vendorId].open_count++;
        if (status === 'won') {
          byVendor[vendorId].won_count++;
          byVendor[vendorId].won_amount += amount;
        }
        if (status === 'lost') byVendor[vendorId].lost_count++;
      }

      // Calcular win rate por vendedor
      for (const vendor of Object.values(byVendor)) {
        const closed = vendor.won_count + vendor.lost_count;
        vendor.win_rate = closed > 0 ? Math.round((vendor.won_count / closed) * 1000) / 10 : 0;
      }

      return Object.values(byVendor).sort((a, b) => b.won_amount - a.won_amount);
    } catch {
      return [];
    }
  }
}

export const commercialMetricsService = new CommercialMetricsService();
export default commercialMetricsService;
