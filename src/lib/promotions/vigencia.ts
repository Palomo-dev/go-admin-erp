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
import { DEFAULT_TIMEZONE, toPlainDate } from '@/lib/utils/dateCore';

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

/** Franja diaria del esquema de siempre (`start_time`/`end_time`). */
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
 * ¿La hora cae en la franja diaria? Sin hora de inicio ni de fin, aplica todo
 * el día. Si el fin es anterior al inicio, la franja cruza la medianoche.
 * Solo mira la hora, no el día: para decidir si una promoción aplica se usa
 * `vigenteEnHorario`. Queda para `solapamiento.franjasSeCruzan`.
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

// ─── Horario semanal: UN SOLO criterio para todo el ERP ─────────────────────
//
// Desde 20261120180000 una promoción puede tener su horario de dos formas:
//
//   1. Esquema de siempre: `applicable_days` + UNA franja diaria
//      `start_time`/`end_time`. Si el fin es anterior al inicio, la franja
//      cruza la medianoche y la madrugada cuenta como el día en que empezó
//      («lunes a miércoles 18:00–02:00» sigue el jueves a la 01:00). Extremos
//      incluidos al segundo: 02:00:00 todavía aplica, 02:00:01 ya no.
//   2. `schedule_windows`: lista de franjas SEMANALES que pueden cruzar días
//      («sábado 16:00 → domingo 14:00»), fin EXCLUSIVO (a las 14:00 ya no) y
//      duración menor que una semana. Si la columna trae una lista no vacía,
//      manda ella y el esquema 1 se ignora.
//
// Las dos se reducen a lo mismo: tramos [inicio, fin) en SEGUNDOS desde el
// lunes 00:00 de la semana, en la hora de pared de la zona de la
// organización. Un tramo puede pasar del domingo (fin > 7 días) y entonces
// sigue en el lunes siguiente. El motor del POS, la cartelera de la pantalla
// del cliente, el aviso de solapamiento y la vista previa del asistente
// salen todos de `tramosSemanalesDe`. La tienda web replica esta misma regla
// en `goadmin-websites/lib/promotions.ts` (`tramosSemanalesDe`).
//
// `end_date` y la cola de la franja: una ocurrencia pertenece al DÍA EN QUE
// EMPEZÓ. Si la promoción vence el sábado, la ocurrencia «sábado 16:00 →
// domingo 14:00» que empezó ese sábado sigue completa el domingo. Se compara
// `end_date` contra el último instante (23:59:59) del día de inicio cuando
// ya estamos en un día posterior; el mismo día, contra el instante actual.

export const SEGUNDOS_DIA = 24 * 60 * 60;
export const SEGUNDOS_SEMANA = 7 * SEGUNDOS_DIA;

/** Lunes primero: el índice × `SEGUNDOS_DIA` es el inicio del día en la semana. */
export const DIAS_DESDE_LUNES: readonly WeekDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Una franja de `promotions.schedule_windows`. Horas `HH:mm` de la zona de la organización. */
export interface FranjaSemanal {
  desde_dia: WeekDay;
  desde_hora: string;
  hasta_dia: WeekDay;
  hasta_hora: string;
}

/** Lo que hace falta leer de una fila para saber su horario semanal. */
export interface HorarioPromocion extends FranjaHoraria {
  applicable_days?: unknown;
  schedule_windows?: unknown;
}

/** [inicio, fin) en segundos desde el lunes 00:00. `inicio` ∈ [0, semana); `fin` ≤ `inicio` + semana. */
export type TramoSemanal = readonly [number, number];

function segundosDeHora(valor: unknown): number | null {
  const hora = horaNormalizada(valor);
  if (!hora) return null;
  const [hh, mm, ss] = hora.split(':').map((parte) => Number(parte));
  return hh * 3600 + mm * 60 + ss;
}

function indiceDia(dia: unknown): number {
  return DIAS_DESDE_LUNES.indexOf(dia as WeekDay);
}

/**
 * Una franja legible o `null`. Mismas reglas que el CHECK
 * `promotions_schedule_windows_forma`: días en inglés, horas `HH:mm` y
 * duración distinta de cero.
 */
