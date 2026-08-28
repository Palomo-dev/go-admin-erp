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

export interface PuntoHora {
  hora: number; // 0-23 (hora local de la org)
  total: number;
}

export interface PuntoDiaMes {
  dia: number; // 1-31 (día del mes en timezone de la org)
  total: number;
}

/** Par de series diarias (mes actual vs mes anterior) para un KPI */
export interface SerieDiariaKpi {
  actual: PuntoDiaMes[];
  anterior: PuntoDiaMes[];
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
  // KPIs nuevos
  visitasWeb: number;
  comprasWeb: number;
  comprasWebPendientes: number;
  comprasWebCanceladas: number;
  comprasWebPagadas: number;
  // Deltas vs período anterior
  ventasAnterior?: number;
  facturasAnterior?: number;
  cuentasAnterior?: number;
  ventasMesAnterior?: number;
  clientesAnterior?: number;
  productosAnterior?: number;
  empleadosAnterior?: number;
  reservasAnterior?: number;
  visitasWebAnterior?: number;
  comprasWebAnterior?: number;
  // Series horarias (solo para periodo 'hoy'): hoy vs ayer a esta misma hora
  ventasPorHoraHoy?: PuntoHora[];
  ventasPorHoraAyer?: PuntoHora[];
  facturasPorHoraHoy?: PuntoHora[];
  facturasPorHoraAyer?: PuntoHora[];
  visitasPorHoraHoy?: PuntoHora[];
  visitasPorHoraAyer?: PuntoHora[];
  comprasPorHoraHoy?: PuntoHora[];
  comprasPorHoraAyer?: PuntoHora[];
  // Hora actual (0-23) en timezone de la org (para recortar el sparkline)
  horaActualOrg?: number;
  // Series diarias del mes calendario: mes actual vs mes anterior (mismos días)
  ventasPorDiaMesActual?: PuntoDiaMes[];
  ventasPorDiaMesAnterior?: PuntoDiaMes[];
  // Series diarias por período (7d, 30d, 90d, año): actual vs anterior por posición
  ventasPorDiaPeriodo?: SerieDiariaKpi;
  facturasPorDiaPeriodo?: SerieDiariaKpi;
  visitasPorDiaPeriodo?: SerieDiariaKpi;
  comprasPorDiaPeriodo?: SerieDiariaKpi;
  // Series diarias para los demás KPIs (creados por día, mes actual vs anterior)
  seriesDiarias?: {
    clientesActivos?: SerieDiariaKpi;
    productosActivos?: SerieDiariaKpi;
    empleadosActivos?: SerieDiariaKpi;
    reservasActivas?: SerieDiariaKpi;
    cuentasPorCobrar?: SerieDiariaKpi;
  };
  // Día actual del mes (1-31) y mes/año para etiqueta dinámica
  diaActualMes?: number;
  mesActualNumero?: number; // 1-12
  anioActual?: number;
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
      if (overrideHours) {
        // Con horas override: usar getDayRange directamente con el timezone de la org
        const timezone = await getOrganizationTimezone(organizationId);
        const range = getDayRange(operatingToday, timezone, overrideHours);
        inicio = range.start;
      } else {
        const range = await getOrgDayRange(organizationId, operatingToday);
        inicio = range.start;
      }
      const yesterday = addDays(operatingToday, -1);
      const { start: inicioAnterior } = await getOrgDayRange(organizationId, yesterday);
      // Comparar contra "ayer a esta misma hora" (no contra el día completo de ayer),
      // igual que pedidos-online, para que el delta sea justo mientras el día no termina.
      // fin = ahora; finAnterior = ahora menos 24h (misma hora local de la org).
      const ahora = new Date();
      const finAnterior = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
      return { inicio, fin: ahora.toISOString(), inicioAnterior, finAnterior, operatingToday };
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
      if (overrideHours) {
        const timezone = await getOrganizationTimezone(organizationId);
        const range = getDayRange(operatingToday, timezone, overrideHours);
        inicio = range.start;
      } else {
        const range = await getOrgDayRange(organizationId, operatingToday);
        inicio = range.start;
      }
      const yesterday = addDays(operatingToday, -1);
      const { start: inicioAnterior } = await getOrgDayRange(organizationId, yesterday);
      // Mismo criterio que 'hoy': comparar contra "ayer a esta misma hora".
      const ahora = new Date();
      const finAnterior = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
      return { inicio, fin: ahora.toISOString(), inicioAnterior, finAnterior, operatingToday };
    }
  }
}

