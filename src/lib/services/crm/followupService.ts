import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para gestión de seguimientos y tareas accionables.
 * Detecta contactos vencidos, oportunidades estancadas y leads sin primer contacto.
 *
 * Tablas: opportunities, stages, activities, customers
 */

export interface OverdueFollowup {
  opportunity_id: string;
  opportunity_name: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  stage_name: string;
  stage_color: string;
  amount: number;
  currency: string;
  next_contact_at: string | null;
  days_in_stage: number;
  sla_days: number | null;
  reason: 'overdue_contact' | 'sla_exceeded';
}

export interface StaleOpportunity {
  opportunity_id: string;
  opportunity_name: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  stage_name: string;
  stage_color: string;
  amount: number;
  currency: string;
  days_without_activity: number;
  last_activity_at: string | null;
}

export interface LeadWithoutContact {
  opportunity_id: string;
  opportunity_name: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  stage_name: string;
  stage_color: string;
  amount: number;
  currency: string;
  created_at: string;
  hours_since_creation: number;
}

export interface ScheduleNextContactInput {
  opportunityId: string;
  date: string; // ISO date
}

class FollowupService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Obtiene oportunidades con contactos vencidos:
   * - next_contact_at <= hoy
   * - OR días en etapa > sla_days de la etapa
   */
  async getOverdueFollowups(): Promise<OverdueFollowup[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const now = new Date().toISOString();

      // Query oportunidades abiertas con su etapa y cliente
      const { data, error } = await supabase
        .from('opportunities')
        .select(`
          id,
          name,
          amount,
          currency,
          next_contact_at,
          stage_id,
          updated_at,
          customer:customers(id, full_name, phone, email),
          stage:stages(id, name, color, sla_days)
        `)
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .not('stage_id', 'is', null);

      if (error) {
        console.warn('Advertencia en getOverdueFollowups:', error.message);
        return [];
      }

      if (!data || data.length === 0) return [];

      const results: OverdueFollowup[] = [];

      for (const row of data as Array<Record<string, unknown>>) {
        const nextContactAt = row.next_contact_at as string | null;
        const stage = row.stage as {
          id: string;
          name: string;
          color: string;
          sla_days: number | null;
        } | null;
        const customer = row.customer as {
          id: string;
          full_name: string;
          phone?: string | null;
          email?: string | null;
        } | null;
        const updatedAt = row.updated_at as string;

        const slaDays = stage?.sla_days ?? null;
        const daysInStage = updatedAt
          ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        let reason: 'overdue_contact' | 'sla_exceeded' | null = null;

        // Verificar next_contact_at vencido
        if (nextContactAt && new Date(nextContactAt) <= new Date(now)) {
          reason = 'overdue_contact';
        }

        // Verificar SLA excedido
        if (slaDays !== null && daysInStage > slaDays) {
          reason = 'sla_exceeded';
        }

        if (reason) {
          results.push({
            opportunity_id: row.id as string,
            opportunity_name: row.name as string,
            customer_id: customer?.id || '',
            customer_name: customer?.full_name || 'Sin cliente',
            customer_phone: customer?.phone || null,
            customer_email: customer?.email || null,
            stage_name: stage?.name || 'Sin etapa',
            stage_color: stage?.color || '#94a3b8',
            amount: row.amount as number,
            currency: (row.currency as string) || 'COP',
            next_contact_at: nextContactAt,
            days_in_stage: daysInStage,
            sla_days: slaDays,
            reason,
          });
        }
      }

      // Ordenar: vencidos por fecha más antigua primero
      results.sort((a, b) => {
        const dateA = a.next_contact_at ? new Date(a.next_contact_at).getTime() : Infinity;
        const dateB = b.next_contact_at ? new Date(b.next_contact_at).getTime() : Infinity;
        return dateA - dateB;
      });

      return results;
    } catch (err) {
      console.error('Error en followupService.getOverdueFollowups:', err);
      return [];
    }
  }

  /**
   * Obtiene oportunidades estancadas: sin actividades en los últimos N días.
   * @param staleDays - Días sin actividad para considerar estancada (default: 7)
   */
  async getStaleOpportunities(staleDays: number = 7): Promise<StaleOpportunity[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const cutoffDate = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

      // Obtener oportunidades abiertas
      const { data: opps, error } = await supabase
        .from('opportunities')
        .select(`
          id,
          name,
          amount,
          currency,
          customer:customers(id, full_name, phone, email),
          stage:stages(id, name, color)
        `)
        .eq('organization_id', orgId)
        .eq('status', 'open');

      if (error || !opps || opps.length === 0) return [];

      const results: StaleOpportunity[] = [];

      for (const opp of opps as Array<Record<string, unknown>>) {
        const oppId = opp.id as string;

        // Buscar última actividad de esta oportunidad
        const { data: lastActivity } = await supabase
          .from('activities')
          .select('occurred_at')
          .eq('related_id', oppId)
          .eq('related_type', 'opportunity')
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastActivityAt = lastActivity
          ? (lastActivity as { occurred_at: string }).occurred_at
          : null;

        const daysWithoutActivity = lastActivityAt
          ? Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
          : 999; // Sin actividades = muy estancada

        // Si no tiene actividad o la última fue antes del cutoff
        if (!lastActivityAt || new Date(lastActivityAt) < new Date(cutoffDate)) {
          const customer = opp.customer as {
            id: string;
            full_name: string;
            phone?: string | null;
            email?: string | null;
          } | null;
          const stage = opp.stage as { id: string; name: string; color: string } | null;

          results.push({
            opportunity_id: oppId,
            opportunity_name: opp.name as string,
            customer_id: customer?.id || '',
            customer_name: customer?.full_name || 'Sin cliente',
            customer_phone: customer?.phone || null,
            customer_email: customer?.email || null,
            stage_name: stage?.name || 'Sin etapa',
            stage_color: stage?.color || '#94a3b8',
            amount: opp.amount as number,
            currency: (opp.currency as string) || 'COP',
            days_without_activity: daysWithoutActivity,
            last_activity_at: lastActivityAt,
          });
        }
      }

      // Ordenar: más días sin actividad primero
      results.sort((a, b) => b.days_without_activity - a.days_without_activity);

      return results;
    } catch (err) {
      console.error('Error en followupService.getStaleOpportunities:', err);
      return [];
    }
  }

  /**
   * Obtiene leads sin primer contacto: oportunidades creadas hace >48h
   * sin ninguna actividad registrada.
   */
  async getLeadsWithoutContact(): Promise<LeadWithoutContact[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      // Obtener oportunidades abiertas creadas hace >48h
      const { data: opps, error } = await supabase
        .from('opportunities')
        .select(`
          id,
          name,
          amount,
          currency,
          created_at,
          customer:customers(id, full_name, phone, email),
          stage:stages(id, name, color)
        `)
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .lt('created_at', cutoffDate);

      if (error || !opps || opps.length === 0) return [];

      const results: LeadWithoutContact[] = [];

      for (const opp of opps as Array<Record<string, unknown>>) {
        const oppId = opp.id as string;

        // Verificar si tiene al menos 1 actividad
        const { count, error: countError } = await supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('related_id', oppId)
          .eq('related_type', 'opportunity');

        if (countError) continue;

        // Si no tiene actividades → lead sin contacto
        if ((count || 0) === 0) {
          const customer = opp.customer as {
            id: string;
            full_name: string;
            phone?: string | null;
            email?: string | null;
          } | null;
          const stage = opp.stage as { id: string; name: string; color: string } | null;
          const createdAt = opp.created_at as string;

          results.push({
            opportunity_id: oppId,
            opportunity_name: opp.name as string,
            customer_id: customer?.id || '',
            customer_name: customer?.full_name || 'Sin cliente',
            customer_phone: customer?.phone || null,
            customer_email: customer?.email || null,
            stage_name: stage?.name || 'Sin etapa',
            stage_color: stage?.color || '#94a3b8',
            amount: opp.amount as number,
            currency: (opp.currency as string) || 'COP',
            created_at: createdAt,
            hours_since_creation: Math.floor(
              (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
            ),
          });
        }
      }

      // Ordenar: más antiguos primero
      results.sort((a, b) => b.hours_since_creation - a.hours_since_creation);

      return results;
    } catch (err) {
      console.error('Error en followupService.getLeadsWithoutContact:', err);
      return [];
    }
  }

  /**
   * Programa el próximo contacto para una oportunidad.
   * @param opportunityId - ID de la oportunidad
   * @param date - Fecha del próximo contacto (ISO)
   */
  async scheduleNextContact(input: ScheduleNextContactInput): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({
          next_contact_at: input.date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.opportunityId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error en followupService.scheduleNextContact:', err);
      return false;
    }
  }
}

export const followupService = new FollowupService();
export default followupService;
