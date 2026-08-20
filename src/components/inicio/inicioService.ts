import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type PeriodoDashboard = 'hoy' | '7d' | '30d' | '90d' | 'año';

export interface DashboardKPIData {
  ventasHoy: number;
  ventasMes: number;
  clientesActivos: number;
  productosActivos: number;
  facturasHoy: number;
  empleadosActivos: number;
  reservasActivas: number;
  cuentasPorCobrar: number;
  // Deltas vs período anterior (opcional, solo si periodo != 'hoy')
  ventasAnterior?: number;
  facturasAnterior?: number;
  cuentasAnterior?: number;
}

export interface PuntoTendencia {
  fecha: string; // ISO date (YYYY-MM-DD)
  total: number;
}

export interface AlertaDashboard {
  id: string;
  severidad: 'alta' | 'media' | 'baja';
  modulo: string;
  titulo: string;
  descripcion: string;
  monto?: number;
  href: string;
  icono: string;
}

export interface ActividadReciente {
  id: string;
  tipo: 'venta' | 'factura' | 'cliente' | 'producto' | 'reserva' | 'stock';
  modulo: 'pos' | 'finance' | 'crm' | 'inventory' | 'pms_hotel';
  descripcion: string;
  monto?: number;
  fecha: string;
}

export interface OnboardingStep {
  id: string;
  titulo: string;
  descripcion: string;
  href: string;
  completado: boolean;
  icono: string;
}

