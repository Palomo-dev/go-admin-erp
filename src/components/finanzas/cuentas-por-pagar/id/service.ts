import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { CuentaPorPagarDetalle, PaymentRecord, AgingInfo, AccountActions, APInstallment } from './types';

export class CuentaPorPagarDetailService {
  private static getOrganizationId(): number {
    const orgId = getOrganizationId();
    if (!orgId) throw new Error('Organization ID no disponible');
    return orgId;
  }

  // Obtener detalles de una cuenta por pagar
  static async obtenerDetalleCuentaPorPagar(accountId: string): Promise<CuentaPorPagarDetalle | null> {
    const organizationId = this.getOrganizationId();
    
    try {
      const { data, error } = await supabase
        .from('accounts_payable')
        .select(`
          *,
          suppliers:supplier_id(
            id,
            name,
            nit,
            email,
            phone,
            contact
          ),
          invoice_purchase:invoice_id(
            id,
            number_ext,
            issue_date,
            currency
          )
        `)
        .eq('id', accountId)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        console.error('Error obteniendo cuenta por pagar:', error);
        throw error;
      }

      if (!data) return null;

      // Obtener historial de pagos
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          method,
          reference,
          status,
          created_at
        `)
        .eq('source', 'account_payable')
        .eq('source_id', accountId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (paymentsError) {
        console.error('Error obteniendo pagos:', paymentsError);
      }

      const paymentHistory: PaymentRecord[] = (payments || []).map((p: any) => ({
        id: p.id,
        amount: parseFloat(p.amount),
        method: p.method,
        reference: p.reference,
        status: p.status,
        created_at: p.created_at
      }));

      // Calcular días vencidos
      const dueDate = new Date(data.due_date);
      const today = new Date();
      const daysOverdue = dueDate < today 
        ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        id: data.id,
        organization_id: data.organization_id,
        supplier_id: data.supplier_id,
        invoice_id: data.invoice_id,
        amount: parseFloat(data.amount || 0),
        balance: parseFloat(data.balance || 0),
        due_date: data.due_date,
        status: data.status,
        days_overdue: daysOverdue,
        created_at: data.created_at,
        updated_at: data.updated_at,
        supplier_name: data.suppliers?.name || 'N/A',
        supplier_nit: data.suppliers?.nit,
        supplier_email: data.suppliers?.email,
        supplier_phone: data.suppliers?.phone,
        supplier_contact: data.suppliers?.contact,
        invoice_number: data.invoice_purchase?.number_ext,
        invoice_date: data.invoice_purchase?.issue_date,
        invoice_currency: data.invoice_purchase?.currency,
        payment_history: paymentHistory
      };
    } catch (error) {
      console.error('Error en obtenerDetalleCuentaPorPagar:', error);
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
    } else {
      return {
        period: 'Más de 60 días',
        days: daysOverdue,
        color: 'text-red-600 dark:text-red-400',
        severity: 'critical'
      };
    }
  }

  // Determinar acciones disponibles
  static getAccountActions(account: CuentaPorPagarDetalle): AccountActions {
    const hasBalance = account.balance > 0;
    const isPaid = account.status === 'paid';

    return {
      canRegisterPayment: hasBalance && !isPaid,
      canSchedulePayment: hasBalance && !isPaid,
      canMarkAsPaid: hasBalance && !isPaid,
      canEdit: !isPaid,
      canCreateInstallments: hasBalance && !isPaid
    };
  }

  // Obtener cuotas de una cuenta por pagar
  static async obtenerCuotas(accountId: string): Promise<APInstallment[]> {
    try {
      const { data, error } = await supabase
        .from('ap_installments')
        .select('*')
        .eq('account_payable_id', accountId)
        .order('installment_number', { ascending: true });

      if (error) {
        console.error('Error obteniendo cuotas:', error);
        throw error;
      }

      return (data || []).map(installment => ({
        ...installment,
        amount: parseFloat(installment.amount),
        balance: parseFloat(installment.balance),
        paid_amount: parseFloat(installment.paid_amount || 0),
        principal: installment.principal ? parseFloat(installment.principal) : undefined,
        interest: installment.interest ? parseFloat(installment.interest) : undefined
      }));
    } catch (error) {
      console.error('Error en obtenerCuotas:', error);
      return [];
    }
  }

  // Crear cuotas para una cuenta por pagar
  static async crearCuotas(
    accountId: string,
    totalAmount: number,
    numberOfInstallments: number,
    startDate: Date,
    interestRate: number = 0
  ): Promise<void> {
    try {
      // Eliminar cuotas existentes
      await supabase
        .from('ap_installments')
        .delete()
        .eq('account_payable_id', accountId);

      const baseAmount = totalAmount / numberOfInstallments;
      const installments = [];

      for (let i = 1; i <= numberOfInstallments; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));

        const principal = Math.round(baseAmount * 100) / 100;
        const interest = Math.round(principal * (interestRate / 100) * 100) / 100;
        const amount = i === numberOfInstallments 
          ? totalAmount - (baseAmount * (numberOfInstallments - 1)) + interest
          : principal + interest;

        installments.push({
          account_payable_id: accountId,
          installment_number: i,
          due_date: dueDate.toISOString().split('T')[0],
          amount: amount,
          principal: principal,
          interest: interest,
          balance: amount,
          status: 'pending',
          paid_amount: 0
        });
      }

      const { error } = await supabase
        .from('ap_installments')
        .insert(installments);

      if (error) {
        console.error('Error creando cuotas:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error en crearCuotas:', error);
      throw error;
    }
  }

  // Registrar pago en cuenta por pagar
  static async registrarPago(
    accountId: string,
    amount: number,
    method: string,
    reference?: string,
    bankAccountId?: string
  ): Promise<void> {
    const organizationId = this.getOrganizationId();
    const branchId = getCurrentBranchId();
    const createdBy = await getCurrentUserId();

    try {
      // Crear registro de pago
      const paymentData: any = {
        organization_id: organizationId,
        branch_id: branchId,
        created_by: createdBy,
        source: 'account_payable',
        source_id: accountId,
        amount: amount,
        method: method,
        reference: reference,
        status: 'completed',
        currency: 'COP'
      };

      if (bankAccountId) {
        paymentData.bank_account_id = bankAccountId;
      }

      const { error: paymentError } = await supabase
        .from('payments')
        .insert(paymentData);

      if (paymentError) throw paymentError;

      // Actualizar balance de cuenta por pagar
      const { data: account, error: accountError } = await supabase
        .from('accounts_payable')
        .select('balance, invoice_id')
        .eq('id', accountId)
        .single();

      if (accountError) throw accountError;

      const newBalance = parseFloat(account.balance) - amount;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      await supabase
        .from('accounts_payable')
        .update({
          balance: Math.max(0, newBalance),
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      // Actualizar balance de factura de compra si existe
      if (account.invoice_id) {
        await supabase
          .from('invoice_purchase')
          .update({
            balance: Math.max(0, newBalance),
            status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', account.invoice_id);
      }
    } catch (error) {
      console.error('Error registrando pago:', error);
      throw error;
    }
  }

  // Pagar cuota específica
  static async pagarCuota(
    installmentId: string,
    amount: number,
    method: string,
    reference?: string,
    bankAccountId?: string
  ): Promise<void> {
    try {
      // Obtener cuota
      const { data: installment, error: installmentError } = await supabase
        .from('ap_installments')
        .select('*, account_payable_id')
        .eq('id', installmentId)
        .single();

      if (installmentError) throw installmentError;

      const newPaidAmount = parseFloat(installment.paid_amount) + amount;
      const newBalance = parseFloat(installment.amount) - newPaidAmount;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      // Actualizar cuota
      await supabase
        .from('ap_installments')
        .update({
          paid_amount: newPaidAmount,
          balance: Math.max(0, newBalance),
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', installmentId);

      // Registrar pago en la cuenta principal
      await this.registrarPago(
        installment.account_payable_id,
        amount,
        method,
        reference,
        bankAccountId
      );
    } catch (error) {
      console.error('Error pagando cuota:', error);
      throw error;
    }
  }

  // Actualizar cuota
  static async actualizarCuota(
    installmentId: string,
    updates: Partial<APInstallment>
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('ap_installments')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', installmentId);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando cuota:', error);
      throw error;
    }
  }

  // Eliminar cuotas
  static async eliminarCuotas(accountId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('ap_installments')
        .delete()
        .eq('account_payable_id', accountId);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando cuotas:', error);
      throw error;
    }
  }

  // Obtener métodos de pago
  static async obtenerMetodosPago(): Promise<any[]> {
    const organizationId = this.getOrganizationId();

    try {
      // Obtener métodos activos de la organización
      const { data: orgMethods, error: orgError } = await supabase
        .from('organization_payment_methods')
        .select('id, payment_method_code, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (orgError) throw orgError;
      if (!orgMethods || orgMethods.length === 0) return [];

      // Obtener detalles de cada método
      const codes = orgMethods.map(m => m.payment_method_code);
      const { data: methods, error: methodsError } = await supabase
        .from('payment_methods')
        .select('code, name, requires_reference')
        .in('code', codes);

      if (methodsError) throw methodsError;

      return orgMethods.map(om => ({
        id: om.id,
        is_active: om.is_active,
        payment_method: methods?.find(m => m.code === om.payment_method_code) || {
          code: om.payment_method_code,
          name: om.payment_method_code,
          requires_reference: false
        }
      }));
    } catch (error) {
      console.error('Error obteniendo métodos de pago:', error);
      return [];
    }
  }

  // Obtener cuentas bancarias
  static async obtenerCuentasBancarias(): Promise<any[]> {
    const organizationId = this.getOrganizationId();

    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, name, bank_name, account_number, balance, currency')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo cuentas bancarias:', error);
      return [];
    }
  }

  // Generar estado de cuenta
  static async generarEstadoCuenta(accountId: string): Promise<string> {
    const account = await this.obtenerDetalleCuentaPorPagar(accountId);
    if (!account) throw new Error('Cuenta no encontrada');

    const installments = await this.obtenerCuotas(accountId);
    
    const formatDate = (date: string) => new Date(date).toLocaleDateString('es-CO');
    const formatCurrency = (amount: number) => 
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(amount);

    let content = `
ESTADO DE CUENTA
================
Fecha de generación: ${formatDate(new Date().toISOString())}

INFORMACIÓN DE LA CUENTA
------------------------
Proveedor: ${account.supplier_name}
NIT: ${account.supplier_nit || 'N/A'}
Factura: ${account.invoice_number || 'N/A'}
Fecha de vencimiento: ${formatDate(account.due_date)}

RESUMEN
-------
Monto original: ${formatCurrency(account.amount)}
Total pagado: ${formatCurrency(account.amount - account.balance)}
Saldo pendiente: ${formatCurrency(account.balance)}
Estado: ${account.status}
Días de atraso: ${account.days_overdue}

HISTORIAL DE PAGOS
------------------
`;

    if (account.payment_history.length > 0) {
      account.payment_history.forEach((p, i) => {
        content += `${i + 1}. ${formatDate(p.created_at)} - ${formatCurrency(p.amount)} (${p.method})\n`;
      });
    } else {
      content += 'Sin pagos registrados\n';
    }

    if (installments.length > 0) {
      content += `
PLAN DE CUOTAS
--------------
`;
      installments.forEach((inst) => {
        content += `Cuota ${inst.installment_number}: ${formatDate(inst.due_date)} - ${formatCurrency(inst.amount)} - ${inst.status}\n`;
      });
    }

    return content;
  }
}