export function franjaSemanalValida(valor: unknown): FranjaSemanal | null {
  if (!valor || typeof valor !== 'object') return null;
  const f = valor as Record<string, unknown>;
  if (indiceDia(f.desde_dia) < 0 || indiceDia(f.hasta_dia) < 0) return null;
  const desde = horaNormalizada(f.desde_hora);
  const hasta = horaNormalizada(f.hasta_hora);
  if (!desde || !hasta) return null;
  const franja: FranjaSemanal = {
    desde_dia: f.desde_dia as WeekDay,
    desde_hora: desde.slice(0, 5),
    hasta_dia: f.hasta_dia as WeekDay,
    hasta_hora: hasta.slice(0, 5),
  };
  return duracionFranjaSegundos(franja) > 0 ? franja : null;
}

/**
 * Franjas de `schedule_windows`. `null` = la fila usa el esquema de
 * siempre (columna nula, ausente, que no es lista o lista vacía). Con una
 * lista, las franjas ilegibles se descartan: si no queda ninguna, la
 * promoción no está nunca activa (mejor no aplicar que aplicar a ciegas).
 */
export function franjasSemanalesDe(valor: unknown): FranjaSemanal[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  return valor.map(franjaSemanalValida).filter((f): f is FranjaSemanal => f !== null);
}

/** Tramo de una franja: del día/hora de inicio al día/hora de fin, siempre hacia adelante. */
export function tramoDeFranja(f: FranjaSemanal): TramoSemanal {
  const inicio = indiceDia(f.desde_dia) * SEGUNDOS_DIA + (segundosDeHora(f.desde_hora) ?? 0);
  const fin = indiceDia(f.hasta_dia) * SEGUNDOS_DIA + (segundosDeHora(f.hasta_hora) ?? 0);
  const duracion = (((fin - inicio) % SEGUNDOS_SEMANA) + SEGUNDOS_SEMANA) % SEGUNDOS_SEMANA;
  return [inicio, inicio + duracion];
}

/** Duración de la franja en segundos (0 = inicio y fin iguales, inválida). */
export function duracionFranjaSegundos(f: FranjaSemanal): number {
  const [inicio, fin] = tramoDeFranja(f);
  return fin - inicio;
}

/** Tramos del esquema de siempre: una franja diaria por cada día aplicable. */
function tramosDelEsquemaDiario(p: HorarioPromocion): TramoSemanal[] {
  const ini = segundosDeHora(p.start_time);
  const fin = segundosDeHora(p.end_time);
  let desde: number;
  let hasta: number;
  // Extremos incluidos al segundo, igual que `appliesInTimeWindow`.
  if (ini == null && fin == null) { desde = 0; hasta = SEGUNDOS_DIA; }
  else if (ini != null && fin == null) { desde = ini; hasta = SEGUNDOS_DIA; }
  else if (ini == null && fin != null) { desde = 0; hasta = fin + 1; }
  else if (ini! <= fin!) { desde = ini!; hasta = fin! + 1; }
  else { desde = ini!; hasta = SEGUNDOS_DIA + fin! + 1; }
  return DIAS_DESDE_LUNES
    .map((dia, i) => [dia, i] as const)
    .filter(([dia]) => appliesOnWeekDay(p, dia))
    .map(([, i]) => [i * SEGUNDOS_DIA + desde, i * SEGUNDOS_DIA + hasta] as TramoSemanal);
}

/** Tramos semanales de la promoción, venga del esquema que venga. */
export function tramosSemanalesDe(p: HorarioPromocion): TramoSemanal[] {
  const franjas = franjasSemanalesDe(p.schedule_windows);
  if (franjas) return franjas.map(tramoDeFranja);
  return tramosDelEsquemaDiario(p);
}

/**
 * Día de la semana del instante en la zona de la organización. Zona
 * ilegible → `DEFAULT_TIMEZONE` (solo como respaldo). Nunca `getDay()`.
 */