/**
 * Parsea un string de fecha (ISO o formato Postgres con espacio) a Date.
 * Supabase puede retornar timestamptz como "2026-08-28 17:21:07.306+00"
 * (con espacio en vez de 'T'), que no es válido en todos los entornos.
 */
function parseFecha(fecha: string): Date {
  // Reemplazar espacio por 'T' si el formato parece ISO con espacio
  const normalized = fecha.includes(' ') && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(fecha)
    ? fecha.replace(' ', 'T')
    : fecha;
  return new Date(normalized);
}

/**
 * Agrupa registros por hora local (0-23) de la organización.
 * Devuelve un array de 24 posiciones con el total acumulado por hora.
 */
function agruparPorHoraLocal(
  registros: { total: number; fecha: string }[],
  timezone: string,
): PuntoHora[] {
  const porHora: number[] = new Array(24).fill(0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  for (const r of registros) {
    const horaStr = fmt.format(parseFecha(r.fecha));
    const hora = Number(horaStr) % 24; // '24' en en-US para medianoche → 0
    if (hora >= 0 && hora < 24) {
      porHora[hora] += Number(r.total || 0);
    }
  }
  return porHora.map((total, hora) => ({ hora, total }));
}

/**
 * Agrupa registros por día del mes (1-31) en timezone de la org.
 * Devuelve un array con un punto por cada día que tenga datos.
 */
function agruparPorDiaMes(
  registros: { total: number; fecha: string }[],
  timezone: string,
): PuntoDiaMes[] {
  const porDia = new Map<number, number>();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    day: 'numeric',
  });
  for (const r of registros) {
    const diaStr = fmt.format(parseFecha(r.fecha));
    const dia = Number(diaStr);
    if (dia >= 1 && dia <= 31) {
      porDia.set(dia, (porDia.get(dia) || 0) + Number(r.total || 0));
    }
  }
  return Array.from(porDia.entries())
    .map(([dia, total]) => ({ dia, total }))
    .sort((a, b) => a.dia - b.dia);
}

/**
 * Agrupa registros por día dentro de un período, usando posición secuencial (1, 2, 3...).
 * Genera todas las fechas del período (incluyendo días sin datos como total=0).
 * @param fechaInicio YYYY-MM-DD (primer día del período en timezone de la org)
 * @param fechaFin YYYY-MM-DD (último día del período en timezone de la org)
 */
