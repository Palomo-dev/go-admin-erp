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

/**
 * Día de la semana del reloj LOCAL de quien ejecuta. Solo para
 * `promotionEngine`, que corre en el navegador del cajero y siempre lo ha
 * hecho así; en servidor hay que usar `weekDayOfPlainDate` con la zona
 * horaria de la organización, porque el proceso va en UTC.
 */
export function weekDayOfLocalDate(date: Date): WeekDay {
  return JS_DAY_TO_WEEKDAY[date.getDay()];
}

/**
 * ¿Aplica hoy según `applicable_days`? Mismo criterio que
 * `promotionEngine.loadActivePromotions`: lista nula, ausente, que no es
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
export function appliesToBranch(promotion: PromotionVigencia, branchId: number | null): boolean {
  const branches = promotion.branches;
  if (!Array.isArray(branches) || branches.length === 0) return true;
  if (branchId === null) return false;
  return branches.some((b) => b === branchId || String(b) === String(branchId));
}
