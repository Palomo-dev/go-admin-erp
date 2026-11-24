/**
 * «Seguimiento»: una sola lista «Por resolver» (Figma «22 Logística» 2825:8985, con selección
 * 2827:8980, celular 2828:9609). Puro: sin Supabase ni React.
 *
 * Por resolver = lo que necesita a alguien hoy: una NOVEDAD (intento fallido, rechazo, dirección
 * mala, daño…) o un envío SIN MOVIMIENTO desde las horas que fija Configuración › Logística
 * (`horasSinMovimiento`: por defecto 2 h domiciliario propio y 24 h transportadora). Cada fila trae
 * su plazo (lo que vence primero va arriba) y una acción sugerida según el motivo.
 */
import { normalizarTexto } from './presentacionEnvio';
import { transicionValida } from './estadosEnvio';
import { AJUSTES_LOGISTICA_POR_DEFECTO, horasSinMovimiento, type AjustesLogistica } from './ajustesLogistica';

/** Umbral «sin movimiento» de una fila: el de los ajustes de la organización según quién la lleva. */
export function umbralSinMovimiento(f: Pick<FilaSeguimiento, 'transportadora'>, ajustes: AjustesLogistica = AJUSTES_LOGISTICA_POR_DEFECTO): number {
  return horasSinMovimiento(ajustes, !!f.transportadora);
}
/** Meta de entregas al primer intento (Figma 2825:8985, «Meta 90 %»). */
export const META_PRIMER_INTENTO = 0.9;

/** Estados en curso que pueden quedarse quietos. */
export const ESTADOS_EN_CURSO_SEGUIMIENTO = [
  'assigned', 'ready', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery',
] as const;
/** Estados con novedad abierta. */
export const ESTADOS_CON_NOVEDAD_ABIERTA = ['failed_attempt', 'failed'] as const;

export const CHIPS_SEGUIMIENTO = ['todo', 'novedades', 'sin_movimiento'] as const;
export type ChipSeguimiento = (typeof CHIPS_SEGUIMIENTO)[number];

export type TipoPorResolver = 'novedad' | 'sin_movimiento';

export const ACCIONES_SUGERIDAS = [
  'reintentar',
  'cambiar_direccion',
  'contactar_cliente',
  'consultar_proveedor',
  'abrir_reclamo',
  'ver_detalle',
] as const;
export type AccionSugerida = (typeof ACCIONES_SUGERIDAS)[number];

/** Qué pasa si nadie responde antes del plazo (texto bajo la hora). */
export type Consecuencia = 'reclamo' | 'devolucion' | 'ultimo_intento' | 'vuelve_a_bodega' | 'revisar';

export interface FilaSeguimiento {
  id: string;
  numero: string;
  status: string;
  modo: string;
  pedido: string | null;
  pedidoWebId: string | null;
  canal: string;
  cliente: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  barrio: string | null;
  /** null = domiciliario propio; si no, el nombre de la transportadora. */
  transportadora: string | null;
  guia: string | null;
  sede: string | null;
  domiciliario: string | null;
  promesa: string | null;
  /** Último evento (o última actualización del envío si no hay eventos). */
  ultimoMovimiento: string;
  /** Descripción del último evento (texto del proveedor o nota del domiciliario). */
  ultimoEvento: string | null;
  motivoNovedad: string | null;
  detalleNovedad: string | null;
  intentosFallidos: number;
  /** Día reprogramado del último intento (`date`), si lo hay. */
  reprogramado: string | null;
}

export interface PorResolver {
  tipo: TipoPorResolver;
  /** Horas sin movimiento (solo `sin_movimiento`). */
  horas: number;
}

const HORA = 3_600_000;

export function horasDesde(iso: string | null | undefined, ahora: Date): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - t) / HORA));
}

/**
 * ¿La fila está por resolver? y por qué. «Sin movimiento» desde `umbralSinMovimiento` horas (los
 * ajustes de la organización; sin ellos, los valores por defecto).
 */
export function porResolver(
  f: Pick<FilaSeguimiento, 'status' | 'ultimoMovimiento' | 'transportadora'>,
  ahora: Date,
  ajustes: AjustesLogistica = AJUSTES_LOGISTICA_POR_DEFECTO,
): PorResolver | null {
  if ((ESTADOS_CON_NOVEDAD_ABIERTA as readonly string[]).includes(f.status)) return { tipo: 'novedad', horas: horasDesde(f.ultimoMovimiento, ahora) };
  if ((ESTADOS_EN_CURSO_SEGUIMIENTO as readonly string[]).includes(f.status)) {
    const horas = horasDesde(f.ultimoMovimiento, ahora);
    if (horas >= umbralSinMovimiento(f, ajustes)) return { tipo: 'sin_movimiento', horas };
  }
  return null;
}

/** Acción sugerida (columna «Acción sugerida»): sale del motivo, o del tipo de envío si está quieto. */
export function accionSugerida(
  f: Pick<FilaSeguimiento, 'status' | 'motivoNovedad' | 'transportadora' | 'ultimoMovimiento'>,
  ahora: Date,
  ajustes: AjustesLogistica = AJUSTES_LOGISTICA_POR_DEFECTO,
): AccionSugerida {
  const pr = porResolver(f, ahora, ajustes);
  if (pr?.tipo === 'sin_movimiento') return f.transportadora ? 'consultar_proveedor' : 'ver_detalle';
  switch (f.motivoNovedad) {
    case 'wrong_address':
    case 'incomplete_address':
      return 'cambiar_direccion';
    case 'rejected':
    case 'customer_request':
      return 'contactar_cliente';
    case 'damaged':
    case 'lost':
      return f.transportadora ? 'abrir_reclamo' : 'ver_detalle';
    case 'not_home':
    case 'business_closed':
    case 'access_denied':
    case 'weather':
    case 'vehicle_issue':
      return transicionValida(f.status, 'out_for_delivery') ? 'reintentar' : 'ver_detalle';
    default:
      return 'ver_detalle';
  }
}

