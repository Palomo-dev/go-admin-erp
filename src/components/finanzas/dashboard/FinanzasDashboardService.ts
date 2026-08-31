import { supabase } from '@/lib/supabase/config';
import { parseLocalDate } from '@/utils/Utils';

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
  /** Granularidad de agrupación: 'dia' (rangos ≤31d) o 'mes' (rangos mayores) */
  granularidad?: 'dia' | 'mes';
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

// ─── Tipos de filas de Supabase (evitan `any` en callbacks) ──────────────────

interface InvoiceSaleRow {
  customer_id: string;
  total: number | string | null;
  customers?: { id: string; full_name: string | null } | null;
}

interface InvoicePurchaseRow {
  supplier_id: string;
  total: number | string | null;
  suppliers?: { id: string; name: string | null } | null;
}

interface InvoiceDateRow {
  issue_date: string | null;
  total: number | string | null;
}

interface AccountsReceivableAgingRow {
  balance: number | string | null;
  due_date: string | null;
}

interface ArInstallmentRow {
  amount: number | string | null;
}

interface ApInstallmentRow {
  amount: number | string | null;
}

interface FacturaPorVencerRow {
  id: string;
  invoice_id: string | null;
  due_date: string | null;
  balance: number | string | null;
  customers?: { full_name: string | null } | null;
}

interface InvoiceSequenceRow {
  id: string;
  prefix: string;
  current_number: number;
  max_number: number;
  resolution_end_date: string;
}

class FinanzasDashboardService {
  
