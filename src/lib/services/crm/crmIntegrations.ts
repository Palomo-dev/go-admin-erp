import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Servicio de integraciones CRM - Wrappers que conectan módulos existentes
 * con el CRM sin modificar los servicios originales.
 *
 * Integraciones:
 * 1. POS → actividad CRM (al cerrar venta)
 * 2. Actividades → calendar_events (actividad con fecha → evento)
 * 3. Timeline global consume activities comerciales
 * 4. Notificaciones: nueva opp / estancada / tarea vencida / won / lost
 *
 * NO modifica servicios existentes. Crea hooks/wrappers que llaman a servicios CRM
 * después de las operaciones existentes.
 */

// ============== 1. POS → Actividad CRM ==============

export interface PosSaleIntegrationInput {
  orderId: string;
  customerId?: string | null;
  amount: number;
  currency?: string;
  branchId?: number | null;
  userId?: string | null;
}

/**
 * Crea una actividad CRM de tipo 'purchase' al cerrar una venta en POS.
 * Actualiza last_contact_at del customer si existe oportunidad abierta.
 *
 * Usar como wrapper DESPUÉS de que posService complete la venta:
 *   const result = await posService.createSale(...);
 *   await crmIntegrations.syncPosSaleToCrm({ orderId: result.id, ... });
 */
async function syncPosSaleToCrm(input: PosSaleIntegrationInput): Promise<void> {
  try {
    const orgId = getOrganizationId();
    if (!orgId || !input.customerId) return;

    // 1. Crear actividad de compra
    await supabase.from('activities').insert({
      organization_id: orgId,
      activity_type: 'purchase',
      user_id: input.userId || null,
      notes: `Venta POS #${input.orderId} - ${input.amount} ${input.currency || 'COP'}`,
      related_type: 'customer',
      related_id: input.customerId,
      occurred_at: new Date().toISOString(),
      metadata: {
        source: 'pos',
        order_id: input.orderId,
        amount: input.amount,
        currency: input.currency || 'COP',
        branch_id: input.branchId || null,
        auto_generated: true,
      },
    });

    // 2. Si existe oportunidad abierta para este customer, agregar actividad
    const { data: openOpp } = await supabase
      .from('opportunities')
      .select('id')
      .eq('organization_id', orgId)
      .eq('customer_id', input.customerId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openOpp) {
      await supabase.from('activities').insert({
        organization_id: orgId,
        activity_type: 'purchase',
        user_id: input.userId || null,
        notes: `Venta POS #${input.orderId} - ${input.amount} ${input.currency || 'COP'}`,
        related_type: 'opportunity',
        related_id: (openOpp as { id: string }).id,
        occurred_at: new Date().toISOString(),
        metadata: {
          source: 'pos',
          order_id: input.orderId,
          amount: input.amount,
          auto_generated: true,
        },
      });
    }
  } catch (err) {
    console.error('Error en syncPosSaleToCrm:', err);
    // No lanzar error para no interrumpir el flujo del POS
  }
}

// ============== 2. Actividades → Calendar ==============

export interface ActivityCalendarInput {
  activityId: string;
  activityType: string;
  notes: string;
  occurredAt: string;
  opportunityId?: string;
  customerId?: string;
  assignedTo?: string | null;
  branchId?: number | null;
}

/**
 * Sincroniza una actividad CRM con fecha al calendario unificado.
 * Crea un evento en calendar_events para que aparezca en calendar_unified.
 *
 * Usar como wrapper DESPUÉS de crear una actividad:
 *   await opportunitiesService.createActivity(...);
 *   await crmIntegrations.syncActivityToCalendar({ activityId, ... });
 */
