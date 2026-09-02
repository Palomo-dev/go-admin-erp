/**
 * Voice Agent Tools — FASE 6: Tools para function calling del agente IA
 * GO Admin ERP
 *
 * Define las herramientas que el agente de voz puede invocar
 * durante una conversación para ejecutar acciones en el CRM.
 *
 * Cada tool valida la organización y respeta las reglas de negocio
 * (ej: stageGateService para mover etapa).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { stageGateService } from '@/lib/services/crm/stageGateService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  related_id?: string;
  related_type?: string;
  assigned_to?: string;
  due_date?: string;
}

export interface SendFollowupInput {
  channel: 'sms' | 'whatsapp' | 'email';
  message: string;
}

// ─── Tool: moveOpportunityStage ──────────────────────────────────────────────

/**
 * Mueve una oportunidad a una nueva etapa.
 * Respeta stageGateService (soft-gate: evalúa pero no bloquea).
 */
export async function moveOpportunityStage(
  orgId: number,
  opportunityId: string,
  stageId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  try {
    // Verificar que la oportunidad pertenece a la org
    const { data: opportunity, error: oppError } = await supabase
      .from('opportunities')
      .select('id, stage_id, pipeline_id')
      .eq('id', opportunityId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (oppError || !opportunity) {
      return { success: false, error: 'Oportunidad no encontrada' };
    }

    // Evaluar stage gate (soft-gate)
    const gateResult = await stageGateService.evaluateStageGate(opportunityId, stageId);

    // Mover la etapa
    const { data: updated, error: updateError } = await supabase
      .from('opportunities')
      .update({
        stage_id: stageId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('organization_id', orgId)
      .select('id, stage_id')
      .maybeSingle();

    if (updateError || !updated) {
      return { success: false, error: 'Error al mover la etapa' };
    }

    // Registrar actividad
    await supabase.from('activities').insert({
      organization_id: orgId,
      related_id: opportunityId,
      related_type: 'opportunity',
      activity_type: 'stage_change',
      title: `Etapa movida por agente IA`,
      description: `Gate: ${gateResult.ok ? 'cumplido' : 'pendiente'}. Faltantes: ${gateResult.missing.join(', ') || 'ninguno'}`,
      occurred_at: new Date().toISOString(),
    });

    return {
      success: true,
      data: {
        opportunity_id: opportunityId,
        new_stage_id: stageId,
        gate_result: gateResult,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Tool: createTask ────────────────────────────────────────────────────────

/**
 * Crea una tarea en el CRM.
 */
export async function createTask(
  orgId: number,
  data: CreateTaskInput,
  supabase: SupabaseClient
): Promise<ToolResult> {
  try {
    if (!data.title) {
      return { success: false, error: 'El título es obligatorio' };
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        organization_id: orgId,
        title: data.title,
        description: data.description ?? null,
        related_id: data.related_id ?? null,
        related_type: data.related_type ?? null,
        assigned_to: data.assigned_to ?? null,
        status: 'pending',
        due_date: data.due_date ?? null,
      })
      .select('id, title, status')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: task };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Tool: sendFollowupMessage ───────────────────────────────────────────────

/**
 * Envía un mensaje de seguimiento al cliente por SMS, WhatsApp o email.
 */
export async function sendFollowupMessage(
  orgId: number,
  customerId: string,
  channel: 'sms' | 'whatsapp' | 'email',
  message: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  try {
    // Obtener info del cliente
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('id, phone, email, first_name, last_name')
      .eq('id', customerId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (custError || !customer) {
      return { success: false, error: 'Cliente no encontrado' };
    }

    const c = customer as { id: string; phone: string; email: string; first_name: string; last_name: string };

    if (channel === 'sms' || channel === 'whatsapp') {
      if (!c.phone) {
        return { success: false, error: 'El cliente no tiene teléfono' };
      }

      // Usar twilioService para enviar
      const { twilioService } = await import('@/lib/services/integrations/twilio');
      const result = await twilioService.send({
        orgId,
        channel,
        to: c.phone,
        body: message,
        module: 'crm_voice_agent',
      });

      if (!result.success) {
        return { success: false, error: result.error || 'Error enviando mensaje' };
      }

      return { success: true, data: { messageSid: result.messageSid } };
    }

    if (channel === 'email') {
      if (!c.email) {
        return { success: false, error: 'El cliente no tiene email' };
      }

      // Registrar intención de envío — el envío real lo maneja el módulo de email
      await supabase.from('activities').insert({
        organization_id: orgId,
        related_id: customerId,
        related_type: 'customer',
        activity_type: 'email_sent',
        title: `Email enviado por agente IA`,
        description: message.substring(0, 200),
        occurred_at: new Date().toISOString(),
      });

      return { success: true, data: { channel: 'email', to: c.email } };
    }

    return { success: false, error: `Canal no soportado: ${channel}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Tool: transferToHuman ───────────────────────────────────────────────────

/**
 * Transfiere la llamada actual a un agente humano.
 * Crea un registro de la transferencia y devuelve el TwiML necesario.
 */
export async function transferToHuman(
  orgId: number,
  callId: string,
  agentPhone: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  try {
    // Actualizar el voice_agent_call a transferred
    const { error: updateError } = await supabase
      .from('voice_agent_calls')
      .update({
        status: 'transferred',
        outcome: 'transferred_to_human',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', callId)
      .eq('organization_id', orgId);

    if (updateError) {
      console.warn('voiceAgentTools.transferToHuman - update error:', updateError.message);
    }

    // Registrar actividad
    await supabase.from('activities').insert({
      organization_id: orgId,
      related_id: callId,
      related_type: 'voice_agent_call',
      activity_type: 'transfer',
      title: 'Llamada transferida a agente humano',
      description: `Transferida a: ${agentPhone}`,
      occurred_at: new Date().toISOString(),
    });

    return {
      success: true,
      data: {
        transfer_to: agentPhone,
        twiml_action: 'dial',
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Tool: getCustomerContext ────────────────────────────────────────────────

/**
 * Obtiene el contexto completo del cliente para el agente IA.
 * Incluye datos del cliente, oportunidades activas, actividades recientes y tareas.
 */
export async function getCustomerContext(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  try {
    // Datos del cliente
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (custError || !customer) {
      return { success: false, error: 'Cliente no encontrado' };
    }

    // Oportunidades activas
    const { data: opportunities } = await supabase
      .from('opportunities')
      .select(`
        id, name, amount, expected_close_date,
        stages:stage_id(id, name, position)
      `)
      .eq('customer_id', customerId)
      .eq('organization_id', orgId)
      .neq('status', 'closed_lost')
      .neq('status', 'closed_won')
      .order('created_at', { ascending: false })
      .limit(5);

    // Actividades recientes
    const { data: activities } = await supabase
      .from('activities')
      .select('id, activity_type, title, description, occurred_at')
      .eq('related_id', customerId)
      .eq('related_type', 'customer')
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .limit(10);

    // Tareas pendientes
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, status, due_date')
      .eq('related_id', customerId)
      .eq('related_type', 'customer')
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(5);

    return {
      success: true,
      data: {
        customer,
        opportunities: opportunities || [],
        recent_activities: activities || [],
        pending_tasks: tasks || [],
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Definiciones de herramientas para el LLM ────────────────────────────────

/**
 * Definiciones de tools en formato OpenAI function calling.
 * El agente solo puede invocar las tools que estén en allowed_tools.
 */
export const VOICE_AGENT_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    name: 'move_opportunity_stage',
    description: 'Mueve una oportunidad a una nueva etapa del pipeline. Respeta los exit criteria de la etapa.',
    parameters: {
      type: 'object',
      properties: {
        opportunity_id: { type: 'string', description: 'ID de la oportunidad' },
        stage_id: { type: 'string', description: 'ID de la etapa destino' },
      },
      required: ['opportunity_id', 'stage_id'],
    },
  },
  {
    type: 'function' as const,
    name: 'create_task',
    description: 'Crea una tarea en el CRM vinculada a un cliente u oportunidad.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título de la tarea' },
        description: { type: 'string', description: 'Descripción de la tarea' },
        related_id: { type: 'string', description: 'ID del cliente u oportunidad relacionada' },
        related_type: { type: 'string', description: 'customer u opportunity' },
        due_date: { type: 'string', description: 'Fecha límite (ISO 8601)' },
      },
      required: ['title'],
    },
  },
  {
    type: 'function' as const,
    name: 'send_followup_message',
    description: 'Envía un mensaje de seguimiento al cliente por SMS, WhatsApp o email.',
    parameters: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'ID del cliente' },
        channel: { type: 'string', enum: ['sms', 'whatsapp', 'email'], description: 'Canal de envío' },
        message: { type: 'string', description: 'Contenido del mensaje' },
      },
      required: ['customer_id', 'channel', 'message'],
    },
  },
  {
    type: 'function' as const,
    name: 'transfer_to_human',
    description: 'Transfiere la llamada actual a un agente humano.',
    parameters: {
      type: 'object',
      properties: {
        call_id: { type: 'string', description: 'ID de la llamada del agente IA' },
        agent_phone: { type: 'string', description: 'Teléfono del agente humano' },
      },
      required: ['call_id', 'agent_phone'],
    },
  },
  {
    type: 'function' as const,
    name: 'get_customer_context',
    description: 'Obtiene el contexto completo del cliente: datos, oportunidades, actividades y tareas.',
    parameters: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'ID del cliente' },
      },
      required: ['customer_id'],
    },
  },
];

/**
 * Ejecuta una tool por nombre.
 * Valida que la tool esté en allowed_tools antes de ejecutar.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  orgId: number,
  supabase: SupabaseClient,
  allowedTools: string[]
): Promise<ToolResult> {
  // Verificar que la tool esté permitida
  if (!allowedTools.includes(toolName)) {
    return { success: false, error: `Tool '${toolName}' no permitida para este agente` };
  }

  switch (toolName) {
    case 'move_opportunity_stage':
      return moveOpportunityStage(
        orgId,
        args.opportunity_id as string,
        args.stage_id as string,
        supabase
      );

    case 'create_task':
      return createTask(
        orgId,
        {
          title: args.title as string,
          description: args.description as string,
          related_id: args.related_id as string,
          related_type: args.related_type as string,
          due_date: args.due_date as string,
        },
        supabase
      );

    case 'send_followup_message':
      return sendFollowupMessage(
        orgId,
        args.customer_id as string,
        args.channel as 'sms' | 'whatsapp' | 'email',
        args.message as string,
        supabase
      );

    case 'transfer_to_human':
      return transferToHuman(
        orgId,
        args.call_id as string,
        args.agent_phone as string,
        supabase
      );

    case 'get_customer_context':
      return getCustomerContext(
        orgId,
        args.customer_id as string,
        supabase
      );

    default:
      return { success: false, error: `Tool desconocida: ${toolName}` };
  }
}
