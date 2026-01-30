'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface DateRange {
  from: string;
  to: string;
}

export interface PnLReport {
  ingresos: number;
  costos: number;
  gastosOperativos: number;
  utilidadBruta: number;
  utilidadNeta: number;
  margenBruto: number;
  margenNeto: number;
}

export interface CashFlowReport {
  saldoInicial: number;
  ingresos: number;
  egresos: number;
  saldoFinal: number;
  movimientosCaja: number;
  transaccionesBanco: number;
}

export interface CarteraReport {
  totalPorCobrar: number;
  totalPorPagar: number;
  carteraVencida: number;
  carteraVigente: number;
  clientesConDeuda: number;
  proveedoresConDeuda: number;
}

export interface TaxReport {
  ivaRecaudado: number;
  ivaPagado: number;
  reteFuente: number;
  reteICA: number;
  reteIVA: number;
  totalImpuestos: number;
}

export interface CashReport {
  sesionesAbiertas: number;
  totalEnCaja: number;
  movimientosHoy: number;
  ingresosCaja: number;
  egresosCaja: number;
  ultimoArqueo?: {
    fecha: string;
    diferencia: number;
  };
}

export interface BankReport {
  totalCuentas: number;
  saldoTotal: number;
  transaccionesDelMes: number;
  depositos: number;
  retiros: number;
  reconciliacionesPendientes: number;
}

export interface ReportSummary {
  pnl: PnLReport;
  cashFlow: CashFlowReport;
  cartera: CarteraReport;
  taxes: TaxReport;
  cash: CashReport;
  bank: BankReport;
}

