import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para gestión de renovaciones (FASE 4 - Post-venta).
 * Sincroniza oportunidades de renovación desde ventas ganadas con billing_cycle_months.
 * Crea hitos 120/90/60/30/15/7 días antes del vencimiento.
 *
 * Tablas: pipelines, stages, opportunities
 */

// Días antes del vencimiento para crear hitos de renovación
const RENEWAL_MILESTONES = [120, 90, 60, 30, 15, 7] as const;

export interface UpcomingRenewal {
  opportunity_id: string;
  renewal_opportunity_id: string | null;
  customer_id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  original_amount: number;
  currency: string;
  billing_cycle_months: number;
  won_date: string;
  renewal_date: string;
  days_until_renewal: number;
  next_milestone_days: number | null;
  status: 'pending' | 'created' | 'open';
}

class RenewalService {
  private getOrgId(override?: number): number {
    if (override && override > 0) return override;
    return getOrganizationId();
  }

  /**
   * Obtiene o crea el pipeline de renovación para la organización actual.
   * @returns ID del pipeline de renovación
   */
  async getOrCreateRenewalPipeline(organizationId?: number): Promise<string | null> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return null;

      const { data: existing } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', orgId)
        .eq('pipeline_type', 'renewal')
        .maybeSingle();

      if (existing) {
        return (existing as { id: string }).id;
      }

      const { data: pipeline, error } = await supabase
        .from('pipelines')
        .insert({
          organization_id: orgId,
          name: 'Renovaciones',
          pipeline_type: 'renewal',
          is_default: false,
        })
        .select()
        .single();

      if (error) throw error;

      const pipelineId = (pipeline as { id: string }).id;

