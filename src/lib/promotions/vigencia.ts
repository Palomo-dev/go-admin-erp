/**
 * Qué significa que una promoción esté «activa AHORA». Módulo PURO: sin
 * Supabase, sin React, sin `Date.now()` implícito. Todo lo que decide entra
 * por parámetro.
 *
 * Existe por CLAUDE.md §7 y por un defecto real de la ronda 1 de la Fase 4:
 * `promotionEngine.loadActivePromotions` descarta en memoria las promociones
 * cuyo `applicable_days` no incluye el día de hoy, y la ruta de la cartelera
 * de la pantalla del cliente (`/api/pos/display/promotions`) no lo hacía —ni
 * siquiera seleccionaba la columna—. Resultado: la pantalla anunciaba al
 * cliente la promoción «solo sábados» un martes y el POS no se la aplicaba.
 * En la base hay hoy 12 de 19 promociones con días restringidos, así que no
 * era un caso de laboratorio.
 *
 * Por qué en memoria y no en SQL: PostgREST no combina bien
 * `or(is.null,gte)` con el resto de filtros (lo documenta el propio
 * promotionEngine al filtrar `end_date` a mano), y `applicable_days` y
 * `branches` son `jsonb` —una lista vacía, un nulo y una lista con elementos
 * se comportan distinto en `cs` / `eq`—. Filtrar aquí cuesta un recorrido de
 * unas decenas de filas y quita de encima una consulta que nadie había
 * ejecutado nunca contra datos reales con sucursales.
 */

import { JS_DAY_TO_WEEKDAY, type WeekDay } from '@/components/pos/promociones/types';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';

/** Lo mínimo que hay que leer de una fila de `promotions` para decidir si aplica hoy. */
export interface PromotionVigencia {
  /** `unknown` a propósito: aquí entran tanto filas tipadas como `Record<string, unknown>` recién leídas. */
  end_date?: unknown;
  applicable_days?: unknown;
  branches?: unknown;
}

/**
 * Día de la semana de una fecha CALENDARIO `YYYY-MM-DD` (la de la zona
 * horaria de la organización, resuelta con `toPlainDate`). Se interpreta a
 * mediodía UTC para que ningún desfase la corra de día: lo prohibido es
 * derivar el día de un `Date` con `getDay()` y el huso del proceso
 * (CLAUDE.md, reglas de fechas).
 */
export function weekDayOfPlainDate(plainDate: string): WeekDay {
  const [y, m, d] = plainDate.split('-').map((part) => Number(part));
  const day = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).getUTCDay();
  return JS_DAY_TO_WEEKDAY[day];
}

// `weekDayOfLocalDate` (día con `getDay()` del reloj del navegador) se retiró
// el 2026-10-07: el POS de un cajero con el equipo en otra zona, o la ruta de
// servidor en UTC, veían otro día. El día sale siempre de la zona de la
// organización: `diaSemanaEnZona` en `motorPromociones.ts`.

/**
 * ¿Aplica hoy según `applicable_days`? Mismo criterio que
 * `motorPromociones.promocionVigente`: lista nula, ausente, que no es
 * lista o VACÍA significa «todos los días»; con elementos, tiene que estar
 * el de hoy.
 */
export function appliesOnWeekDay(promotion: PromotionVigencia, weekDay: WeekDay): boolean {
  const days = promotion.applicable_days;
  if (!Array.isArray(days) || days.length === 0) return true;
  return days.includes(weekDay);
}

/**
 * ¿Sigue vigente a esta hora? `end_date` nulo o ausente = no vence. Una
 * fecha ilegible se trata como vencida: mejor no anunciar una promoción que
 * anunciar una que caducó.
 */
export function isWithinEndDate(promotion: PromotionVigencia, now: Date): boolean {
  const end = promotion.end_date;
  if (end === null || end === undefined || end === '') return true;
  if (typeof end !== 'string' && !(end instanceof Date)) return false;
  const at = new Date(end).getTime();
  if (!Number.isFinite(at)) return false;
  return at >= now.getTime();
}

