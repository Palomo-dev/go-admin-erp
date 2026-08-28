import { supabase } from '@/lib/supabase/config';
import {
  getOrgDayRange,
  getOrgDateRange,
  getOperatingToday,
  getDayRange,
} from '@/lib/utils/timezone';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { getOperatingHours } from '@/lib/services/organizationOperatingHoursService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type PeriodoDashboard = 'hoy' | '7d' | '30d' | '90d' | 'año';

/** Horas opcionales para filtrar el dashboard (formato HH:mm) */
export interface HorasDashboard {
  horaInicio: string | null; // "HH:mm" o null
  horaFin: string | null;   // "HH:mm" o null
}

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

/**
 * Suma (o resta) días a una fecha YYYY-MM-DD.
 * Usa UTC para evitar desplazamientos por timezone del navegador.
 */
function addDays(dateString: string, days: number): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  const ny = result.getUTCFullYear();
  const nm = String(result.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(result.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * Devuelve el inicio del día operativo actual (UTC ISO) respetando
 * timezone y horas de operación de la organización.
 * Usa getOrgDayRange para calcular el rango UTC del día operativo.
 */
async function startOfToday(
  organizationId: number,
): Promise<{ start: string; end: string; operatingToday: string }> {
  // Obtener timezone y operating hours para calcular el día operativo actual
  // (getOperatingToday necesita ambos para manejar cruce de medianoche)
  const [timezone, operatingHours] = await Promise.all([
    getOrganizationTimezone(organizationId),
    getOperatingHours(organizationId),
  ]);
  const operatingToday = getOperatingToday(timezone, operatingHours);
  // Usar getOrgDayRange para obtener el rango UTC del día operativo
  const { start, end } = await getOrgDayRange(organizationId, operatingToday);
  return { start, end, operatingToday };
}

// Devuelve [inicio, fin] del período actual y [inicioAnterior, finAnterior] del período anterior
// Respetando timezone y horas de operación de la organización.
// finAnterior siempre es igual a inicio del período actual (exclusive upper bound).
// Si se pasan horasOverride, se usan en vez de las operating hours de la org.
async function rangoPeriodo(
  organizationId: number,
  periodo: PeriodoDashboard,
  horasOverride?: HorasDashboard | null,
): Promise<{
  inicio: string;
  fin: string;
  inicioAnterior: string;
  finAnterior: string;
  operatingToday: string;
}> {
  const { operatingToday } = await startOfToday(organizationId);
  const fin = new Date().toISOString(); // momento actual

  // Convertir horasOverride al formato que esperan getOrgDayRange/getOrgDateRange
  const overrideHours = horasOverride && (horasOverride.horaInicio || horasOverride.horaFin)
    ? {
        enabled: true,
        start_time: horasOverride.horaInicio,
        end_time: horasOverride.horaFin,
      }
    : undefined;

  switch (periodo) {
    case 'hoy': {
      let inicio: string;
      let finPeriodoHoy: string;
      if (overrideHours) {
        // Con horas override: usar getDayRange directamente con el timezone de la org
        const timezone = await getOrganizationTimezone(organizationId);
        const range = getDayRange(operatingToday, timezone, overrideHours);
        inicio = range.start;
        finPeriodoHoy = range.end;
      } else {
        const range = await getOrgDayRange(organizationId, operatingToday);
        inicio = range.start;
        finPeriodoHoy = range.end;
      }
      const yesterday = addDays(operatingToday, -1);
      const { start: inicioAnterior } = await getOrgDayRange(organizationId, yesterday);
      return { inicio, fin: finPeriodoHoy, inicioAnterior, finAnterior: inicio, operatingToday };
    }
    case '7d': {
      const start7d = addDays(operatingToday, -7);
      const { start: inicio } = await getOrgDateRange(organizationId, start7d, operatingToday, overrideHours ?? null);
      const start14d = addDays(operatingToday, -14);
      const { start: inicioAnterior } = await getOrgDateRange(organizationId, start14d, start7d);
      return { inicio, fin, inicioAnterior, finAnterior: inicio, operatingToday };
    }
    case '30d': {
      const start30d = addDays(operatingToday, -30);
      const { start: inicio } = await getOrgDateRange(organizationId, start30d, operatingToday, overrideHours ?? null);
      const start60d = addDays(operatingToday, -60);
      const { start: inicioAnterior } = await getOrgDateRange(organizationId, start60d, start30d);
      return { inicio, fin, inicioAnterior, finAnterior: inicio, operatingToday };
    }
    case '90d': {
      const start90d = addDays(operatingToday, -90);
      const { start: inicio } = await getOrgDateRange(organizationId, start90d, operatingToday, overrideHours ?? null);
      const start180d = addDays(operatingToday, -180);
      const { start: inicioAnterior } = await getOrgDateRange(organizationId, start180d, start90d);
      return { inicio, fin, inicioAnterior, finAnterior: inicio, operatingToday };
    }
    case 'año': {
      const start365d = addDays(operatingToday, -365);
      const { start: inicio } = await getOrgDateRange(organizationId, start365d, operatingToday, overrideHours ?? null);
      const start730d = addDays(operatingToday, -730);
      const { start: inicioAnterior } = await getOrgDateRange(organizationId, start730d, start365d);
      return { inicio, fin, inicioAnterior, finAnterior: inicio, operatingToday };
    }
    default: {
      let inicio: string;
      let finDefault: string;
      if (overrideHours) {
        const timezone = await getOrganizationTimezone(organizationId);
        const range = getDayRange(operatingToday, timezone, overrideHours);
        inicio = range.start;
        finDefault = range.end;
      } else {
        const range = await getOrgDayRange(organizationId, operatingToday);
        inicio = range.start;
        finDefault = range.end;
      }
      const yesterday = addDays(operatingToday, -1);
      const { start: inicioAnterior } = await getOrgDayRange(organizationId, yesterday);
      return { inicio, fin: finDefault, inicioAnterior, finAnterior: inicio, operatingToday };
    }
  }
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const inicioService = {
  async getDashboardData(
    organizationId: number,
    periodo: PeriodoDashboard = 'hoy',
    horas?: HorasDashboard | null,
  ): Promise<DashboardData> {
    const {
      inicio: inicioPeriodo,
      fin: finPeriodo,
      inicioAnterior,
      finAnterior,
      operatingToday,
    } = await rangoPeriodo(organizationId, periodo, horas);

    // Últimos 30 días para "ventasMes" (respetando timezone + operating hours)
    const start30d = addDays(operatingToday, -30);
    const { start: last30Days } = await getOrgDayRange(organizationId, start30d);

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
        .lt('sale_date', finPeriodo)
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
        .lt('created_at', finPeriodo)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")')
        .is('sale_id', null),
      // Pedidos web últimos 30 días (pagados o entregados, sin sale_id para no duplicar)
      supabase
        .from('web_orders')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('created_at', last30Days)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")')
        .is('sale_id', null),
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
        .gte('issue_date', inicioPeriodo)
        .lt('issue_date', finPeriodo),
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
      // Pedidos web período anterior (sin sale_id para no duplicar)
      supabase
        .from('web_orders')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioAnterior)
        .lt('created_at', finAnterior)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")')
        .is('sale_id', null),
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
    // Usar timezone de la organización para calcular el rango correcto
    const [timezone, operatingHours] = await Promise.all([
      getOrganizationTimezone(organizationId),
      getOperatingHours(organizationId),
    ]);
    const operatingToday = getOperatingToday(timezone, operatingHours);
    const startDias = addDays(operatingToday, -(dias - 1));
    const { start: desde } = await getOrgDayRange(organizationId, startDias);

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
        .not('status', 'in', '("cancelled","rejected")')
        .is('sale_id', null),
    ]);

    // Formateador para extraer YYYY-MM-DD en el timezone de la organización
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const porDia = new Map<string, number>();

    // Inicializar todos los días del rango con 0 (usando fechas del timezone org)
    for (let i = dias - 1; i >= 0; i--) {
      const fecha = addDays(operatingToday, -i);
      porDia.set(fecha, 0);
    }

    // Sumar ventas POS (formateando la fecha al timezone de la org)
    (salesRes.data || []).forEach((v) => {
      if (!v.sale_date) return;
      const dia = dtf.format(new Date(v.sale_date));
      if (porDia.has(dia)) {
        porDia.set(dia, (porDia.get(dia) || 0) + Number(v.total || 0));
      }
    });

    // Sumar pedidos web (formateando la fecha al timezone de la org)
    (webOrdersRes.data || []).forEach((v) => {
      if (!v.created_at) return;
      const dia = dtf.format(new Date(v.created_at));
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
