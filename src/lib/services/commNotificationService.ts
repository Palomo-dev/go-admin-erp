/**
 * Communication Notification Service — Notificaciones por módulo
 * GO Admin ERP
 *
 * Servicio centralizado que cada módulo del ERP puede usar para enviar
 * notificaciones SMS/WhatsApp. Gestiona templates y canales automáticamente.
 */

import { twilioService } from './integrations/twilio/twilioService';
import type { SendMessageResult, CommChannel } from './integrations/twilio/twilioTypes';

// ─── Tipos ──────────────────────────────────────────────

export type NotificationModule =
  | 'auth'
  | 'pms'
  | 'pos'
  | 'crm'
  | 'calendario'
  | 'hrm'
  | 'finanzas'
  | 'inventario'
  | 'chat'
  | 'notificaciones'
  | 'gimnasio'
  | 'parqueadero'
  | 'transporte';

export interface NotificationParams {
  orgId: number;
  to: string;
  channel?: CommChannel;
  module: NotificationModule;
  templateKey: string;
  variables: Record<string, string | number>;
  mediaUrl?: string[];
}

// ─── Templates por módulo ───────────────────────────────

const TEMPLATES: Record<string, string> = {
  // Auth
  'auth.otp': 'Tu código de verificación GO Admin es: {{code}}. Expira en 10 minutos.',

  // PMS
  'pms.reservation_confirmed': 'Hola {{name}}, tu reserva #{{code}} ha sido confirmada para el {{checkin}}. Te esperamos.',
  'pms.checkin_reminder': 'Hola {{name}}, te recordamos que tu check-in es mañana {{checkin}}. Reserva #{{code}}.',
  'pms.checkout_reminder': 'Hola {{name}}, tu checkout es hoy. Esperamos que hayas disfrutado tu estadía.',
  'pms.reservation_cancelled': 'Hola {{name}}, tu reserva #{{code}} ha sido cancelada. Contáctanos si necesitas ayuda.',

  // POS
  'pos.order_ready': 'Hola {{name}}, tu pedido #{{code}} está listo para recoger.',
  'pos.order_confirmed': 'Hola {{name}}, tu pedido #{{code}} ha sido confirmado. Total: {{total}}.',
  'pos.order_shipped': 'Hola {{name}}, tu pedido #{{code}} ha sido enviado. Seguimiento: {{tracking}}.',

  // CRM
  'crm.welcome': 'Bienvenido {{name}} a {{business}}. Gracias por elegirnos.',
  'crm.follow_up': 'Hola {{name}}, ¿cómo te fue con tu última visita? Nos encantaría saber tu opinión.',
  'crm.promotion': '{{name}}, tenemos una oferta especial para ti: {{offer}}. Válido hasta {{expires}}.',
  'crm.birthday': '¡Feliz cumpleaños {{name}}! 🎂 Te tenemos un regalo especial. Visítanos.',

  // Calendario
  'calendario.event_reminder': 'Recordatorio: tienes el evento "{{event}}" mañana a las {{time}}.',
  'calendario.event_cancelled': 'El evento "{{event}}" programado para {{date}} ha sido cancelado.',
  'calendario.appointment_confirmed': 'Tu cita para "{{service}}" el {{date}} a las {{time}} está confirmada.',

  // HRM
  'hrm.shift_notification': 'Hola {{name}}, tu turno de mañana es de {{start}} a {{end}}.',
  'hrm.payroll_ready': 'Hola {{name}}, tu nómina de {{period}} ya está disponible.',
  'hrm.attendance_code': 'Tu código de asistencia para hoy es: {{code}}.',

  // Finanzas
  'finanzas.payment_reminder': 'Hola {{name}}, tienes un pago pendiente de {{amount}} con vencimiento {{due_date}}.',
  'finanzas.payment_received': 'Pago de {{amount}} recibido exitosamente. Gracias, {{name}}.',
  'finanzas.invoice_sent': 'Hola {{name}}, tu factura #{{invoice}} por {{amount}} ha sido generada.',

  // Inventario
  'inventario.stock_low': 'Alerta: El producto "{{product}}" tiene stock bajo ({{quantity}} unidades restantes).',
  'inventario.reorder_needed': 'El producto "{{product}}" necesita reabastecimiento. Stock actual: {{quantity}}.',

  // Chat
  'chat.new_message': 'Tienes un nuevo mensaje de {{sender}}: "{{preview}}"',

  // Notificaciones
  'notificaciones.critical_alert': 'ALERTA: {{message}}',
  'notificaciones.system_update': 'Actualización del sistema: {{message}}',

  // Gimnasio
  'gimnasio.class_reminder': 'Recordatorio: tu clase de {{class}} es mañana a las {{time}}.',
  'gimnasio.membership_expiring': 'Hola {{name}}, tu membresía vence el {{date}}. Renuévala para no perder beneficios.',
  'gimnasio.welcome_member': 'Bienvenido al gimnasio, {{name}}. Tu membresía {{plan}} está activa.',

  // Parqueadero
  'parqueadero.entry_registered': 'Entrada registrada. Placa: {{plate}}, Hora: {{time}}. Conserva este mensaje.',
  'parqueadero.exit_receipt': 'Salida registrada. Placa: {{plate}}, Duración: {{duration}}, Monto: {{amount}}.',

  // Transporte
  'transporte.ticket_confirmed': 'Boleto confirmado. Ruta: {{route}}, Fecha: {{date}}, Asiento: {{seat}}.',
  'transporte.departure_reminder': 'Tu viaje {{route}} sale en 1 hora. Preséntate 15 min antes.',
  'transporte.trip_completed': 'Viaje completado. Ruta: {{route}}. ¡Gracias por viajar con nosotros!',
};

