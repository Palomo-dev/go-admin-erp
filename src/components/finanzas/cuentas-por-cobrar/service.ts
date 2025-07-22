import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { CuentaPorCobrar, FiltrosCuentasPorCobrar, AgingBucket, Recordatorio, Abono, EstadisticasCxC, ResultadoPaginado } from './types';

export class CuentasPorCobrarService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org.id;
  }

  // Obtener cuentas por cobrar con paginación
  static async obtenerCuentasPorCobrarPaginadas(filtros: FiltrosCuentasPorCobrar): Promise<ResultadoPaginado<CuentaPorCobrar>> {
    const organizationId = this.getOrganizationId();

    try {
      const { data, error } = await supabase
        .rpc('get_accounts_receivable_paginated', {
          org_id: organizationId,
          search_term: filtros.busqueda || null,
          status_filter: filtros.estado,
          aging_filter: filtros.aging,
          customer_id_filter: filtros.cliente || null,
          date_from: filtros.fechaDesde || null,
          date_to: filtros.fechaHasta || null,
          page_size: filtros.pageSize,
          page_number: filtros.pageNumber
        });

      if (error) {
        console.error('Error al obtener cuentas por cobrar paginadas:', error);
        throw error;
      }

      const result = data as any;
      
      return {
        data: result.data.map((item: any) => ({
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
          customer_name: item.customer_name || '',
          customer_email: item.customer_email || '',
          customer_phone: item.customer_phone || ''
        })),
        total_count: result.total_count,
        page_size: result.page_size,
        page_number: result.page_number,
        total_pages: result.total_pages
      };
    } catch (error) {
      console.error('Error al obtener cuentas por cobrar paginadas:', error);
      throw error;
    }
  }

  // Obtener todas las cuentas por cobrar con filtros (método original, mantenido para compatibilidad)
  static async obtenerCuentasPorCobrar(filtros: FiltrosCuentasPorCobrar): Promise<CuentaPorCobrar[]> {
    const organizationId = this.getOrganizationId();

    
    try {
      // Usar función RPC para bypassear RLS
      const { data, error } = await supabase
        .rpc('get_accounts_receivable_with_customers', {
          org_id: organizationId
        });

      if (error) {
        console.error('Error al obtener cuentas por cobrar:', error);
        throw error;
      }

      // Aplicar filtros en el cliente
      let filteredData = data || [];

      // Filtrar por búsqueda
      if (filtros.busqueda) {
        const searchTerm = filtros.busqueda.toLowerCase();
        filteredData = filteredData.filter((item: any) => 
          item.customer_name?.toLowerCase().includes(searchTerm) ||
          item.customer_email?.toLowerCase().includes(searchTerm) ||
          item.customer_phone?.toLowerCase().includes(searchTerm)
        );
      }

      // Filtrar por estado
      if (filtros.estado !== 'todos') {
        filteredData = filteredData.filter((item: any) => item.status === filtros.estado);
      }

      // Filtrar por aging
      if (filtros.aging !== 'todos') {
        const today = new Date();
        filteredData = filteredData.filter((item: any) => {
          const dueDate = new Date(item.due_date);
          const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          
          switch (filtros.aging) {
            case '0-30':
              return daysDiff >= 0 && daysDiff <= 30;
            case '31-60':
              return daysDiff > 30 && daysDiff <= 60;
            case '61-90':
              return daysDiff > 60 && daysDiff <= 90;
            case '90+':
              return daysDiff > 90;
            default:
              return true;
          }
        });
      }

      // Filtrar por cliente
      if (filtros.cliente) {
        filteredData = filteredData.filter((item: any) => item.customer_id === filtros.cliente);
      }

      // Filtrar por fechas
      if (filtros.fechaDesde) {
        filteredData = filteredData.filter((item: any) => 
          new Date(item.created_at) >= new Date(filtros.fechaDesde!)
        );
      }

      if (filtros.fechaHasta) {
        filteredData = filteredData.filter((item: any) => 
          new Date(item.created_at) <= new Date(filtros.fechaHasta!)
        );
      }

      return filteredData.map((item: any) => ({
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
      }));
    } catch (error) {
      console.error('Error en obtenerCuentasPorCobrar:', error);
      throw error;
    }
  }

  // Obtener reporte de aging usando RPC como las demás funciones
  static async obtenerReporteAging(): Promise<AgingBucket[]> {
    const organizationId = this.getOrganizationId();

    try {
      // Usar función RPC para bypassear RLS, igual que las otras funciones
      const { data, error } = await supabase
        .rpc('get_accounts_receivable_paginated', {
          org_id: organizationId,
          search_term: null,
          status_filter: 'todos', // Obtener todos para procesar aging
          aging_filter: 'todos',
          customer_id_filter: null,
          date_from: null,
          date_to: null,
          page_size: 1000, // Número grande para obtener todos los registros
          page_number: 1
        });

      if (error) {
        console.error('Error al obtener datos para aging con RPC:', error);
        throw error;
      }

      const result = data as any;
      const cuentas = result.data || [];

      // Procesar los datos para crear buckets de aging
      const customerMap = new Map<string, AgingBucket>();
      const today = new Date();

      cuentas.forEach((item: any) => {
        const customerId = item.customer_id;
        const balance = parseFloat(item.balance || 0);
        
        // Solo procesar cuentas con saldo pendiente
        if (balance <= 0) return;
        
        const dueDate = new Date(item.due_date);
        const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer_id: customerId,
            customer_name: item.customer_name || 'N/A',
            customer_email: item.customer_email || '',
            customer_phone: item.customer_phone || '',
            current: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_90_plus: 0,
            total: 0,
          });
        }

        const bucket = customerMap.get(customerId)!;
        bucket.total += balance;

        // Clasificar por aging
        if (daysDiff <= 30) {
          bucket.current += balance;
        } else if (daysDiff <= 60) {
          bucket.days_31_60 += balance;
        } else if (daysDiff <= 90) {
          bucket.days_61_90 += balance;
        } else {
          bucket.days_90_plus += balance;
        }
      });

      return Array.from(customerMap.values());
    } catch (error) {
      console.error('Error al obtener reporte de aging:', error);
      throw error;
    }
  }

  // Obtener cuentas que necesitan recordatorios
  static async obtenerCuentasParaRecordatorio(): Promise<Recordatorio[]> {
    const organizationId = this.getOrganizationId();
    const today = new Date();
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    
    const { data, error } = await supabase
      .from('accounts_receivable')
      .select(`
        *,
        customers!inner(
          full_name,
          email,
          phone
        )
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'overdue')
      .gt('balance', 0)
      .or(`last_reminder_date.is.null,last_reminder_date.lte.${threeDaysAgo.toISOString()}`);

    if (error) {
      console.error('Error al obtener cuentas para recordatorio:', error);
      throw error;
    }

    return data?.map((item: any) => ({
      id: item.id,
      customer_id: item.customer_id,
      customer_name: item.customers?.full_name || 'N/A',
      customer_email: item.customers?.email || '',
      amount: parseFloat(item.amount),
      due_date: item.due_date,
      days_overdue: item.days_overdue,
      last_reminder_date: item.last_reminder_date,
      next_reminder_date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    })) || [];
  }

  // Aplicar abono a una cuenta por cobrar
  static async aplicarAbono(accountId: string, abono: Omit<Abono, 'id' | 'account_receivable_id'>): Promise<void> {
    const organizationId = this.getOrganizationId();
    
    // Usar RPC para obtener la cuenta y evitar problemas de RLS
    const { data: accountData, error: accountError } = await supabase
      .rpc('get_account_receivable_detail', {
        account_id: accountId,
        org_id: organizationId
      });

    if (accountError || !accountData || accountData.length === 0) {
      console.error('Error al obtener cuenta por cobrar:', accountError);
      throw new Error('No se pudo encontrar la cuenta por cobrar o no tiene permisos para acceder a ella');
    }

    const account = accountData[0];

    const currentBalance = parseFloat(account.balance);
    const abonoAmount = parseFloat(abono.amount.toString());
    const newBalance = currentBalance - abonoAmount;

    // Obtener branch_id y usuario actual desde el contexto del usuario
    const currentBranchId = getCurrentBranchId();
    const currentUserId = await getCurrentUserId();
    
    // Crear el registro de pago
    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        organization_id: organizationId,
        branch_id: currentBranchId,
        source: 'account_receivable',
        source_id: accountId,
        method: abono.payment_method,
        amount: abonoAmount,
        currency: 'COP',
        reference: abono.reference,
        status: 'completed',
        created_by: currentUserId,
        created_at: abono.payment_date,
      });

    if (paymentError) {
      console.error('Error al crear pago:', paymentError);
      throw paymentError;
    }

    // El trigger update_accounts_receivable_on_payment se encarga automáticamente
    // de actualizar el balance y estado de la cuenta por cobrar
  }

  // Actualizar fecha de recordatorio
  static async actualizarFechaRecordatorio(accountId: string): Promise<void> {
    const organizationId = this.getOrganizationId();
    
    const { error } = await supabase
      .from('accounts_receivable')
      .update({
        last_reminder_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error al actualizar fecha de recordatorio:', error);
      throw error;
    }
  }

  // Obtener estadísticas de cuentas por cobrar
  static async obtenerEstadisticas(): Promise<EstadisticasCxC> {
    const organizationId = this.getOrganizationId();
    
    const { data, error } = await supabase
      .from('accounts_receivable')
      .select('amount, balance, status, days_overdue')
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error al obtener estadísticas:', error);
      throw error;
    }

    const stats = data?.reduce((acc, item) => {
      const amount = parseFloat(item.amount);
      const balance = parseFloat(item.balance);
      
      acc.total_cuentas += 1;
      acc.total_amount += amount;
      acc.total_balance += balance;
      
      switch (item.status) {
        case 'current':
          acc.current_amount += balance;
          break;
        case 'overdue':
          acc.overdue_amount += balance;
          break;
        case 'paid':
          acc.paid_amount += amount;
          break;
        case 'partial':
          acc.partial_amount += balance;
          break;
      }
      
      if (item.days_overdue > 0) {
        acc.promedio_dias_cobro += item.days_overdue;
      }
      
      return acc;
    }, {
      total_cuentas: 0,
      total_amount: 0,
      total_balance: 0,
      current_amount: 0,
      overdue_amount: 0,
      paid_amount: 0,
      partial_amount: 0,
      promedio_dias_cobro: 0,
    });

    if (stats) {
      stats.promedio_dias_cobro = stats.total_cuentas > 0 ? stats.promedio_dias_cobro / stats.total_cuentas : 0;
    }

    return stats || {
      total_cuentas: 0,
      total_amount: 0,
      total_balance: 0,
      current_amount: 0,
      overdue_amount: 0,
      paid_amount: 0,
      partial_amount: 0,
      promedio_dias_cobro: 0,
    };
  }

  // Exportar datos a CSV
  static async exportarCSV(filtros: FiltrosCuentasPorCobrar): Promise<string> {
    const cuentas = await this.obtenerCuentasPorCobrar(filtros);
    
    const headers = [
      'ID',
      'Cliente',
      'Email',
      'Teléfono',
      'Monto',
      'Balance',
      'Fecha Vencimiento',
      'Estado',
      'Días Vencidos',
      'Último Recordatorio',
      'Fecha Creación'
    ];

    const csvContent = [
      headers.join(','),
      ...cuentas.map(cuenta => [
        cuenta.id,
        `"${cuenta.customer_name}"`,
        cuenta.customer_email,
        cuenta.customer_phone,
        cuenta.amount,
        cuenta.balance,
        cuenta.due_date,
        cuenta.status,
        cuenta.days_overdue,
        cuenta.last_reminder_date || 'N/A',
        cuenta.created_at
      ].join(','))
    ].join('\n');

    return csvContent;
  }

  // Función auxiliar para obtener balances usando RPC (más eficiente para múltiples clientes)
  static async obtenerBalancesClientes(customerIds: string[]): Promise<Array<{customer_id: string, balance: number, days_overdue: number, status: string, due_date: string}>> {
    const organizationId = this.getOrganizationId();
    
    if (customerIds.length === 0) return [];
    
    try {
      const { data, error } = await supabase
        .rpc('get_accounts_receivable_for_customers', {
          customer_ids: customerIds,
          org_id: organizationId
        });

      if (error) {
        console.error('Error al obtener balances con RPC:', error);
        throw error;
      }

      return data?.map((item: any) => ({
        customer_id: item.customer_id,
        balance: parseFloat(item.balance || 0),
        days_overdue: item.days_overdue || 0,
        status: item.status,
        due_date: item.due_date,
      })) || [];
    } catch (error) {
      console.error('Error en obtenerBalancesClientes:', error);
      return [];
    }
  }

  // Función optimizada para obtener estadísticas usando RPC cuando es posible
  static async obtenerEstadisticasOptimizadas(): Promise<EstadisticasCxC> {
    const organizationId = this.getOrganizationId();

    
    try {
      // Usar función RPC para bypassear RLS
      const { data, error } = await supabase
        .rpc('get_accounts_receivable_stats', {
          org_id: organizationId
        });

      if (error) {
        console.error('Error al obtener estadísticas:', error);
        // Fallback a la función original
        return this.obtenerEstadisticas();
      }

      // Los datos ya vienen calculados desde la función RPC
      const stats = data && data.length > 0 ? {
        total_cuentas: parseInt(data[0].total_cuentas || 0),
        total_amount: parseFloat(data[0].total_amount || 0),
        total_balance: parseFloat(data[0].total_balance || 0),
        current_amount: parseFloat(data[0].current_amount || 0),
        overdue_amount: parseFloat(data[0].overdue_amount || 0),
        paid_amount: parseFloat(data[0].paid_amount || 0),
        partial_amount: parseFloat(data[0].partial_amount || 0),
        promedio_dias_cobro: parseFloat(data[0].promedio_dias_cobro || 0),
      } : null;

      return stats || {
        total_cuentas: 0,
        total_amount: 0,
        total_balance: 0,
        current_amount: 0,
        overdue_amount: 0,
        paid_amount: 0,
        partial_amount: 0,
        promedio_dias_cobro: 0,
      };
    } catch (error) {
      console.error('Error en obtenerEstadisticasOptimizadas:', error);
      // Fallback a la función original
      return this.obtenerEstadisticas();
    }
  }
}
