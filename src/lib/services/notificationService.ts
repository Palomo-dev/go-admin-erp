import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { sendgridService } from '@/lib/services/integrations/sendgrid';

export interface NotificationPayload {
  customer_name?: string;
  invoice_number?: string;
  amount?: number;
  due_date?: string;
  days_overdue?: number;
  balance?: number;
  [key: string]: any;
}

export interface CreateNotificationParams {
  recipientEmail?: string;
  recipientPhone?: string;
  recipientUserId?: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'push';
  templateId?: string;
  payload: NotificationPayload;
}

export class NotificationService {
  
  // Crear una notificación
  static async createNotification(params: CreateNotificationParams): Promise<string | null> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      const { data, error } = await supabase
        .from('notifications')
        .insert({
          organization_id: organizationId,
          recipient_email: params.recipientEmail,
          recipient_phone: params.recipientPhone,
          recipient_user_id: params.recipientUserId,
          channel: params.channel,
          template_id: params.templateId,
          payload: params.payload,
          status: 'pending'
        })
        .select('id')
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('Error creando notificación:', error);
      return null;
    }
  }

  // Enviar recordatorio de pago para CxC
  static async sendPaymentReminder(
    accountReceivableId: string,
    customerEmail: string,
    customerPhone: string | null,
    payload: NotificationPayload
  ): Promise<boolean> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      // Crear notificación por email
      if (customerEmail) {
        await this.createNotification({
          recipientEmail: customerEmail,
          channel: 'email',
          payload: {
            type: 'payment_reminder',
            account_receivable_id: accountReceivableId,
            ...payload
          }
        });
      }

      // Crear notificación por SMS/WhatsApp si hay teléfono
      if (customerPhone) {
        await this.createNotification({
          recipientPhone: customerPhone,
          channel: 'whatsapp',
          payload: {
            type: 'payment_reminder',
            account_receivable_id: accountReceivableId,
            ...payload
          }
        });
      }

      // Actualizar last_reminder_date en accounts_receivable
      const { error: updateError } = await supabase
        .from('accounts_receivable')
        .update({
          last_reminder_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', accountReceivableId)
        .eq('organization_id', organizationId);

      if (updateError) {
        console.error('Error actualizando fecha de recordatorio:', updateError);
      }

      return true;
    } catch (error) {
      console.error('Error enviando recordatorio de pago:', error);
      return false;
    }
  }

  // Obtener notificaciones pendientes
  static async getPendingNotifications(): Promise<any[]> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo notificaciones pendientes:', error);
      return [];
    }
  }

  // Marcar notificación como enviada
  static async markAsSent(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error marcando notificación como enviada:', error);
      return false;
    }
  }

  // Marcar notificación como fallida
  static async markAsFailed(notificationId: string, errorMsg: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          status: 'failed',
          error_msg: errorMsg,
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error marcando notificación como fallida:', error);
      return false;
    }
  }

  // Obtener plantillas de notificación
  static async getTemplates(channel?: string): Promise<any[]> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) return [];

      let query = supabase
        .from('notification_templates')
        .select('*')
        .eq('organization_id', organizationId);

      if (channel) {
        query = query.eq('channel', channel);
      }

      const { data, error } = await query.order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo plantillas:', error);
      return [];
    }
  }

  // Crear plantilla de notificación
  static async createTemplate(template: {
    name: string;
    channel: string;
    subject?: string;
    body_html?: string;
    body_text: string;
    variables?: string[];
  }): Promise<string | null> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      const { data, error } = await supabase
        .from('notification_templates')
        .insert({
          organization_id: organizationId,
          ...template,
          version: 1
        })
        .select('id')
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('Error creando plantilla:', error);
      return null;
    }
  }

  // Obtener historial de notificaciones de una cuenta
  static async getNotificationHistory(accountReceivableId: string): Promise<any[]> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('organization_id', organizationId)
        .contains('payload', { account_receivable_id: accountReceivableId })
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo historial de notificaciones:', error);
      return [];
    }
  }

  // Enviar recordatorios masivos para cuentas vencidas
  static async sendBulkReminders(daysOverdueThreshold: number = 1): Promise<{
    sent: number;
    failed: number;
  }> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) return { sent: 0, failed: 0 };

      // Obtener cuentas vencidas
      const { data: accounts, error } = await supabase
        .from('accounts_receivable')
        .select(`
          id,
          amount,
          balance,
          due_date,
          days_overdue,
          customers:customer_id(
            full_name,
            email,
            phone
          ),
          invoice_sales:invoice_id(
            number
          )
        `)
        .eq('organization_id', organizationId)
        .gt('balance', 0)
        .gte('days_overdue', daysOverdueThreshold);

      if (error) throw error;

      let sent = 0;
      let failed = 0;

      for (const account of accounts || []) {
        const customer = account.customers as any;
        const invoice = account.invoice_sales as any;

        if (customer?.email) {
          const success = await this.sendPaymentReminder(
            account.id,
            customer.email,
            customer.phone,
            {
              customer_name: customer.full_name,
              invoice_number: invoice?.number,
              amount: account.amount,
              balance: account.balance,
              due_date: account.due_date,
              days_overdue: account.days_overdue
            }
          );

          if (success) {
            sent++;
          } else {
            failed++;
          }
        }
      }

      return { sent, failed };
    } catch (error) {
      console.error('Error enviando recordatorios masivos:', error);
      return { sent: 0, failed: 0 };
    }
  }

  // ----------------------------------------------------------
  // Envío real de email vía SendGrid
  // ----------------------------------------------------------

  /**
   * Envía un email real usando SendGrid para una notificación.
   * Busca la conexión SendGrid de la organización y envía el email.
   * Actualiza el status de la notificación a 'sent' o 'failed'.
   */
  static async sendEmailViaSendGrid(
    notificationId: string,
    organizationId: number,
    recipientEmail: string,
    subject: string,
    html?: string,
    text?: string,
    templateId?: string,
    templateData?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const { credentials } = await sendgridService.getCredentialsByOrganization(organizationId);

      if (!credentials) {
        console.warn('[Notifications] No hay conexión SendGrid activa para org:', organizationId);
        await this.markAsFailed(notificationId, 'No hay conexión SendGrid configurada');
        return false;
      }

      const result = await sendgridService.sendSimpleEmail(credentials, {
        to: recipientEmail,
        subject,
        html,
        text,
        templateId,
        templateData,
        categories: ['go-admin-notification'],
      });

      if (result.success) {
        await this.markAsSent(notificationId);
        return true;
      } else {
        await this.markAsFailed(notificationId, result.error || `HTTP ${result.statusCode}`);
        return false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[Notifications] Error enviando email:', msg);
      await this.markAsFailed(notificationId, msg);
      return false;
    }
  }

  /**
   * Procesa y envía todas las notificaciones email pendientes de una organización.
   * Busca notificaciones con channel='email' y status='pending', las envía vía SendGrid.
   */
  static async processEmailNotifications(organizationId?: number): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    try {
      const orgId = organizationId || getOrganizationId();
      if (!orgId) return { processed: 0, sent: 0, failed: 0 };

      // Verificar que haya conexión SendGrid antes de procesar
      const { credentials } = await sendgridService.getCredentialsByOrganization(orgId);
      if (!credentials) {
        console.warn('[Notifications] No hay conexión SendGrid para org:', orgId);
        return { processed: 0, sent: 0, failed: 0 };
      }

      // Obtener notificaciones email pendientes
      const { data: pendingEmails, error } = await supabase
        .from('notifications')
        .select('id, recipient_email, payload, template_id')
        .eq('organization_id', orgId)
        .eq('channel', 'email')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50);

      if (error || !pendingEmails || pendingEmails.length === 0) {
        return { processed: 0, sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;

      for (const notification of pendingEmails) {
        if (!notification.recipient_email) {
          await this.markAsFailed(notification.id, 'Sin email de destinatario');
          failed++;
          continue;
        }

        const payload = notification.payload as NotificationPayload;
        const subject = this.buildSubjectFromPayload(payload);
        const html = this.buildHtmlFromPayload(payload);

        const success = await sendgridService.sendSimpleEmail(credentials, {
          to: notification.recipient_email,
          subject,
          html,
          categories: ['go-admin-notification', payload.type || 'general'],
        });

        if (success.success) {
          await this.markAsSent(notification.id);
          sent++;
        } else {
          await this.markAsFailed(notification.id, success.error || 'Error de envío');
          failed++;
        }
      }

      return { processed: pendingEmails.length, sent, failed };
    } catch (error) {
      console.error('[Notifications] Error procesando emails:', error);
      return { processed: 0, sent: 0, failed: 0 };
    }
  }

  /**
   * Vincula el canal de email de una organización con una conexión de SendGrid.
   * Actualiza notification_channels.connection_id y provider_name.
   */
  static async linkSendGridChannel(
    organizationId: number,
    connectionId: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notification_channels')
        .update({
          connection_id: connectionId,
          provider_name: 'SendGrid',
          config_json: { provider: 'sendgrid', linked_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('code', 'email');

      if (error) {
        console.error('[Notifications] Error vinculando canal SendGrid:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Notifications] Error en linkSendGridChannel:', error);
      return false;
    }
  }

  // ----------------------------------------------------------
  // Helpers internos para construir contenido de email
  // ----------------------------------------------------------

  private static buildSubjectFromPayload(payload: NotificationPayload): string {
    switch (payload.type) {
      case 'payment_reminder':
        return `Recordatorio de pago - ${payload.invoice_number || 'Factura pendiente'}`;
      case 'invoice_created':
        return `Nueva factura ${payload.invoice_number || ''}`;
      case 'payment_received':
        return `Pago recibido - ${payload.invoice_number || ''}`;
      case 'welcome':
        return 'Bienvenido a nuestra plataforma';
      default:
        return 'Notificación de GO Admin';
    }
  }

  private static buildHtmlFromPayload(payload: NotificationPayload): string {
    const customerName = payload.customer_name || 'Estimado cliente';

    switch (payload.type) {
      case 'payment_reminder':
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Recordatorio de Pago</h2>
            <p>Hola ${customerName},</p>
            <p>Le recordamos que tiene un saldo pendiente:</p>
            <ul>
              ${payload.invoice_number ? `<li><strong>Factura:</strong> ${payload.invoice_number}</li>` : ''}
              ${payload.balance ? `<li><strong>Saldo pendiente:</strong> $${payload.balance.toLocaleString()}</li>` : ''}
              ${payload.due_date ? `<li><strong>Fecha de vencimiento:</strong> ${payload.due_date}</li>` : ''}
              ${payload.days_overdue ? `<li><strong>Días vencido:</strong> ${payload.days_overdue}</li>` : ''}
            </ul>
            <p>Por favor, realice su pago a la brevedad posible.</p>
            <p>Gracias por su atención.</p>
          </div>`;
      case 'payment_received':
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Pago Recibido</h2>
            <p>Hola ${customerName},</p>
            <p>Hemos recibido su pago exitosamente.</p>
            ${payload.amount ? `<p><strong>Monto:</strong> $${payload.amount.toLocaleString()}</p>` : ''}
            ${payload.invoice_number ? `<p><strong>Factura:</strong> ${payload.invoice_number}</p>` : ''}
            <p>Gracias por su pago.</p>
          </div>`;
      default:
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Notificación</h2>
            <p>Hola ${customerName},</p>
            <p>${JSON.stringify(payload)}</p>
          </div>`;
    }
  }
}