export interface DashboardData {
  kpis: DashboardKPIData;
  actividad: ActividadReciente[];
  onboarding: OnboardingStep[];
  organizacionCreatedAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Devuelve [inicio, fin] del período actual y [inicioAnterior, finAnterior] del período anterior
function rangoPeriodo(periodo: PeriodoDashboard): {
  inicio: string;
  fin: string;
  inicioAnterior: string;
  finAnterior: string;
} {
  const ahora = new Date();
  const fin = ahora.toISOString();
  switch (periodo) {
    case 'hoy': {
      const inicio = startOfToday();
      const inicioAnterior = daysAgo(1);
      const finAnterior = startOfToday();
      return { inicio, fin, inicioAnterior, finAnterior };
    }
    case '7d': {
      const inicio = daysAgo(7);
      const inicioAnterior = daysAgo(14);
      const finAnterior = daysAgo(7);
      return { inicio, fin, inicioAnterior, finAnterior };
    }
    case '30d': {
      const inicio = daysAgo(30);
      const inicioAnterior = daysAgo(60);
      const finAnterior = daysAgo(30);
      return { inicio, fin, inicioAnterior, finAnterior };
    }
    case '90d': {
      const inicio = daysAgo(90);
      const inicioAnterior = daysAgo(180);
      const finAnterior = daysAgo(90);
      return { inicio, fin, inicioAnterior, finAnterior };
    }
    case 'año': {
      const inicio = daysAgo(365);
      const inicioAnterior = daysAgo(730);
      const finAnterior = daysAgo(365);
      return { inicio, fin, inicioAnterior, finAnterior };
    }
    default: {
      const inicio = startOfToday();
      const inicioAnterior = daysAgo(1);
      const finAnterior = startOfToday();
      return { inicio, fin, inicioAnterior, finAnterior };
    }
  }
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const inicioService = {
  async getDashboardData(
    organizationId: number,
    periodo: PeriodoDashboard = 'hoy'
  ): Promise<DashboardData> {
    const today = startOfToday();
    const last30Days = daysAgo(30);
    const { inicio: inicioPeriodo, inicioAnterior, finAnterior } = rangoPeriodo(periodo);

    // Ejecutar queries en paralelo para mayor velocidad
    const [
      ventasHoyRes,
      ventasMesRes,
      webOrdersHoyRes,
      webOrdersMesRes,
      clientesRes,
      productosRes,
      facturasHoyRes,
      empleadosRes,
      reservasRes,
      cuentasRes,
      actividadVentas,
      actividadFacturasRes,
      actividadClientesRes,
      actividadStockRes,
      actividadReservasRes,
      orgRes,
      branchesRes,
      membersRes,
      taxesRes,
      modulesRes,
      ventasAnteriorRes,
      webOrdersAnteriorRes,
      facturasAnteriorRes,
    ] = await Promise.all([
      // Ventas POS del período seleccionado
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('sale_date', inicioPeriodo)
        .in('status', ['paid', 'completed']),
      // Ventas POS últimos 30 días
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('sale_date', last30Days),
      // Pedidos web del período seleccionado (pagados o entregados)
      supabase
        .from('web_orders')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioPeriodo)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")'),
      // Pedidos web últimos 30 días (pagados o entregados)
      supabase
        .from('web_orders')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('created_at', last30Days)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")'),
      // Clientes activos
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      // Productos activos
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'active'),
      // Facturas del período seleccionado
      supabase
        .from('invoice_sales')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('issue_date', inicioPeriodo),
      // Miembros activos de la organización
      supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      // Reservas activas
      supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('status', ['confirmed', 'checked_in']),
      // Cuentas por cobrar (status reales: overdue, current, partial, paid)
      supabase
        .from('accounts_receivable')
        .select('balance')
        .eq('organization_id', organizationId)
        .in('status', ['overdue', 'current', 'partial']),
      // Actividad reciente (últimas ventas POS)
      supabase
        .from('sales')
        .select('id, total, sale_date, status')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5),
      // Actividad: facturas emitidas recientes
      supabase
        .from('invoice_sales')
        .select('id, total, number, issue_date, status')
        .eq('organization_id', organizationId)
        .order('issue_date', { ascending: false })
        .limit(5),
      // Actividad: clientes nuevos recientes
      supabase
        .from('customers')
        .select('id, full_name, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5),
      // Actividad: movimientos de stock recientes
      supabase
        .from('stock_movements')
        .select('id, direction, qty, source, note, created_at, products(name)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5),
      // Actividad: reservas recientes
      supabase
        .from('reservations')
        .select('id, status, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5),
      // Organización (para onboarding)
      supabase
        .from('organizations')
        .select('created_at')
        .eq('id', organizationId)
        .single(),
      // Sucursales (para onboarding check)
      supabase
        .from('branches')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      // Miembros (para onboarding check)
      supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      // Impuestos (para onboarding check)
      supabase
        .from('organization_taxes')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      // Módulos activos NO-core (para onboarding check)
      // Excluir módulos core que se crean automáticamente (clientes, organizations, roles)
      supabase
        .from('organization_modules')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .not('module_code', 'in', '("clientes","organizations","roles")'),
      // ─── Queries del período anterior (para deltas) ───────────────────────────
      // Ventas POS período anterior
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('sale_date', inicioAnterior)
        .lt('sale_date', finAnterior)
        .in('status', ['paid', 'completed']),
      // Pedidos web período anterior
      supabase
        .from('web_orders')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioAnterior)
        .lt('created_at', finAnterior)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")'),
      // Facturas período anterior
      supabase
        .from('invoice_sales')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('issue_date', inicioAnterior)
        .lt('issue_date', finAnterior),
    ]);

    // KPIs — sumar ventas POS + pedidos web
    const ventasPosHoy = (ventasHoyRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const ventasPosMes = (ventasMesRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const ventasWebHoy = (webOrdersHoyRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const ventasWebMes = (webOrdersMesRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const cuentasPorCobrar = (cuentasRes.data || []).reduce((s, c) => s + Number(c.balance || 0), 0);

    // Deltas del período anterior (ventas, facturas)
    const ventasPosAnterior = (ventasAnteriorRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const ventasWebAnterior = (webOrdersAnteriorRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const ventasAnterior = ventasPosAnterior + ventasWebAnterior;
    const facturasAnterior = facturasAnteriorRes.count || 0;

    const kpis: DashboardKPIData = {
      ventasHoy: ventasPosHoy + ventasWebHoy,
      ventasMes: ventasPosMes + ventasWebMes,
      clientesActivos: clientesRes.count || 0,
      productosActivos: productosRes.count || 0,
      facturasHoy: facturasHoyRes.count || 0,
      empleadosActivos: empleadosRes.count || 0,
      reservasActivas: reservasRes.count || 0,
      cuentasPorCobrar,
      ventasAnterior,
      facturasAnterior,
    };

    // Actividad reciente — consolidar ventas, facturas, clientes, stock y reservas
    const actividad: ActividadReciente[] = [];

    // Ventas POS
    (actividadVentas.data || []).forEach((v) => {
      actividad.push({
        id: `venta-${v.id}`,
        tipo: 'venta',
        modulo: 'pos',
        descripcion: `Venta ${v.status === 'paid' ? 'completada' : v.status}`,
        monto: Number(v.total),
        fecha: v.sale_date,
      });
    });

    // Facturas emitidas
    (actividadFacturasRes.data || []).forEach((f) => {
      actividad.push({
        id: `factura-${f.id}`,
        tipo: 'factura',
        modulo: 'finance',
        descripcion: `Factura ${f.number || ''} ${f.status === 'paid' ? 'pagada' : f.status}`,
        monto: Number(f.total),
        fecha: f.issue_date,
      });
    });

    // Clientes nuevos
    (actividadClientesRes.data || []).forEach((c) => {
      actividad.push({
        id: `cliente-${c.id}`,
        tipo: 'cliente',
        modulo: 'crm',
        descripcion: `Nuevo cliente: ${c.full_name || 'Sin nombre'}`,
        fecha: c.created_at,
      });
    });

    // Movimientos de stock
    (actividadStockRes.data || []).forEach((s) => {
      const productName = (s.products as { name?: string } | null)?.name || 'Producto';
      const dirLabel = s.direction === 'in' ? 'Entrada' : 'Salida';
      actividad.push({
        id: `stock-${s.id}`,
        tipo: 'stock',
        modulo: 'inventory',
        descripcion: `${dirLabel} stock: ${productName} (${s.qty})`,
        fecha: s.created_at,
      });
    });

    // Reservas
    (actividadReservasRes.data || []).forEach((r) => {
      actividad.push({
        id: `reserva-${r.id}`,
        tipo: 'reserva',
        modulo: 'pms_hotel',
        descripcion: `Reserva ${r.status}`,
        fecha: r.created_at,
      });
    });

    // Ordenar por fecha descendente y limitar a 15
    actividad.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    actividad.splice(15);

    // Onboarding steps
    const onboarding: OnboardingStep[] = [
      {
        id: 'modules',
        titulo: 'Activar módulos',
        descripcion: 'Activa los módulos que necesitas para tu negocio',
        href: '/app/organizacion/modulos',
        completado: (modulesRes.count || 0) > 0,
        icono: 'LayoutGrid',
      },
      {
        id: 'org',
        titulo: 'Configurar organización',
        descripcion: 'Completa los datos de tu empresa',
        href: '/app/organizacion',
        completado: true, // siempre completado si existe
        icono: 'Settings',
      },
      {
        id: 'branch',
        titulo: 'Crear sucursal',
        descripcion: 'Agrega al menos una sucursal',
        href: '/app/organizacion/sucursales',
        completado: (branchesRes.count || 0) > 0,
        icono: 'Building2',
      },
      {
        id: 'team',
        titulo: 'Invitar equipo',
        descripcion: 'Agrega miembros a tu organización',
        href: '/app/organizacion/miembros',
        completado: (membersRes.count || 0) > 1,
        icono: 'Users',
      },
      {
        id: 'products',
        titulo: 'Agregar productos',
        descripcion: 'Crea tu catálogo de productos',
        href: '/app/inventario/productos',
        completado: (productosRes.count || 0) > 0,
        icono: 'Package',
      },
      {
        id: 'taxes',
        titulo: 'Configurar impuestos',
        descripcion: 'Configura los impuestos de tu país',
        href: '/app/finanzas/impuestos',
        completado: (taxesRes.count || 0) > 0,
        icono: 'Percent',
      },
      {
        id: 'customers',
        titulo: 'Registrar clientes',
        descripcion: 'Agrega tus primeros clientes',
        href: '/app/crm',
        completado: (clientesRes.count || 0) > 0,
        icono: 'UserPlus',
      },
    ];

    return {
      kpis,
      actividad,
      onboarding,
      organizacionCreatedAt: orgRes.data?.created_at || null,
    };
  },

  // ─── Tendencia de ventas diarias (para gráfico) ────────────────────────────
  // Devuelve un array de { fecha, total } con las ventas agregadas por día
  // de los últimos `dias` días (incluyendo hoy).
  async getTendenciaVentas(
    organizationId: number,
    dias: number = 30
  ): Promise<PuntoTendencia[]> {
    const desde = daysAgo(dias - 1); // incluir hoy
    const [salesRes, webOrdersRes] = await Promise.all([
      supabase
        .from('sales')
        .select('total, sale_date')
        .eq('organization_id', organizationId)
        .gte('sale_date', desde)
        .in('status', ['paid', 'completed']),
      supabase
        .from('web_orders')
        .select('total, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', desde)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")'),
    ]);

    // Agregar por día (YYYY-MM-DD)
    const porDia = new Map<string, number>();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Inicializar todos los días del rango con 0
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(d.getDate() - i);
      porDia.set(d.toISOString().slice(0, 10), 0);
    }

    // Sumar ventas POS
    (salesRes.data || []).forEach((v) => {
      const dia = (v.sale_date || '').slice(0, 10);
      if (porDia.has(dia)) {
        porDia.set(dia, (porDia.get(dia) || 0) + Number(v.total || 0));
      }
    });

    // Sumar pedidos web
    (webOrdersRes.data || []).forEach((v) => {
      const dia = (v.created_at || '').slice(0, 10);
      if (porDia.has(dia)) {
        porDia.set(dia, (porDia.get(dia) || 0) + Number(v.total || 0));
      }
    });

    return Array.from(porDia.entries()).map(([fecha, total]) => ({ fecha, total }));
  },

  // ─── Alertas consolidadas de módulos ───────────────────────────────────────
  // Devuelve alertas reales de: cuentas vencidas, stock bajo, reservas pendientes
  async getAlertas(organizationId: number): Promise<AlertaDashboard[]> {
    const alertas: AlertaDashboard[] = [];

    const [cuentasVencidasRes, stockRes, reservasRes] = await Promise.all([
      // Cuentas por cobrar vencidas
      supabase
        .from('accounts_receivable')
        .select('balance, days_overdue')
        .eq('organization_id', organizationId)
        .eq('status', 'overdue'),
      // Stock bajo: productos con seguimiento de stock y qty_on_hand <= min_level
      supabase
        .from('stock_levels')
        .select('qty_on_hand, min_level, product_id, products!inner(organization_id, name, track_stock)')
        .eq('products.organization_id', organizationId)
        .eq('products.track_stock', true)
        .gt('min_level', 0),
      // Reservas que requieren check-in (confirmed de hoy)
      supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'confirmed'),
    ]);

    // Alerta: cuentas vencidas
    const cuentasVencidas = cuentasVencidasRes.data || [];
    if (cuentasVencidas.length > 0) {
      const totalVencido = cuentasVencidas.reduce((s, c) => s + Number(c.balance || 0), 0);
      const maxDias = Math.max(...cuentasVencidas.map((c) => c.days_overdue || 0));
      alertas.push({
        id: 'cuentas-vencidas',
        severidad: totalVencido > 1000 ? 'alta' : 'media',
        modulo: 'finance',
        titulo: 'Cuentas por cobrar vencidas',
        descripcion: `${cuentasVencidas.length} cuenta(s) vencida(s) · ${maxDias} día(s) máx.`,
        monto: totalVencido,
        href: '/app/finanzas/cuentas-por-cobrar',
        icono: 'CreditCard',
      });
    }

    // Alerta: stock bajo
    const stockBajo = (stockRes.data || []).filter(
      (s) => Number(s.qty_on_hand) <= Number(s.min_level),
    );
    if (stockBajo.length > 0) {
      alertas.push({
        id: 'stock-bajo',
        severidad: stockBajo.length > 5 ? 'alta' : 'media',
        modulo: 'inventory',
        titulo: 'Stock bajo',
        descripcion: `${stockBajo.length} producto(s) con stock por debajo del mínimo`,
        href: '/app/inventario/productos',
        icono: 'Package',
      });
    }

    // Alerta: reservas pendientes de check-in
    const reservasPendientes = reservasRes.count || 0;
    if (reservasPendientes > 0) {
      alertas.push({
        id: 'reservas-pendientes',
        severidad: 'baja',
        modulo: 'pms_hotel',
        titulo: 'Reservas confirmadas',
        descripcion: `${reservasPendientes} reserva(s) confirmada(s) pendiente(s) de check-in`,
        href: '/app/pms',
        icono: 'BedDouble',
      });
    }

    return alertas;
  },
};