  async getKPIs(organizationId: number, filters: DashboardFilters): Promise<KPIData> {
    const { fechaInicio, fechaFin } = filters;
    // fechaFin viene como 'YYYY-MM-DD'. Usar lt con el día siguiente para
    // incluir todo el día fechaFin (hasta 23:59:59), ya que los campos
    // sale_date/issue_date son timestamptz y comparar con lte('2026-08-28')
    // excluye todo lo posterior a las 00:00:00 UTC del 28.
    const fechaFinNextDay = new Date(fechaFin + 'T00:00:00Z');
    fechaFinNextDay.setUTCDate(fechaFinNextDay.getUTCDate() + 1);
    const fechaFinExclusive = fechaFinNextDay.toISOString();

    // Ingresos (facturas de venta pagadas)
    // Excluir facturas que ya tienen sale_id (se generaron desde una venta
    // POS que ya se suma más abajo) para evitar doble conteo.
    const { data: ventasData } = await supabase
      .from('invoice_sales')
      .select('total')
      .eq('organization_id', organizationId)
      .gte('issue_date', fechaInicio)
      .lt('issue_date', fechaFinExclusive)
      .in('status', ['paid', 'partial'])
      .is('sale_id', null);

    const ingresosFacturas = ventasData?.reduce((sum, v) => sum + (Number(v.total) || 0), 0) || 0;

    // Ingresos POS (sales pagadas)
    const { data: salesData } = await supabase
      .from('sales')
      .select('total')
      .eq('organization_id', organizationId)
      .gte('sale_date', fechaInicio)
      .lt('sale_date', fechaFinExclusive)
      .eq('payment_status', 'paid');

    const ingresosPOS = salesData?.reduce((sum, s) => sum + (Number(s.total) || 0), 0) || 0;

    // Ingresos pedidos online (web_orders pagadas, sin sale_id para no duplicar)
    const { data: webOrdersData } = await supabase
      .from('web_orders')
      .select('total')
      .eq('organization_id', organizationId)
      .gte('created_at', fechaInicio)
      .lt('created_at', fechaFinExclusive)
      .eq('payment_status', 'paid')
      .is('sale_id', null);

    const ingresosWeb = webOrdersData?.reduce((sum, w) => sum + (Number(w.total) || 0), 0) || 0;

    const ingresos = ingresosFacturas + ingresosPOS + ingresosWeb;

    // Egresos (facturas de compra pagadas)
    const { data: comprasData } = await supabase
      .from('invoice_purchase')
      .select('total')
      .eq('organization_id', organizationId)
      .gte('issue_date', fechaInicio)
      .lt('issue_date', fechaFinExclusive)
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
    
    // Caja (sesiones de caja abiertas: initial_amount + movimientos in - movimientos out)
    const { data: cajaData } = await supabase
      .from('cash_sessions')
      .select('id, initial_amount')
      .eq('organization_id', organizationId)
      .eq('status', 'open');

    let caja = 0;
    if (cajaData && cajaData.length > 0) {
      const sessionIds = cajaData.map((s) => s.id);
      const { data: movimientosData } = await supabase
        .from('cash_movements')
        .select('cash_session_id, type, amount')
        .in('cash_session_id', sessionIds);

      const movimientosPorSesion = new Map<number, number>();
      for (const m of movimientosData || []) {
        const actual = movimientosPorSesion.get(m.cash_session_id) || 0;
        const delta = m.type === 'in' ? Number(m.amount) || 0 : -(Number(m.amount) || 0);
        movimientosPorSesion.set(m.cash_session_id, actual + delta);
      }

      caja = cajaData.reduce(
        (sum, s) => sum + (Number(s.initial_amount) || 0) + (movimientosPorSesion.get(s.id) || 0),
        0,
      );
    }

    // Bancos
    const { data: bancosData } = await supabase
      .from('bank_accounts')
      .select('balance')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    const bancos = bancosData?.reduce((sum, b) => sum + (Number(b.balance) || 0), 0) || 0;
    
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
        customers!inner(id, full_name)
      `)
      .eq('organization_id', organizationId)
      .gte('issue_date', fechaInicio)
      .lte('issue_date', fechaFin);
    
    if (!data) return [];
    
    // Agrupar por cliente
    const clienteMap = new Map<string, { nombre: string; monto: number }>();
    
    (data as unknown as InvoiceSaleRow[]).forEach((item: InvoiceSaleRow) => {
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
      .gte('issue_date', fechaInicio)
      .lte('issue_date', fechaFin);
    
    if (!data) return [];
    
    // Agrupar por proveedor
    const proveedorMap = new Map<string, { nombre: string; monto: number }>();
    
    (data as unknown as InvoicePurchaseRow[]).forEach((item: InvoicePurchaseRow) => {
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

    // Determinar granularidad: si el rango es ≤31 días → agrupar por día,
    // si es mayor → agrupar por mes (comportamiento original).
    const diasRango = Math.ceil(
      (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;
    const granularidad: 'dia' | 'mes' = diasRango <= 31 ? 'dia' : 'mes';
    // Clave de agrupación: 'YYYY-MM-DD' (día) o 'YYYY-MM' (mes)
    const groupKey = (raw: string | null) => (raw ?? '').substring(0, granularidad === 'dia' ? 10 : 7);

    // fechaFinExclusive: día siguiente a fechaFin para usar lt (incluye todo el día fechaFin)
    const fechaFinNextDay = new Date(fechaFin + 'T00:00:00Z');
    fechaFinNextDay.setUTCDate(fechaFinNextDay.getUTCDate() + 1);
    const fechaFinExclusive = fechaFinNextDay.toISOString();

    // Ventas: alineado con getKPIs — 3 fuentes para evitar doble conteo:
    // 1. invoice_sales pagadas/parciales sin sale_id (facturas independientes del POS)
    // 2. sales pagadas (ventas POS)
    // 3. web_orders pagadas sin sale_id (pedidos web no vinculados a una sale)
    const [ventasFacturasRes, ventasPosRes, ventasWebRes] = await Promise.all([
      supabase
        .from('invoice_sales')
        .select('issue_date, total')
        .eq('organization_id', organizationId)
        .gte('issue_date', fechaInicio)
        .lt('issue_date', fechaFinExclusive)
        .in('status', ['paid', 'partial'])
        .is('sale_id', null),
      supabase
        .from('sales')
        .select('sale_date, total')
        .eq('organization_id', organizationId)
        .gte('sale_date', fechaInicio)
        .lt('sale_date', fechaFinExclusive)
        .eq('payment_status', 'paid'),
      supabase
        .from('web_orders')
        .select('created_at, total')
        .eq('organization_id', organizationId)
        .gte('created_at', fechaInicio)
        .lt('created_at', fechaFinExclusive)
        .eq('payment_status', 'paid')
        .is('sale_id', null),
    ]);

    // Compras: facturas de compra pagadas/parciales (alineado con getKPIs)
    const { data: comprasData } = await supabase
      .from('invoice_purchase')
      .select('issue_date, total')
      .eq('organization_id', organizationId)
      .gte('issue_date', fechaInicio)
      .lt('issue_date', fechaFinExclusive)
      .in('status', ['paid', 'partial']);

    // Agrupar por día o mes según la granularidad
    const bucketMap = new Map<string, { ventas: number; compras: number }>();

    const addVenta = (raw: string | null, total: number | string | null) => {
      const key = groupKey(raw);
      if (!key) return;
      if (!bucketMap.has(key)) bucketMap.set(key, { ventas: 0, compras: 0 });
      bucketMap.get(key)!.ventas += Number(total) || 0;
    };

    (ventasFacturasRes.data || []).forEach((v: InvoiceDateRow) => addVenta(v.issue_date, v.total));
    (ventasPosRes.data || []).forEach((v: { sale_date: string | null; total: number | string | null }) => addVenta(v.sale_date, v.total));
    (ventasWebRes.data || []).forEach((v: { created_at: string | null; total: number | string | null }) => addVenta(v.created_at, v.total));

    comprasData?.forEach((c: InvoiceDateRow) => {
      const key = groupKey(c.issue_date);
      if (!key) return;
      if (!bucketMap.has(key)) bucketMap.set(key, { ventas: 0, compras: 0 });
      bucketMap.get(key)!.compras += Number(c.total) || 0;
    });

    // Si la granularidad es diaria, rellenar TODOS los días del rango
    // (incluso los que no tienen datos) para mostrar el mes completo
    // progresando día a día, como un calendario.
    if (granularidad === 'dia') {
      const inicio = new Date(fechaInicio + 'T00:00:00');
      const fin = new Date(fechaFin + 'T00:00:00');
      for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().substring(0, 10);
        if (!bucketMap.has(key)) bucketMap.set(key, { ventas: 0, compras: 0 });
      }
    }

    return Array.from(bucketMap.entries())
      .map(([fecha, { ventas, compras }]) => ({ fecha, ventas, compras, granularidad }))
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
    
    data.forEach((item: AccountsReceivableAgingRow) => {
      if (!item.due_date) return;
      const dueDate = parseLocalDate(item.due_date);
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

    // ─── Base histórica: promedio de los últimos 3 meses ───────────────────
    // Si no hay cuotas pendientes (ar_installments/ap_installments),
    // usamos el promedio histórico como proyección base.
    const hace3Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);
    const fechaInicioHist = hace3Meses.toISOString().split('T')[0];
    const fechaFinHist = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().split('T')[0];

    const [ventasHistRes, comprasHistRes] = await Promise.all([
      supabase
        .from('invoice_sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('issue_date', fechaInicioHist)
        .lte('issue_date', fechaFinHist)
        .in('status', ['paid', 'partial']),
      supabase
        .from('invoice_purchase')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('issue_date', fechaInicioHist)
        .lte('issue_date', fechaFinHist)
        .in('status', ['paid', 'partial']),
    ]);

    const ventasHistTotal = ventasHistRes.data?.reduce((sum, v) => sum + (Number(v.total) || 0), 0) || 0;
    const comprasHistTotal = comprasHistRes.data?.reduce((sum, c) => sum + (Number(c.total) || 0), 0) || 0;
    const promedioMensualIngresos = ventasHistTotal / 3;
    const promedioMensualEgresos = comprasHistTotal / 3;

    for (let i = 0; i < 6; i++) {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      const mesInicio = fecha.toISOString().split('T')[0];
      const mesFin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).toISOString().split('T')[0];

      // Ingresos proyectados (cuotas CxC pendientes)
      const { data: ingresosData } = await supabase
        .from('ar_installments')
        .select('amount, accounts_receivable!inner(organization_id)')
        .eq('accounts_receivable.organization_id', organizationId)
        .gte('due_date', mesInicio)
        .lte('due_date', mesFin)
        .eq('status', 'pending');

      let ingresos = ingresosData?.reduce((sum, inst: ArInstallmentRow) => sum + (Number(inst.amount) || 0), 0) || 0;

      // Egresos proyectados (cuotas CxP pendientes)
      const { data: egresosData } = await supabase
        .from('ap_installments')
        .select('amount, accounts_payable!inner(organization_id)')
        .eq('accounts_payable.organization_id', organizationId)
        .gte('due_date', mesInicio)
        .lte('due_date', mesFin)
        .eq('status', 'pending');

      let egresos = egresosData?.reduce((sum, inst: ApInstallmentRow) => sum + (Number(inst.amount) || 0), 0) || 0;

      // Fallback: si no hay cuotas pendientes, usar promedio histórico
      // (solo para el primer mes; los siguientes meses se ajustan con una
      // ligera tendencia basada en el promedio)
      if (ingresos === 0 && promedioMensualIngresos > 0) {
        ingresos = promedioMensualIngresos;
      }
      if (egresos === 0 && promedioMensualEgresos > 0) {
        egresos = promedioMensualEgresos;
      }

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
      .select('id, invoice_id, due_date, balance, customers(full_name)')
      .eq('organization_id', organizationId)
      .gte('due_date', hoyStr)
      .lte('due_date', en7Dias)
      .gt('balance', 0)
      .limit(5);
    
    (facturasPorVencer as unknown as FacturaPorVencerRow[])?.forEach((f: FacturaPorVencerRow) => {
      if (!f.due_date) return;
      alertas.push({
        id: `factura-${f.id}`,
        tipo: 'factura_vencer',
        titulo: 'Factura por vencer',
        descripcion: `${f.customers?.full_name || 'Cliente'} - Vence: ${parseLocalDate(f.due_date).toLocaleDateString('es-CO')}`,
        prioridad: 'media',
        fecha: f.due_date ?? undefined,
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
    
    secuencias?.forEach((seq: InvoiceSequenceRow) => {
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
    
    // Saldo bajo en bancos (sin minimum_balance en schema — omitir alerta)
    // bank_accounts tiene: name, balance, is_active (no minimum_balance)
    // TODO: si se agrega minimum_balance en el futuro, restaurar esta alerta
    
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
