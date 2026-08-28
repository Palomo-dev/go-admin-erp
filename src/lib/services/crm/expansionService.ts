import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para detectar y gestionar oportunidades de expansión (FASE 4 - Post-venta).
 * Detecta clientes saludables sin actividad de expansión y crecimiento de compras.
 *
 * Tablas: pipelines, stages, opportunities, mv_customer_health, health_score_snapshots, sales
 */

export type ExpansionType = 'cross-sell' | 'upsell' | 'nueva-sucursal' | 'nuevo-modulo';

export interface ExpansionSignal {
  customer_id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  type: ExpansionType;
  reason: string;
  health_score: number | null;
  health_band: string | null;
  revenue_current: number;
  revenue_previous: number;
  growth_pct: number;
  has_expansion_opp: boolean;
}

class ExpansionService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Obtiene o crea el pipeline de expansión para la organización actual.
   * @returns ID del pipeline de expansión
   */
  async getOrCreateExpansionPipeline(): Promise<string | null> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return null;

      const { data: existing } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', orgId)
        .eq('pipeline_type', 'expansion')
        .maybeSingle();

      if (existing) {
        return (existing as { id: string }).id;
      }

      const { data: pipeline, error } = await supabase
        .from('pipelines')
        .insert({
          organization_id: orgId,
          name: 'Expansion',
          pipeline_type: 'expansion',
          is_default: false,
        })
        .select()
        .single();

      if (error) throw error;

      const pipelineId = (pipeline as { id: string }).id;

      const stages = [
        { name: 'Deteccion', position: 1, probability: 20, color: '#3b82f6', sla_days: 7 },
        { name: 'Contacto', position: 2, probability: 40, color: '#6366f1', sla_days: 14 },
        { name: 'Propuesta expansion', position: 3, probability: 60, color: '#a855f7', sla_days: 21 },
        { name: 'Negociacion', position: 4, probability: 75, color: '#ec4899', sla_days: 30 },
        { name: 'Cerrado', position: 5, probability: 100, color: '#22c55e', sla_days: null },
        { name: 'No interesado', position: 6, probability: 0, color: '#ef4444', sla_days: null },
      ];

      const stagesToInsert = stages.map((s) => ({
        pipeline_id: pipelineId,
        name: s.name,
        position: s.position,
        probability: s.probability,
        color: s.color,
        sla_days: s.sla_days,
        is_won: s.position === 5,
        is_lost: s.position === 6,
      }));

      await supabase.from('stages').insert(stagesToInsert);

      return pipelineId;
    } catch (err) {
      console.error('Error en expansionService.getOrCreateExpansionPipeline:', err);
      return null;
    }
  }

  /**
   * Detecta oportunidades de expansión para los clientes de la organización.
   * - Cliente saludable (green/yellow) + sin actividad de expansión → tarea sugerida
   * - Crecimiento de compras vs periodo anterior → upsell candidato
   * @returns Lista de señales de expansión
   */
  async getExpansionSignals(): Promise<ExpansionSignal[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const pipelineId = await this.getOrCreateExpansionPipeline();
      if (!pipelineId) return [];

      // Obtener clientes con health score (snapshot más reciente)
      const { data: snapshots, error: snapError } = await supabase
        .from('health_score_snapshots')
        .select(`
          customer_id,
          score,
          band,
          created_at,
          customer:customers(id, full_name, email, phone)
        `)
        .eq('organization_id', orgId)
        .in('band', ['green', 'yellow'])
        .order('created_at', { ascending: false });

      if (snapError || !snapshots) return [];

      // Deduplicar por customer_id (snapshot más reciente)
      const seen = new Set<string>();
      const healthyCustomers: Array<{
        customer_id: string;
        customer_name: string;
        customer_email: string | null;
        customer_phone: string | null;
        health_score: number;
        health_band: string;
      }> = [];

      for (const row of snapshots as Array<Record<string, unknown>>) {
        const customerId = row.customer_id as string;
        if (seen.has(customerId)) continue;
        seen.add(customerId);

        const customer = row.customer as {
          id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
        } | null;

        healthyCustomers.push({
          customer_id: customerId,
          customer_name: customer?.full_name || 'Sin nombre',
          customer_email: customer?.email || null,
          customer_phone: customer?.phone || null,
          health_score: row.score as number,
          health_band: row.band as string,
        });
      }

      // Obtener oportunidades de expansión existentes
      const { data: existingOpps } = await supabase
        .from('opportunities')
        .select('customer_id')
        .eq('organization_id', orgId)
        .eq('pipeline_id', pipelineId)
        .eq('status', 'open');

      const expansionCustomerIds = new Set(
        (existingOpps || []).map((o) => (o as { customer_id: string }).customer_id)
      );

      const results: ExpansionSignal[] = [];
      const now = new Date();

      for (const cust of healthyCustomers) {
        // Comparar compras del periodo actual (90d) vs periodo anterior (90d-180d)
        const currentStart = new Date(now);
        currentStart.setDate(currentStart.getDate() - 90);
        const previousStart = new Date(now);
        previousStart.setDate(previousStart.getDate() - 180);
        const previousEnd = new Date(now);
        previousEnd.setDate(previousEnd.getDate() - 90);

        const { data: currentSales } = await supabase
          .from('sales')
          .select('total')
          .eq('customer_id', cust.customer_id)
          .eq('organization_id', orgId)
          .neq('status', 'cancelled')
          .gte('sale_date', currentStart.toISOString());

        const { data: previousSales } = await supabase
          .from('sales')
          .select('total')
          .eq('customer_id', cust.customer_id)
          .eq('organization_id', orgId)
          .neq('status', 'cancelled')
          .gte('sale_date', previousStart.toISOString())
          .lt('sale_date', previousEnd.toISOString());

        const revenueCurrent = (currentSales || []).reduce(
          (sum, s) => sum + Number((s as { total: number }).total) || 0,
          0
        );
        const revenuePrevious = (previousSales || []).reduce(
          (sum, s) => sum + Number((s as { total: number }).total) || 0,
          0
        );

        const growthPct = revenuePrevious > 0
          ? Math.round(((revenueCurrent - revenuePrevious) / revenuePrevious) * 100)
          : revenueCurrent > 0 ? 100 : 0;

        const hasExpansion = expansionCustomerIds.has(cust.customer_id);

        // Señal 1: Cliente saludable sin actividad de expansión
        if (!hasExpansion && cust.health_band === 'green') {
          results.push({
            customer_id: cust.customer_id,
            customer_name: cust.customer_name,
            customer_email: cust.customer_email,
            customer_phone: cust.customer_phone,
            type: 'cross-sell',
            reason: 'Cliente saludable sin actividad de expansión activa',
            health_score: cust.health_score,
            health_band: cust.health_band,
            revenue_current: revenueCurrent,
            revenue_previous: revenuePrevious,
            growth_pct: growthPct,
            has_expansion_opp: false,
          });
        }

        // Señal 2: Crecimiento de compras > 20% → upsell candidato
        if (growthPct > 20 && !hasExpansion) {
          results.push({
            customer_id: cust.customer_id,
            customer_name: cust.customer_name,
            customer_email: cust.customer_email,
            customer_phone: cust.customer_phone,
            type: 'upsell',
            reason: `Crecimiento de ${growthPct}% en compras vs periodo anterior`,
            health_score: cust.health_score,
            health_band: cust.health_band,
            revenue_current: revenueCurrent,
            revenue_previous: revenuePrevious,
            growth_pct: growthPct,
            has_expansion_opp: false,
          });
        }
      }

      // Ordenar: mayor crecimiento primero
      results.sort((a, b) => b.growth_pct - a.growth_pct);

      return results;
    } catch (err) {
      console.error('Error en expansionService.getExpansionSignals:', err);
      return [];
    }
  }

  /**
   * Crea una oportunidad de expansión para un cliente.
   * @param customerId - ID del cliente
   * @param type - Tipo de expansión (cross-sell/upsell/nueva-sucursal/nuevo-modulo)
   * @returns Oportunidad creada o null si falla
   */
  async createExpansionOpportunity(
    customerId: string,
    type: ExpansionType
  ): Promise<{ id: string; name: string } | null> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return null;

      const pipelineId = await this.getOrCreateExpansionPipeline();
      if (!pipelineId) return null;

      // Obtener la primera etapa
      const { data: firstStage } = await supabase
        .from('stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true })
        .limit(1)
        .single();

      if (!firstStage) return null;
      const stageId = (firstStage as { id: string }).id;

      // Obtener nombre del cliente
      const { data: customer } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', customerId)
        .maybeSingle();

      const customerName = (customer as { full_name: string } | null)?.full_name || 'Cliente';
      const typeLabels: Record<ExpansionType, string> = {
        'cross-sell': 'Cross-sell',
        'upsell': 'Upsell',
        'nueva-sucursal': 'Nueva sucursal',
        'nuevo-modulo': 'Nuevo modulo',
      };

      const oppName = `Expansion ${typeLabels[type]} - ${customerName}`;

      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('opportunities')
        .insert({
          organization_id: orgId,
          pipeline_id: pipelineId,
          stage_id: stageId,
          customer_id: customerId,
          name: oppName,
          amount: 0,
          currency: 'COP',
          status: 'open',
          created_by: userData.user?.id || null,
          metadata: {
            type: 'expansion',
            deal_type: type,
          },
        })
        .select('id, name')
        .single();

      if (error) throw error;

      return data as { id: string; name: string };
    } catch (err) {
      console.error('Error en expansionService.createExpansionOpportunity:', err);
      return null;
    }
  }
}

export const expansionService = new ExpansionService();
export default expansionService;
