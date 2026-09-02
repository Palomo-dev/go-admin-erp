import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';

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
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', assignedIds);

        if (users) {
          (users as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>).forEach((u) => {
            const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
            usersMap.set(u.id, fullName || u.email || 'Usuario sin nombre');
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

// ─── Funciones server-side (F11) ─────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export interface OnboardingTemplateRow {
  id: string;
  organization_id: number;
  name: string;
  steps: unknown;
  default_duration_days: number;
  is_active: boolean;
  created_at: string;
}

export interface OnboardingInstanceRow {
  id: string;
  organization_id: number;
  template_id: string | null;
  opportunity_id: string;
  customer_id: string;
  parent_opportunity_id: string | null;
  status: 'active' | 'completed' | 'at_risk' | 'churned';
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface OnboardingStepRow {
  id: string;
  organization_id: number;
  instance_id: string;
  step_number: number;
  name: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  is_completed: boolean;
  notes: string | null;
  created_at: string;
}

export interface OnboardingInstanceWithSteps extends OnboardingInstanceRow {
  steps: OnboardingStepRow[];
  template?: OnboardingTemplateRow | null;
}

export interface OnboardingInstanceFilters {
  status?: string;
  opportunity_id?: string;
  customer_id?: string;
  template_id?: string;
  limit?: number;
  offset?: number;
}

export interface OnboardingTemplateInput {
  name: string;
  steps: unknown;
  default_duration_days?: number;
  is_active?: boolean;
}

/**
 * Crea una instancia de onboarding desde una plantilla.
 * Crea onboarding_instance + onboarding_steps desde template.steps.
 */
export async function createOnboardingInstance(
  orgId: number,
  opportunityId: string,
  templateId: string,
  supabase: SupabaseClient
): Promise<OnboardingInstanceWithSteps | null> {
  // 1. Obtener la plantilla
  const { data: template, error: tplError } = await supabase
    .from('onboarding_templates')
    .select('*')
    .eq('id', templateId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (tplError || !template) {
    console.warn('[onboardingService.createOnboardingInstance] template not found:', templateId);
    return null;
  }

  const tpl = template as OnboardingTemplateRow;

  // 2. Obtener datos de la oportunidad (customer_id, parent_opportunity_id)
  const { data: opp, error: oppError } = await supabase
    .from('opportunities')
    .select('id, customer_id, parent_opportunity_id')
    .eq('id', opportunityId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (oppError || !opp) {
    console.warn('[onboardingService.createOnboardingInstance] opportunity not found:', opportunityId);
    return null;
  }

  const oppData = opp as { id: string; customer_id: string; parent_opportunity_id: string | null };

  // 3. Crear la instancia
  const { data: instance, error: instError } = await supabase
    .from('onboarding_instances')
    .insert({
      organization_id: orgId,
      template_id: templateId,
      opportunity_id: opportunityId,
      customer_id: oppData.customer_id,
      parent_opportunity_id: oppData.parent_opportunity_id,
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (instError || !instance) {
    console.error('[onboardingService.createOnboardingInstance] error creating instance:', instError?.message);
    return null;
  }

  const instanceRow = instance as OnboardingInstanceRow;

  // 4. Crear steps desde template.steps (jsonb)
  const rawSteps = Array.isArray(tpl.steps) ? tpl.steps : [];
  const now = new Date();
  const durationDays = tpl.default_duration_days || 30;

  const stepsToInsert = rawSteps.map((step: Record<string, unknown>, index: number) => {
    const dayOffset = typeof step.day === 'number' ? step.day : Math.round((durationDays / Math.max(rawSteps.length, 1)) * (index + 1));
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + dayOffset);

    return {
      organization_id: orgId,
      instance_id: instanceRow.id,
      step_number: index + 1,
      name: (step.title as string) || (step.name as string) || `Paso ${index + 1}`,
      description: (step.description as string) || null,
      due_date: dueDate.toISOString(),
      is_completed: false,
    };
  });

  let createdSteps: OnboardingStepRow[] = [];
  if (stepsToInsert.length > 0) {
    const { data: steps, error: stepsError } = await supabase
      .from('onboarding_steps')
      .insert(stepsToInsert)
      .select('*')
      .order('step_number', { ascending: true });

    if (stepsError) {
      console.warn('[onboardingService.createOnboardingInstance] error creating steps:', stepsError.message);
    } else {
      createdSteps = (steps || []) as OnboardingStepRow[];
    }
  }

  return {
    ...instanceRow,
    steps: createdSteps,
    template: tpl,
  };
}

/**
 * Lista instancias de onboarding con filtros opcionales.
 */
export async function getOnboardingInstances(
  orgId: number,
  supabase: SupabaseClient,
  filters?: OnboardingInstanceFilters
): Promise<{ data: OnboardingInstanceRow[]; count: number }> {
  let query = supabase
    .from('onboarding_instances')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.opportunity_id) {
    query = query.eq('opportunity_id', filters.opportunity_id);
  }
  if (filters?.customer_id) {
    query = query.eq('customer_id', filters.customer_id);
  }
  if (filters?.template_id) {
    query = query.eq('template_id', filters.template_id);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[onboardingService.getOnboardingInstances] error:', error.message);
    return { data: [], count: 0 };
  }

  return {
    data: (data || []) as OnboardingInstanceRow[],
    count: count || 0,
  };
}

/**
 * Obtiene una instancia de onboarding con sus steps.
 */
export async function getOnboardingInstance(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<OnboardingInstanceWithSteps | null> {
  const { data: instance, error } = await supabase
    .from('onboarding_instances')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !instance) {
    console.warn('[onboardingService.getOnboardingInstance] not found:', id);
    return null;
  }

  const instanceRow = instance as OnboardingInstanceRow;

  const { data: steps, error: stepsError } = await supabase
    .from('onboarding_steps')
    .select('*')
    .eq('instance_id', id)
    .eq('organization_id', orgId)
    .order('step_number', { ascending: true });

  if (stepsError) {
    console.warn('[onboardingService.getOnboardingInstance] error loading steps:', stepsError.message);
  }

  // Obtener template si existe
  let template: OnboardingTemplateRow | null = null;
  if (instanceRow.template_id) {
    const { data: tpl } = await supabase
      .from('onboarding_templates')
      .select('*')
      .eq('id', instanceRow.template_id)
      .maybeSingle();
    if (tpl) template = tpl as OnboardingTemplateRow;
  }

  return {
    ...instanceRow,
    steps: (steps || []) as OnboardingStepRow[],
    template,
  };
}

/**
 * Marca un step como completado (o actualiza sus datos).
 */
export async function updateOnboardingStep(
  stepId: string,
  orgId: number,
  data: { is_completed?: boolean; notes?: string; completed_by?: string },
  supabase: SupabaseClient
): Promise<OnboardingStepRow | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.is_completed !== undefined) {
    updateData.is_completed = data.is_completed;
    if (data.is_completed) {
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by = data.completed_by || null;
    } else {
      updateData.completed_at = null;
      updateData.completed_by = null;
    }
  }

  if (data.notes !== undefined) {
    updateData.notes = data.notes;
  }

  const { data: result, error } = await supabase
    .from('onboarding_steps')
    .update(updateData)
    .eq('id', stepId)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error || !result) {
    console.error('[onboardingService.updateOnboardingStep] error:', error?.message);
    return null;
  }

  return result as OnboardingStepRow;
}

/**
 * Actualiza el estado de una instancia de onboarding.
 */
export async function updateOnboardingInstanceStatus(
  id: string,
  orgId: number,
  status: 'active' | 'completed' | 'at_risk' | 'churned',
  supabase: SupabaseClient
): Promise<OnboardingInstanceRow | null> {
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { data: result, error } = await supabase
    .from('onboarding_instances')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error || !result) {
    console.error('[onboardingService.updateOnboardingInstanceStatus] error:', error?.message);
    return null;
  }

  return result as OnboardingInstanceRow;
}

/**
 * Obtiene las plantillas de onboarding de una organización (tabla onboarding_templates).
 */
export async function getOnboardingTemplatesServer(
  orgId: number,
  supabase: SupabaseClient
): Promise<OnboardingTemplateRow[]> {
  const { data, error } = await supabase
    .from('onboarding_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  if (error) {
    console.warn('[onboardingService.getOnboardingTemplatesServer] error:', error.message);
    return [];
  }

  return (data || []) as OnboardingTemplateRow[];
}

/**
 * Crea una plantilla de onboarding (tabla onboarding_templates).
 */
export async function createOnboardingTemplateServer(
  orgId: number,
  data: OnboardingTemplateInput,
  supabase: SupabaseClient
): Promise<OnboardingTemplateRow | null> {
  const { data: result, error } = await supabase
    .from('onboarding_templates')
    .insert({
      organization_id: orgId,
      name: data.name,
      steps: data.steps,
      default_duration_days: data.default_duration_days ?? 30,
      is_active: data.is_active ?? true,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[onboardingService.createOnboardingTemplateServer] error:', error.message);
    throw error;
  }

  return result as OnboardingTemplateRow;
}
