import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { CuentaPorCobrarDetalle, PaymentRecord, AgingInfo, AccountActions } from './types';
import { NotificationService } from '@/lib/services/notificationService';

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

      // Obtener datos de la factura si existe invoice_id
      let invoiceNumber = item.invoice_number || '';
      let invoiceDate = item.invoice_date || '';
      
      if (item.invoice_id && !invoiceNumber) {
        const { data: invoiceData } = await supabase
          .from('invoice_sales')
          .select('number, issue_date')
          .eq('id', item.invoice_id)
          .single();
        
        if (invoiceData) {
          invoiceNumber = invoiceData.number || '';
          invoiceDate = invoiceData.issue_date || '';
        }
      }

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
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
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

  // Obtener cuotas de una cuenta por cobrar
  static async obtenerCuotas(accountId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('ar_installments')
        .select('*')
        .eq('account_receivable_id', accountId)
        .order('installment_number', { ascending: true });

      if (error) {
        console.error('Error al obtener cuotas:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerCuotas:', error);
      return [];
    }
  }

  // Crear cuotas para una cuenta por cobrar
  static async crearCuotas(
    accountId: string, 
    totalAmount: number, 
    numberOfInstallments: number,
    startDate: Date
  ): Promise<void> {
    try {
      // Primero eliminar cuotas existentes
      await supabase
        .from('ar_installments')
        .delete()
        .eq('account_receivable_id', accountId);

      const installmentAmount = Math.round((totalAmount / numberOfInstallments) * 100) / 100;
      const installments = [];

      for (let i = 1; i <= numberOfInstallments; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));

        // Ajustar la última cuota para cubrir diferencias de redondeo
        const amount = i === numberOfInstallments 
          ? totalAmount - (installmentAmount * (numberOfInstallments - 1))
          : installmentAmount;

        installments.push({
          account_receivable_id: accountId,
          installment_number: i,
          due_date: dueDate.toISOString().split('T')[0],
          amount: amount,
          balance: amount,
          status: 'pending',
          paid_amount: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      console.log('📋 Creando cuotas:', installments);

      const { error } = await supabase
        .from('ar_installments')
        .insert(installments);

      if (error) {
        console.error('Error al crear cuotas:', error.message, error.details, error.hint);
        throw new Error(`Error al crear cuotas: ${error.message}`);
      }
      
      console.log('✅ Cuotas creadas exitosamente');
    } catch (error: any) {
      console.error('Error en crearCuotas:', error?.message || error);
      throw error;
    }
  }

  // Obtener métodos de pago de la organización
  static async obtenerMetodosPago(): Promise<any[]> {
    try {
      const organizationId = this.getOrganizationId();
      
      if (!organizationId) {
        console.warn('No se encontró organization_id, retornando array vacío');
        return [];
      }

      const { data, error } = await supabase
        .from('organization_payment_methods')
        .select(`
          id,
          is_active,
          payment_method:payment_methods (
            id,
            code,
            name,
            type
          )
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) {
        console.error('Error al obtener métodos de pago:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerMetodosPago:', error);
      return [];
    }
  }

  // Pagar una cuota específica
  static async pagarCuota(
    installmentId: string,
    amount: number,
    method: string,
    reference?: string
  ): Promise<void> {
    try {
      // Obtener la cuota
      const { data: installment, error: installmentError } = await supabase
        .from('ar_installments')
        .select('*, account_receivable_id')
        .eq('id', installmentId)
        .single();

      if (installmentError || !installment) {
        throw new Error('Cuota no encontrada');
      }

      // Validar que el monto no exceda el balance
      if (amount > installment.balance) {
        throw new Error('El monto excede el balance de la cuota');
      }

      // Calcular nuevos valores
      const newPaidAmount = (installment.paid_amount || 0) + amount;
      const newBalance = installment.amount - newPaidAmount;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      // Actualizar la cuota
      const { error: updateError } = await supabase
        .from('ar_installments')
        .update({
          paid_amount: newPaidAmount,
          balance: newBalance,
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date().toISOString() : null
        })
        .eq('id', installmentId);

      if (updateError) {
        console.error('Error al actualizar cuota:', updateError);
        throw updateError;
      }

      // Registrar el pago en la cuenta principal
      await this.aplicarPago(
        installment.account_receivable_id,
        amount,
        method,
        reference
      );

    } catch (error) {
      console.error('Error en pagarCuota:', error);
      throw error;
    }
  }

  // Eliminar cuotas de una cuenta
  static async eliminarCuotas(accountId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('ar_installments')
        .delete()
        .eq('account_receivable_id', accountId);

      if (error) {
        console.error('Error al eliminar cuotas:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error en eliminarCuotas:', error);
      throw error;
    }
  }

  // Enviar recordatorio usando el servicio de notificaciones centralizado
  static async enviarRecordatorio(accountId: string, message: string): Promise<void> {
    const organizationId = this.getOrganizationId();
    
    try {
      // Obtener datos de la cuenta y cliente
      const account = await this.obtenerDetallesCuentaPorCobrar(accountId);
      if (!account) {
        throw new Error('Cuenta no encontrada');
      }

      // Usar el servicio de notificaciones centralizado
      if (account.customer_email || account.customer_phone) {
        const success = await NotificationService.sendPaymentReminder(
          accountId,
          account.customer_email || '',
          account.customer_phone || null,
          {
            customer_name: account.customer_name,
            amount: account.amount,
            balance: account.balance,
            due_date: account.due_date,
            days_overdue: account.days_overdue,
            message: message
          }
        );

        if (!success) {
          console.warn('No se pudo crear la notificación, pero se actualizará la fecha de recordatorio');
        }
      }

      // Actualizar fecha de último recordatorio
      const { error } = await supabase
        .from('accounts_receivable')
        .update({
          last_reminder_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error al actualizar fecha de recordatorio:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error en enviarRecordatorio:', error);
      throw error;
    }
  }
}