async function syncActivityToCalendar(input: ActivityCalendarInput): Promise<void> {
  try {
    const orgId = getOrganizationId();
    if (!orgId) return;

    // Solo sincronizar actividades con fecha futura o de hoy
    const activityDate = new Date(input.occurredAt);
    const now = new Date();
    if (activityDate < now && activityDate.getDate() !== now.getDate()) {
      // Actividad pasada — no crear evento de calendario
      return;
    }

    const typeLabels: Record<string, string> = {
      call: 'Llamada',
      email: 'Correo',
      meeting: 'Reunión',
      visit: 'Visita',
      task: 'Tarea CRM',
      note: 'Nota CRM',
    };

    const typeColors: Record<string, string> = {
      call: '#3B82F6',
      email: '#10B981',
      meeting: '#8B5CF6',
      visit: '#F59E0B',
      task: '#EF4444',
      note: '#6B7280',
    };

    await supabase.from('calendar_events').insert({
      organization_id: orgId,
      title: `${typeLabels[input.activityType] || 'Actividad'} CRM`,
      description: input.notes || null,
      start_at: input.occurredAt,
      end_at: new Date(new Date(input.occurredAt).getTime() + 60 * 60 * 1000).toISOString(),
      all_day: false,
      location: null,
      assigned_to: input.assignedTo || null,
      customer_id: input.customerId || null,
      branch_id: input.branchId || null,
      event_type: 'crm_activity',
      color: typeColors[input.activityType] || '#3B82F6',
      status: 'confirmed',
      metadata: {
        source: 'crm_activity',
        activity_id: input.activityId,
        opportunity_id: input.opportunityId,
        auto_generated: true,
      },
    });
  } catch (err) {
    console.error('Error en syncActivityToCalendar:', err);
    // No lanzar error para no interrumpir el flujo
  }
}

// ============== 3. Timeline global ==============

/**
 * Registra un evento comercial en el timeline global.
 * El timeline consume la tabla de audit logs; esta función inserta
 * un evento de dominio para que aparezca en el timeline unificado.
 */
async function logCrmTimelineEvent(params: {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const orgId = getOrganizationId();
    if (!orgId) return;

    // Intentar insertar en la tabla de timeline events
    // Si no existe, el error se captura silenciosamente
    await supabase.from('domain_events').insert({
      organization_id: orgId,
      source_category: 'domain_event',
      source_table: 'crm',
      event_type: 'crm_event',
      action: params.action,
      actor_id: params.actorId || null,
      entity_type: params.entityType,
      entity_id: params.entityId,
      payload: params.payload || {},
      event_time: new Date().toISOString(),
    });
  } catch (err) {
    // La tabla puede no existir o tener estructura diferente
    console.warn('No se pudo registrar evento en timeline:', err);
  }
}

// ============== 4. Notificaciones CRM ==============

export type CrmNotificationType =
  | 'new_opportunity'
  | 'stale_opportunity'
  | 'overdue_task'
  | 'opportunity_won'
  | 'opportunity_lost';

/**
 * Crea una notificación CRM en la tabla notifications.
 * Usa el mismo formato que notificationService pero con tipos CRM.
 */
async function notifyCrmEvent(params: {
  type: CrmNotificationType;
  recipientUserId?: string;
  recipientEmail?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const orgId = getOrganizationId();
    if (!orgId) return;

    const typeSubjects: Record<CrmNotificationType, string> = {
      new_opportunity: 'Nueva oportunidad creada',
      stale_opportunity: 'Oportunidad estancada',
      overdue_task: 'Tarea vencida',
      opportunity_won: 'Oportunidad ganada',
      opportunity_lost: 'Oportunidad perdida',
    };

    await supabase.from('notifications').insert({
      organization_id: orgId,
      recipient_user_id: params.recipientUserId || null,
      recipient_email: params.recipientEmail || null,
      channel: params.recipientEmail ? 'email' : 'push',
      payload: {
        type: params.type,
        subject: typeSubjects[params.type],
        ...params.payload,
      },
      status: 'pending',
    });
  } catch (err) {
    console.error('Error en notifyCrmEvent:', err);
    // No lanzar error para no interrumpir el flujo
  }
}

// ============== Export consolidado ==============

export const crmIntegrations = {
  syncPosSaleToCrm,
  syncActivityToCalendar,
  logCrmTimelineEvent,
  notifyCrmEvent,
};

export default crmIntegrations;