/**
 * ¿Alcanza a esta sucursal? `branches` es `jsonb`: nulo, ausente o lista
 * vacía = todas las sucursales (así están hoy las 19 filas de la base);
 * con elementos, tiene que estar la de la terminal. Se comparan como número
 * y como cadena porque el JSON guardado por la interfaz puede traer
 * cualquiera de los dos.
 */
export interface FranjaHoraria {
  start_time?: unknown;
  end_time?: unknown;
}

function horaConZona(ahora: Date, zona: string): string | null {
  try {
    const partes = new Intl.DateTimeFormat('en-GB', {
      timeZone: zona,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(ahora);
    const tomar = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '00';
    return `${tomar('hour')}:${tomar('minute')}:${tomar('second')}`;
  } catch {
    return null;
  }
}

/** `HH:mm:ss` en la zona de la organización. Zona ilegible → America/Bogota y, si tampoco, UTC. */
export function horaEnZona(ahora: Date, zonaHoraria: string): string {
  return horaConZona(ahora, zonaHoraria || DEFAULT_TIMEZONE)
    ?? horaConZona(ahora, DEFAULT_TIMEZONE)
    ?? horaConZona(ahora, 'UTC')
    ?? '00:00:00';
}

function horaNormalizada(valor: unknown): string | null {
  if (valor == null || valor === '') return null;
  const texto = String(valor).trim();
  const m = texto.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = m[1].padStart(2, '0');
  const mm = m[2];
  const ss = (m[3] ?? '00').padStart(2, '0');
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return null;
  return `${hh}:${mm}:${ss}`;
}

/**
 * ¿La hora cae en la franja? Sin hora de inicio ni de fin, aplica todo el día.
 * Si el fin es anterior al inicio, la franja cruza la medianoche.
 */
export function appliesInTimeWindow(promotion: FranjaHoraria, hora: string): boolean {
  const inicio = horaNormalizada(promotion.start_time);
  const fin = horaNormalizada(promotion.end_time);
  if (!inicio && !fin) return true;
  if (inicio && !fin) return hora >= inicio;
  if (!inicio && fin) return hora <= fin;
  if (inicio! <= fin!) return hora >= inicio! && hora <= fin!;
  return hora >= inicio! || hora <= fin!;
}

/** Día anterior de la semana (lunes → domingo). */
export function diaAnterior(dia: WeekDay): WeekDay {
  const orden: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return orden[(orden.indexOf(dia) + 6) % 7];
}

/**
 * ¿La hora cae en la «madrugada» de una franja que cruza la medianoche?
 * (inicio > fin y hora ≤ fin, p. ej. 18:00–02:00 a la 01:00). Esa madrugada
 * pertenece al día en que EMPEZÓ la franja, no al día del reloj.
 */
export function esMadrugadaDeFranja(promotion: FranjaHoraria, hora: string): boolean {
  const inicio = horaNormalizada(promotion.start_time);
  const fin = horaNormalizada(promotion.end_time);
  if (!inicio || !fin || inicio <= fin) return false;
  return hora <= fin && hora < inicio;
}

/**
 * Día de la semana contra el que se evalúa `applicable_days`. Una promo
 * «lunes a miércoles 18:00–02:00» sigue vigente el jueves a la 01:00 porque
 * esa madrugada es la cola de la franja del miércoles.
 */
export function diaEfectivoDeFranja(promotion: FranjaHoraria, diaReloj: WeekDay, hora: string): WeekDay {
  return esMadrugadaDeFranja(promotion, hora) ? diaAnterior(diaReloj) : diaReloj;
}

export function appliesToBranch(promotion: PromotionVigencia, branchId: number | null): boolean {
  const branches = promotion.branches;
  if (!Array.isArray(branches) || branches.length === 0) return true;
  if (branchId === null) return false;
  return branches.some((b) => b === branchId || String(b) === String(branchId));
}
