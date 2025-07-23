import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { CuentaPorCobrarDetalle, PaymentRecord, AgingInfo, AccountActions } from './types';

export class CuentaPorCobrarDetailService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    console.log('🏢 DEBUG getOrganizationId:', { org: org?.id, orgData: org });
    return org.id;
  }



  // Obtener detalles de una cuenta por cobrar específica
  static async obtenerDetallesCuentaPorCobrar(accountId: string): Promise<CuentaPorCobrarDetalle | null> {
    const organizationId = this.getOrganizationId();
    
    try {
      // Usar función RPC para obtener detalles completos
      const { data, error } = await supabase
        .rpc('get_account_receivable_detail', {
          account_id: accountId,
          org_id: organizationId
        });

      if (error) {
        console.error('Error al obtener detalles de cuenta por cobrar:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        return null;
      }

      const item = data[0];
      
      // Procesar historial de pagos
      const paymentHistory: PaymentRecord[] = item.payment_history || [];

      return {
        id: item.id,
        organization_id: item.organization_id,
        customer_id: item.customer_id,
        invoice_id: item.invoice_id,
        sale_id: item.sale_id,
        amount: parseFloat(item.amount || 0),
        balance: parseFloat(item.balance || 0),
        due_date: item.due_date,
        status: item.status,
        days_overdue: item.days_overdue || 0,
        last_reminder_date: item.last_reminder_date,
        created_at: item.created_at,
        updated_at: item.updated_at,
        customer_name: item.customer_name || 'N/A',
        customer_email: item.customer_email || '',
        customer_phone: item.customer_phone || '',
        customer_address: item.customer_address || '',
        payment_history: paymentHistory.map(payment => ({
          id: payment.id,
          amount: typeof payment.amount === 'number' ? payment.amount : parseFloat(payment.amount || '0'),
          method: payment.method || 'N/A',
          reference: payment.reference,
          status: payment.status || 'unknown',
          created_at: payment.created_at
        }))
      };
    } catch (error) {
      console.error('Error en obtenerDetallesCuentaPorCobrar:', error);
      throw error;
    }
  }

  // Obtener información de aging
  static getAgingInfo(daysOverdue: number): AgingInfo {
    if (daysOverdue <= 0) {
      return {
        period: 'Al día',
        days: daysOverdue,
        color: 'text-green-600 dark:text-green-400',
        severity: 'low'
      };
    } else if (daysOverdue <= 30) {
      return {
        period: '1-30 días',
        days: daysOverdue,
        color: 'text-yellow-600 dark:text-yellow-400',
        severity: 'medium'
      };
    } else if (daysOverdue <= 60) {
      return {
        period: '31-60 días',
        days: daysOverdue,
        color: 'text-orange-600 dark:text-orange-400',
        severity: 'high'
      };
    } else if (daysOverdue <= 90) {
      return {
        period: '61-90 días',
        days: daysOverdue,
        color: 'text-red-600 dark:text-red-400',
        severity: 'critical'
      };
    } else {
      return {
        period: 'Más de 90 días',
        days: daysOverdue,
        color: 'text-red-800 dark:text-red-300',
        severity: 'critical'
      };
    }
  }

  // Determinar acciones disponibles
  static getAccountActions(account: CuentaPorCobrarDetalle): AccountActions {
    const hasBalance = account.balance > 0;
    const isOverdue = account.days_overdue > 0;
    const isPaid = account.status === 'paid';

    return {
      canSendReminder: hasBalance && isOverdue && !isPaid,
      canApplyPayment: hasBalance && !isPaid,
      canMarkAsPaid: hasBalance && !isPaid,
      canEdit: true
    };
  }

  // Obtener pagos filtrados con paginación
  static async obtenerPagosFiltrados(
    accountId: string,
    organizationId: number,
    options: {
      showAllCustomerPayments?: boolean;
      searchTerm?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    payments: PaymentRecord[];
    totalCount: number;
  }> {
    const {
      showAllCustomerPayments = false,
      searchTerm = '',
      limit = 10,
      offset = 0
    } = options;

    try {
      const { data, error } = await supabase.rpc('get_payments_filtered', {
        account_id: accountId,
        org_id: organizationId,
        show_all_customer_payments: showAllCustomerPayments,
        search_term: searchTerm,
        payment_limit: limit,
        payment_offset: offset
      });

      if (error) {
        console.error('Error al obtener pagos filtrados:', error);
        throw error;
      }

      const payments: PaymentRecord[] = (data || []).map((payment: any) => ({
        id: payment.id,
        amount: typeof payment.amount === 'number' ? payment.amount : parseFloat(payment.amount || '0'),
        method: payment.method || 'N/A',
        reference: payment.reference,
        status: payment.status || 'unknown',
        created_at: payment.created_at,
        invoice_number: payment.invoice_number
      }));

      const totalCount = data && data.length > 0 ? data[0].total_count : 0;

      return {
        payments,
        totalCount: parseInt(totalCount.toString())
      };
    } catch (error) {
      console.error('Error en obtenerPagosFiltrados:', error);
      throw error;
    }
  }

  // Aplicar pago
  static async aplicarPago(accountId: string, amount: number, method: string, reference?: string): Promise<void> {
    const organizationId = this.getOrganizationId();
    const branchId = getCurrentBranchId();
    const createdBy = await getCurrentUserId();
    
    console.log('💰 DEBUG aplicarPago:', { accountId, amount, method, organizationId, branchId, createdBy });
    
    try {
      // Crear registro de pago
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          created_by: createdBy,
          source: 'account_receivable',
          source_id: accountId,
          amount: amount,
          method: method,
          reference: reference,
          status: 'completed',
          currency: 'COP'
        });

      if (paymentError) {
        console.error('Error al crear pago:', paymentError);
        throw paymentError;
      }

      // Actualizar balance de cuenta por cobrar
      const { data: account, error: accountError } = await supabase
        .from('accounts_receivable')
        .select('balance')
        .eq('id', accountId)
        .eq('organization_id', organizationId)
        .single();

      if (accountError) {
        console.error('Error al obtener cuenta:', accountError);
        throw accountError;
      }

      const newBalance = parseFloat(account.balance) - amount;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      const { error: updateError } = await supabase
        .from('accounts_receivable')
        .update({
          balance: newBalance,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId)
        .eq('organization_id', organizationId);

      if (updateError) {
        console.error('Error al actualizar cuenta:', updateError);
        throw updateError;
      }

    } catch (error) {
      console.error('Error en aplicarPago:', error);
      throw error;
    }
  }

  // Enviar recordatorio
  static async enviarRecordatorio(accountId: string, message: string): Promise<void> {
    const organizationId = this.getOrganizationId();
    
    try {
      const { error } = await supabase
        .from('accounts_receivable')
        .update({
          last_reminder_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error al enviar recordatorio:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error en enviarRecordatorio:', error);
      throw error;
    }
  }
}
