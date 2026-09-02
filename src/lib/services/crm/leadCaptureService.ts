import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';

/**
 * Servicio CRM para captura automática de leads desde webhooks y otros canales.
 * Garantiza 1 oportunidad abierta por customer (dedupe) y crea actividades
 * cuando ya existe un deal abierto en lugar de duplicar.
 *
 * Tablas: opportunities, activities, pipelines, stages, customers
 */

export interface EnsureLeadInput {
  customerId: string;
  source?: string;
  recordType?: 'lead' | 'opportunity';
  name?: string;
  amount?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface EnsureLeadResult {
  action: 'created' | 'activity_added';
  opportunityId: string;
  message: string;
}

class LeadCaptureService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Obtiene el pipeline y la primera etapa (Lead nuevo) de la organización.
   */
  private async getDefaultPipelineAndStage(): Promise<{
    pipelineId: string;
    stageId: string;
  } | null> {
    const orgId = this.getOrgId();
    if (!orgId) return null;

    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .select('id')
      .eq('organization_id', orgId)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !pipeline) return null;
    const pipelineId = (pipeline as { id: string }).id;

    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (stageError || !stage) return null;

    return {
      pipelineId,
      stageId: (stage as { id: string }).id,
    };
  }

  /**
   * Busca si ya existe una oportunidad abierta para el customer dado.
   */
  private async findOpenOpportunityByCustomer(
    customerId: string
  ): Promise<string | null> {
    const orgId = this.getOrgId();

    const { data, error } = await supabase
      .from('opportunities')
      .select('id')
      .eq('organization_id', orgId)
      .eq('customer_id', customerId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return (data as { id: string }).id;
  }

  /**
   * Crea una actividad asociada a una oportunidad existente.
   */
  private async addActivityToOpportunity(
    opportunityId: string,
    notes: string,
    source?: string
  ): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();

    await supabase.from('activities').insert({
      organization_id: this.getOrgId(),
      activity_type: 'note',
      user_id: userData.user?.id || null,
      notes: notes || `Nuevo contacto recibido desde ${source || 'webhook'}`,
      related_type: 'opportunity',
      related_id: opportunityId,
      occurred_at: new Date().toISOString(),
      metadata: { source: source || 'webhook', auto_generated: true },
    });
  }

  /**
   * Asegura que exista exactamente 1 oportunidad abierta por customer.
   * Si ya existe un deal abierto, crea una actividad en lugar de duplicar.
   *
   * @param input - Datos del lead a capturar
   * @returns Resultado con la acción realizada y el ID de la oportunidad
   */
  async ensureLeadOpportunity(input: EnsureLeadInput): Promise<EnsureLeadResult> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) {
        throw new Error('No se pudo obtener la organización activa');
      }

      // 1. Verificar si ya existe oportunidad abierta para este customer
      const existingOppId = await this.findOpenOpportunityByCustomer(input.customerId);

      if (existingOppId) {
        // Ya existe deal abierto → crear actividad en vez de nueva oportunidad
        await this.addActivityToOpportunity(
          existingOppId,
          input.notes || `Nuevo contacto recibido desde ${input.source || 'webhook'}`,
          input.source
        );

        return {
          action: 'activity_added',
          opportunityId: existingOppId,
          message: 'Se agregó actividad a oportunidad existente (dedupe)',
        };
      }

      // 2. No existe oportunidad abierta → crear nueva
      const pipelineData = await this.getDefaultPipelineAndStage();
      if (!pipelineData) {
        throw new Error('No se encontró pipeline/etapa por defecto para la organización');
      }

      // Obtener nombre del customer para el nombre de la oportunidad
      let opportunityName = input.name;
      if (!opportunityName) {
        const { data: customer } = await supabase
          .from('customers')
          .select('full_name')
          .eq('id', input.customerId)
          .maybeSingle();

        opportunityName = `Lead - ${(customer as { full_name?: string } | null)?.full_name || 'Cliente'}`;
      }

      const { data: userData } = await supabase.auth.getUser();

      const { data: newOpp, error } = await supabase
        .from('opportunities')
        .insert({
          organization_id: orgId,
          pipeline_id: pipelineData.pipelineId,
          stage_id: pipelineData.stageId,
          customer_id: input.customerId,
          name: opportunityName,
          amount: input.amount || 0,
          currency: 'COP',
          status: 'open',
          source: input.source || 'webhook',
          created_by: userData.user?.id || null,
          next_contact_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          metadata: input.metadata || {},
        })
        .select('id')
        .single();

      if (error) throw error;

      const opportunityId = (newOpp as { id: string }).id;

      // Crear actividad inicial
      await supabase.from('activities').insert({
        organization_id: orgId,
        activity_type: 'note',
        user_id: userData.user?.id || null,
        notes: input.notes || `Lead capturado desde ${input.source || 'webhook'}`,
        related_type: 'opportunity',
        related_id: opportunityId,
        occurred_at: new Date().toISOString(),
        metadata: { source: input.source || 'webhook', auto_generated: true },
      });

      return {
        action: 'created',
        opportunityId,
        message: 'Nueva oportunidad creada para el cliente',
      };
    } catch (err) {
      console.error('Error en leadCaptureService.ensureLeadOpportunity:', err);
      throw err;
    }
  }
}

export const leadCaptureService = new LeadCaptureService();
export default leadCaptureService;
