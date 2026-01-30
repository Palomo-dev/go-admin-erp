import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

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
}
