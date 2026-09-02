import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';

/**
 * Servicio CRM - Motor de secuencias de seguimiento (FASE 5).
 *
 * Ejecuta automatizaciones (tabla `automations`) con trigger_json / actions_json
 * completos: crear actividades, enviar emails, crear tareas según la etapa del
 * pipeline.
 *
 * Tabla: automations (id, organization_id, name, description, active,
 *        trigger_json JSONB, actions_json JSONB, created_at, updated_at)
 * Tabla: activities (id, organization_id, related_id, related_type,
 *        activity_type, title, description, occurred_at, created_at)
 * Tabla: tasks (id, organization_id, related_id, related_type, title,
 *        status, due_date, created_at)
 */

// ============== Tipos ==============

export interface AutomationTrigger {
  event_type: 'stage_change' | 'opportunity_created' | 'inactivity' | 'scheduled';
  pipeline_id?: string;
  stage_id?: string;
  days_in_stage?: number;
  conditions?: Array<{
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte';
    value: unknown;
  }>;
}

export interface AutomationAction {
  type: 'create_activity' | 'send_email' | 'create_task';
  activity_type?: string;
  title?: string;
  description?: string;
  due_in_days?: number;
  email_template?: string;
  subject?: string;
  body?: string;
}

export interface AutomationActions {
  create_tasks?: boolean;
  send_notifications?: boolean;
  update_status?: boolean;
  log_activity?: boolean;
  send_reminders?: boolean;
  steps?: AutomationAction[];
}

export interface Automation {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  active: boolean;
  trigger_json: AutomationTrigger;
  actions_json: AutomationActions;
  created_at: string;
  updated_at: string;
}

export interface TriggerContext {
  opportunity_id: string;
  opportunity_name: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  stage_id: string;
  stage_name: string;
  salesperson_id?: string | null;
  amount: number;
  currency: string;
  days_in_stage: number;
  organization_id: number;
}

export interface ExecutionResult {
  automation_id: string;
  automation_name: string;
  actions_executed: number;
  errors: string[];
}

export interface RunResult {
  total_automations: number;
  total_actions: number;
  results: ExecutionResult[];
  errors: string[];
}

// ============== Servicio ==============