      // Crear etapas del pipeline de renovación
      const stages = [
        { name: 'Renovacion pendiente', position: 1, probability: 50, color: '#3b82f6', sla_days: null },
        { name: 'Contacto iniciado', position: 2, probability: 60, color: '#6366f1', sla_days: 30 },
        { name: 'Negociacion', position: 3, probability: 75, color: '#a855f7', sla_days: 21 },
        { name: 'Contrato enviado', position: 4, probability: 90, color: '#ec4899', sla_days: 14 },
        { name: 'Renovado', position: 5, probability: 100, color: '#22c55e', sla_days: null },
        { name: 'No renovado', position: 6, probability: 0, color: '#ef4444', sla_days: null },
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
      console.error('Error en renewalService.getOrCreateRenewalPipeline:', err);
      return null;
    }
  }

  /**
   * Sincroniza renovaciones: lee oportunidades ganadas con billing_cycle_months,
   * calcula fecha de vencimiento y crea oportunidades de renovación si no existen.
   * @returns Número de renovaciones creadas/actualizadas
   */
  async syncRenewals(organizationId?: number): Promise<number> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return 0;

      const pipelineId = await this.getOrCreateRenewalPipeline();
      if (!pipelineId) return 0;

      // Obtener la primera etapa del pipeline de renovación
      const { data: firstStage } = await supabase
        .from('stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true })
        .limit(1)
        .single();

      if (!firstStage) return 0;
      const firstStageId = (firstStage as { id: string }).id;

      // Leer oportunidades ganadas con billing_cycle_months definido
      const { data: wonOpps, error } = await supabase
        .from('opportunities')
        .select(`
          id,
          name,
          customer_id,
          amount,
          currency,
          billing_cycle_months,
          updated_at,
          created_at,
          customer:customers(id, full_name, email, phone)
        `)
        .eq('organization_id', orgId)
        .eq('status', 'won')
        .not('billing_cycle_months', 'is', null)
        .gt('billing_cycle_months', 0);

      if (error || !wonOpps || wonOpps.length === 0) return 0;

      let count = 0;
      const now = new Date();

      for (const opp of wonOpps as Array<Record<string, unknown>>) {
        const parentId = opp.id as string;
        const customerId = opp.customer_id as string;
        const billingMonths = opp.billing_cycle_months as number;
        const customer = opp.customer as {
          id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
        } | null;

        if (!customerId) continue;

        // won_date: usar updated_at como proxy (cuando se marcó como ganada)
        const wonDate = new Date((opp.updated_at as string) || (opp.created_at as string));
        const renewalDate = new Date(wonDate);
        renewalDate.setMonth(renewalDate.getMonth() + billingMonths);

        // Si la renovación ya venció hace más de 30 días, saltar
        const daysUntilRenewal = Math.floor(
          (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilRenewal < -30) continue;

        // Verificar si ya existe oportunidad de renovación para este padre
        const { data: existing } = await supabase
          .from('opportunities')
          .select('id, next_contact_at')
          .eq('parent_opportunity_id', parentId)
          .eq('pipeline_id', pipelineId)
          .maybeSingle();

        // Calcular próximo hito (next_contact_at)
        const nextMilestone = this.calculateNextMilestone(renewalDate, now);

        if (existing) {
          // Actualizar next_contact_at si es necesario
          const existingRow = existing as { id: string; next_contact_at: string | null };
          if (nextMilestone && (!existingRow.next_contact_at ||
            new Date(existingRow.next_contact_at).getTime() !== nextMilestone.getTime())) {
            await supabase
              .from('opportunities')
              .update({ next_contact_at: nextMilestone.toISOString() })
              .eq('id', existingRow.id);
          }
          continue;
        }

        // Crear oportunidad de renovación
        const customerName = customer?.full_name || 'Cliente';
        const renewalName = `Renovacion - ${customerName} - ${renewalDate.toLocaleDateString('es-CO')}`;

        const { data: userData } = await supabase.auth.getUser();

        const { error: createError } = await supabase
          .from('opportunities')
          .insert({
            organization_id: orgId,
            pipeline_id: pipelineId,
            stage_id: firstStageId,
            customer_id: customerId,
            name: renewalName,
            amount: opp.amount as number,
            currency: (opp.currency as string) || 'COP',
            status: 'open',
            parent_opportunity_id: parentId,
            expected_close_date: renewalDate.toISOString().split('T')[0],
            next_contact_at: nextMilestone?.toISOString() || null,
            created_by: userData.user?.id || null,
            metadata: {
              type: 'renewal',
              parent_opportunity_id: parentId,
              billing_cycle_months: billingMonths,
              renewal_date: renewalDate.toISOString(),
            },
          });

        if (createError) {
          console.warn(`Advertencia creando renovación para ${parentId}:`, createError.message);
        } else {
          count++;
        }
      }

      return count;
    } catch (err) {
      console.error('Error en renewalService.syncRenewals:', err);
      return 0;
    }
  }

  /**
   * Calcula el próximo hito de renovación (120/90/60/30/15/7 días antes).
   * @param renewalDate - Fecha de vencimiento de la renovación
   * @param now - Fecha actual
   * @returns Fecha del próximo hito o null si ya pasaron todos
   */
  private calculateNextMilestone(renewalDate: Date, now: Date): Date | null {
    for (const daysBefore of RENEWAL_MILESTONES) {
      const milestoneDate = new Date(renewalDate);
      milestoneDate.setDate(milestoneDate.getDate() - daysBefore);

      if (milestoneDate > now) {
        return milestoneDate;
      }
    }
    return null;
  }

  /**
   * Obtiene las renovaciones próximas (dentro de N días).
   * @param days - Ventana de días (default: 90)
   * @returns Lista de renovaciones próximas ordenadas por fecha
   */
  async getUpcomingRenewals(days: number = 90, organizationId?: number): Promise<UpcomingRenewal[]> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return [];

      const pipelineId = await this.getOrCreateRenewalPipeline();
      if (!pipelineId) return [];

      const now = new Date();
      const cutoffDate = new Date(now);
      cutoffDate.setDate(cutoffDate.getDate() + days);

      // Obtener oportunidades ganadas con billing_cycle_months
      const { data: wonOpps, error } = await supabase
        .from('opportunities')
        .select(`
          id,
          name,
          customer_id,
          amount,
          currency,
          billing_cycle_months,
          updated_at,
          created_at,
          customer:customers(id, full_name, email, phone)
        `)
        .eq('organization_id', orgId)
        .eq('status', 'won')
        .not('billing_cycle_months', 'is', null)
        .gt('billing_cycle_months', 0);

      if (error || !wonOpps) return [];

      const results: UpcomingRenewal[] = [];

      for (const opp of wonOpps as Array<Record<string, unknown>>) {
        const customerId = opp.customer_id as string;
        if (!customerId) continue;

        const wonDate = new Date((opp.updated_at as string) || (opp.created_at as string));
        const renewalDate = new Date(wonDate);
        renewalDate.setMonth(renewalDate.getMonth() + (opp.billing_cycle_months as number));

        const daysUntilRenewal = Math.floor(
          (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Filtrar: renovaciones dentro de la ventana (puede incluir recién vencidas)
        if (daysUntilRenewal > days || daysUntilRenewal < -30) continue;

        const customer = opp.customer as {
          id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
        } | null;

        // Buscar oportunidad de renovación existente
        const { data: renewalOpp } = await supabase
          .from('opportunities')
          .select('id, status, next_contact_at')
          .eq('parent_opportunity_id', opp.id as string)
          .eq('pipeline_id', pipelineId)
          .maybeSingle();

        const renewalRow = renewalOpp as { id: string; status: string; next_contact_at: string | null } | null;

        // Calcular próximo hito
        let nextMilestoneDays: number | null = null;
        if (renewalRow?.next_contact_at) {
          nextMilestoneDays = Math.floor(
            (new Date(renewalRow.next_contact_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        results.push({
          opportunity_id: opp.id as string,
          renewal_opportunity_id: renewalRow?.id || null,
          customer_id: customerId,
          customer_name: customer?.full_name || 'Sin nombre',
          customer_email: customer?.email || null,
          customer_phone: customer?.phone || null,
          original_amount: Number(opp.amount) || 0,
          currency: (opp.currency as string) || 'COP',
          billing_cycle_months: opp.billing_cycle_months as number,
          won_date: wonDate.toISOString(),
          renewal_date: renewalDate.toISOString(),
          days_until_renewal: daysUntilRenewal,
          next_milestone_days: nextMilestoneDays,
          status: (renewalRow ? renewalRow.status : 'pending') as 'pending' | 'created' | 'open',
        });
      }

      // Ordenar por días hasta renovación ascendente
      results.sort((a, b) => a.days_until_renewal - b.days_until_renewal);

      return results;
    } catch (err) {
      console.error('Error en renewalService.getUpcomingRenewals:', err);
      return [];
    }
  }
}

export const renewalService = new RenewalService();
export default renewalService;
