import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para gestión de onboarding de clientes (FASE 4 - Post-venta).
 * Crea oportunidades hijas en pipeline type='onboarding', gestiona plantillas
 * de onboarding y checklist de tareas.
 *
 * Tablas: pipelines, stages, opportunities, tasks, templates
 */

// Etapas del pipeline de onboarding
export const ONBOARDING_STAGES = [
  { name: 'Kickoff', position: 1, probability: 10, color: '#3b82f6', sla_days: 3 },
  { name: 'Configuracion', position: 2, probability: 20, color: '#6366f1', sla_days: 7 },
  { name: 'Importacion', position: 3, probability: 35, color: '#8b5cf6', sla_days: 10 },
  { name: 'Capacitacion', position: 4, probability: 50, color: '#a855f7', sla_days: 14 },
  { name: 'Uso asistido', position: 5, probability: 70, color: '#d946ef', sla_days: 21 },
  { name: 'Revision 14d', position: 6, probability: 85, color: '#ec4899', sla_days: 30 },
  { name: 'Business Review 30d', position: 7, probability: 100, color: '#22c55e', sla_days: 45 },
] as const;

export interface OnboardingStep {
  day: number;
  title: string;
  description?: string;
  responsible?: string;
}

export interface OnboardingTemplate {
  id?: string;
  organization_id?: number;
  name: string;
  kind: 'onboarding';
  channel: string;
  subject?: string;
  body_html: string;
  steps: OnboardingStep[];
  is_active?: boolean;
}

export interface OnboardingTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  assigned_to: string | null;
  status: string;
  completed_at: string | null;
  related_to_id: string | null;
  related_to_type: string | null;
  assigned_to_name?: string | null;
}

