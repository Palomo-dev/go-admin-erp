import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { 
  AccountPayable, 
  Payment, 
  PaymentWithRelations,
  AccountsPayableSummary,
  FiltrosCuentasPorPagar,
  ProgramarPagoForm,
  RegistrarPagoForm,
  BankFileRecord,
  PaymentApproval
} from './types';
import { SupplierBase, OrganizationPaymentMethod, OrganizationCurrency } from '../facturas-compra/types';

export class CuentasPorPagarService {
  
  /**
   * Obtiene todas las cuentas por pagar con filtros aplicados
   */
  static async obtenerCuentasPorPagar(
    filtros: FiltrosCuentasPorPagar,
    page: number = 1,
    pageSize: number = 10
  ): Promise<{
    cuentas: AccountPayable[];
    total: number;
    totalPages: number;
  }> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      let query = supabase
        .from('accounts_payable')
        .select(`
          *,
          supplier:suppliers(
            id,
            name,
            nit,
            contact,
            phone,
            email
          ),
          invoice_purchase:invoice_purchase(
            id,
            number_ext,
            issue_date,
            currency
          )
        `, { count: 'exact' })
        .eq('organization_id', organizationId);

      // Aplicar filtros
      if (filtros.estado !== 'todos') {
        if (filtros.estado === 'overdue') {
          query = query.lt('due_date', new Date().toISOString()).gt('balance', 0);
        } else {
          query = query.eq('status', filtros.estado);
        }
      }

      if (filtros.proveedor !== 'todos') {
        query = query.eq('supplier_id', parseInt(filtros.proveedor));
      }

      if (filtros.busqueda) {
        // Buscar en nombre del proveedor o número de factura
        const { data: searchData } = await supabase
          .from('accounts_payable')
          .select(`
            id,
            supplier:suppliers(name),
            invoice_purchase:invoice_purchase(number_ext)
          `)
          .eq('organization_id', organizationId)
          .or(`supplier.name.ilike.%${filtros.busqueda}%,invoice_purchase.number_ext.ilike.%${filtros.busqueda}%`);
        
        if (searchData) {
          const ids = searchData.map(item => item.id);
          query = query.in('id', ids);
        }
      }

      if (filtros.fechaDesde) {
        query = query.gte('due_date', filtros.fechaDesde);
      }

      if (filtros.fechaHasta) {
        query = query.lte('due_date', filtros.fechaHasta);
      }

      if (filtros.montoMinimo !== null) {
        query = query.gte('balance', filtros.montoMinimo);
      }

      if (filtros.montoMaximo !== null) {
        query = query.lte('balance', filtros.montoMaximo);
      }

      // Filtros de vencimiento
      const hoy = new Date();
      const en15Dias = new Date();
      en15Dias.setDate(hoy.getDate() + 15);

      switch (filtros.vencimiento) {
        case 'vencidas':
          query = query.lt('due_date', hoy.toISOString()).gt('balance', 0);
          break;
        case 'proximas':
          query = query.gte('due_date', hoy.toISOString()).lte('due_date', en15Dias.toISOString());
          break;
        case 'futuras':
          query = query.gt('due_date', en15Dias.toISOString());
          break;
      }

      // Paginación
      const from = (page - 1) * pageSize;
      query = query
        .order('due_date', { ascending: true })
        .range(from, from + pageSize - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error obteniendo cuentas por pagar:', error);
        throw error;
      }

      // Calcular días vencidos
      const cuentasConVencimiento = (data || []).map(cuenta => ({
        ...cuenta,
        days_overdue: cuenta.due_date && new Date(cuenta.due_date) < hoy 
          ? Math.floor((hoy.getTime() - new Date(cuenta.due_date).getTime()) / (1000 * 60 * 60 * 24))
          : 0
      }));

      const totalPages = Math.ceil((count || 0) / pageSize);