/** Acciones que la Fase 1 no puede ejecutar (necesitan el conector de la transportadora, Fase 2). */
export function accionRequiereConector(a: AccionSugerida): boolean {
  return a === 'consultar_proveedor' || a === 'abrir_reclamo';
}

/**
 * Plazo de la fila: hasta cuándo hay que resolver. Novedad: la hora prometida si sigue en el
 * futuro, si no 24 h después del último movimiento. Sin movimiento: 48 h después del último
 * movimiento (pasado eso, la transportadora suele devolver o hay que reclamar).
 */
export function plazoDe(
  f: Pick<FilaSeguimiento, 'status' | 'promesa' | 'ultimoMovimiento' | 'transportadora'>,
  ahora: Date,
  ajustes: AjustesLogistica = AJUSTES_LOGISTICA_POR_DEFECTO,
): string {
  const base = new Date(f.ultimoMovimiento).getTime();
  const pr = porResolver(f, ahora, ajustes);
  if (pr?.tipo === 'novedad') {
    const promesa = f.promesa ? new Date(f.promesa).getTime() : NaN;
    if (Number.isFinite(promesa) && promesa > ahora.getTime()) return new Date(promesa).toISOString();
    return new Date((Number.isFinite(base) ? base : ahora.getTime()) + 24 * HORA).toISOString();
  }
  return new Date((Number.isFinite(base) ? base : ahora.getTime()) + 48 * HORA).toISOString();
}

export function consecuenciaDe(
  f: Pick<FilaSeguimiento, 'status' | 'motivoNovedad' | 'transportadora' | 'intentosFallidos' | 'ultimoMovimiento'>,
  ahora: Date,
  ajustes: AjustesLogistica = AJUSTES_LOGISTICA_POR_DEFECTO,
): Consecuencia {
  const pr = porResolver(f, ahora, ajustes);
  if (pr?.tipo === 'sin_movimiento') return f.transportadora ? 'reclamo' : 'revisar';
  if (f.transportadora) return f.motivoNovedad === 'damaged' || f.motivoNovedad === 'lost' ? 'reclamo' : 'devolucion';
  if (f.motivoNovedad === 'rejected') return 'vuelve_a_bodega';
  return f.intentosFallidos >= 2 ? 'ultimo_intento' : 'revisar';
}

export interface FiltrosSeguimiento {
  chip?: ChipSeguimiento;
  busqueda?: string;
  propio?: 'propio' | 'transportadora' | null;
}

export function coincideBusquedaSeguimiento(f: FilaSeguimiento, termino: string): boolean {
  const t = normalizarTexto(termino);
  if (!t) return true;
  return [f.numero, f.pedido, f.guia, f.cliente, f.direccion, f.barrio, f.ciudad].some((s) => normalizarTexto(s).includes(t));
}

/** Solo las filas por resolver, filtradas y ordenadas por plazo (lo que vence primero, arriba). */
export function listaPorResolver(
  filas: readonly FilaSeguimiento[],
  filtros: FiltrosSeguimiento,
  ahora: Date,
  ajustes: AjustesLogistica = AJUSTES_LOGISTICA_POR_DEFECTO,
): FilaSeguimiento[] {
  const chip = filtros.chip ?? 'todo';
  return filas
    .filter((f) => {
      const pr = porResolver(f, ahora, ajustes);
      if (!pr) return false;
      if (chip === 'novedades' && pr.tipo !== 'novedad') return false;
      if (chip === 'sin_movimiento' && pr.tipo !== 'sin_movimiento') return false;
      if (filtros.propio === 'propio' && f.transportadora) return false;
      if (filtros.propio === 'transportadora' && !f.transportadora) return false;
      return !filtros.busqueda || coincideBusquedaSeguimiento(f, filtros.busqueda);
    })
    .sort((a, b) => plazoDe(a, ahora, ajustes).localeCompare(plazoDe(b, ahora, ajustes)) || a.numero.localeCompare(b.numero));
}

export interface ConteosSeguimiento {
  todo: number;
  novedades: number;
  sinMovimiento: number;
  /** Novedades cuyo plazo vence hoy o ya venció. */
  vencenHoy: number;
  sinMovimientoTransportadora: number;
}

export function conteosSeguimiento(
  filas: readonly FilaSeguimiento[],
  ahora: Date,
  finDeHoy: Date,
  ajustes: AjustesLogistica = AJUSTES_LOGISTICA_POR_DEFECTO,
): ConteosSeguimiento {
  let novedades = 0;
  let sinMovimiento = 0;
  let vencenHoy = 0;
  let sinMovTransp = 0;
  for (const f of filas) {
    const pr = porResolver(f, ahora, ajustes);
    if (!pr) continue;
    if (pr.tipo === 'novedad') {
      novedades += 1;
      if (new Date(plazoDe(f, ahora, ajustes)).getTime() <= finDeHoy.getTime()) vencenHoy += 1;
    } else {
      sinMovimiento += 1;
      if (f.transportadora) sinMovTransp += 1;
    }
  }
  return { todo: novedades + sinMovimiento, novedades, sinMovimiento, vencenHoy, sinMovimientoTransportadora: sinMovTransp };
}

/** Entregas al primer intento: entregados sin intentos fallidos / entregados. null sin entregas. */
export function tasaPrimerIntento(entregados: readonly { failed_attempts?: number | null }[]): number | null {
  if (entregados.length === 0) return null;
  const primeros = entregados.filter((e) => !(Number(e.failed_attempts) > 0)).length;
  return primeros / entregados.length;
}
