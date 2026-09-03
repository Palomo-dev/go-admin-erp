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

export type PeriodoDashboard = 'hoy' | 'ayer' | '7d' | '30d' | '90d' | 'año';

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
  comprasWebCompletadas: number;
  comprasWebCompletadasAnterior?: number;
  // Tasas de conversión de comercio web
  tasaVisitaPedido: number;
  tasaPedidoCompletado: number;
  tasaAbandono: number;
  conversionWeb: number; // = tasaPedidoCompletado (valor principal de la card)
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
  tasaVisitaPedidoAnterior?: number;
  tasaPedidoCompletadoAnterior?: number;
  conversionWebAnterior?: number;
  // Series horarias (solo para periodo 'hoy'): hoy vs ayer a esta misma hora
  ventasPorHoraHoy?: PuntoHora[];
  ventasPorHoraAyer?: PuntoHora[];
  facturasPorHoraHoy?: PuntoHora[];
  facturasPorHoraAyer?: PuntoHora[];
  visitasPorHoraHoy?: PuntoHora[];
  visitasPorHoraAyer?: PuntoHora[];
  comprasPorHoraHoy?: PuntoHora[];
  comprasPorHoraAyer?: PuntoHora[];
  // Desglose horario por estado (pedidos = total; pagados/cancelados = subset)
  comprasPorHoraHoyPagadas?: PuntoHora[];
  comprasPorHoraHoyCanceladas?: PuntoHora[];
  comprasPorHoraAyerPagadas?: PuntoHora[];
  comprasPorHoraAyerCanceladas?: PuntoHora[];
  // Desglose horario: completados (pagados online + manuales confirmados)
  comprasPorHoraHoyCompletadas?: PuntoHora[];
  comprasPorHoraAyerCompletadas?: PuntoHora[];
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
  // Desglose por período (7d, 30d, 90d, año) por estado
  comprasPorDiaPeriodoPagadas?: SerieDiariaKpi;
  comprasPorDiaPeriodoCanceladas?: SerieDiariaKpi;
  comprasPorDiaPeriodoCompletadas?: SerieDiariaKpi;
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
    case 'ayer': {
      const yesterday = addDays(operatingToday, -1);
      let inicio: string;
      let fin: string;
      if (overrideHours) {
        const timezone = await getOrganizationTimezone(organizationId);
        const range = getDayRange(yesterday, timezone, overrideHours);
        inicio = range.start;
        fin = range.end;
      } else {
        const range = await getOrgDayRange(organizationId, yesterday);
        inicio = range.start;
        fin = range.end;
      }
      // Período anterior = anteayer (mismo día completo)
      const twoDaysAgo = addDays(operatingToday, -2);
      const { start: inicioAnterior, end: finAnterior } = await getOrgDayRange(organizationId, twoDaysAgo);
      return { inicio, fin, inicioAnterior, finAnterior, operatingToday };
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
 * Mapea el resultado de la RPC get_website_visits_by_day (que devuelve
 * {fecha: 'YYYY-MM-DD', total}[] en la timezone de la org) a PuntoDiaMes[]
 * con posición secuencial (1, 2, 3...), generando todos los días del período
 * (incluyendo días sin datos como total=0).
 *
 * A diferencia de agruparPorDiaPeriodo, no necesita Intl.DateTimeFormat porque
 * la RPC ya devuelve la fecha convertida a la timezone de la org.
 */
function mapearVisitasPorDiaPeriodo(
  visitas: { fecha: string; total: number }[],
  fechaInicio: string,
  fechaFin: string,
): PuntoDiaMes[] {
  const map = new Map<string, number>();
  for (const v of visitas) {
    // La RPC devuelve date que PostgREST serializa como 'YYYY-MM-DD'
    map.set(v.fecha, (map.get(v.fecha) || 0) + Number(v.total || 0));
  }
  const result: PuntoDiaMes[] = [];
  let current = fechaInicio;
  let posicion = 1;
  while (current <= fechaFin) {
    result.push({ dia: posicion, total: map.get(current) || 0 });
    current = addDays(current, 1);
    posicion++;
  }
  return result;
}

// ─── Helpers para series RPC ─────────────────────────────────────────────────

/** Suma todos los totales de una serie (PuntoHora[] o {fecha, total}[]). */
function sumarSerie(data: { total: number }[] | null | undefined): number {
  return (data || []).reduce((s, p) => s + Number(p.total || 0), 0);
}

/** Combina dos series horarias (24 entradas c/u) sumando totales por hora. */
function combinarSeriesPorHora(a: PuntoHora[], b: PuntoHora[]): PuntoHora[] {
  return a.map((p, i) => ({ hora: p.hora, total: p.total + (b[i]?.total ?? 0) }));
}

/** Combina dos series por fecha (longitud variable) sumando totales por fecha. */
function combinarSeriesPorDia(
  a: { fecha: string; total: number }[],
  b: { fecha: string; total: number }[],
): { fecha: string; total: number }[] {
  const map = new Map<string, number>();
  for (const p of a) map.set(p.fecha, (map.get(p.fecha) || 0) + Number(p.total || 0));
  for (const p of b) map.set(p.fecha, (map.get(p.fecha) || 0) + Number(p.total || 0));
  return Array.from(map.entries())
    .map(([fecha, total]) => ({ fecha, total }))
    .sort((x, y) => x.fecha.localeCompare(y.fecha));
}

/** Mapea {fecha: 'YYYY-MM-DD', total}[] a PuntoDiaMes[] (día del mes 1-31). */
function mapearPorDiaMesDesdeRPC(data: { fecha: string; total: number }[]): PuntoDiaMes[] {
  return data.map((p) => ({ dia: Number(p.fecha.split('-')[2]), total: p.total }));
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

    // Timezone de la org (con cache en memoria) para las funciones RPC de visitas web.
    // Se obtiene aquí (antes del Promise.all) porque las RPC la necesitan como parámetro.
    const timezoneOrg = await getOrganizationTimezone(organizationId);

    // Ejecutar queries en paralelo para mayor velocidad.
    // Las queries que traen filas completas usan RPC (agregación en BD) para
    // evitar el límite de 1000 filas del cliente Supabase.
    const isHorario = periodo === 'hoy' || periodo === 'ayer';
    const salesFn = isHorario ? 'get_sales_by_hour' : 'get_sales_by_day';
    const webOrdersRevFn = isHorario ? 'get_web_orders_revenue_by_hour' : 'get_web_orders_revenue_by_day';
    const invoicesFn = isHorario ? 'get_invoice_sales_by_hour' : 'get_invoice_sales_by_day';
    const webOrdersAllFn = isHorario ? 'get_web_orders_all_by_hour' : 'get_web_orders_all_by_day';
    const rpcArgs = (p_start: string, p_end: string) => ({
      p_organization_id: organizationId, p_timezone: timezoneOrg, p_start, p_end,
    });

    const [
      // ─── Queries seguras (head:true, limit, single) ───────────────────────────
      clientesRes,
      productosRes,
      empleadosRes,
      reservasRes,
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
      // ─── Visitas web (RPC + count exacto) ──────────────────────────────────────
      visitasWebHoyRes,
      visitasWebAnteriorRes,
      visitasWebCountRes,
      visitasWebAnteriorCountRes,
      // ─── RPC: período actual (by_hour si hoy, by_day si otro) ──────────────────
      salesPeriodoRes,
      webOrdersRevPeriodoRes,
      invoicesPeriodoRes,
      webOrdersAllPeriodoRes,
      // ─── RPC: período anterior ─────────────────────────────────────────────────
      salesAnteriorRes,
      webOrdersRevAnteriorRes,
      invoicesAnteriorRes,
      webOrdersAllAnteriorRes,
      // ─── RPC: mes calendario actual (siempre by_day) ───────────────────────────
      salesMesActualRes,
      webOrdersRevMesActualRes,
      clientesMesActualRes,
      productosMesActualRes,
      empleadosMesActualRes,
      reservasMesActualRes,
      cuentasMesActualRes,
      // ─── RPC: mes calendario anterior (siempre by_day) ─────────────────────────
      salesMesAnteriorRes,
      webOrdersRevMesAnteriorRes,
      clientesMesAnteriorRes,
      productosMesAnteriorRes,
      empleadosMesAnteriorRes,
      reservasMesAnteriorRes,
      cuentasMesAnteriorRes,
      // ─── RPC: suma acumulada de cuentas por cobrar ─────────────────────────────
      cuentasSumRes,
    ] = await Promise.all([
      // Queries seguras (head:true, limit, single)
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'active'),
      supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true),
      supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', ['confirmed', 'checked_in']),
      supabase.from('sales').select('id, total, sale_date, status').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(5),
      supabase.from('invoice_sales').select('id, total, number, issue_date, status').eq('organization_id', organizationId).order('issue_date', { ascending: false }).limit(5),
      supabase.from('customers').select('id, full_name, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(5),
      supabase.from('stock_movements').select('id, direction, qty, source, note, created_at, products(name)').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(5),
      supabase.from('reservations').select('id, status, created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(5),
      supabase.from('organizations').select('created_at').eq('id', organizationId).single(),
      supabase.from('branches').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase.from('organization_taxes').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase.from('organization_modules').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true).not('module_code', 'in', '("clientes","organizations","roles")'),
      // Visitas web (RPC + count exacto)
      isHorario
        ? supabase.rpc('get_website_visits_by_hour', rpcArgs(inicioPeriodo, finPeriodo))
        : supabase.rpc('get_website_visits_by_day', rpcArgs(inicioPeriodo, finPeriodo)),
      isHorario
        ? supabase.rpc('get_website_visits_by_hour', rpcArgs(inicioAnterior, finAnterior))
        : supabase.rpc('get_website_visits_by_day', rpcArgs(inicioAnterior, finAnterior)),
      supabase.from('website_visits').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).gte('created_at', inicioPeriodo).lt('created_at', finPeriodo),
      supabase.from('website_visits').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).gte('created_at', inicioAnterior).lt('created_at', finAnterior),
      // RPC: período actual
      supabase.rpc(salesFn, rpcArgs(inicioPeriodo, finPeriodo)),
      supabase.rpc(webOrdersRevFn, rpcArgs(inicioPeriodo, finPeriodo)),
      supabase.rpc(invoicesFn, rpcArgs(inicioPeriodo, finPeriodo)),
      supabase.rpc(webOrdersAllFn, rpcArgs(inicioPeriodo, finPeriodo)),
      // RPC: período anterior
      supabase.rpc(salesFn, rpcArgs(inicioAnterior, finAnterior)),
      supabase.rpc(webOrdersRevFn, rpcArgs(inicioAnterior, finAnterior)),
      supabase.rpc(invoicesFn, rpcArgs(inicioAnterior, finAnterior)),
      supabase.rpc(webOrdersAllFn, rpcArgs(inicioAnterior, finAnterior)),
      // RPC: mes calendario actual (by_day)
      supabase.rpc('get_sales_by_day', rpcArgs(inicioMesActual, finPeriodo)),
      supabase.rpc('get_web_orders_revenue_by_day', rpcArgs(inicioMesActual, finPeriodo)),
      supabase.rpc('get_customers_by_day', rpcArgs(inicioMesActual, finPeriodo)),
      supabase.rpc('get_products_by_day', rpcArgs(inicioMesActual, finPeriodo)),
      supabase.rpc('get_org_members_by_day', rpcArgs(inicioMesActual, finPeriodo)),
      supabase.rpc('get_reservations_by_day', rpcArgs(inicioMesActual, finPeriodo)),
      supabase.rpc('get_accounts_receivable_by_day', rpcArgs(inicioMesActual, finPeriodo)),
      // RPC: mes calendario anterior (by_day)
      supabase.rpc('get_sales_by_day', rpcArgs(inicioMesAnterior, finMesAnteriorCal)),
      supabase.rpc('get_web_orders_revenue_by_day', rpcArgs(inicioMesAnterior, finMesAnteriorCal)),
      supabase.rpc('get_customers_by_day', rpcArgs(inicioMesAnterior, finMesAnteriorCal)),
      supabase.rpc('get_products_by_day', rpcArgs(inicioMesAnterior, finMesAnteriorCal)),
      supabase.rpc('get_org_members_by_day', rpcArgs(inicioMesAnterior, finMesAnteriorCal)),
      supabase.rpc('get_reservations_by_day', rpcArgs(inicioMesAnterior, finMesAnteriorCal)),
      supabase.rpc('get_accounts_receivable_by_day', rpcArgs(inicioMesAnterior, finMesAnteriorCal)),
      // RPC: suma acumulada de cuentas por cobrar
      supabase.rpc('get_accounts_receivable_sum', { p_organization_id: organizationId }),
    ]);

    // ─── Procesamiento de resultados RPC ────────────────────────────────────────
    // Las RPC devuelven series agregadas en BD (by_hour: 24 filas, by_day: {fecha, total}[]).
    // Los KPIs totales se calculan sumando las series. Las series se usan directamente.
    type PuntoHoraRPC = { hora: number; total: number };
    type PuntoDiaRPC = { fecha: string; total: number };
    type PuntoComprasRPC = { pedidos: number; pendientes: number; pagados: number; cancelados: number; completados: number };

    const salesPeriodo = (salesPeriodoRes.data as PuntoHoraRPC[] | PuntoDiaRPC[] | null) ?? [];
    const webOrdersRevPeriodo = (webOrdersRevPeriodoRes.data as PuntoHoraRPC[] | PuntoDiaRPC[] | null) ?? [];
    const invoicesPeriodo = (invoicesPeriodoRes.data as PuntoHoraRPC[] | PuntoDiaRPC[] | null) ?? [];
    const webOrdersAllPeriodo = (webOrdersAllPeriodoRes.data as PuntoComprasRPC[] | null) ?? [];
    const salesAnteriorData = (salesAnteriorRes.data as PuntoHoraRPC[] | PuntoDiaRPC[] | null) ?? [];
    const webOrdersRevAnteriorData = (webOrdersRevAnteriorRes.data as PuntoHoraRPC[] | PuntoDiaRPC[] | null) ?? [];
    const invoicesAnteriorData = (invoicesAnteriorRes.data as PuntoHoraRPC[] | PuntoDiaRPC[] | null) ?? [];
    const webOrdersAllAnteriorData = (webOrdersAllAnteriorRes.data as PuntoComprasRPC[] | null) ?? [];

    // KPIs totales (suma de series RPC)
    const ventasPosHoy = sumarSerie(salesPeriodo);
    const ventasWebHoy = sumarSerie(webOrdersRevPeriodo);
    const ventasPosMes = sumarSerie(salesMesActualRes.data as PuntoDiaRPC[] | null);
    const ventasWebMes = sumarSerie(webOrdersRevMesActualRes.data as PuntoDiaRPC[] | null);
    const cuentasPorCobrar = (cuentasSumRes.data as { total: number }[] | null)?.[0]?.total ?? 0;

    // Deltas del período anterior
    const ventasPosAnterior = sumarSerie(salesAnteriorData);
    const ventasWebAnterior = sumarSerie(webOrdersRevAnteriorData);
    const ventasAnterior = ventasPosAnterior + ventasWebAnterior;
    const facturasAnterior = sumarSerie(invoicesAnteriorData);

    // Deltas de los 6 KPIs restantes (de las series mensuales)
    const ventasMesAnterior = sumarSerie(salesMesAnteriorRes.data as PuntoDiaRPC[] | null)
      + sumarSerie(webOrdersRevMesAnteriorRes.data as PuntoDiaRPC[] | null);
    const clientesAnterior = sumarSerie(clientesMesAnteriorRes.data as PuntoDiaRPC[] | null);
    const productosAnterior = sumarSerie(productosMesAnteriorRes.data as PuntoDiaRPC[] | null);
    const empleadosAnterior = sumarSerie(empleadosMesAnteriorRes.data as PuntoDiaRPC[] | null);
    const reservasAnterior = sumarSerie(reservasMesAnteriorRes.data as PuntoDiaRPC[] | null);
    const cuentasAnterior = sumarSerie(cuentasMesAnteriorRes.data as PuntoDiaRPC[] | null);

    // Visitas web (count exacto via head:true)
    const visitasWeb = visitasWebCountRes.count ?? 0;
    const visitasWebAnterior = visitasWebAnteriorCountRes.count ?? 0;

    // Compras web (desglose desde RPC: pedidos/pendientes/pagados/cancelados)
    const sumarCampo = (data: PuntoComprasRPC[] | null, campo: keyof PuntoComprasRPC): number =>
      (data || []).reduce((s, p) => s + Number(p[campo] || 0), 0);
    const comprasWeb = sumarCampo(webOrdersAllPeriodo, 'pedidos');
    const comprasWebPendientes = sumarCampo(webOrdersAllPeriodo, 'pendientes');
    const comprasWebPagadas = sumarCampo(webOrdersAllPeriodo, 'pagados');
    const comprasWebCanceladas = sumarCampo(webOrdersAllPeriodo, 'cancelados');
    const comprasWebCompletadas = sumarCampo(webOrdersAllPeriodo, 'completados');
    const comprasWebAnterior = sumarCampo(webOrdersAllAnteriorData, 'pedidos');
    const comprasWebCompletadasAnterior = sumarCampo(webOrdersAllAnteriorData, 'completados');

    // ── Tasas de conversión de comercio web ──
    const tasaVisitaPedido = visitasWeb > 0 ? (comprasWeb / visitasWeb) * 100 : 0;
    const tasaPedidoCompletado = comprasWeb > 0 ? (comprasWebCompletadas / comprasWeb) * 100 : 0;
    const tasaAbandono = comprasWeb > 0 ? (comprasWebCanceladas / comprasWeb) * 100 : 0;
    const tasaVisitaPedidoAnterior = visitasWebAnterior > 0 ? (comprasWebAnterior / visitasWebAnterior) * 100 : 0;
    const tasaPedidoCompletadoAnterior = comprasWebAnterior > 0 ? (comprasWebCompletadasAnterior / comprasWebAnterior) * 100 : 0;
    const conversionWebAnterior = tasaPedidoCompletadoAnterior;

    // Series horarias (solo para periodo 'hoy'): hoy vs ayer a esta misma hora
    let ventasPorHoraHoy: PuntoHora[] | undefined;
    let ventasPorHoraAyer: PuntoHora[] | undefined;
    let facturasPorHoraHoy: PuntoHora[] | undefined;
    let facturasPorHoraAyer: PuntoHora[] | undefined;
    let visitasPorHoraHoy: PuntoHora[] | undefined;
    let visitasPorHoraAyer: PuntoHora[] | undefined;
    let comprasPorHoraHoy: PuntoHora[] | undefined;
    let comprasPorHoraAyer: PuntoHora[] | undefined;
    let comprasPorHoraHoyPagadas: PuntoHora[] | undefined;
    let comprasPorHoraHoyCanceladas: PuntoHora[] | undefined;
    let comprasPorHoraAyerPagadas: PuntoHora[] | undefined;
    let comprasPorHoraAyerCanceladas: PuntoHora[] | undefined;
    let comprasPorHoraHoyCompletadas: PuntoHora[] | undefined;
    let comprasPorHoraAyerCompletadas: PuntoHora[] | undefined;
    let horaActualOrg: number | undefined;
    if (isHorario) {
      const horaFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezoneOrg, hour: 'numeric', hour12: false });
      horaActualOrg = Number(horaFmt.format(new Date())) % 24;
      // Las RPC by_hour ya devuelven PuntoHora[] (24 horas). Se combinan sales + web_orders.
      ventasPorHoraHoy = combinarSeriesPorHora(
        salesPeriodo as PuntoHora[],
        webOrdersRevPeriodo as PuntoHora[],
      );
      ventasPorHoraAyer = combinarSeriesPorHora(
        salesAnteriorData as PuntoHora[],
        webOrdersRevAnteriorData as PuntoHora[],
      );
      facturasPorHoraHoy = invoicesPeriodo as PuntoHora[];
      facturasPorHoraAyer = invoicesAnteriorData as PuntoHora[];
      visitasPorHoraHoy = (visitasWebHoyRes.data as PuntoHora[] | null) ?? [];
      visitasPorHoraAyer = (visitasWebAnteriorRes.data as PuntoHora[] | null) ?? [];
      // Compras web: la RPC get_web_orders_all_by_hour devuelve {hora, pedidos, pendientes, pagados, cancelados}[]
      const comprasPeriodoHora = webOrdersAllPeriodo as unknown as { hora: number; pedidos: number; pendientes: number; pagados: number; cancelados: number; completados: number }[];
      const comprasAnteriorHora = webOrdersAllAnteriorData as unknown as { hora: number; pedidos: number; pendientes: number; pagados: number; cancelados: number; completados: number }[];
      comprasPorHoraHoy = comprasPeriodoHora.map((p) => ({ hora: p.hora, total: p.pedidos }));
      comprasPorHoraAyer = comprasAnteriorHora.map((p) => ({ hora: p.hora, total: p.pedidos }));
      comprasPorHoraHoyPagadas = comprasPeriodoHora.map((p) => ({ hora: p.hora, total: p.pagados }));
      comprasPorHoraHoyCanceladas = comprasPeriodoHora.map((p) => ({ hora: p.hora, total: p.cancelados }));
      comprasPorHoraHoyCompletadas = comprasPeriodoHora.map((p) => ({ hora: p.hora, total: p.completados }));
      comprasPorHoraAyerPagadas = comprasAnteriorHora.map((p) => ({ hora: p.hora, total: p.pagados }));
      comprasPorHoraAyerCanceladas = comprasAnteriorHora.map((p) => ({ hora: p.hora, total: p.cancelados }));
      comprasPorHoraAyerCompletadas = comprasAnteriorHora.map((p) => ({ hora: p.hora, total: p.completados }));
    }

    // Series diarias por período (7d, 30d, 90d, año): actual vs anterior por posición
    let ventasPorDiaPeriodo: SerieDiariaKpi | undefined;
    let facturasPorDiaPeriodo: SerieDiariaKpi | undefined;
    let visitasPorDiaPeriodo: SerieDiariaKpi | undefined;
    let comprasPorDiaPeriodo: SerieDiariaKpi | undefined;
    let comprasPorDiaPeriodoPagadas: SerieDiariaKpi | undefined;
    let comprasPorDiaPeriodoCanceladas: SerieDiariaKpi | undefined;
    let comprasPorDiaPeriodoCompletadas: SerieDiariaKpi | undefined;
    if (!isHorario) {
      const diasPeriodo: Record<PeriodoDashboard, number> = { hoy: 1, ayer: 1, '7d': 7, '30d': 30, '90d': 90, año: 365 };
      const n = diasPeriodo[periodo];
      const fechaFinActual = operatingToday;
      const fechaInicioActual = addDays(operatingToday, -(n - 1));
      const fechaFinAnterior = addDays(fechaInicioActual, -1);
      const fechaInicioAnterior = addDays(fechaInicioActual, -n);
      // Ventas: combinar sales + web_orders por día
      const ventasDiaActual = combinarSeriesPorDia(
        salesPeriodo as PuntoDiaRPC[],
        webOrdersRevPeriodo as PuntoDiaRPC[],
      );
      const ventasDiaAnterior = combinarSeriesPorDia(
        salesAnteriorData as PuntoDiaRPC[],
        webOrdersRevAnteriorData as PuntoDiaRPC[],
      );
      ventasPorDiaPeriodo = {
        actual: mapearVisitasPorDiaPeriodo(ventasDiaActual, fechaInicioActual, fechaFinActual),
        anterior: mapearVisitasPorDiaPeriodo(ventasDiaAnterior, fechaInicioAnterior, fechaFinAnterior),
      };
      // Facturas
      facturasPorDiaPeriodo = {
        actual: mapearVisitasPorDiaPeriodo(invoicesPeriodo as PuntoDiaRPC[], fechaInicioActual, fechaFinActual),
        anterior: mapearVisitasPorDiaPeriodo(invoicesAnteriorData as PuntoDiaRPC[], fechaInicioAnterior, fechaFinAnterior),
      };
      // Visitas web
      visitasPorDiaPeriodo = {
        actual: mapearVisitasPorDiaPeriodo(
          (visitasWebHoyRes.data as PuntoDiaRPC[] | null) ?? [], fechaInicioActual, fechaFinActual),
        anterior: mapearVisitasPorDiaPeriodo(
          (visitasWebAnteriorRes.data as PuntoDiaRPC[] | null) ?? [], fechaInicioAnterior, fechaFinAnterior),
      };
      // Compras web (con desglose)
      const comprasDiaActual = webOrdersAllPeriodo as unknown as { fecha: string; pedidos: number; pagados: number; cancelados: number; completados: number }[];
      const comprasDiaAnterior = webOrdersAllAnteriorData as unknown as { fecha: string; pedidos: number; pagados: number; cancelados: number; completados: number }[];
      comprasPorDiaPeriodo = {
        actual: mapearVisitasPorDiaPeriodo(
          comprasDiaActual.map((p) => ({ fecha: p.fecha, total: p.pedidos })), fechaInicioActual, fechaFinActual),
        anterior: mapearVisitasPorDiaPeriodo(
          comprasDiaAnterior.map((p) => ({ fecha: p.fecha, total: p.pedidos })), fechaInicioAnterior, fechaFinAnterior),
      };
      comprasPorDiaPeriodoPagadas = {
        actual: mapearVisitasPorDiaPeriodo(
          comprasDiaActual.map((p) => ({ fecha: p.fecha, total: p.pagados })), fechaInicioActual, fechaFinActual),
        anterior: mapearVisitasPorDiaPeriodo(
          comprasDiaAnterior.map((p) => ({ fecha: p.fecha, total: p.pagados })), fechaInicioAnterior, fechaFinAnterior),
      };
      comprasPorDiaPeriodoCanceladas = {
        actual: mapearVisitasPorDiaPeriodo(
          comprasDiaActual.map((p) => ({ fecha: p.fecha, total: p.cancelados })), fechaInicioActual, fechaFinActual),
        anterior: mapearVisitasPorDiaPeriodo(
          comprasDiaAnterior.map((p) => ({ fecha: p.fecha, total: p.cancelados })), fechaInicioAnterior, fechaFinAnterior),
      };
      comprasPorDiaPeriodoCompletadas = {
        actual: mapearVisitasPorDiaPeriodo(
          comprasDiaActual.map((p) => ({ fecha: p.fecha, total: p.completados })), fechaInicioActual, fechaFinActual),
        anterior: mapearVisitasPorDiaPeriodo(
          comprasDiaAnterior.map((p) => ({ fecha: p.fecha, total: p.completados })), fechaInicioAnterior, fechaFinAnterior),
      };
    }

    // Series diarias del mes calendario: mes actual vs mes anterior (mismos días)
    // Las RPC by_day devuelven {fecha, total}[]. Se mapea a PuntoDiaMes[] (día del mes).
    const ventasMesActualCombined = combinarSeriesPorDia(
      (salesMesActualRes.data as PuntoDiaRPC[] | null) ?? [],
      (webOrdersRevMesActualRes.data as PuntoDiaRPC[] | null) ?? [],
    );
    const ventasMesAnteriorCombined = combinarSeriesPorDia(
      (salesMesAnteriorRes.data as PuntoDiaRPC[] | null) ?? [],
      (webOrdersRevMesAnteriorRes.data as PuntoDiaRPC[] | null) ?? [],
    );
    const ventasPorDiaMesActual = mapearPorDiaMesDesdeRPC(ventasMesActualCombined);
    const ventasPorDiaMesAnterior = mapearPorDiaMesDesdeRPC(ventasMesAnteriorCombined);

    // Series diarias del mes para los demás KPIs (registros creados por día)
    const seriesDiarias: NonNullable<DashboardKPIData['seriesDiarias']> = {
      clientesActivos: {
        actual: mapearPorDiaMesDesdeRPC((clientesMesActualRes.data as PuntoDiaRPC[] | null) ?? []),
        anterior: mapearPorDiaMesDesdeRPC((clientesMesAnteriorRes.data as PuntoDiaRPC[] | null) ?? []),
      },
      productosActivos: {
        actual: mapearPorDiaMesDesdeRPC((productosMesActualRes.data as PuntoDiaRPC[] | null) ?? []),
        anterior: mapearPorDiaMesDesdeRPC((productosMesAnteriorRes.data as PuntoDiaRPC[] | null) ?? []),
      },
      empleadosActivos: {
        actual: mapearPorDiaMesDesdeRPC((empleadosMesActualRes.data as PuntoDiaRPC[] | null) ?? []),
        anterior: mapearPorDiaMesDesdeRPC((empleadosMesAnteriorRes.data as PuntoDiaRPC[] | null) ?? []),
      },
      reservasActivas: {
        actual: mapearPorDiaMesDesdeRPC((reservasMesActualRes.data as PuntoDiaRPC[] | null) ?? []),
        anterior: mapearPorDiaMesDesdeRPC((reservasMesAnteriorRes.data as PuntoDiaRPC[] | null) ?? []),
      },
      cuentasPorCobrar: {
        actual: mapearPorDiaMesDesdeRPC((cuentasMesActualRes.data as PuntoDiaRPC[] | null) ?? []),
        anterior: mapearPorDiaMesDesdeRPC((cuentasMesAnteriorRes.data as PuntoDiaRPC[] | null) ?? []),
      },
    };

    const kpis: DashboardKPIData = {
      ventasHoy: ventasPosHoy + ventasWebHoy,
      ventasMes: ventasPosMes + ventasWebMes,
      clientesActivos: clientesRes.count || 0,
      productosActivos: productosRes.count || 0,
      facturasHoy: sumarSerie(invoicesPeriodo),
      empleadosActivos: empleadosRes.count || 0,
      reservasActivas: reservasRes.count || 0,
      cuentasPorCobrar,
      // KPIs nuevos
      visitasWeb,
      comprasWeb,
      comprasWebPendientes,
      comprasWebCanceladas,
      comprasWebPagadas,
      comprasWebCompletadas,
      comprasWebCompletadasAnterior,
      // Tasas de conversión
      tasaVisitaPedido,
      tasaPedidoCompletado,
      tasaAbandono,
      conversionWeb: tasaPedidoCompletado,
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
      tasaVisitaPedidoAnterior,
      tasaPedidoCompletadoAnterior,
      conversionWebAnterior,
      // Series horarias
      ventasPorHoraHoy,
      ventasPorHoraAyer,
      facturasPorHoraHoy,
      facturasPorHoraAyer,
      visitasPorHoraHoy,
      visitasPorHoraAyer,
      comprasPorHoraHoy,
      comprasPorHoraAyer,
      comprasPorHoraHoyPagadas,
      comprasPorHoraHoyCanceladas,
      comprasPorHoraAyerPagadas,
      comprasPorHoraAyerCanceladas,
      comprasPorHoraHoyCompletadas,
      comprasPorHoraAyerCompletadas,
      horaActualOrg,
      ventasPorDiaMesActual,
      ventasPorDiaMesAnterior,
      ventasPorDiaPeriodo,
      facturasPorDiaPeriodo,
      visitasPorDiaPeriodo,
      comprasPorDiaPeriodo,
      comprasPorDiaPeriodoPagadas,
      comprasPorDiaPeriodoCanceladas,
      comprasPorDiaPeriodoCompletadas,
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
        .not('status', 'in', '("cancelled","rejected","expired")')
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