export function diaEnZona(ahora: Date, zonaHoraria: string): WeekDay {
  for (const zona of [zonaHoraria || DEFAULT_TIMEZONE, DEFAULT_TIMEZONE]) {
    try {
      const plano = toPlainDate(ahora, zona);
      if (plano) return weekDayOfPlainDate(plano);
    } catch {
      /* zona inválida: respaldo */
    }
  }
  return JS_DAY_TO_WEEKDAY[ahora.getUTCDay()];
}

/** Segundo de la semana (desde el lunes 00:00) del instante, en la hora de pared de la zona. */
export function segundoDeSemana(ahora: Date, zonaHoraria: string): number {
  const dia = indiceDia(diaEnZona(ahora, zonaHoraria));
  return dia * SEGUNDOS_DIA + (segundosDeHora(horaEnZona(ahora, zonaHoraria)) ?? 0);
}

/** Ocurrencia de un tramo que contiene el instante. */
export interface OcurrenciaEnCurso {
  tramo: TramoSemanal;
  /** Días de calendario desde el día en que empezó la ocurrencia (0 = hoy). */
  diasDesdeInicio: number;
}

/** Todas las ocurrencias que contienen el instante (franjas solapadas = varias). */
export function ocurrenciasEnCurso(p: HorarioPromocion, ahora: Date, zonaHoraria: string): OcurrenciaEnCurso[] {
  const s = segundoDeSemana(ahora, zonaHoraria);
  const salida: OcurrenciaEnCurso[] = [];
  for (const tramo of tramosSemanalesDe(p)) {
    // `s + semana`: la cola de un tramo que pasó del domingo cae en el lunes siguiente.
    for (const m of [s, s + SEGUNDOS_SEMANA]) {
      if (tramo[0] <= m && m < tramo[1]) {
        salida.push({ tramo, diasDesdeInicio: Math.floor(m / SEGUNDOS_DIA) - Math.floor(tramo[0] / SEGUNDOS_DIA) });
      }
    }
  }
  return salida;
}

/** ¿El instante cae dentro de alguna franja semanal? (Sin mirar `start_date`/`end_date`.) */
export function activaEnHorario(p: HorarioPromocion, ahora: Date, zonaHoraria: string): boolean {
  return ocurrenciasEnCurso(p, ahora, zonaHoraria).length > 0;
}

/**
 * ¿Está dentro de su horario semanal y, contando la cola de la franja, no
 * ha vencido? Es la pregunta que hacen el motor y la cartelera. `start_date`
 * se mira aparte (`start_date ≤ ahora`), igual que siempre.
 *
 * El último instante del día de inicio se calcula restando a `ahora` los
 * segundos de pared desde la medianoche y los días completos; en una zona con
 * cambio de hora puede correrse una hora ese día (America/Bogota no tiene).
 */
export function vigenteEnHorario(p: HorarioPromocion & PromotionVigencia, ahora: Date, zonaHoraria: string): boolean {
  const ocurrencias = ocurrenciasEnCurso(p, ahora, zonaHoraria);
  if (ocurrencias.length === 0) return false;
  const desdeMedianoche = segundosDeHora(horaEnZona(ahora, zonaHoraria)) ?? 0;
  return ocurrencias.some(({ diasDesdeInicio }) => {
    if (diasDesdeInicio <= 0) return isWithinEndDate(p, ahora);
    // Aterriza en las 23:59:59.000 del día en que empezó la ocurrencia.
    const atras = (desdeMedianoche + 1 + (diasDesdeInicio - 1) * SEGUNDOS_DIA) * 1000 + ahora.getUTCMilliseconds();
    return isWithinEndDate(p, new Date(ahora.getTime() - atras));
  });
}

/**
 * ¿Alcanza a esta sucursal? `branches` es `jsonb`: nulo, ausente o lista
 * vacía = todas las sucursales; con elementos, tiene que estar la de la
 * terminal. Se comparan como número y como cadena porque el JSON guardado
 * por la interfaz puede traer cualquiera de los dos.
 */

export function appliesToBranch(promotion: PromotionVigencia, branchId: number | null): boolean {
  const branches = promotion.branches;
  if (!Array.isArray(branches) || branches.length === 0) return true;
  if (branchId === null) return false;
  return branches.some((b) => b === branchId || String(b) === String(branchId));
}
