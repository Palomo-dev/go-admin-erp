/**
 * Hora oficial de un hecho de dinero (venta, pago, apertura de caja): lógica pura.
 *
 * Regla (docs/reglas-fechas-timezone.md §«Hora oficial», análisis en
 * docs/design/HORA-SERVIDOR-ANALISIS.md): la hora la pone el servidor. La del
 * equipo solo cuenta en una operación hecha SIN CONEXIÓN, y solo si el desfase
 * del reloj del equipo contra el servidor, medido antes de quedarse sin red,
 * era conocido y no pasaba de 10 minutos.
 *
 * Es el espejo de `public.fn_hora_oficial_resolver` (migración
 * 20260930190001): los tests de `__tests__/horaOficial.test.ts` recorren los
 * mismos casos que la prueba en seco de esa función. Si cambias uno, cambia el
 * otro.
 *
 * Convención de signo: desfase = reloj del equipo − reloj del servidor
 * (positivo = el equipo va adelantado), igual que `sales.clock_skew_seconds`.
 */

import { toPlainDate } from '@/lib/utils/dateCore';

/**
 * Valor para marcar un cierre (`closed_at`, …) desde el navegador SIN usar su
 * reloj: Postgres convierte la cadena 'now' en la hora de la transacción del
 * servidor. El trigger `trg_00_hora_oficial` impone igualmente now() sobre
 * cualquier valor que mande el navegador; esto deja la intención explícita.
 */
export const HORA_DEL_SERVIDOR = 'now';

/** A partir de este desfase se avisa al cajero (no bloquea). */
export const UMBRAL_AVISO_MS = 2 * 60_000;
/** Desfase máximo con el que la hora de una venta sin conexión se acepta como oficial. */
export const UMBRAL_DIA_CONTABLE_MS = 10 * 60_000;
/** Una hora del equipo más adelantada que esto respecto al servidor no se acepta. */
export const TOLERANCIA_FUTURO_MS = 5 * 60_000;
/** Una venta sin conexión más antigua que esto no conserva su hora. */
export const ANTIGUEDAD_MAXIMA_MS = 30 * 24 * 60 * 60_000;

export type MotivoRevisionHora = 'reloj_desfasado' | 'desfase_desconocido' | 'hora_futura' | 'hora_muy_antigua';

export interface EntradaHoraOficial {
  /** Hora que puso el equipo (ISO o Date). */
  horaEquipo: string | Date | null | undefined;
  /** Desfase medido del equipo en ms (equipo − servidor); null si nunca se midió. */
  desfaseMs: number | null | undefined;
  /** true solo para una operación hecha sin red que se sincroniza después. */
  sinConexion: boolean;
  /** Hora del servidor en el momento de registrar (en SQL, `now()`). */
  ahoraServidor: Date;
  /** Umbral del día contable; por omisión 10 min. */
  umbralMs?: number;
}

export interface HoraOficial {
  instante: Date;
  /** null = la hora es fiable; si no, la venta queda marcada para revisión (sin bloquearla). */
  motivoRevision: MotivoRevisionHora | null;
}

function aDate(valor: string | Date | null | undefined): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Misma decisión que `fn_hora_oficial_resolver`. */
export function resolverHoraOficial(entrada: EntradaHoraOficial): HoraOficial {
  const ahora = entrada.ahoraServidor;
  const equipo = aDate(entrada.horaEquipo);
  const umbral = entrada.umbralMs ?? UMBRAL_DIA_CONTABLE_MS;
  const servidor = (motivo: MotivoRevisionHora | null): HoraOficial => ({ instante: ahora, motivoRevision: motivo });

  if (!entrada.sinConexion || !equipo) return servidor(null);
  const t = equipo.getTime();
  if (t > ahora.getTime() + TOLERANCIA_FUTURO_MS) return servidor('hora_futura');
  if (t < ahora.getTime() - ANTIGUEDAD_MAXIMA_MS) return servidor('hora_muy_antigua');
  if (entrada.desfaseMs === null || entrada.desfaseMs === undefined || !Number.isFinite(entrada.desfaseMs)) {
    return servidor('desfase_desconocido');
  }
  if (Math.abs(entrada.desfaseMs) > umbral) return servidor('reloj_desfasado');
  return { instante: equipo, motivoRevision: null };
}

/**
 * Día contable (YYYY-MM-DD en la zona de la organización) de la hora oficial.
 * Es el día en que la venta cuenta para el cierre y los reportes.
 */
export function diaContable(entrada: EntradaHoraOficial, timezone: string): string {
  return toPlainDate(resolverHoraOficial(entrada).instante, timezone);
}

/**
 * Desfase del equipo contra el servidor a partir de una medición de ida y
 * vuelta: el servidor respondió `servidorMs` en algún momento entre
 * `antesMs` y `despuesMs` (reloj del equipo); se toma el punto medio.
 */
export function calcularDesfaseMs(medicion: { antesMs: number; despuesMs: number; servidorMs: number }): number {
  const medio = medicion.antesMs + (medicion.despuesMs - medicion.antesMs) / 2;
  return Math.round(medio - medicion.servidorMs);
}

/** true si el desfase merece el aviso al cajero (por omisión, más de 2 min). */
export function desfaseRelevante(desfaseMs: number | null | undefined, umbralMs: number = UMBRAL_AVISO_MS): boolean {
  return typeof desfaseMs === 'number' && Number.isFinite(desfaseMs) && Math.abs(desfaseMs) > umbralMs;
}

/** Minutos enteros de desfase para el aviso (siempre positivo). */
export function minutosDeDesfase(desfaseMs: number): number {
  return Math.max(1, Math.round(Math.abs(desfaseMs) / 60_000));
}
