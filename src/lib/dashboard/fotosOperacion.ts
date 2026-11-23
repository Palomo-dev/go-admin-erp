/**
 * Fotos diarias de la operación (`ops_daily_snapshots`): la base de comparación de los widgets
 * de Logística y Transporte del inicio (Figma `03` › Inicio, 2917:45049 «Atrasados 5 +2» y
 * 2917:45560 «Ocupación 78 % +5 pp» con su mini-gráfica; aprobado el 2026-11-23).
 *
 * Regla pura, sin red. La foto la toma el cron `/api/cron/fotos-operacion` una vez al día por
 * organización, en la última hora del día de su zona (`tocaFoto`), con las MISMAS reglas de las
 * pantallas (`kpisDespacho` y `resumenViajesHoy`): aquí solo se decide qué se guarda y cómo se
 * compara.
 *
 * Comparación: la cifra de ahora contra la foto del cierre de AYER (etiqueta «vs. cierre de
 * ayer»). Sin foto de ayer no hay delta: nunca se inventa. La mini-gráfica son las fotos de los
 * últimos `DIAS_SERIE` días más la cifra de ahora, y solo se pinta con dos puntos o más.
 */
import { addPlainDays, startOfDayInstant, toPlainDate } from '@/lib/utils/dateCore';
import type { KpisDespacho } from '@/lib/logistica/despacho';
import type { TextoModulo } from './resumenModulos';

export const METRICAS_LOGISTICA = ['logistica.atrasados', 'logistica.por_despachar', 'logistica.sin_domiciliario'] as const;
export const METRICAS_TRANSPORTE = ['transporte.viajes', 'transporte.ocupacion_pct', 'transporte.bloqueados'] as const;
export type MetricaFoto = (typeof METRICAS_LOGISTICA)[number] | (typeof METRICAS_TRANSPORTE)[number];

const METRICAS = new Set<string>([...METRICAS_LOGISTICA, ...METRICAS_TRANSPORTE]);

/** Días de fotos que se leen para la mini-gráfica (la de ayer va incluida). */
export const DIAS_SERIE = 14;

/** Hora local (0–23) en la que el cron toma la foto del día: la última, el «cierre». */
export const HORA_FOTO = 23;

/** Texto de la etiqueta de comparación (namespace `inicioWidgets`). */
export const ETIQUETA_COMPARACION: TextoModulo = { clave: 'comun.vsCierreAyer' };

export interface FotoDia {
  /** Día local `YYYY-MM-DD`. */
  fecha: string;
  metrica: MetricaFoto;
  valor: number;
}

/** Fila a guardar (la escribe el cron con service_role). */
export interface FilaFoto {
  organization_id: number;
  branch_id: number | null;
  fecha: string;
  metrica: MetricaFoto;
  valor: number;
}

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Filas de la base → fotos válidas (tolerante: una fila rara se descarta). */
export function leerFotos(crudo: unknown): FotoDia[] {
  if (!Array.isArray(crudo)) return [];
  const salida: FotoDia[] = [];
  for (const x of crudo) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const valor = typeof r.valor === 'number' ? r.valor : typeof r.valor === 'string' ? Number(r.valor) : NaN;
    if (typeof r.fecha !== 'string' || !RE_DIA.test(r.fecha) || typeof r.metrica !== 'string' || !METRICAS.has(r.metrica) || !Number.isFinite(valor)) continue;
    salida.push({ fecha: r.fecha, metrica: r.metrica as MetricaFoto, valor });
  }
  return salida;
}

export interface Comparacion {
  /** Cifra de ahora menos la foto del cierre de ayer; null sin foto de ayer. */
  delta: number | null;
  /** Fotos de los últimos días (en orden) y la cifra de ahora; vacía con menos de dos puntos. */
  serie: number[];
}

export function comparar(fotos: readonly FotoDia[] | null | undefined, metrica: MetricaFoto, hoy: string, actual: number | null): Comparacion {
  if (!fotos || actual === null || !Number.isFinite(actual)) return { delta: null, serie: [] };
  const ayer = addPlainDays(hoy, -1);
  const desde = addPlainDays(hoy, -DIAS_SERIE);
  const propias = fotos
    .filter((f) => f.metrica === metrica && f.fecha < hoy && f.fecha >= desde)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const base = propias.find((f) => f.fecha === ayer);
  const serie = [...propias.map((f) => f.valor), actual];
  return { delta: base ? actual - base.valor : null, serie: serie.length >= 2 ? serie : [] };
}

/** Lo que se guarda de Logística: las cifras de Por despachar (`kpisDespacho`). */
export function valoresLogistica(k: Pick<KpisDespacho, 'atrasados' | 'porDespachar' | 'sinDomiciliario'>): Array<[MetricaFoto, number]> {
  return [
    ['logistica.atrasados', k.atrasados],
    ['logistica.por_despachar', k.porDespachar],
    ['logistica.sin_domiciliario', k.sinDomiciliario],
  ];
}

/** Lo que se guarda de Transporte: viajes de hoy, ocupación de los salidos (si hay) y bloqueados. */
export function valoresTransporte(r: { total: number; pctOcupacion: number | null; bloqueados: number }): Array<[MetricaFoto, number]> {
  return [
    ['transporte.viajes', r.total],
    ...(r.pctOcupacion === null ? [] : ([['transporte.ocupacion_pct', r.pctOcupacion]] as Array<[MetricaFoto, number]>)),
    ['transporte.bloqueados', r.bloqueados],
  ];
}

/** Hora local (0–23) de `ahora` en `zona`. */
export function horaLocal(ahora: Date, zona: string): number {
  const inicio = startOfDayInstant(toPlainDate(ahora, zona), zona).getTime();
  return Math.min(23, Math.max(0, Math.floor((ahora.getTime() - inicio) / 3_600_000)));
}

/** ¿Le toca la foto del día a esta organización? Solo en la última hora de su día. */
export function tocaFoto(ahora: Date, zona: string): boolean {
  return horaLocal(ahora, zona) === HORA_FOTO;
}