class OnboardingService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Obtiene o crea el pipeline de onboarding para la organización actual.
   * @returns ID del pipeline de onboarding
   */
  async getOrCreateOnboardingPipeline(): Promise<string | null> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return null;

      // Buscar pipeline existente con type='onboarding'
      const { data: existing } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', orgId)
        .eq('pipeline_type', 'onboarding')
        .maybeSingle();

      if (existing) {
        return (existing as { id: string }).id;
      }

      // Crear pipeline de onboarding
      const { data: pipeline, error: pipelineError } = await supabase
        .from('pipelines')
        .insert({
          organization_id: orgId,
          name: 'Onboarding',
          pipeline_type: 'onboarding',
          is_default: false,
        })
        .select()
        .single();

      if (pipelineError) throw pipelineError;

      const pipelineId = (pipeline as { id: string }).id;

      // Crear etapas de onboarding
      const stagesToInsert = ONBOARDING_STAGES.map((stage) => ({
        pipeline_id: pipelineId,
        name: stage.name,
        position: stage.position,
        probability: stage.probability,
        color: stage.color,
        sla_days: stage.sla_days,
        is_won: stage.position === 7,
        is_lost: false,
      }));

      const { error: stagesError } = await supabase
        .from('stages')
        .insert(stagesToInsert);

      if (stagesError) {
        console.warn('Advertencia creando etapas de onboarding:', stagesError.message);
      }

      return pipelineId;
    } catch (err) {
      console.error('Error en onboardingService.getOrCreateOnboardingPipeline:', err);
      return null;
    }
  }

  /**
   * Crea una oportunidad hija de onboarding vinculada a una oportunidad padre ganada.
   * @param parentOpportunityId - ID de la oportunidad padre (venta ganada)
   * @param customerId - ID del cliente
   * @returns Oportunidad de onboarding creada o null si falla
   */
  async createOnboardingOpportunity(
    parentOpportunityId: string,
    customerId: string
  ): Promise<{ id: string; name: string } | null> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return null;

      const pipelineId = await this.getOrCreateOnboardingPipeline();
      if (!pipelineId) return null;

      // Obtener la primera etapa del pipeline de onboarding
      const { data: firstStage } = await supabase
        .from('stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true })
        .limit(1)
        .single();

      if (!firstStage) {
        console.error('No se encontraron etapas en el pipeline de onboarding');
        return null;
      }

      const stageId = (firstStage as { id: string }).id;

      // Verificar si ya existe una oportunidad de onboarding para este padre
      const { data: existing } = await supabase
        .from('opportunities')
        .select('id, name')
        .eq('parent_opportunity_id', parentOpportunityId)
        .eq('pipeline_id', pipelineId)
        .maybeSingle();

      if (existing) {
        return existing as { id: string; name: string };
      }

      // Obtener datos del cliente para el nombre
      const { data: customer } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', customerId)
        .maybeSingle();

      const customerName = (customer as { full_name: string } | null)?.full_name || 'Cliente';
      const oppName = `Onboarding - ${customerName}`;

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
          parent_opportunity_id: parentOpportunityId,
          created_by: userData.user?.id || null,
          metadata: { type: 'onboarding', parent_opportunity_id: parentOpportunityId },
        })
        .select('id, name')
        .single();

      if (error) throw error;

      return data as { id: string; name: string };
    } catch (err) {
      console.error('Error en onboardingService.createOnboardingOpportunity:', err);
      return null;
    }
  }

  /**
   * Obtiene las plantillas de onboarding (templates con kind='onboarding').
   * @returns Lista de plantillas de onboarding
   */
  async getOnboardingTemplates(): Promise<OnboardingTemplate[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('organization_id', orgId)
        .eq('kind', 'onboarding')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Advertencia obteniendo templates de onboarding:', error.message);
        return [];
      }

      if (!data || data.length === 0) return [];

      // Parsear steps desde body_html (JSON embebido) o variables
      return (data as Array<Record<string, unknown>>).map((row) => {
        let steps: OnboardingStep[] = [];
        try {
          const bodyData = JSON.parse(row.body_html as string);
          steps = Array.isArray(bodyData?.steps) ? bodyData.steps : [];
        } catch {
          // body_html no es JSON, intentar desde description
          try {
            const descData = JSON.parse((row.description as string) || '{}');
            steps = Array.isArray(descData?.steps) ? descData.steps : [];
          } catch {
            steps = [];
          }
        }

        return {
          id: row.id as string,
          organization_id: row.organization_id as number,
          name: row.name as string,
          kind: 'onboarding',
          channel: row.channel as string,
          subject: (row.subject as string) || undefined,
          body_html: row.body_html as string,
          steps,
          is_active: row.is_active as boolean,
        };
      });
    } catch (err) {
      console.error('Error en onboardingService.getOnboardingTemplates:', err);
      return [];
    }
  }

  /**
   * Guarda o actualiza una plantilla de onboarding.
   * @param template - Plantilla a guardar
   * @returns Plantilla guardada o null si falla
   */
  async saveOnboardingTemplate(template: OnboardingTemplate): Promise<OnboardingTemplate | null> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return null;

      // Serializar steps dentro de body_html como JSON
      const bodyHtml = JSON.stringify({ steps: template.steps });
      const { data: userData } = await supabase.auth.getUser();

      const rowData = {
        organization_id: orgId,
        name: template.name,
        kind: 'onboarding',
        channel: template.channel || 'onboarding',
        subject: template.subject || null,
        body_html: bodyHtml,
        description: `Plantilla de onboarding con ${template.steps.length} pasos`,
        is_active: template.is_active ?? true,
        created_by: userData.user?.id || null,
      };

      if (template.id) {
        // Actualizar existente
        const { data, error } = await supabase
          .from('templates')
          .update({
            name: rowData.name,
            subject: rowData.subject,
            body_html: rowData.body_html,
            description: rowData.description,
            is_active: rowData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', template.id)
          .select('*')
          .single();

        if (error) throw error;

        return {
          id: (data as { id: string }).id,
          organization_id: orgId,
          name: (data as { name: string }).name,
          kind: 'onboarding',
          channel: (data as { channel: string }).channel,
          subject: (data as { subject?: string }).subject || undefined,
          body_html: (data as { body_html: string }).body_html,
          steps: template.steps,
          is_active: (data as { is_active: boolean }).is_active,
        };
      }

      // Crear nueva
      const { data, error } = await supabase
        .from('templates')
        .insert(rowData)
        .select('*')
        .single();

      if (error) throw error;

      return {
        id: (data as { id: string }).id,
        organization_id: orgId,
        name: (data as { name: string }).name,
        kind: 'onboarding',
        channel: (data as { channel: string }).channel,
        subject: (data as { subject?: string }).subject || undefined,
        body_html: (data as { body_html: string }).body_html,
        steps: template.steps,
        is_active: (data as { is_active: boolean }).is_active,
      };
    } catch (err) {
      console.error('Error en onboardingService.saveOnboardingTemplate:', err);
      return null;
    }
  }

  /**
   * Obtiene el checklist de tareas de onboarding para una oportunidad.
   * @param opportunityId - ID de la oportunidad de onboarding
   * @returns Lista de tareas del checklist
   */
  async getOnboardingChecklist(opportunityId: string): Promise<OnboardingTask[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          description,
          due_date,
          assigned_to,
          status,
          completed_at,
          related_to_id,
          related_to_type
        `)
        .eq('related_to_id', opportunityId)
        .eq('related_to_type', 'opportunity')
        .order('due_date', { ascending: true });

      if (error) {
        console.warn('Advertencia obteniendo checklist de onboarding:', error.message);
        return [];
      }

      if (!data || data.length === 0) return [];

      // Obtener nombres de asignados
      const assignedIds = Array.from(
        new Set(
          (data as Array<Record<string, unknown>>)
            .map((t) => t.assigned_to as string | null)
            .filter((id): id is string => id !== null)
        )
      );

      const usersMap = new Map<string, string>();
      if (assignedIds.length > 0) {
        const { data: users } = await supabase
          .from('user_profiles')
          .select('id, name')
          .in('id', assignedIds);

        if (users) {
          (users as Array<{ id: string; name: string }>).forEach((u) => {
            usersMap.set(u.id, u.name);
          });
        }
      }

      return (data as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        title: row.title as string,
        description: (row.description as string) || null,
        due_date: (row.due_date as string) || null,
        assigned_to: (row.assigned_to as string) || null,
        status: (row.status as string) || 'pending',
        completed_at: (row.completed_at as string) || null,
        related_to_id: (row.related_to_id as string) || null,
        related_to_type: (row.related_to_type as string) || null,
        assigned_to_name: row.assigned_to ? usersMap.get(row.assigned_to as string) || null : null,
      }));
    } catch (err) {
      console.error('Error en onboardingService.getOnboardingChecklist:', err);
      return [];
    }
  }

  /**
   * Crea tareas de onboarding desde una plantilla para una oportunidad.
   * @param opportunityId - ID de la oportunidad de onboarding
   * @param templateId - ID de la plantilla a aplicar
   * @returns Número de tareas creadas
   */
  async applyTemplateToOpportunity(
    opportunityId: string,
    templateId: string
  ): Promise<number> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return 0;

      const { data: template } = await supabase
        .from('templates')
        .select('body_html')
        .eq('id', templateId)
        .maybeSingle();

      if (!template) return 0;

      let steps: OnboardingStep[] = [];
      try {
        const bodyData = JSON.parse((template as { body_html: string }).body_html);
        steps = Array.isArray(bodyData?.steps) ? bodyData.steps : [];
      } catch {
        steps = [];
      }

      if (steps.length === 0) return 0;

      const { data: userData } = await supabase.auth.getUser();
      const now = new Date();

      const tasksToInsert = steps.map((step) => {
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + step.day);

        return {
          organization_id: orgId,
          title: step.title,
          description: step.description || null,
          due_date: dueDate.toISOString(),
          status: 'pending',
          related_to_id: opportunityId,
          related_to_type: 'opportunity',
          created_by: userData.user?.id || null,
          type: 'onboarding',
        };
      });

      const { data, error } = await supabase
        .from('tasks')
        .insert(tasksToInsert)
        .select('id');

      if (error) throw error;

      return data?.length || 0;
    } catch (err) {
      console.error('Error en onboardingService.applyTemplateToOpportunity:', err);
      return 0;
    }
  }
}

export const onboardingService = new OnboardingService();
export default onboardingService;