      return {
        cuentas: cuentasConVencimiento,
        total: count || 0,
        totalPages
      };
    } catch (error) {
      console.error('Error en obtenerCuentasPorPagar:', error);
      throw error;
    }
  }

  /**
   * Obtiene resumen de cuentas por pagar
   */
  static async obtenerResumen(): Promise<AccountsPayableSummary> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      const hoy = new Date().toISOString();

      // Obtener totales
      const { data: totales, error: totalesError } = await supabase
        .from('accounts_payable')
        .select('status, balance, due_date')
        .eq('organization_id', organizationId)
        .gt('balance', 0);

      if (totalesError) throw totalesError;

      let total_pending = 0;
      let total_overdue = 0;
      let total_partial = 0;
      let overdue_count = 0;

      (totales || []).forEach(cuenta => {
        const balance = parseFloat(cuenta.balance) || 0;
        
        switch (cuenta.status) {
          case 'pending':
            total_pending += balance;
            break;
          case 'partial':
            total_partial += balance;
            break;
        }

        if (cuenta.due_date && cuenta.due_date < hoy && balance > 0) {
          total_overdue += balance;
          overdue_count++;
        }
      });

      // Obtener conteo de proveedores
      const { count: suppliers_count } = await supabase
        .from('accounts_payable')
        .select('supplier_id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gt('balance', 0);

      // Obtener próximo vencimiento
      const { data: proximoVencimiento } = await supabase
        .from('accounts_payable')
        .select('balance, due_date')
        .eq('organization_id', organizationId)
        .gt('balance', 0)
        .gte('due_date', hoy)
        .order('due_date', { ascending: true })
        .limit(1)
        .single();

      return {
        total_pending,
        total_overdue,
        total_partial,
        total_amount: total_pending + total_overdue + total_partial,
        suppliers_count: suppliers_count || 0,
        overdue_count,
        next_due_amount: proximoVencimiento ? parseFloat(proximoVencimiento.balance) : 0,
        next_due_date: proximoVencimiento?.due_date
      };
    } catch (error) {
      console.error('Error en obtenerResumen:', error);
      throw error;
    }
  }

  /**
   * Obtiene cuenta por pagar por ID
   */
  static async obtenerCuentaPorId(id: string): Promise<AccountPayable | null> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      const { data, error } = await supabase
        .from('accounts_payable')
        .select(`
          *,
          supplier:suppliers(*),
          invoice_purchase:invoice_purchase(
            id,
            number_ext,
            issue_date,
            currency,
            subtotal,
            tax_total,
            total
          )
        `)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        console.error('Error obteniendo cuenta por pagar:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error en obtenerCuentaPorId:', error);
      return null;
    }
  }

  /**
   * Programa un pago (crea un pago pendiente en la tabla payments)
   */
  static async programarPago(pagoData: ProgramarPagoForm): Promise<PaymentWithRelations> {
    try {
      const organizationId = getOrganizationId();
      const branchId = getCurrentBranchId();
      const userId = await getCurrentUserId();
      
      if (!organizationId || !userId) {
        throw new Error('Organization ID o User ID no disponibles');
      }

      // Validaciones adicionales para UUIDs
      const userIdStr = String(userId);
      if (!userId || userIdStr === '{}' || userIdStr === 'undefined' || userIdStr === 'null') {
        throw new Error(`User ID inválido: ${userIdStr}`);
      }

      if (!pagoData.account_payable_id || typeof pagoData.account_payable_id !== 'string') {
        throw new Error(`Account Payable ID inválido: ${pagoData.account_payable_id}`);
      }

      // Validar datos requeridos
      console.log('DEBUG - Datos para insertar:', {
        organizationId,
        branchId,
        userId,
        pagoData
      });

      // Crear un pago pendiente en la tabla payments
      const nuevoPago = {
        organization_id: organizationId,
        branch_id: branchId || null,
        source: 'account_payable',
        source_id: pagoData.account_payable_id,
        method: pagoData.payment_method || 'transfer',
        amount: parseFloat(pagoData.amount.toString()),
        currency: 'COP', // Por defecto
        reference: pagoData.reference || `Pago programado para ${pagoData.scheduled_date}`,
        status: 'pending' as const,
        created_by: userId
      };

      console.log('DEBUG - Objeto a insertar:', nuevoPago);

      const { data, error } = await supabase
        .from('payments')
        .insert(nuevoPago)
        .select('*')
        .single();

      if (error) {
        console.error('Error programando pago:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw new Error(`Error al programar pago: ${error.message || JSON.stringify(error)}`);
      }

      console.log('Pago programado exitosamente:', data.id);
      return data as PaymentWithRelations;
    } catch (error) {
      console.error('Error en programarPago:', error);
      throw error;
    }
  }

  /**
   * Registra un pago directo
   */
  static async registrarPago(pagoData: RegistrarPagoForm): Promise<Payment> {
    try {
      const organizationId = getOrganizationId();
      const branchId = getCurrentBranchId();
      const userId = await getCurrentUserId();
      
      if (!organizationId || !userId) {
        throw new Error('Organization ID o User ID no disponibles');
      }

      // Obtener información de la cuenta por pagar
      const { data: cuenta, error: cuentaError } = await supabase
        .from('accounts_payable')
        .select('id, balance, supplier_id, invoice_id')
        .eq('id', pagoData.account_payable_id)
        .eq('organization_id', organizationId)
        .single();

      if (cuentaError || !cuenta) {
        throw new Error('Cuenta por pagar no encontrada');
      }

      if (pagoData.amount > cuenta.balance) {
        throw new Error('El monto del pago no puede ser mayor al saldo pendiente');
      }

      // Registrar el pago
      const nuevoPago = {
        organization_id: organizationId,
        branch_id: branchId,
        source: 'account_payable',
        source_id: pagoData.account_payable_id,
        method: pagoData.payment_method,
        amount: pagoData.amount,
        currency: 'COP', // Por defecto, podríamos obtenerlo de la organización
        reference: pagoData.reference || null,
        status: 'completed' as const,
        created_by: userId
      };

      const { data: pago, error: pagoError } = await supabase
        .from('payments')
        .insert(nuevoPago)
        .select()
        .single();

      if (pagoError) {
        console.error('Error registrando pago:', pagoError);
        throw pagoError;
      }

      // Actualizar balances usando el método auxiliar
      await this.actualizarBalancesDespuesDePago(pagoData.account_payable_id, pagoData.amount);

      console.log(`Pago registrado exitosamente: ${pago.id}`);
      return pago;
    } catch (error) {
      console.error('Error en registrarPago:', error);
      throw error;
    }
  }

  /**
   * Obtiene historial de pagos de una cuenta por pagar
   */
  static async obtenerHistorialPagos(accountPayableId: string): Promise<Payment[]> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          created_by_user:profiles(
            id,
            email,
            full_name
          )
        `)
        .eq('organization_id', organizationId)
        .eq('source', 'account_payable')
        .eq('source_id', accountPayableId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error obteniendo historial de pagos:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerHistorialPagos:', error);
      return [];
    }
  }

  /**
   * Obtiene pagos programados (simulado con pagos de invoice_purchase pendientes)
   */
  static async obtenerPagosProgramados(
    filtros?: { status?: string; fecha_desde?: string; fecha_hasta?: string }
  ): Promise<PaymentWithRelations[]> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      // Buscar pagos programados con source='account_payable'
      let query = supabase
        .from('payments')
        .select(`
          *
        `)
        .eq('organization_id', organizationId)
        .eq('source', 'account_payable');

      // Por defecto buscar pagos pendientes si no se especifica status
      const statusFilter = filtros?.status || 'pending';
      if (statusFilter !== 'todos') {
        query = query.eq('status', statusFilter);
      }

      if (filtros?.fecha_desde) {
        query = query.gte('created_at', filtros.fecha_desde);
      }

      if (filtros?.fecha_hasta) {
        query = query.lte('created_at', filtros.fecha_hasta);
      }

      query = query.order('created_at', { ascending: true }).limit(10);

      const { data, error } = await query;

      if (error) {
        console.error('Error obteniendo pagos programados:', error);
        throw error;
      }

      // Como es una consulta simplificada, retornamos los datos tal como vienen
      // En una implementación real, aquí se harían las consultas adicionales para las relaciones
      return (data as PaymentWithRelations[]) || [];
    } catch (error) {
      console.error('Error en obtenerPagosProgramados:', error);
      return [];
    }
  }

  /**
   * Método auxiliar para actualizar balances después de un pago
   */
  private static async actualizarBalancesDespuesDePago(accountPayableId: string, paymentAmount: number): Promise<void> {
    try {
      // Obtener información de la cuenta por pagar
      const { data: cuenta, error: cuentaError } = await supabase
        .from('accounts_payable')
        .select('balance, invoice_id')
        .eq('id', accountPayableId)
        .single();

      if (cuentaError || !cuenta) {
        console.error('Cuenta por pagar no encontrada para actualización de balance');
        return;
      }

      // Calcular nuevo balance
      const nuevoBalance = cuenta.balance - paymentAmount;
      const nuevoEstado = nuevoBalance <= 0 ? 'paid' : 'partial';

      // Actualizar balance de la cuenta por pagar
      const { error: updateError } = await supabase
        .from('accounts_payable')
        .update({ 
          balance: nuevoBalance,
          status: nuevoEstado,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountPayableId);

      if (updateError) {
        console.error('Error actualizando balance de cuenta por pagar:', updateError);
      }

      // Actualizar balance de la factura de compra correspondiente
      if (cuenta.invoice_id) {
        const { error: invoiceUpdateError } = await supabase
          .from('invoice_purchase')
          .update({ 
            balance: nuevoBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', cuenta.invoice_id);

        if (invoiceUpdateError) {
          console.error('Error actualizando balance de factura de compra:', invoiceUpdateError);
        } else {
          console.log(`Balances sincronizados para cuenta ${accountPayableId} y factura ${cuenta.invoice_id}`);
        }
      }
    } catch (error) {
      console.error('Error en actualizarBalancesDespuesDePago:', error);
    }
  }

  /**
   * Aprueba un pago programado (cambia status a completed)
   */
  static async aprobarPago(paymentId: string, comments?: string): Promise<void> {
    try {
      const organizationId = getOrganizationId();
      const userId = await getCurrentUserId();
      
      if (!organizationId || !userId) {
        throw new Error('Organization ID o User ID no disponibles');
      }

      const updateData: any = {
        status: 'completed',
        updated_at: new Date().toISOString()
      };
      
      // Si hay comentarios, los agregamos a la referencia
      if (comments) {
        updateData.reference = comments;
      }

      // Primero obtener información del pago
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select('source_id, amount')
        .eq('id', paymentId)
        .eq('organization_id', organizationId)
        .single();

      if (paymentError || !payment) {
        throw new Error('Pago no encontrado');
      }

      // Actualizar status del pago
      const { error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', paymentId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error aprobando pago:', error);
        throw error;
      }

      // Actualizar balances si es un pago de cuenta por pagar
      if (payment.source_id) {
        await this.actualizarBalancesDespuesDePago(payment.source_id, payment.amount);
      }

      console.log(`Pago aprobado: ${paymentId}`);
    } catch (error) {
      console.error('Error en aprobarPago:', error);
      throw error;
    }
  }

  /**
   * Rechaza un pago programado (cambia status a cancelled)
   */
  static async rechazarPago(paymentId: string, comments?: string): Promise<void> {
    try {
      const organizationId = getOrganizationId();
      const userId = await getCurrentUserId();
      
      if (!organizationId || !userId) {
        throw new Error('Organization ID o User ID no disponibles');
      }

      const updateData: any = {
        status: 'cancelled',
        updated_at: new Date().toISOString()
      };
      
      // Si hay comentarios, los agregamos a la referencia
      if (comments) {
        updateData.reference = comments;
      }

      const { error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', paymentId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error rechazando pago:', error);
        throw error;
      }

      console.log(`Pago rechazado: ${paymentId}`);
    } catch (error) {
      console.error('Error en rechazarPago:', error);
      throw error;
    }
  }

  /**
   * Obtiene proveedores con saldo pendiente
   */
  static async obtenerProveedoresConSaldo(): Promise<SupplierBase[]> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      const { data, error } = await supabase
        .from('suppliers')
        .select(`
          *,
          accounts_payable!inner(
            balance
          )
        `)
        .eq('organization_id', organizationId)
        .gt('accounts_payable.balance', 0);

      if (error) {
        console.error('Error obteniendo proveedores con saldo:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerProveedoresConSaldo:', error);
      return [];
    }
  }

  /**
   * Obtiene métodos de pago disponibles
   */
  static async obtenerMetodosPago(): Promise<OrganizationPaymentMethod[]> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      const { data, error } = await supabase
        .from('organization_payment_methods')
        .select(`
          *,
          payment_methods(
            code,
            name,
            requires_reference,
            is_active,
            is_system
          )
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) {
        console.error('Error obteniendo métodos de pago:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerMetodosPago:', error);
      return [];
    }
  }

  /**
   * Obtiene monedas de la organización
   */
  static async obtenerMonedas(): Promise<OrganizationCurrency[]> {
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) throw new Error('Organization ID no disponible');

      const { data: orgCurrencies, error: orgError } = await supabase
        .from('organization_currencies')
        .select('*')
        .eq('organization_id', organizationId)
        .order('is_base', { ascending: false });

      if (orgError || !orgCurrencies?.length) {
        console.error('Error obteniendo monedas organizacion:', orgError);
        return [];
      }

      const currencyCodes = orgCurrencies.map(oc => oc.currency_code);
      const { data: currencies, error: currError } = await supabase
        .from('currencies')
        .select('*')
        .in('code', currencyCodes);

      if (currError) {
        console.error('Error obteniendo currencies:', currError);
        return orgCurrencies;
      }

      const result = orgCurrencies.map(orgCurr => ({
        ...orgCurr,
        currencies: currencies?.find(c => c.code === orgCurr.currency_code)
      }));

      return result;
    } catch (error) {
      console.error('Error en obtenerMonedas:', error);
      return [];
    }
  }

  /**
   * Exporta cuentas por pagar para archivo de banca online
   */
  static async exportarParaBancaOnline(cuentasIds: string[]): Promise<BankFileRecord> {
    try {
      const organizationId = getOrganizationId();
      const userId = await getCurrentUserId();
      
      if (!organizationId || !userId) {
        throw new Error('Organization ID o User ID no disponibles');
      }

      // Obtener las cuentas seleccionadas
      const { data: cuentas, error: cuentasError } = await supabase
        .from('accounts_payable')
        .select(`
          *,
          supplier:suppliers(name, nit, email),
          invoice_purchase:invoice_purchase(number_ext)
        `)
        .in('id', cuentasIds)
        .eq('organization_id', organizationId);

      if (cuentasError || !cuentas) {
        throw new Error('Error obteniendo cuentas para exportar');
      }

      // Crear registro del archivo
      const nuevoArchivo = {
        organization_id: organizationId,
        file_name: `pagos_${new Date().toISOString().split('T')[0]}.csv`,
        file_type: 'csv' as const,
        records_count: cuentas.length,
        processed_count: 0,
        status: 'pending' as const,
        upload_date: new Date().toISOString(),
        created_by: userId
      };

      const { data: archivo, error: archivoError } = await supabase
        .from('bank_files')
        .insert(nuevoArchivo)
        .select()
        .single();

      if (archivoError) {
        console.error('Error creando archivo bancario:', archivoError);
        throw archivoError;
      }

      console.log(`Archivo de banca online generado: ${archivo.id}`);
      return archivo;
    } catch (error) {
      console.error('Error en exportarParaBancaOnline:', error);
      throw error;
    }
  }
}