class ReportesFinancierosService {
  /**
   * Obtener reporte de Pérdidas y Ganancias (P&G)
   */
  async getPnLReport(dateRange: DateRange): Promise<PnLReport> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return this.getEmptyPnL();
    }

    try {
      // Obtener ingresos (facturas de venta)
      const { data: ventas } = await supabase
        .from('invoice_sales')
        .select('total, subtotal, tax_total')
        .eq('organization_id', organizationId)
        .gte('issue_date', dateRange.from)
        .lte('issue_date', dateRange.to)
        .neq('status', 'voided');

      // Obtener costos (facturas de compra)
      const { data: compras } = await supabase
        .from('invoice_purchase')
        .select('total, subtotal, tax_total')
        .eq('organization_id', organizationId)
        .gte('issue_date', dateRange.from)
        .lte('issue_date', dateRange.to)
        .neq('status', 'voided');

      const ingresos = ventas?.reduce((sum, v) => sum + Number(v.total || 0), 0) || 0;
      const costos = compras?.reduce((sum, c) => sum + Number(c.total || 0), 0) || 0;
      const gastosOperativos = costos * 0.2; // Estimación simple
      const utilidadBruta = ingresos - costos;
      const utilidadNeta = utilidadBruta - gastosOperativos;

      return {
        ingresos,
        costos,
        gastosOperativos,
        utilidadBruta,
        utilidadNeta,
        margenBruto: ingresos > 0 ? (utilidadBruta / ingresos) * 100 : 0,
        margenNeto: ingresos > 0 ? (utilidadNeta / ingresos) * 100 : 0,
      };
    } catch (error) {
      console.error('Error getting PnL report:', error);
      return this.getEmptyPnL();
    }
  }

  /**
   * Obtener reporte de Flujo de Caja
   */
  async getCashFlowReport(dateRange: DateRange): Promise<CashFlowReport> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return this.getEmptyCashFlow();
    }

    try {
      // Movimientos de caja
      const { data: movimientos } = await supabase
        .from('cash_movements')
        .select('type, amount')
        .eq('organization_id', organizationId)
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);

      // Transacciones bancarias
      const { data: transacciones } = await supabase
        .from('bank_transactions')
        .select('amount, transaction_type')
        .eq('organization_id', organizationId)
        .gte('trans_date', dateRange.from)
        .lte('trans_date', dateRange.to);

      const ingresosCaja = movimientos?.filter(m => m.type === 'income').reduce((sum, m) => sum + Number(m.amount), 0) || 0;
      const egresosCaja = movimientos?.filter(m => m.type === 'expense').reduce((sum, m) => sum + Number(m.amount), 0) || 0;
      
      const depositosBanco = transacciones?.filter(t => Number(t.amount) > 0).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const retirosBanco = transacciones?.filter(t => Number(t.amount) < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) || 0;

      const ingresos = ingresosCaja + depositosBanco;
      const egresos = egresosCaja + retirosBanco;

      return {
        saldoInicial: 0,
        ingresos,
        egresos,
        saldoFinal: ingresos - egresos,
        movimientosCaja: movimientos?.length || 0,
        transaccionesBanco: transacciones?.length || 0,
      };
    } catch (error) {
      console.error('Error getting cash flow report:', error);
      return this.getEmptyCashFlow();
    }
  }

  /**
   * Obtener reporte de Cartera
   */
  async getCarteraReport(): Promise<CarteraReport> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return this.getEmptyCartera();
    }

    try {
      const today = new Date().toISOString();

      // Cuentas por cobrar
      const { data: cxc } = await supabase
        .from('accounts_receivable')
        .select('balance, due_date, customer_id')
        .eq('organization_id', organizationId)
        .gt('balance', 0);

      // Cuentas por pagar
      const { data: cxp } = await supabase
        .from('accounts_payable')
        .select('balance, due_date, supplier_id')
        .eq('organization_id', organizationId)
        .gt('balance', 0);

      const totalPorCobrar = cxc?.reduce((sum, c) => sum + Number(c.balance), 0) || 0;
      const totalPorPagar = cxp?.reduce((sum, c) => sum + Number(c.balance), 0) || 0;
      
      const carteraVencida = cxc?.filter(c => c.due_date && new Date(c.due_date) < new Date())
        .reduce((sum, c) => sum + Number(c.balance), 0) || 0;
      const carteraVigente = totalPorCobrar - carteraVencida;

      const clientesConDeuda = new Set(cxc?.map(c => c.customer_id)).size;
      const proveedoresConDeuda = new Set(cxp?.map(c => c.supplier_id)).size;

      return {
        totalPorCobrar,
        totalPorPagar,
        carteraVencida,
        carteraVigente,
        clientesConDeuda,
        proveedoresConDeuda,
      };
    } catch (error) {
      console.error('Error getting cartera report:', error);
      return this.getEmptyCartera();
    }
  }

  /**
   * Obtener reporte de Impuestos
   */
  async getTaxReport(dateRange: DateRange): Promise<TaxReport> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return this.getEmptyTax();
    }

    try {
      // IVA de ventas
      const { data: ventas } = await supabase
        .from('invoice_sales')
        .select('tax_total')
        .eq('organization_id', organizationId)
        .gte('issue_date', dateRange.from)
        .lte('issue_date', dateRange.to)
        .neq('status', 'voided');

      // IVA de compras
      const { data: compras } = await supabase
        .from('invoice_purchase')
        .select('tax_total')
        .eq('organization_id', organizationId)
        .gte('issue_date', dateRange.from)
        .lte('issue_date', dateRange.to)
        .neq('status', 'voided');

      const ivaRecaudado = ventas?.reduce((sum, v) => sum + Number(v.tax_total || 0), 0) || 0;
      const ivaPagado = compras?.reduce((sum, c) => sum + Number(c.tax_total || 0), 0) || 0;

      return {
        ivaRecaudado,
        ivaPagado,
        reteFuente: 0,
        reteICA: 0,
        reteIVA: 0,
        totalImpuestos: ivaRecaudado - ivaPagado,
      };
    } catch (error) {
      console.error('Error getting tax report:', error);
      return this.getEmptyTax();
    }
  }

  /**
   * Obtener reporte de Caja
   */
  async getCashReport(): Promise<CashReport> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return this.getEmptyCash();
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Sesiones abiertas
      const { data: sesiones } = await supabase
        .from('cash_sessions')
        .select('id, initial_amount, final_amount, status')
        .eq('organization_id', organizationId)
        .eq('status', 'open');

      // Movimientos de hoy
      const { data: movimientosHoy } = await supabase
        .from('cash_movements')
        .select('type, amount')
        .eq('organization_id', organizationId)
        .gte('created_at', today.toISOString());

      // Último arqueo
      const { data: arqueos } = await supabase
        .from('cash_counts')
        .select('created_at, difference')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1);

      const totalEnCaja = sesiones?.reduce((sum, s) => sum + Number(s.initial_amount || 0), 0) || 0;
      const ingresosCaja = movimientosHoy?.filter(m => m.type === 'income').reduce((sum, m) => sum + Number(m.amount), 0) || 0;
      const egresosCaja = movimientosHoy?.filter(m => m.type === 'expense').reduce((sum, m) => sum + Number(m.amount), 0) || 0;

      return {
        sesionesAbiertas: sesiones?.length || 0,
        totalEnCaja: totalEnCaja + ingresosCaja - egresosCaja,
        movimientosHoy: movimientosHoy?.length || 0,
        ingresosCaja,
        egresosCaja,
        ultimoArqueo: arqueos?.[0] ? {
          fecha: arqueos[0].created_at,
          diferencia: Number(arqueos[0].difference || 0),
        } : undefined,
      };
    } catch (error) {
      console.error('Error getting cash report:', error);
      return this.getEmptyCash();
    }
  }

  /**
   * Obtener reporte de Bancos
   */
  async getBankReport(dateRange: DateRange): Promise<BankReport> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return this.getEmptyBank();
    }

    try {
      // Cuentas bancarias
      const { data: cuentas } = await supabase
        .from('bank_accounts')
        .select('id, balance')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      // Transacciones del periodo
      const { data: transacciones } = await supabase
        .from('bank_transactions')
        .select('amount')
        .eq('organization_id', organizationId)
        .gte('trans_date', dateRange.from)
        .lte('trans_date', dateRange.to);

      // Reconciliaciones pendientes
      const { data: reconciliaciones } = await supabase
        .from('bank_reconciliations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'pending');

      const saldoTotal = cuentas?.reduce((sum, c) => sum + Number(c.balance || 0), 0) || 0;
      const depositos = transacciones?.filter(t => Number(t.amount) > 0).reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const retiros = transacciones?.filter(t => Number(t.amount) < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) || 0;

      return {
        totalCuentas: cuentas?.length || 0,
        saldoTotal,
        transaccionesDelMes: transacciones?.length || 0,
        depositos,
        retiros,
        reconciliacionesPendientes: reconciliaciones?.length || 0,
      };
    } catch (error) {
      console.error('Error getting bank report:', error);
      return this.getEmptyBank();
    }
  }

  /**
   * Obtener resumen completo de reportes
   */
  async getReportSummary(dateRange: DateRange): Promise<ReportSummary> {
    const [pnl, cashFlow, cartera, taxes, cash, bank] = await Promise.all([
      this.getPnLReport(dateRange),
      this.getCashFlowReport(dateRange),
      this.getCarteraReport(),
      this.getTaxReport(dateRange),
      this.getCashReport(),
      this.getBankReport(dateRange),
    ]);

    return { pnl, cashFlow, cartera, taxes, cash, bank };
  }

  // Métodos auxiliares para retornar objetos vacíos
  private getEmptyPnL(): PnLReport {
    return { ingresos: 0, costos: 0, gastosOperativos: 0, utilidadBruta: 0, utilidadNeta: 0, margenBruto: 0, margenNeto: 0 };
  }

  private getEmptyCashFlow(): CashFlowReport {
    return { saldoInicial: 0, ingresos: 0, egresos: 0, saldoFinal: 0, movimientosCaja: 0, transaccionesBanco: 0 };
  }

  private getEmptyCartera(): CarteraReport {
    return { totalPorCobrar: 0, totalPorPagar: 0, carteraVencida: 0, carteraVigente: 0, clientesConDeuda: 0, proveedoresConDeuda: 0 };
  }

  private getEmptyTax(): TaxReport {
    return { ivaRecaudado: 0, ivaPagado: 0, reteFuente: 0, reteICA: 0, reteIVA: 0, totalImpuestos: 0 };
  }

  private getEmptyCash(): CashReport {
    return { sesionesAbiertas: 0, totalEnCaja: 0, movimientosHoy: 0, ingresosCaja: 0, egresosCaja: 0 };
  }

  private getEmptyBank(): BankReport {
    return { totalCuentas: 0, saldoTotal: 0, transaccionesDelMes: 0, depositos: 0, retiros: 0, reconciliacionesPendientes: 0 };
  }
}

export const reportesFinancierosService = new ReportesFinancierosService();
