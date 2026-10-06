/**
 * Reglas del listado de Pedidos online (Figma 447:195914): el periodo en la
 * zona de la organización, la promesa de cada pedido («A tiempo»), el
 * cumplimiento para el KPI y la variación contra el periodo anterior.
 *
 * Funciones puras: la pantalla pone la hora actual, la zona y los textos.
 */
import { getDateRange } from '@/lib/utils/dateRanges';
import { formatInstantWithOffset } from '@/lib/utils/dateCore';
import { sumarDiasCalendario } from '@/lib/utils/taskReminderDates';
import { esComerAqui, esDomicilio } from './tipoEntrega';

export type PeriodoListado = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom' | 'all';

export const PERIODOS_LISTADO: readonly PeriodoListado[] = ['today', 'yesterday', 'last7', 'last30', 'custom', 'all'];

export interface Rango {
  from?: string;
  to?: string;
}

/**
 * Rango del periodo y el del periodo anterior equivalente, «a la misma hora»
 * cuando el periodo llega hasta hoy. `hoy` es el día calendario de la
 * organización (`todayInTz`), nunca el del navegador.
 */
export function rangosDelPeriodo(
  periodo: PeriodoListado,
  zona: string,
  hoy: string,
  ahora: Date,
  personalizado: { desde?: string; hasta?: string } = {},
): { actual: Rango; anterior: Rango | null } {
  const dia = (d: string) => getDateRange(d, d, zona);
  const hastaAhora = (desplazamientoDias: number) =>
    formatInstantWithOffset(new Date(ahora.getTime() - desplazamientoDias * 86_400_000), zona);
  const desdeHasta = (desde: string, hasta: string) => {
    const r = getDateRange(desde, hasta, zona);
    return { from: r.start, to: r.end };
  };
  switch (periodo) {
    case 'today': {
      const r = dia(hoy);
      const ayer = sumarDiasCalendario(hoy, -1);
      return { actual: { from: r.start, to: r.end }, anterior: { from: dia(ayer).start, to: hastaAhora(1) } };
    }
    case 'yesterday': {
      const ayer = sumarDiasCalendario(hoy, -1);
      return { actual: desdeHasta(ayer, ayer), anterior: desdeHasta(sumarDiasCalendario(hoy, -2), sumarDiasCalendario(hoy, -2)) };
    }
    case 'last7':
    case 'last30': {
      const n = periodo === 'last7' ? 7 : 30;
      return {
        actual: desdeHasta(sumarDiasCalendario(hoy, -n), hoy),
        anterior: { from: dia(sumarDiasCalendario(hoy, -2 * n)).start, to: hastaAhora(n) },
      };
    }
    case 'custom': {
      const { desde, hasta } = personalizado;
      if (!desde || !hasta || desde > hasta) {
        return { actual: { from: desde ? dia(desde).start : undefined, to: hasta ? dia(hasta).end : undefined }, anterior: null };
      }
      const largo = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
      return {
        actual: desdeHasta(desde, hasta),
        anterior: desdeHasta(sumarDiasCalendario(desde, -largo), sumarDiasCalendario(desde, -1)),
      };
    }
    default:
      return { actual: {}, anterior: null };
  }
}

