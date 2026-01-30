import { supabase } from '@/lib/supabase/config';

export interface KPIData {
  ingresos: number;
  egresos: number;
  utilidadBruta: number;
  carteraVencida: number;
  caja: number;
  bancos: number;
  cuentasPorCobrar: number;
  cuentasPorPagar: number;
}

export interface TopClienteProveedor {
  id: string;
  nombre: string;
  monto: number;
  tipo: 'cliente' | 'proveedor';
}

export interface VentasComprasData {
  fecha: string;
  ventas: number;
  compras: number;
}

export interface AgingData {
  rango: string;
  monto: number;
  porcentaje: number;
}

export interface FlujoProyectado {
  mes: string;
  ingresos: number;
  egresos: number;
  saldo: number;
}

export interface Alerta {
  id: string;
  tipo: 'factura_vencer' | 'resolucion_dian' | 'conciliacion' | 'cartera_vencida' | 'saldo_bajo';
  titulo: string;
  descripcion: string;
  prioridad: 'alta' | 'media' | 'baja';
  fecha?: string;
  enlace?: string;
}

export interface DashboardFilters {
  fechaInicio: string;
  fechaFin: string;
  sucursalId?: number;
}

class FinanzasDashboardService {
  
  async getKPIs(organizationId: number, filters: DashboardFilters): Promise<KPIData> {
    const { fechaInicio, fechaFin } = filters;
    
    // Ingresos (facturas de venta pagadas)
    const { data: ventasData } = await supabase
      .from('invoice_sales')
      .select('total')
      .eq('organization_id', organizationId)
      .gte('invoice_date', fechaInicio)
      .lte('invoice_date', fechaFin)
      .in('status', ['paid', 'partial']);
    
    const ingresos = ventasData?.reduce((sum, v) => sum + (Number(v.total) || 0), 0) || 0;
    
    // Egresos (facturas de compra pagadas)
    const { data: comprasData } = await supabase
      .from('invoice_purchase')
      .select('total')
      .eq('organization_id', organizationId)
      .gte('invoice_date', fechaInicio)
      .lte('invoice_date', fechaFin)
      .in('status', ['paid', 'partial']);
    
    const egresos = comprasData?.reduce((sum, c) => sum + (Number(c.total) || 0), 0) || 0;
    
    // Cartera vencida (CxC vencidas)
    const hoy = new Date().toISOString().split('T')[0];
    const { data: carteraVencidaData } = await supabase
      .from('accounts_receivable')
      .select('balance')
      .eq('organization_id', organizationId)
      .lt('due_date', hoy)
      .gt('balance', 0);
    
    const carteraVencida = carteraVencidaData?.reduce((sum, c) => sum + (Number(c.balance) || 0), 0) || 0;
    
    // Caja (sesiones de caja activas)
    const { data: cajaData } = await supabase
      .from('cash_sessions')
      .select('current_balance')
      .eq('organization_id', organizationId)
      .eq('status', 'open');
    
    const caja = cajaData?.reduce((sum, c) => sum + (Number(c.current_balance) || 0), 0) || 0;
    
    // Bancos
    const { data: bancosData } = await supabase
      .from('bank_accounts')
      .select('current_balance')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    const bancos = bancosData?.reduce((sum, b) => sum + (Number(b.current_balance) || 0), 0) || 0;
    
    // Cuentas por cobrar total
    const { data: cxcData } = await supabase
      .from('accounts_receivable')
      .select('balance')
      .eq('organization_id', organizationId)
      .gt('balance', 0);
    
    const cuentasPorCobrar = cxcData?.reduce((sum, c) => sum + (Number(c.balance) || 0), 0) || 0;
    
    // Cuentas por pagar total
    const { data: cxpData } = await supabase
      .from('accounts_payable')
      .select('balance')
      .eq('organization_id', organizationId)
      .gt('balance', 0);
    
    const cuentasPorPagar = cxpData?.reduce((sum, c) => sum + (Number(c.balance) || 0), 0) || 0;
    
    return {
      ingresos,
      egresos,
      utilidadBruta: ingresos - egresos,
      carteraVencida,
      caja,
      bancos,
      cuentasPorCobrar,
      cuentasPorPagar
    };
  }
  
