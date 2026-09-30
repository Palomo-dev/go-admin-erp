/**
 * Rango de instantes del selector de periodo del inicio (`PeriodoSelector`:
 * Hoy · Ayer · 7 · 30 · 90 días · Año · Personalizado, con filtro de horas) y
 * del periodo anterior con el que se compara.
 *
 * Regla pura y ÚNICA: la usa el navegador (`inicioService.rangoPeriodo`, KPIs
 * y tendencia) y el servidor (`/api/inicio/ventas`, `/tienda-web`,
 * `/modulos`), para que la tarjeta de ventas, la tienda web y los módulos
 * cuenten el mismo periodo que los KPIs. Antes vivía solo dentro de
 * `inicioService.ts` y leía la zona con el cliente del navegador.
 *
 * - Días en la zona de la organización y con sus horas de operación
 *   (`getDayRange` / `getDateRange` de `dateRanges.ts`); nunca el día UTC.
 * - «Hoy» se compara contra «ayer hasta esta misma hora».
 * - Rangos de N días: el anterior son los N días inmediatamente antes.
 * - Personalizado: el anterior es el rango de igual número de días justo antes.
 */
import { addPlainDays } from '@/lib/utils/dateCore';
import { getDateRange, getDayRange, type OperatingHoursOptions } from '@/lib/utils/dateRanges';

export const PERIODOS_INICIO = ['hoy', 'ayer', '7d', '30d', '90d', 'año', 'personalizado'] as const;
export type PeriodoInicio = (typeof PERIODOS_INICIO)[number];

export interface HorasPeriodo {
  horaInicio: string | null;
  horaFin: string | null;
}

export interface FechasPeriodo {
  fechaInicio: string;
  fechaFin: string;
}

export interface EntradaRangoPeriodo {
  periodo: PeriodoInicio;
  /** Día operativo actual de la organización (`getOperatingToday`). */
  hoyOperativo: string;
  zona: string;
  /** Horas de operación de la organización (o null). */
  horasOrg: OperatingHoursOptions | null;
  /** Filtro de horas del selector (sobrescribe las de la organización). */
  horas?: HorasPeriodo | null;
  fechas?: FechasPeriodo | null;
  ahora: Date;
}

export interface RangoPeriodo {
  inicio: string;
  fin: string;
  inicioAnterior: string;
  finAnterior: string;
}

const DIAS_POR_PERIODO: Partial<Record<PeriodoInicio, number>> = { '7d': 7, '30d': 30, '90d': 90, año: 365 };
const MS_DIA = 86_400_000;

/** Suma días a un `YYYY-MM-DD` (sin pasar por la zona del navegador). */
export function sumarDias(dia: string, dias: number): string {
  return addPlainDays(dia, dias);
}