// ─── Servicio ───────────────────────────────────────────

class CommNotificationService {
  /**
   * Envía una notificación usando un template predefinido.
   */
  async notify(params: NotificationParams): Promise<SendMessageResult> {
    const { orgId, to, channel = 'whatsapp', module, templateKey, variables, mediaUrl } = params;

    // Buscar template
    const fullKey = `${module}.${templateKey}`;
    const template = TEMPLATES[fullKey];

    if (!template) {
      console.warn(`[CommNotification] Template no encontrado: ${fullKey}`);
      return { success: false, error: `Template no encontrado: ${fullKey}` };
    }

    // Reemplazar variables
    const body = this.renderTemplate(template, variables);

    // Enviar via twilioService
    return twilioService.send({
      orgId,
      channel,
      to,
      body,
      module,
      mediaUrl,
      metadata: { templateKey: fullKey, variables },
    });
  }

  /**
   * Envía una notificación con mensaje personalizado (sin template).
   */
  async sendCustom(
    orgId: number,
    to: string,
    body: string,
    module: NotificationModule,
    channel: CommChannel = 'whatsapp'
  ): Promise<SendMessageResult> {
    return twilioService.send({ orgId, channel, to, body, module });
  }

  /**
   * Envía notificación a múltiples destinatarios.
   */
  async notifyBulk(
    params: Omit<NotificationParams, 'to'> & { recipients: string[] }
  ): Promise<{ sent: number; failed: number; results: SendMessageResult[] }> {
    const { recipients, ...rest } = params;
    const results: SendMessageResult[] = [];
    let sent = 0;
    let failed = 0;

    for (const to of recipients) {
      const result = await this.notify({ ...rest, to });
      results.push(result);
      if (result.success) sent++;
      else failed++;

      // Rate limiting básico: 100ms entre envíos
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { sent, failed, results };
  }

  /**
   * Obtiene la lista de templates disponibles para un módulo.
   */
  getTemplatesForModule(module: NotificationModule): { key: string; template: string }[] {
    const prefix = `${module}.`;
    return Object.entries(TEMPLATES)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, template]) => ({
        key: key.replace(prefix, ''),
        template,
      }));
  }

  /**
   * Obtiene todos los templates disponibles.
   */
  getAllTemplates(): Record<string, string> {
    return { ...TEMPLATES };
  }

  /**
   * Reemplaza variables {{var}} en un template.
   */
  private renderTemplate(template: string, variables: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }
}

export const commNotificationService = new CommNotificationService();
export default CommNotificationService;