  async getTopClientes(organizationId: number, filters: DashboardFilters, limit: number = 5): Promise<TopClienteProveedor[]> {
    const { fechaInicio, fechaFin } = filters;
    
    const { data } = await supabase
      .from('invoice_sales')
      .select(`
        customer_id,
        total,
        customers!inner(id, name)
      `)
      .eq('organization_id', organizationId)
      .gte('invoice_date', fechaInicio)
      .lte('invoice_date', fechaFin);
    
    if (!data) return [];
    
    // Agrupar por cliente
    const clienteMap = new Map<string, { nombre: string; monto: number }>();
    
    data.forEach((item: any) => {
      const customerId = item.customer_id;
      const customerName = item.customers?.full_name || 'Sin nombre';
      const total = Number(item.total) || 0;
      
      if (clienteMap.has(customerId)) {
        clienteMap.get(customerId)!.monto += total;
      } else {
        clienteMap.set(customerId, { nombre: customerName, monto: total });
      }
    });
    
    return Array.from(clienteMap.entries())
      .map(([id, { nombre, monto }]) => ({
        id,
        nombre,
        monto,
        tipo: 'cliente' as const
      }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, limit);
  }
  
  async getTopProveedores(organizationId: number, filters: DashboardFilters, limit: number = 5): Promise<TopClienteProveedor[]> {
    const { fechaInicio, fechaFin } = filters;
    
    const { data } = await supabase
      .from('invoice_purchase')
      .select(`
        supplier_id,
        total,
        suppliers!inner(id, name)
      `)
      .eq('organization_id', organizationId)
      .gte('invoice_date', fechaInicio)
      .lte('invoice_date', fechaFin);
    
    if (!data) return [];
    
    // Agrupar por proveedor
    const proveedorMap = new Map<string, { nombre: string; monto: number }>();
    
    data.forEach((item: any) => {
      const supplierId = item.supplier_id;
      const supplierName = item.suppliers?.name || 'Sin nombre';
      const total = Number(item.total) || 0;
      
      if (proveedorMap.has(supplierId)) {
        proveedorMap.get(supplierId)!.monto += total;
      } else {
        proveedorMap.set(supplierId, { nombre: supplierName, monto: total });
      }
    });
    
    return Array.from(proveedorMap.entries())
      .map(([id, { nombre, monto }]) => ({
        id,
        nombre,
        monto,
        tipo: 'proveedor' as const
      }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, limit);
  }
  
  async getVentasVsCompras(organizationId: number, filters: DashboardFilters): Promise<VentasComprasData[]> {
    const { fechaInicio, fechaFin } = filters;
    
    // Obtener ventas agrupadas por mes
    const { data: ventasData } = await supabase
      .from('invoice_sales')
      .select('invoice_date, total')
      .eq('organization_id', organizationId)
      .gte('invoice_date', fechaInicio)
      .lte('invoice_date', fechaFin);
    
    // Obtener compras agrupadas por mes
    const { data: comprasData } = await supabase
      .from('invoice_purchase')
      .select('invoice_date, total')
      .eq('organization_id', organizationId)
      .gte('invoice_date', fechaInicio)
      .lte('invoice_date', fechaFin);
    
    // Agrupar por mes
    const mesMap = new Map<string, { ventas: number; compras: number }>();
    
    ventasData?.forEach((v: any) => {
      const mes = v.invoice_date?.substring(0, 7) || '';
      if (!mesMap.has(mes)) {
        mesMap.set(mes, { ventas: 0, compras: 0 });
      }
      mesMap.get(mes)!.ventas += Number(v.total) || 0;
    });
    
    comprasData?.forEach((c: any) => {
      const mes = c.invoice_date?.substring(0, 7) || '';
      if (!mesMap.has(mes)) {
        mesMap.set(mes, { ventas: 0, compras: 0 });
      }
      mesMap.get(mes)!.compras += Number(c.total) || 0;
    });
    
    return Array.from(mesMap.entries())
      .map(([fecha, { ventas, compras }]) => ({ fecha, ventas, compras }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  
  async getAgingCuentasPorCobrar(organizationId: number): Promise<AgingData[]> {
    const hoy = new Date();
    
    const { data } = await supabase
      .from('accounts_receivable')
      .select('balance, due_date')
      .eq('organization_id', organizationId)
      .gt('balance', 0);
    
    if (!data) return [];
    
    const rangos = {
      'Vigente': 0,
      '1-30 días': 0,
      '31-60 días': 0,
      '61-90 días': 0,
      '+90 días': 0
    };
    
    data.forEach((item: any) => {
      const dueDate = new Date(item.due_date);
      const diasVencido = Math.floor((hoy.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balance = Number(item.balance) || 0;
      
      if (diasVencido <= 0) {
        rangos['Vigente'] += balance;
      } else if (diasVencido <= 30) {
        rangos['1-30 días'] += balance;
      } else if (diasVencido <= 60) {
        rangos['31-60 días'] += balance;
      } else if (diasVencido <= 90) {
        rangos['61-90 días'] += balance;
      } else {
        rangos['+90 días'] += balance;
      }
    });
    
    const total = Object.values(rangos).reduce((sum, val) => sum + val, 0);
    
    return Object.entries(rangos).map(([rango, monto]) => ({
      rango,
      monto,
      porcentaje: total > 0 ? (monto / total) * 100 : 0
    }));
  }
  
  async getFlujoProyectado(organizationId: number): Promise<FlujoProyectado[]> {
    const hoy = new Date();
    const result: FlujoProyectado[] = [];
    
    for (let i = 0; i < 6; i++) {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      const mesInicio = fecha.toISOString().split('T')[0];
      const mesFin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).toISOString().split('T')[0];
      
      // Ingresos proyectados (cuotas CxC)
      const { data: ingresosData } = await supabase
        .from('ar_installments')
        .select('amount, accounts_receivable!inner(organization_id)')
        .eq('accounts_receivable.organization_id', organizationId)
        .gte('due_date', mesInicio)
        .lte('due_date', mesFin)
        .eq('status', 'pending');
      
      const ingresos = ingresosData?.reduce((sum, i: any) => sum + (Number(i.amount) || 0), 0) || 0;
      
      // Egresos proyectados (cuotas CxP)
      const { data: egresosData } = await supabase
        .from('ap_installments')
        .select('amount, accounts_payable!inner(organization_id)')
        .eq('accounts_payable.organization_id', organizationId)
        .gte('due_date', mesInicio)
        .lte('due_date', mesFin)
        .eq('status', 'pending');
      
      const egresos = egresosData?.reduce((sum, e: any) => sum + (Number(e.amount) || 0), 0) || 0;
      
      const mesNombre = fecha.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
      
      result.push({
        mes: mesNombre,
        ingresos,
        egresos,
        saldo: ingresos - egresos
      });
    }
    
    return result;
  }
  
  async getAlertas(organizationId: number): Promise<Alerta[]> {
    const alertas: Alerta[] = [];
    const hoy = new Date();
    const en7Dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];
    
    // Facturas por vencer (próximos 7 días)
    const { data: facturasPorVencer } = await supabase
      .from('accounts_receivable')
      .select('id, invoice_id, due_date, balance, customers(name)')
      .eq('organization_id', organizationId)
      .gte('due_date', hoyStr)
      .lte('due_date', en7Dias)
      .gt('balance', 0)
      .limit(5);
    
    facturasPorVencer?.forEach((f: any) => {
      alertas.push({
        id: `factura-${f.id}`,
        tipo: 'factura_vencer',
        titulo: 'Factura por vencer',
        descripcion: `${f.customers?.full_name || 'Cliente'} - Vence: ${new Date(f.due_date).toLocaleDateString('es-CO')}`,
        prioridad: 'media',
        fecha: f.due_date,
        enlace: `/app/finanzas/cuentas-por-cobrar/${f.id}`
      });
    });
    
    // Cartera vencida (más de 30 días)
    const hace30Dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: carteraVencida, count: carteraCount } = await supabase
      .from('accounts_receivable')
      .select('id, balance', { count: 'exact' })
      .eq('organization_id', organizationId)
      .lt('due_date', hace30Dias)
      .gt('balance', 0);
    
    if (carteraCount && carteraCount > 0) {
      const totalVencido = carteraVencida?.reduce((sum, c) => sum + (Number(c.balance) || 0), 0) || 0;
      alertas.push({
        id: 'cartera-vencida',
        tipo: 'cartera_vencida',
        titulo: 'Cartera vencida (+30 días)',
        descripcion: `${carteraCount} facturas vencidas por $${totalVencido.toLocaleString('es-CO')}`,
        prioridad: 'alta',
        enlace: '/app/finanzas/cuentas-por-cobrar?filter=vencidas'
      });
    }
    
    // Resolución DIAN por agotarse
    const { data: secuencias } = await supabase
      .from('invoice_sequences')
      .select('id, prefix, current_number, max_number, resolution_end_date')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    secuencias?.forEach((seq: any) => {
      const porcentajeUsado = (seq.current_number / seq.max_number) * 100;
      const fechaVence = new Date(seq.resolution_end_date);
      const diasRestantes = Math.floor((fechaVence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      
      if (porcentajeUsado >= 80) {
        alertas.push({
          id: `resolucion-cantidad-${seq.id}`,
          tipo: 'resolucion_dian',
          titulo: `Resolución ${seq.prefix} casi agotada`,
          descripcion: `Usados ${seq.current_number} de ${seq.max_number} (${porcentajeUsado.toFixed(0)}%)`,
          prioridad: porcentajeUsado >= 95 ? 'alta' : 'media',
          enlace: '/app/finanzas/configuracion/secuencias'
        });
      }
      
      if (diasRestantes <= 30 && diasRestantes > 0) {
        alertas.push({
          id: `resolucion-fecha-${seq.id}`,
          tipo: 'resolucion_dian',
          titulo: `Resolución ${seq.prefix} por vencer`,
          descripcion: `Vence en ${diasRestantes} días (${fechaVence.toLocaleDateString('es-CO')})`,
          prioridad: diasRestantes <= 15 ? 'alta' : 'media',
          enlace: '/app/finanzas/configuracion/secuencias'
        });
      }
    });
    
    // Saldo bajo en bancos
    const { data: bancosData } = await supabase
      .from('bank_accounts')
      .select('id, account_name, current_balance, minimum_balance')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    bancosData?.forEach((banco: any) => {
      if (banco.minimum_balance && Number(banco.current_balance) < Number(banco.minimum_balance)) {
        alertas.push({
          id: `banco-${banco.id}`,
          tipo: 'saldo_bajo',
          titulo: 'Saldo bajo en cuenta',
          descripcion: `${banco.account_name}: $${Number(banco.current_balance).toLocaleString('es-CO')}`,
          prioridad: 'media',
          enlace: '/app/finanzas/bancos'
        });
      }
    });
    
    // Ordenar por prioridad
    const prioridadOrden = { alta: 0, media: 1, baja: 2 };
    return alertas.sort((a, b) => prioridadOrden[a.prioridad] - prioridadOrden[b.prioridad]);
  }
  
  async getResumenGeneral(organizationId: number, filters: DashboardFilters) {
    const [kpis, topClientes, topProveedores, ventasCompras, aging, flujo, alertas] = await Promise.all([
      this.getKPIs(organizationId, filters),
      this.getTopClientes(organizationId, filters),
      this.getTopProveedores(organizationId, filters),
      this.getVentasVsCompras(organizationId, filters),
      this.getAgingCuentasPorCobrar(organizationId),
      this.getFlujoProyectado(organizationId),
      this.getAlertas(organizationId)
    ]);
    
    return {
      kpis,
      topClientes,
      topProveedores,
      ventasCompras,
      aging,
      flujo,
      alertas
    };
  }
}

export const finanzasDashboardService = new FinanzasDashboardService();
export default finanzasDashboardService;