/** Variación porcentual redondeada; null sin base de comparación. */
export function variacionPct(actual: number, anterior: number | null | undefined): number | null {
  if (anterior == null || anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export interface PedidoPromesa {
  status: string;
  delivery_type?: string | null;
  internal_notes?: string | null;
  created_at: string;
  estimated_ready_at?: string | null;
  estimated_delivery_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
}

/** Qué se le prometió al cliente: la hora de entrega a domicilio o la de «listo». */
export function horaPrometida(p: PedidoPromesa): string | null {
  if (esDomicilio(p.delivery_type)) return p.estimated_delivery_at ?? p.estimated_ready_at ?? null;
  return p.estimated_ready_at ?? null;
}

/**
 * ¿Se cumplió la promesa? Para domicilio cuenta la entrega; para recoger y
 * «Comer aquí», la hora de «listo». null si no hubo promesa o aún no termina.
 */
export function cumplioPromesa(p: PedidoPromesa): boolean | null {
  const promesa = horaPrometida(p);
  if (!promesa) return null;
  const real = esDomicilio(p.delivery_type) ? p.delivered_at : p.ready_at ?? p.delivered_at;
  if (!real) return null;
  return Date.parse(real) <= Date.parse(promesa) + 60_000;
}

/** Porcentaje de pedidos medidos que cumplieron; null si no hay ninguno medido. */
export function porcentajeATiempo(pedidos: readonly PedidoPromesa[]): { pct: number | null; medidos: number } {
  let medidos = 0;
  let cumplidos = 0;
  for (const p of pedidos) {
    const r = cumplioPromesa(p);
    if (r === null) continue;
    medidos++;
    if (r) cumplidos++;
  }
  return { pct: medidos > 0 ? Math.round((cumplidos / medidos) * 100) : null, medidos };
}

export type TonoPromesa = 'exito' | 'peligro' | 'advertencia' | 'neutro';

/**
 * Columna «A tiempo»: qué se espera y cómo va. La pantalla traduce `clave`
 * (`sinConfirmar`, `listo`, `entrega`, `entregado`, `cancelado`) y `detalle`
 * (`haceSinPromesa`, `faltan`, `retraso`, `aTiempo`, `antes`).
 */
export interface Promesa {
  clave: 'sinConfirmar' | 'listo' | 'entrega' | 'entregado' | 'cancelado';
  /** Instante a mostrar junto a la clave (en la zona de la organización). */
  hora: string | null;
  detalle: { clave: 'haceSinPromesa' | 'faltan' | 'retraso' | 'aTiempo' | 'antes'; minutos: number } | null;
  tono: TonoPromesa;
}

/** Minutos sin confirmar a partir de los que el pedido pide atención. */
export const MINUTOS_ALERTA_SIN_CONFIRMAR = 10;

const minutos = (ms: number) => Math.max(0, Math.round(ms / 60_000));

export function promesaDelPedido(p: PedidoPromesa, ahora: Date): Promesa {
  const t = ahora.getTime();
  const domicilio = esDomicilio(p.delivery_type);

  if (['cancelled', 'rejected', 'expired'].includes(p.status)) {
    return { clave: 'cancelado', hora: p.cancelled_at ?? p.updated_at ?? null, detalle: null, tono: 'neutro' };
  }

  if (p.status === 'pending') {
    const espera = minutos(t - Date.parse(p.created_at));
    return {
      clave: 'sinConfirmar',
      hora: null,
      detalle: { clave: 'haceSinPromesa', minutos: espera },
      tono: espera >= MINUTOS_ALERTA_SIN_CONFIRMAR ? 'peligro' : 'advertencia',
    };
  }

  if (p.status === 'delivered') {
    const promesa = horaPrometida(p);
    const real = domicilio ? p.delivered_at : p.delivered_at ?? p.ready_at;
    if (!promesa || !real) return { clave: 'entregado', hora: real ?? null, detalle: null, tono: 'neutro' };
    // Para recoger y «Comer aquí» se compara «listo» con lo prometido; la hora
    // que se muestra es la de la entrega.
    const medido = domicilio ? real : p.ready_at ?? real;
    const diferencia = Date.parse(medido) - Date.parse(promesa);
    if (diferencia > 60_000) return { clave: 'entregado', hora: real, detalle: { clave: 'retraso', minutos: minutos(diferencia) }, tono: 'peligro' };
    if (diferencia < -60_000) return { clave: 'entregado', hora: real, detalle: { clave: 'antes', minutos: minutos(-diferencia) }, tono: 'exito' };
    return { clave: 'entregado', hora: real, detalle: { clave: 'aTiempo', minutos: 0 }, tono: 'exito' };
  }

  // Ya listo o en camino a domicilio: lo que cuenta es la entrega.
  if (domicilio && ['ready', 'in_delivery'].includes(p.status) && p.estimated_delivery_at) {
    const objetivo = Date.parse(p.estimated_delivery_at);
    if (t > objetivo + 60_000) {
      return { clave: 'entrega', hora: p.estimated_delivery_at, detalle: { clave: 'retraso', minutos: minutos(t - objetivo) }, tono: 'peligro' };
    }
    return { clave: 'entrega', hora: p.estimated_delivery_at, detalle: { clave: 'aTiempo', minutos: 0 }, tono: 'exito' };
  }

  // Listo para recoger o para la mesa: cómo salió frente a lo prometido.
  if (p.status === 'ready' && p.ready_at) {
    if (!p.estimated_ready_at) return { clave: 'listo', hora: p.ready_at, detalle: null, tono: 'neutro' };
    const diferencia = Date.parse(p.ready_at) - Date.parse(p.estimated_ready_at);
    return diferencia > 60_000
      ? { clave: 'listo', hora: p.ready_at, detalle: { clave: 'retraso', minutos: minutos(diferencia) }, tono: 'peligro' }
      : { clave: 'listo', hora: p.ready_at, detalle: { clave: 'aTiempo', minutos: 0 }, tono: 'exito' };
  }

  // Confirmado o en preparación: cuánto falta para «listo».
  if (!p.estimated_ready_at) return { clave: 'listo', hora: null, detalle: null, tono: 'neutro' };
  const objetivo = Date.parse(p.estimated_ready_at);
  if (t > objetivo + 60_000) {
    return { clave: 'listo', hora: p.estimated_ready_at, detalle: { clave: 'retraso', minutos: minutos(t - objetivo) }, tono: 'peligro' };
  }
  return { clave: 'listo', hora: p.estimated_ready_at, detalle: { clave: 'faltan', minutos: minutos(objetivo - t) }, tono: 'exito' };
}

/** Clave del origen para «14:05 · Tienda web (QR de mesa)». */
export function origenDelPedido(p: { source?: string | null } & Parameters<typeof esComerAqui>[0]): {
  clave: 'website' | 'mobile_app' | 'whatsapp' | 'phone' | 'otro';
  qrMesa: boolean;
} {
  const s = p.source;
  const clave = s === 'website' || s === 'mobile_app' || s === 'whatsapp' || s === 'phone' ? s : 'otro';
  return { clave, qrMesa: esComerAqui(p) };
}