function agruparPorDiaPeriodo(
  registros: { total: number; fecha: string }[],
  timezone: string,
  fechaInicio: string,
  fechaFin: string,
): PuntoDiaMes[] {
  // Mapa de fechaStr → total
  const porFecha = new Map<string, number>();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  for (const r of registros) {
    const parts = fmt.formatToParts(parseFecha(r.fecha));
    const y = parts.find((p) => p.type === 'year')?.value || '';
    const m = parts.find((p) => p.type === 'month')?.value || '';
    const d = parts.find((p) => p.type === 'day')?.value || '';
    const dateStr = `${y}-${m}-${d}`;
    porFecha.set(dateStr, (porFecha.get(dateStr) || 0) + Number(r.total || 0));
  }
  // Generar todas las fechas del período con posición secuencial
  const result: PuntoDiaMes[] = [];
  let current = fechaInicio;
  let posicion = 1;
  while (current <= fechaFin) {
    result.push({ dia: posicion, total: porFecha.get(current) || 0 });
    current = addDays(current, 1);
    posicion++;
  }
  return result;
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

    // Mes calendario actual (del 1 del mes hasta hoy) y mes anterior (mismos días)
    const [year, month, day] = operatingToday.split('-').map(Number);
    const diaActualMes = day;
    const mesActualNumero = month;
    const anioActual = year;
    const inicioMesActualStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const inicioMesAnteriorStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    // Día equivalente en el mes anterior (limitado al último día del mes si es más corto)
    const diasEnMesAnterior = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    const diaEquivalenteMesAnterior = Math.min(diaActualMes, diasEnMesAnterior);
    const finMesAnteriorStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(diaEquivalenteMesAnterior).padStart(2, '0')}`;

    const { start: inicioMesActual } = await getOrgDateRange(
      organizationId, inicioMesActualStr, operatingToday, null,
    );
    const { start: inicioMesAnterior, end: finMesAnteriorCal } = await getOrgDateRange(
      organizationId, inicioMesAnteriorStr, finMesAnteriorStr, null,
    );

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
      ventasMesAnteriorRes,
      webOrdersMesAnteriorRes,
      // Series diarias del mes para los demás KPIs (mes actual + mes anterior)
      clientesMesActualRes,
      clientesMesAnteriorRes,
      productosMesActualRes,
      productosMesAnteriorRes,
      empleadosMesActualRes,
      empleadosMesAnteriorRes,
      reservasMesActualRes,
      reservasMesAnteriorRes,
      cuentasMesActualRes,
      cuentasMesAnteriorRes,
      // Visitas web del período actual y anterior
      visitasWebHoyRes,
      visitasWebAnteriorRes,
      // Compras web del período actual (todos los estados) y anterior
      comprasWebTodasRes,
      comprasWebAnteriorRes,
    ] = await Promise.all([
      // Ventas POS del período seleccionado
      supabase
        .from('sales')
        .select('total, sale_date')
        .eq('organization_id', organizationId)
        .gte('sale_date', inicioPeriodo)
        .lt('sale_date', finPeriodo)
        .in('status', ['paid', 'completed']),
      // Ventas POS del mes calendario actual (del 1 del mes hasta hoy)
      supabase
        .from('sales')
        .select('total, sale_date')
        .eq('organization_id', organizationId)
        .gte('sale_date', inicioMesActual)
        .lt('sale_date', finPeriodo)
        .in('status', ['paid', 'completed']),
      // Pedidos web del período seleccionado (pagados o entregados)
      supabase
        .from('web_orders')
        .select('total, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioPeriodo)
        .lt('created_at', finPeriodo)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")')
        .is('sale_id', null),
      // Pedidos web del mes calendario actual (pagados o entregados, sin sale_id para no duplicar)
      supabase
        .from('web_orders')
        .select('total, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesActual)
        .lt('created_at', finPeriodo)
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
      // Facturas del período seleccionado (con issue_date para series temporales)
      supabase
        .from('invoice_sales')
        .select('issue_date')
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
        .select('total, sale_date')
        .eq('organization_id', organizationId)
        .gte('sale_date', inicioAnterior)
        .lt('sale_date', finAnterior)
        .in('status', ['paid', 'completed']),
      // Pedidos web período anterior (sin sale_id para no duplicar)
      supabase
        .from('web_orders')
        .select('total, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioAnterior)
        .lt('created_at', finAnterior)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")')
        .is('sale_id', null),
      // Facturas período anterior (con issue_date para series temporales)
      supabase
        .from('invoice_sales')
        .select('issue_date')
        .eq('organization_id', organizationId)
        .gte('issue_date', inicioAnterior)
        .lt('issue_date', finAnterior),
      // ─── Queries del mes anterior (mismos días, para sparkline mensual) ────────
      // Ventas POS del mes anterior (mismos días transcurridos)
      supabase
        .from('sales')
        .select('total, sale_date')
        .eq('organization_id', organizationId)
        .gte('sale_date', inicioMesAnterior)
        .lt('sale_date', finMesAnteriorCal)
        .in('status', ['paid', 'completed']),
      // Pedidos web del mes anterior (mismos días transcurridos)
      supabase
        .from('web_orders')
        .select('total, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesAnterior)
        .lt('created_at', finMesAnteriorCal)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")')
        .is('sale_id', null),
      // ─── Series diarias del mes para KPIs no-ventas (mes actual + anterior) ───
      // Clientes nuevos por día — mes actual
      supabase
        .from('customers')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesActual)
        .lt('created_at', finPeriodo),
      // Clientes nuevos por día — mes anterior
      supabase
        .from('customers')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesAnterior)
        .lt('created_at', finMesAnteriorCal),
      // Productos creados por día — mes actual
      supabase
        .from('products')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesActual)
        .lt('created_at', finPeriodo),
      // Productos creados por día — mes anterior
      supabase
        .from('products')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesAnterior)
        .lt('created_at', finMesAnteriorCal),
      // Miembros añadidos por día — mes actual
      supabase
        .from('organization_members')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesActual)
        .lt('created_at', finPeriodo),
      // Miembros añadidos por día — mes anterior
      supabase
        .from('organization_members')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesAnterior)
        .lt('created_at', finMesAnteriorCal),
      // Reservas creadas por día — mes actual
      supabase
        .from('reservations')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesActual)
        .lt('created_at', finPeriodo),
      // Reservas creadas por día — mes anterior
      supabase
        .from('reservations')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesAnterior)
        .lt('created_at', finMesAnteriorCal),
      // Cuentas por cobrar nuevas por día — mes actual (suma de balance)
      supabase
        .from('accounts_receivable')
        .select('balance, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesActual)
        .lt('created_at', finPeriodo),
      // Cuentas por cobrar nuevas por día — mes anterior (suma de balance)
      supabase
        .from('accounts_receivable')
        .select('balance, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioMesAnterior)
        .lt('created_at', finMesAnteriorCal),
      // ─── Visitas web (período actual y anterior) ──────────────────────────────
      supabase
        .from('website_visits')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioPeriodo)
        .lt('created_at', finPeriodo),
      supabase
        .from('website_visits')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioAnterior)
        .lt('created_at', finAnterior),
      // ─── Compras web (todos los estados) ───────────────────────────────────────
      // Período actual: traer status y payment_status para desglose
      supabase
        .from('web_orders')
        .select('status, payment_status, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioPeriodo)
        .lt('created_at', finPeriodo),
      // Período anterior: contar todas para delta
      supabase
        .from('web_orders')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', inicioAnterior)
        .lt('created_at', finAnterior),
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
    const facturasAnterior = (facturasAnteriorRes.data || []).length;

    // Deltas de los 6 KPIs restantes (calculados de las series mensuales ya consultadas)
    const ventasMesAnterior = (ventasMesAnteriorRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0)
      + (webOrdersMesAnteriorRes.data || []).reduce((s, v) => s + Number(v.total || 0), 0);
    const clientesAnterior = (clientesMesAnteriorRes.data || []).length;
    const productosAnterior = (productosMesAnteriorRes.data || []).length;
    const empleadosAnterior = (empleadosMesAnteriorRes.data || []).length;
    const reservasAnterior = (reservasMesAnteriorRes.data || []).length;
    const cuentasAnterior = (cuentasMesAnteriorRes.data || []).reduce((s, c) => s + Number(c.balance || 0), 0);

    // KPIs nuevos: visitas web y compras web por estado
    const visitasWeb = (visitasWebHoyRes.data || []).length;
    const visitasWebAnterior = (visitasWebAnteriorRes.data || []).length;
    const comprasWebTodas = comprasWebTodasRes.data || [];
    const comprasWeb = comprasWebTodas.length;
    const comprasWebPendientes = comprasWebTodas.filter(
      (o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'preparing' || o.status === 'ready' || o.status === 'in_delivery',
    ).length;
    const comprasWebCanceladas = comprasWebTodas.filter(
      (o) => o.status === 'cancelled' || o.status === 'rejected',
    ).length;
    const comprasWebPagadas = comprasWebTodas.filter(
      (o) => o.payment_status === 'paid',
    ).length;
    const comprasWebAnterior = (comprasWebAnteriorRes.data || []).length;

    // Series horarias (solo para periodo 'hoy'): hoy vs ayer a esta misma hora
    let ventasPorHoraHoy: PuntoHora[] | undefined;
    let ventasPorHoraAyer: PuntoHora[] | undefined;
    let facturasPorHoraHoy: PuntoHora[] | undefined;
    let facturasPorHoraAyer: PuntoHora[] | undefined;
    let visitasPorHoraHoy: PuntoHora[] | undefined;
    let visitasPorHoraAyer: PuntoHora[] | undefined;
    let comprasPorHoraHoy: PuntoHora[] | undefined;
    let comprasPorHoraAyer: PuntoHora[] | undefined;
    let horaActualOrg: number | undefined;
    if (periodo === 'hoy') {
      const timezone = await getOrganizationTimezone(organizationId);
      const horaFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
      horaActualOrg = Number(horaFmt.format(new Date())) % 24;
      const registrosHoy: { total: number; fecha: string }[] = [
        ...((ventasHoyRes.data || []).map((v) => ({ total: Number(v.total || 0), fecha: v.sale_date }))),
        ...((webOrdersHoyRes.data || []).map((w) => ({ total: Number(w.total || 0), fecha: w.created_at }))),
      ];
      const registrosAyer: { total: number; fecha: string }[] = [
        ...((ventasAnteriorRes.data || []).map((v) => ({ total: Number(v.total || 0), fecha: v.sale_date }))),
        ...((webOrdersAnteriorRes.data || []).map((w) => ({ total: Number(w.total || 0), fecha: w.created_at }))),
      ];
      ventasPorHoraHoy = agruparPorHoraLocal(registrosHoy, timezone);
      ventasPorHoraAyer = agruparPorHoraLocal(registrosAyer, timezone);
      // Facturas: contar por hora (cada factura = 1)
      const facturasHoyReg = (facturasHoyRes.data || []).map((f) => ({ total: 1, fecha: f.issue_date }));
      const facturasAyerReg = (facturasAnteriorRes.data || []).map((f) => ({ total: 1, fecha: f.issue_date }));
      facturasPorHoraHoy = agruparPorHoraLocal(facturasHoyReg, timezone);
      facturasPorHoraAyer = agruparPorHoraLocal(facturasAyerReg, timezone);
      // Visitas web: contar por hora (cada visita = 1)
      const visitasHoyReg = (visitasWebHoyRes.data || []).map((v) => ({ total: 1, fecha: v.created_at }));
      const visitasAyerReg = (visitasWebAnteriorRes.data || []).map((v) => ({ total: 1, fecha: v.created_at }));
      visitasPorHoraHoy = agruparPorHoraLocal(visitasHoyReg, timezone);
      visitasPorHoraAyer = agruparPorHoraLocal(visitasAyerReg, timezone);
      // Compras web: contar por hora (cada orden = 1)
      const comprasHoyReg = (comprasWebTodasRes.data || []).map((o) => ({ total: 1, fecha: o.created_at }));
      const comprasAyerReg = (comprasWebAnteriorRes.data || []).map((o) => ({ total: 1, fecha: o.created_at }));
      comprasPorHoraHoy = agruparPorHoraLocal(comprasHoyReg, timezone);
      comprasPorHoraAyer = agruparPorHoraLocal(comprasAyerReg, timezone);
    }

    // Series diarias por período (7d, 30d, 90d, año): actual vs anterior por posición
    let ventasPorDiaPeriodo: SerieDiariaKpi | undefined;
    let facturasPorDiaPeriodo: SerieDiariaKpi | undefined;
    let visitasPorDiaPeriodo: SerieDiariaKpi | undefined;
    let comprasPorDiaPeriodo: SerieDiariaKpi | undefined;
    if (periodo !== 'hoy') {
      const timezone = await getOrganizationTimezone(organizationId);
      // Calcular fechas de inicio/fin en YYYY-MM-DD (timezone de la org) para cada período
      const diasPeriodo: Record<PeriodoDashboard, number> = { hoy: 1, '7d': 7, '30d': 30, '90d': 90, año: 365 };
      const n = diasPeriodo[periodo];
      const fechaFinActual = operatingToday;
      const fechaInicioActual = addDays(operatingToday, -(n - 1));
      const fechaFinAnterior = addDays(fechaInicioActual, -1);
      const fechaInicioAnterior = addDays(fechaInicioActual, -n);
      // Ventas: POS + web del período actual y anterior
      const ventasPeriodoActual: { total: number; fecha: string }[] = [
        ...((ventasHoyRes.data || []).map((v) => ({ total: Number(v.total || 0), fecha: v.sale_date }))),
        ...((webOrdersHoyRes.data || []).map((w) => ({ total: Number(w.total || 0), fecha: w.created_at }))),
      ];
      const ventasPeriodoAnterior: { total: number; fecha: string }[] = [
        ...((ventasAnteriorRes.data || []).map((v) => ({ total: Number(v.total || 0), fecha: v.sale_date }))),
        ...((webOrdersAnteriorRes.data || []).map((w) => ({ total: Number(w.total || 0), fecha: w.created_at }))),
      ];
      ventasPorDiaPeriodo = {
        actual: agruparPorDiaPeriodo(ventasPeriodoActual, timezone, fechaInicioActual, fechaFinActual),
        anterior: agruparPorDiaPeriodo(ventasPeriodoAnterior, timezone, fechaInicioAnterior, fechaFinAnterior),
      };
      // Facturas: contar por día (cada factura = 1)
      const facturasPeriodoActual = (facturasHoyRes.data || []).map((f) => ({ total: 1, fecha: f.issue_date }));
      const facturasPeriodoAnterior = (facturasAnteriorRes.data || []).map((f) => ({ total: 1, fecha: f.issue_date }));
      facturasPorDiaPeriodo = {
        actual: agruparPorDiaPeriodo(facturasPeriodoActual, timezone, fechaInicioActual, fechaFinActual),
        anterior: agruparPorDiaPeriodo(facturasPeriodoAnterior, timezone, fechaInicioAnterior, fechaFinAnterior),
      };
      // Visitas web: contar por día (cada visita = 1)
      const visitasPeriodoActual = (visitasWebHoyRes.data || []).map((v) => ({ total: 1, fecha: v.created_at }));
      const visitasPeriodoAnterior = (visitasWebAnteriorRes.data || []).map((v) => ({ total: 1, fecha: v.created_at }));
      visitasPorDiaPeriodo = {
        actual: agruparPorDiaPeriodo(visitasPeriodoActual, timezone, fechaInicioActual, fechaFinActual),
        anterior: agruparPorDiaPeriodo(visitasPeriodoAnterior, timezone, fechaInicioAnterior, fechaFinAnterior),
      };
      // Compras web: contar por día (cada orden = 1)
      const comprasPeriodoActual = (comprasWebTodasRes.data || []).map((o) => ({ total: 1, fecha: o.created_at }));
      const comprasPeriodoAnterior = (comprasWebAnteriorRes.data || []).map((o) => ({ total: 1, fecha: o.created_at }));
      comprasPorDiaPeriodo = {
        actual: agruparPorDiaPeriodo(comprasPeriodoActual, timezone, fechaInicioActual, fechaFinActual),
        anterior: agruparPorDiaPeriodo(comprasPeriodoAnterior, timezone, fechaInicioAnterior, fechaFinAnterior),
      };
    }

    // Series diarias del mes calendario: mes actual vs mes anterior (mismos días)
    const timezoneMes = await getOrganizationTimezone(organizationId);
    const registrosMesActual: { total: number; fecha: string }[] = [
      ...((ventasMesRes.data || []).map((v) => ({ total: Number(v.total || 0), fecha: v.sale_date }))),
      ...((webOrdersMesRes.data || []).map((w) => ({ total: Number(w.total || 0), fecha: w.created_at }))),
    ];
    const registrosMesAnterior: { total: number; fecha: string }[] = [
      ...((ventasMesAnteriorRes.data || []).map((v) => ({ total: Number(v.total || 0), fecha: v.sale_date }))),
      ...((webOrdersMesAnteriorRes.data || []).map((w) => ({ total: Number(w.total || 0), fecha: w.created_at }))),
    ];
    const ventasPorDiaMesActual = agruparPorDiaMes(registrosMesActual, timezoneMes);
    const ventasPorDiaMesAnterior = agruparPorDiaMes(registrosMesAnterior, timezoneMes);

    // Series diarias del mes para los demás KPIs (registros creados por día)
    // Contadores: cada registro cuenta como 1. Cuentas por cobrar: suma del balance.
    const contarRegistros = (data: { created_at: string }[] | null): { total: number; fecha: string }[] =>
      (data || []).map((r) => ({ total: 1, fecha: r.created_at }));
    const sumarBalance = (data: { balance: number; created_at: string }[] | null): { total: number; fecha: string }[] =>
      (data || []).map((r) => ({ total: Number(r.balance || 0), fecha: r.created_at }));

    const seriesDiarias: NonNullable<DashboardKPIData['seriesDiarias']> = {
      clientesActivos: {
        actual: agruparPorDiaMes(contarRegistros(clientesMesActualRes.data as { created_at: string }[] | null), timezoneMes),
        anterior: agruparPorDiaMes(contarRegistros(clientesMesAnteriorRes.data as { created_at: string }[] | null), timezoneMes),
      },
      productosActivos: {
        actual: agruparPorDiaMes(contarRegistros(productosMesActualRes.data as { created_at: string }[] | null), timezoneMes),
        anterior: agruparPorDiaMes(contarRegistros(productosMesAnteriorRes.data as { created_at: string }[] | null), timezoneMes),
      },
      empleadosActivos: {
        actual: agruparPorDiaMes(contarRegistros(empleadosMesActualRes.data as { created_at: string }[] | null), timezoneMes),
        anterior: agruparPorDiaMes(contarRegistros(empleadosMesAnteriorRes.data as { created_at: string }[] | null), timezoneMes),
      },
      reservasActivas: {
        actual: agruparPorDiaMes(contarRegistros(reservasMesActualRes.data as { created_at: string }[] | null), timezoneMes),
        anterior: agruparPorDiaMes(contarRegistros(reservasMesAnteriorRes.data as { created_at: string }[] | null), timezoneMes),
      },
      cuentasPorCobrar: {
        actual: agruparPorDiaMes(sumarBalance(cuentasMesActualRes.data as { balance: number; created_at: string }[] | null), timezoneMes),
        anterior: agruparPorDiaMes(sumarBalance(cuentasMesAnteriorRes.data as { balance: number; created_at: string }[] | null), timezoneMes),
      },
    };

    const kpis: DashboardKPIData = {
      ventasHoy: ventasPosHoy + ventasWebHoy,
      ventasMes: ventasPosMes + ventasWebMes,
      clientesActivos: clientesRes.count || 0,
      productosActivos: productosRes.count || 0,
      facturasHoy: (facturasHoyRes.data || []).length,
      empleadosActivos: empleadosRes.count || 0,
      reservasActivas: reservasRes.count || 0,
      cuentasPorCobrar,
      // KPIs nuevos
      visitasWeb,
      comprasWeb,
      comprasWebPendientes,
      comprasWebCanceladas,
      comprasWebPagadas,
      // Deltas
      ventasAnterior,
      facturasAnterior,
      cuentasAnterior,
      ventasMesAnterior,
      clientesAnterior,
      productosAnterior,
      empleadosAnterior,
      reservasAnterior,
      visitasWebAnterior,
      comprasWebAnterior,
      // Series horarias
      ventasPorHoraHoy,
      ventasPorHoraAyer,
      facturasPorHoraHoy,
      facturasPorHoraAyer,
      visitasPorHoraHoy,
      visitasPorHoraAyer,
      comprasPorHoraHoy,
      comprasPorHoraAyer,
      horaActualOrg,
      ventasPorDiaMesActual,
      ventasPorDiaMesAnterior,
      ventasPorDiaPeriodo,
      facturasPorDiaPeriodo,
      visitasPorDiaPeriodo,
      comprasPorDiaPeriodo,
      seriesDiarias,
      diaActualMes,
      mesActualNumero,
      anioActual,
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