export function calcularRangoPeriodo(e: EntradaRangoPeriodo): RangoPeriodo {
  const { hoyOperativo: hoy, zona, horasOrg, ahora } = e;
  const override: OperatingHoursOptions | undefined =
    e.horas && (e.horas.horaInicio || e.horas.horaFin)
      ? { start_time: e.horas.horaInicio, end_time: e.horas.horaFin }
      : undefined;
  // Igual que `getOrgDateRange`: las horas del filtro solo mandan si vienen completas.
  const horasRango = override?.start_time && override?.end_time ? override : horasOrg;
  const diaOrg = (dia: string) => getDayRange(dia, zona, horasOrg);
  const ahoraIso = ahora.toISOString();
  const ayerMismaHora = new Date(ahora.getTime() - MS_DIA).toISOString();

  const comoHoy = (conFiltro: boolean): RangoPeriodo => ({
    inicio: (conFiltro && override ? getDayRange(hoy, zona, override) : diaOrg(hoy)).start,
    fin: ahoraIso,
    inicioAnterior: diaOrg(sumarDias(hoy, -1)).start,
    finAnterior: ayerMismaHora,
  });

  const dias = DIAS_POR_PERIODO[e.periodo];
  if (dias) {
    const desde = sumarDias(hoy, -dias);
    const inicio = getDateRange(desde, hoy, zona, horasRango).start;
    return {
      inicio,
      fin: ahoraIso,
      inicioAnterior: getDateRange(sumarDias(hoy, -2 * dias), desde, zona, horasOrg).start,
      finAnterior: inicio,
    };
  }

  if (e.periodo === 'ayer') {
    const ayer = sumarDias(hoy, -1);
    const r = override ? getDayRange(ayer, zona, override) : diaOrg(ayer);
    const antier = diaOrg(sumarDias(hoy, -2));
    return { inicio: r.start, fin: r.end, inicioAnterior: antier.start, finAnterior: antier.end };
  }

  if (e.periodo === 'personalizado') {
    const f = e.fechas;
    if (!f?.fechaInicio || !f?.fechaFin) return comoHoy(false);
    const inicio = getDateRange(f.fechaInicio, f.fechaFin, zona, horasRango).start;
    const n = Math.round((Date.parse(f.fechaFin) - Date.parse(f.fechaInicio)) / MS_DIA) + 1;
    return {
      inicio,
      fin: getDateRange(f.fechaFin, f.fechaFin, zona, horasOrg).end,
      inicioAnterior: getDateRange(sumarDias(f.fechaInicio, -n), sumarDias(f.fechaInicio, -1), zona, horasOrg).start,
      finAnterior: inicio,
    };
  }

  // 'hoy' y cualquier valor desconocido.
  return comoHoy(true);
}

// ─── Lectura de la query (servidor) ─────────────────────────────────────────

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface PeriodoPedido {
  periodo: PeriodoInicio;
  horas: HorasPeriodo | null;
  fechas: FechasPeriodo | null;
}

/**
 * `?periodo=&horaInicio=&horaFin=&desde=&hasta=` validados. `null` = pedido
 * inválido (la ruta responde 400). Sin `periodo`, «hoy».
 */
export function leerPeriodo(params: URLSearchParams): PeriodoPedido | null {
  const crudo = params.get('periodo') ?? 'hoy';
  if (!(PERIODOS_INICIO as readonly string[]).includes(crudo)) return null;
  const periodo = crudo as PeriodoInicio;

  const hi = params.get('horaInicio') || null;
  const hf = params.get('horaFin') || null;
  if ((hi && !RE_HORA.test(hi)) || (hf && !RE_HORA.test(hf))) return null;
  const horas = hi || hf ? { horaInicio: hi, horaFin: hf } : null;

  let fechas: FechasPeriodo | null = null;
  if (periodo === 'personalizado') {
    const d = params.get('desde');
    const h = params.get('hasta');
    if (!d || !h || !RE_DIA.test(d) || !RE_DIA.test(h) || Number.isNaN(Date.parse(d)) || Number.isNaN(Date.parse(h)) || d > h) {
      return null;
    }
    // Mismo tope que las funciones de la base (400 días).
    if ((Date.parse(h) - Date.parse(d)) / MS_DIA > 399) return null;
    fechas = { fechaInicio: d, fechaFin: h };
  }
  return { periodo, horas, fechas };
}

/** Query string del periodo para las rutas del inicio (lado navegador). */
export function queryPeriodo(p: {
  periodo: PeriodoInicio;
  horas?: HorasPeriodo | null;
  fechas?: FechasPeriodo | null;
  sucursal?: number | null;
}): string {
  const qs = new URLSearchParams({ periodo: p.periodo });
  if (p.horas?.horaInicio) qs.set('horaInicio', p.horas.horaInicio);
  if (p.horas?.horaFin) qs.set('horaFin', p.horas.horaFin);
  if (p.periodo === 'personalizado' && p.fechas) {
    qs.set('desde', p.fechas.fechaInicio);
    qs.set('hasta', p.fechas.fechaFin);
  }
  if (p.sucursal) qs.set('sucursal', String(p.sucursal));
  return qs.toString();
}