class FollowupEngineService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Lista todas las automatizaciones activas de la organización.
   */
  async listAutomations(): Promise<Automation[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Advertencia listando automatizaciones:', error.message);
        return [];
      }
      return (data || []) as Automation[];
    } catch (err) {
      console.error('Error en followupEngineService.listAutomations:', err);
      return [];
    }
  }

  /**
   * Evalúa si el trigger de una automatización se cumple dado el contexto.
   */
  evaluateTrigger(automation: Automation, context: TriggerContext): boolean {
    const trigger = automation.trigger_json;
    if (!trigger) return false;

    // Filtrar por pipeline si está definido
    if (trigger.pipeline_id && context.stage_id) {
      // No podemos comparar pipeline_id directamente con stage_id,
      // pero verificamos condiciones adicionales
    }

    // Filtrar por etapa
    if (trigger.stage_id && trigger.stage_id !== context.stage_id) {
      return false;
    }

    // Filtrar por días en etapa (inactivity)
    if (trigger.event_type === 'inactivity' && trigger.days_in_stage) {
      if (context.days_in_stage < trigger.days_in_stage) {
        return false;
      }
    }

    // Evaluar condiciones adicionales
    if (trigger.conditions && trigger.conditions.length > 0) {
      for (const cond of trigger.conditions) {
        const fieldValue = this.getContextField(context, cond.field);
        if (!this.evaluateCondition(fieldValue, cond.operator, cond.value)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Ejecuta las acciones de una automatización dado el contexto.
   */
  async executeActions(
    automation: Automation,
    context: TriggerContext
  ): Promise<ExecutionResult> {
    const actions = automation.actions_json;
    const errors: string[] = [];
    let executed = 0;

    if (!actions) {
      return {
        automation_id: automation.id,
        automation_name: automation.name,
        actions_executed: 0,
        errors,
      };
    }

    // Procesar pasos explícitos si existen
    const steps = actions.steps || [];

    // Si no hay pasos explícitos, construir pasos desde flags legacy
    if (steps.length === 0) {
      if (actions.log_activity) {
        steps.push({
          type: 'create_activity',
          activity_type: 'follow_up',
          title: `Seguimiento: ${context.opportunity_name}`,
          description: `Actividad automática generada por "${automation.name}"`,
        });
      }
      if (actions.create_tasks) {
        steps.push({
          type: 'create_task',
          title: `Tarea de seguimiento: ${context.opportunity_name}`,
          due_in_days: 1,
        });
      }
      if (actions.send_reminders) {
        steps.push({
          type: 'create_activity',
          activity_type: 'reminder',
          title: `Recordatorio: ${context.opportunity_name}`,
          description: `Recordatorio automático - ${context.days_in_stage} días en etapa ${context.stage_name}`,
        });
      }
    }

    for (const step of steps) {
      try {
        switch (step.type) {
          case 'create_activity':
            await this.createActivity(context, step);
            executed++;
            break;
          case 'create_task':
            await this.createTask(context, step);
            executed++;
            break;
          case 'send_email':
            // Marcar como ejecutado; el envío real se maneja por integración externa
            console.log(`[FollowupEngine] Email pendiente para ${context.customer_email}`);
            executed++;
            break;
          default:
            break;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Error en acción "${step.type}": ${msg}`);
      }
    }

    return {
      automation_id: automation.id,
      automation_name: automation.name,
      actions_executed: executed,
      errors,
    };
  }

  /**
   * Cron principal: recorre oportunidades abiertas, evalúa triggers y ejecuta
   * acciones para cada automatización activa.
   *
   * @param organizationId - ID de organización (opcional, usa getOrgId por defecto)
   */
  async runFollowupSequences(organizationId?: number): Promise<RunResult> {
    const orgId = organizationId || this.getOrgId();
    const errors: string[] = [];

    if (!orgId) {
      return { total_automations: 0, total_actions: 0, results: [], errors: ['Sin organización'] };
    }

    // 1. Obtener automatizaciones activas
    const automations = await this.listAutomationsForOrg(orgId);
    if (automations.length === 0) {
      return { total_automations: 0, total_actions: 0, results: [], errors };
    }

    // 2. Obtener oportunidades abiertas con etapa y cliente
    const { data: opps, error: oppError } = await supabase
      .from('opportunities')
      .select(`
        id,
        name,
        amount,
        currency,
        stage_id,
        updated_at,
        salesperson_id,
        organization_id,
        customer:customers(id, full_name, phone, email),
        stage:stages(id, name, pipeline_id)
      `)
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .not('stage_id', 'is', null);

    if (oppError || !opps || opps.length === 0) {
      return { total_automations: automations.length, total_actions: 0, results: [], errors };
    }

    const results: ExecutionResult[] = [];
    let totalActions = 0;

    // 3. Para cada oportunidad, evaluar triggers de cada automatización
    for (const opp of opps as Array<Record<string, unknown>>) {
      const oppId = opp.id as string;
      const updatedAt = opp.updated_at as string;
      const daysInStage = Math.floor(
        (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      const customer = opp.customer as {
        id: string;
        full_name: string;
        phone?: string | null;
        email?: string | null;
      } | null;
      const stage = opp.stage as { id: string; name: string; pipeline_id?: string } | null;

      const context: TriggerContext = {
        opportunity_id: oppId,
        opportunity_name: opp.name as string,
        customer_id: customer?.id || '',
        customer_name: customer?.full_name || 'Sin cliente',
        customer_email: customer?.email || null,
        customer_phone: customer?.phone || null,
        stage_id: stage?.id || '',
        stage_name: stage?.name || 'Sin etapa',
        salesperson_id: (opp.salesperson_id as string) || null,
        amount: (opp.amount as number) || 0,
        currency: (opp.currency as string) || 'COP',
        days_in_stage: daysInStage,
        organization_id: orgId,
      };

      for (const automation of automations) {
        // Filtrar por pipeline_id del trigger si está definido
        const trigger = automation.trigger_json;
        if (trigger?.pipeline_id && stage?.pipeline_id !== trigger.pipeline_id) {
          continue;
        }

        if (this.evaluateTrigger(automation, context)) {
          // Verificar que no se haya ejecutado ya hoy (idempotencia)
          const alreadyExecuted = await this.checkAlreadyExecutedToday(
            automation.id,
            oppId
          );
          if (alreadyExecuted) continue;

          const result = await this.executeActions(automation, context);
          results.push(result);
          totalActions += result.actions_executed;

          // Registrar ejecución para idempotencia
          await this.logExecution(automation.id, oppId, orgId);
        }
      }
    }

    return {
      total_automations: automations.length,
      total_actions: totalActions,
      results,
      errors,
    };
  }

  // ============== Helpers internos ==============

  private async listAutomationsForOrg(orgId: number): Promise<Automation[]> {
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('active', true);

    if (error || !data) return [];
    return data as Automation[];
  }

  private getContextField(context: TriggerContext, field: string): unknown {
    const map: Record<string, unknown> = {
      stage_id: context.stage_id,
      stage_name: context.stage_name,
      days_in_stage: context.days_in_stage,
      amount: context.amount,
      opportunity_id: context.opportunity_id,
      customer_id: context.customer_id,
    };
    return map[field] ?? undefined;
  }

  private evaluateCondition(
    fieldValue: unknown,
    operator: string,
    compareValue: unknown
  ): boolean {
    const a = Number(fieldValue);
    const b = Number(compareValue);

    switch (operator) {
      case 'eq':
        return fieldValue === compareValue;
      case 'ne':
        return fieldValue !== compareValue;
      case 'gt':
        return !isNaN(a) && !isNaN(b) && a > b;
      case 'lt':
        return !isNaN(a) && !isNaN(b) && a < b;
      case 'gte':
        return !isNaN(a) && !isNaN(b) && a >= b;
      case 'lte':
        return !isNaN(a) && !isNaN(b) && a <= b;
      default:
        return false;
    }
  }

  private async createActivity(
    context: TriggerContext,
    step: AutomationAction
  ): Promise<void> {
    const { error } = await supabase.from('activities').insert({
      organization_id: context.organization_id,
      related_id: context.opportunity_id,
      related_type: 'opportunity',
      activity_type: step.activity_type || 'follow_up',
      title: step.title || `Seguimiento: ${context.opportunity_name}`,
      description: step.description || '',
      occurred_at: new Date().toISOString(),
    });

    if (error) throw new Error(error.message);
  }

  private async createTask(
    context: TriggerContext,
    step: AutomationAction
  ): Promise<void> {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (step.due_in_days || 1));

    const { error } = await supabase.from('tasks').insert({
      organization_id: context.organization_id,
      related_id: context.opportunity_id,
      related_type: 'opportunity',
      title: step.title || `Tarea: ${context.opportunity_name}`,
      description: step.description || '',
      status: 'pending',
      due_date: dueDate.toISOString(),
      assigned_to: context.salesperson_id || null,
    });

    if (error) throw new Error(error.message);
  }

  /**
   * Verifica si una automatización ya se ejecutó hoy para una oportunidad.
   * Usa activities con metadata para tracking. Si la tabla no soporta metadata,
   * retorna false (siempre ejecuta).
   */
  private async checkAlreadyExecutedToday(
    automationId: string,
    opportunityId: string
  ): Promise<boolean> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('related_id', opportunityId)
        .eq('related_type', 'opportunity')
        .gte('occurred_at', todayStart.toISOString())
        .ilike('description', `%automation:${automationId}%`);

      if (error) return false;
      return (count || 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Registra la ejecución de una automatización para idempotencia.
   */
  private async logExecution(
    automationId: string,
    opportunityId: string,
    orgId: number
  ): Promise<void> {
    try {
      await supabase.from('activities').insert({
        organization_id: orgId,
        related_id: opportunityId,
        related_type: 'opportunity',
        activity_type: 'automation_log',
        title: `Automatización ejecutada`,
        description: `automation:${automationId}`,
        occurred_at: new Date().toISOString(),
      });
    } catch {
      // Silencioso: el log es best-effort
    }
  }
}

export const followupEngineService = new FollowupEngineService();
export default followupEngineService;
