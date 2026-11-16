/**
 * Motor de clasificación de horas de Recursos humanos (ADR-002 §3).
 *
 * Función PURA: no lee la base, ni el reloj, ni el `TZ` del proceso. Recibe un
 * día trabajado (sus intervalos ya sin descansos), la zona de la sede, los
 * festivos de ley y los TRAMOS de vigencia de cada parámetro, y parte el tiempo
 * en ocho categorías con el recargo y el divisor vigentes en cada tramo.
 *
 * Reglas:
 * 1. Cada intervalo se corta en la medianoche local y en el inicio y el fin del
 *    nocturno, con los valores del día local de cada tramo. Así un turno que
 *    cruza la medianoche, un cambio de vigencia o un festivo queda partido.
 * 2. Dominical o festivo: el día de descanso pactado (domingo por defecto) o un
 *    festivo de ley. Los días propios de la empresa no generan recargo (decisión
 *    del dueño): no se pasan aquí.
 * 3. En orden cronológico, un minuto es ordinario mientras no se pase el tope
 *    del día ni el semanal que rige ESE día; el resto es extra.
 * 4. Ningún valor legal está escrito aquí: todos llegan en `parametros`. Si falta
 *    uno o está por confirmar, el motor falla (`parametro_no_configurado`).
 *
 * La base le entrega los insumos (`fn_hr_jornada_insumos`) y guarda su salida
 * (`fn_hr_jornada_guardar`). Pruebas: src/__tests__/timezone/motorHorasHrm.test.ts.
 */
import { addPlainDays, toPlainDate, wallTimeToInstant } from '@/lib/utils/dateCore';

export const VERSION_MOTOR = 'hrm-jornada-1';

export const CATEGORIAS = [
  'ord_diurna',
  'ord_nocturna',
  'dom_diurna',
  'dom_nocturna',
  'extra_diurna',
  'extra_nocturna',
  'extra_dom_diurna',
  'extra_dom_nocturna',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** Parámetros que lee el motor (los mismos que entrega `fn_hr_jornada_insumos`). */
export const CODIGOS_PARAMETROS_JORNADA = [
  'nocturno_hora_inicio',
  'nocturno_hora_fin',
  'recargo_nocturno',
  'recargo_dominical_festivo',
  'recargo_extra_diurna',
  'recargo_extra_nocturna',
  'jornada_max_semanal',
  'jornada_max_diaria',
  'jornada_flexible_max_diaria',
  'divisor_hora_mensual',
  'horas_extra_max_dia',
  'horas_extra_max_semana',
] as const;
export type CodigoParametroJornada = (typeof CODIGOS_PARAMETROS_JORNADA)[number];

export interface TramoParametro {
  /** Día calendario `YYYY-MM-DD` desde el que rige (incluido). */
  desde: string;
  /** Último día en que rige (incluido); `null` = sin fin. */
  hasta: string | null;
  valor: number | null;
  /** `por_confirmar` no se usa para calcular. */
  estado?: string | null;
}
export type ParametrosJornada = Partial<Record<CodigoParametroJornada, readonly TramoParametro[]>>;

export interface Intervalo {
  /** Instante ISO con zona (`2026-06-28T22:00:00-05:00` o `…Z`). */
  inicio: string;
  fin: string;
}

export interface EntradaDia {
  /** Día de trabajo (`timesheets.work_date`): el de la entrada. */
  fechaTrabajo: string;
  /** Zona IANA de la sede, resuelta por `fn_timezone_for`. */
  zona: string;
  /** Tiempo trabajado, con los descansos no pagados ya restados. */
  intervalos: readonly Intervalo[];
  /** Festivos de ley (`hr_holidays`), `YYYY-MM-DD`. */
  festivos: readonly string[];
  /** Día de descanso obligatorio pactado: 0 = domingo … 6 = sábado. */
  diaDescanso?: number;
  /** Jornada ordinaria pactada del día (el turno publicado), en minutos. */
  topeDiarioMinutos?: number | null;
  /** Jornada flexible pactada (CST 161 lit. c): tope diario de `jornada_flexible_max_diaria`. */
  jornadaFlexible?: boolean;
  /** Horas semanales del contrato, si son menos que el máximo legal. */
  contratoHorasSemana?: number | null;
  /** Dirección, confianza y manejo (CST 162): no genera horas extra. */
  exentoHorasExtra?: boolean;
  /** Minutos ordinarios y extra que la semana (lunes a domingo) ya lleva antes de este día. */
  semana?: { ordinariasPrevias: number; extrasPrevias: number };
  /** Hubo una entrada sin salida: se avisa y no se clasifica ese tramo. */
  marcacionIncompleta?: boolean;
  parametros: ParametrosJornada;
}

export type MotivoDominical = 'dia_descanso' | 'festivo';

export interface TramoClasificado {
  inicio: string;
  fin: string;
  fechaLocal: string;
  minutos: number;
  categoria: Categoria;
  nocturno: boolean;
  extra: boolean;
  dominical: MotivoDominical | null;
  /** Recargo en fracción (0,9 = 90 %), con los parámetros del día local. */
  recargo: number;
  divisor: number;
}

export interface LineaClasificada {
  categoria: Categoria;
  fecha_local: string;
  minutos: number;
  recargo: number;
  divisor: number;
  motivo_dominical: MotivoDominical | null;
}

export type CodigoAlerta = 'extra_supera_tope_diario' | 'extra_supera_tope_semanal' | 'marcacion_incompleta';

export interface Alerta {
  codigo: CodigoAlerta;
  minutos?: number;
  tope_minutos?: number;
}

export interface ResultadoDia {
  fechaTrabajo: string;
  minutos: Record<Categoria, number>;
  totalMinutos: number;
  ordinarias: number;
  extras: number;
  lineas: LineaClasificada[];
  tramos: TramoClasificado[];
  alertas: Alerta[];
  /** Acumulado de la semana DESPUÉS de este día (para encadenar días). */
  semana: { ordinarias: number; extras: number };
  /** Huella de la entrada: misma entrada, misma huella (idempotencia). */
  huella: string;
  motor: string;
}

/** Un parámetro no tiene valor confirmado para la fecha: el día no se clasifica. */
export class ParametroFaltanteError extends Error {
  readonly code = 'parametro_no_configurado';
  constructor(
    public readonly codigo: string,
    public readonly fecha: string
  ) {
    super(`parametro_no_configurado: ${codigo} en ${fecha}`);
    this.name = 'ParametroFaltanteError';
  }
}

const MINUTO_MS = 60_000;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valor del parámetro vigente en un día calendario. */
export function valorEn(parametros: ParametrosJornada, codigo: CodigoParametroJornada, fecha: string): number {
  const tramos = parametros[codigo] ?? [];
  for (const t of tramos) {
    if (t.desde <= fecha && (t.hasta === null || t.hasta === undefined || fecha <= t.hasta)) {
      if (t.estado === 'por_confirmar' || t.valor === null || t.valor === undefined || !Number.isFinite(Number(t.valor))) {
        throw new ParametroFaltanteError(codigo, fecha);
      }
      return Number(t.valor);
    }
  }
  throw new ParametroFaltanteError(codigo, fecha);
}

/** Día de la semana de un día calendario (0 = domingo), sin zona: es un `date`. */
export function diaDeLaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Lunes de la semana (ISO, lunes a domingo) de un día calendario. */
export function lunesDeLaSemana(fecha: string): string {
  const dow = diaDeLaSemana(fecha);
  return addPlainDays(fecha, dow === 0 ? -6 : 1 - dow);
}

/** Hora del día en horas decimales (19, 6, 21.5) a `HH:mm`. */
function horaComoTexto(horas: number): string {
  const total = Math.round(horas * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Instante truncado al minuto (las marcaciones traen segundos; se clasifica por minuto). */
function alMinuto(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`instante_invalido: ${iso}`);
  return Math.floor(ms / MINUTO_MS) * MINUTO_MS;
}

function redondear4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Intervalos ordenados, sin solapes ni vacíos, en milisegundos al minuto. */
function normalizar(intervalos: readonly Intervalo[]): Array<[number, number]> {
  const crudos = intervalos
    .map((i) => [alMinuto(i.inicio), alMinuto(i.fin)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of crudos) {
    const ultimo = out[out.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else out.push([a, b]);
  }
  return out;
}

interface Pieza {
  inicio: number;
  fin: number;
  fechaLocal: string;
  nocturno: boolean;
}

/** Corta un intervalo en la medianoche local y en el inicio y fin del nocturno de cada día. */
function partir(inicio: number, fin: number, zona: string, parametros: ParametrosJornada): Pieza[] {
  const piezas: Pieza[] = [];
  let dia = toPlainDate(new Date(inicio), zona);
  for (let guarda = 0; guarda < 40; guarda++) {
    const siguiente = addPlainDays(dia, 1);
    const b0 = wallTimeToInstant(dia, '00:00', zona).getTime();
    const b24 = wallTimeToInstant(siguiente, '00:00', zona).getTime();
    if (b0 >= fin) break;
    const finNoct = wallTimeToInstant(dia, horaComoTexto(valorEn(parametros, 'nocturno_hora_fin', dia)), zona).getTime();
    const iniNoct = wallTimeToInstant(dia, horaComoTexto(valorEn(parametros, 'nocturno_hora_inicio', dia)), zona).getTime();
    const tramosDelDia: Array<[number, number, boolean]> = [
      [b0, finNoct, true],
      [finNoct, iniNoct, false],
      [iniNoct, b24, true],
    ];
    for (const [a, b, nocturno] of tramosDelDia) {
      const desde = Math.max(a, inicio);
      const hasta = Math.min(b, fin);
      if (hasta > desde) piezas.push({ inicio: desde, fin: hasta, fechaLocal: dia, nocturno });
    }
    if (b24 >= fin) break;
    dia = siguiente;
  }
  return piezas;
}

function categoriaDe(extra: boolean, dominical: boolean, nocturno: boolean): Categoria {
  const franja = nocturno ? 'nocturna' : 'diurna';
  if (extra) return (dominical ? `extra_dom_${franja}` : `extra_${franja}`) as Categoria;
  return (dominical ? `dom_${franja}` : `ord_${franja}`) as Categoria;
}

/** Recargo (fracción) de una categoría con los parámetros del día local. Ver ADR-002 §3, regla 5. */
export function recargoDe(categoria: Categoria, parametros: ParametrosJornada, fecha: string): number {
  const v = (c: CodigoParametroJornada) => valorEn(parametros, c, fecha);
  switch (categoria) {
    case 'ord_diurna':
      return 0;
    case 'ord_nocturna':
      return v('recargo_nocturno');
    case 'dom_diurna':
      return v('recargo_dominical_festivo');
    case 'dom_nocturna':
      return redondear4(v('recargo_dominical_festivo') + v('recargo_nocturno'));
    case 'extra_diurna':
      return v('recargo_extra_diurna');
    case 'extra_nocturna':
      // La extra nocturna (75 %) ya incluye lo nocturno: no se suma el 35 % (CST 168).
      return v('recargo_extra_nocturna');
    case 'extra_dom_diurna':
      return redondear4(v('recargo_dominical_festivo') + v('recargo_extra_diurna'));
    case 'extra_dom_nocturna':
      return redondear4(v('recargo_dominical_festivo') + v('recargo_extra_nocturna'));
  }
}

/** JSON estable (claves ordenadas) para la huella. */
function estable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${estable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** FNV-1a de 32 bits, en hexadecimal: suficiente para detectar que la entrada cambió. */
export function huellaDe(entrada: EntradaDia): string {
  const texto = `${VERSION_MOTOR}|${estable(entrada)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function vacio(): Record<Categoria, number> {
  return Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<Categoria, number>;
}

/** Clasifica un día trabajado. Ver las reglas en la cabecera del archivo. */
export function clasificarDia(entrada: EntradaDia): ResultadoDia {
  if (!FECHA_RE.test(entrada.fechaTrabajo)) throw new Error('fecha_trabajo_invalida');
  const p = entrada.parametros;
  const festivos = new Set(entrada.festivos);
  const diaDescanso = entrada.diaDescanso ?? 0;
  const exento = entrada.exentoHorasExtra === true;
  const fechaTrabajo = entrada.fechaTrabajo;

  // Tope del día: la jornada pactada (turno), nunca por encima del máximo legal del día.
  const maxLegalDia = 60 * valorEn(p, entrada.jornadaFlexible ? 'jornada_flexible_max_diaria' : 'jornada_max_diaria', fechaTrabajo);
  const topeDia = exento
    ? Number.POSITIVE_INFINITY
    : Math.min(entrada.topeDiarioMinutos ?? Number.POSITIVE_INFINITY, maxLegalDia);
  const contrato = entrada.contratoHorasSemana && entrada.contratoHorasSemana > 0 ? entrada.contratoHorasSemana : null;

  let ordSemana = Math.max(0, entrada.semana?.ordinariasPrevias ?? 0);
  const extrasPrevias = Math.max(0, entrada.semana?.extrasPrevias ?? 0);
  let ordHoy = 0;

  const tramos: TramoClasificado[] = [];
  const empujar = (inicio: number, fin: number, fechaLocal: string, nocturno: boolean, extra: boolean) => {
    const minutos = Math.round((fin - inicio) / MINUTO_MS);
    if (minutos <= 0) return;
    const motivo: MotivoDominical | null = festivos.has(fechaLocal)
      ? 'festivo'
      : diaDeLaSemana(fechaLocal) === diaDescanso
        ? 'dia_descanso'
        : null;
    const categoria = categoriaDe(extra, motivo !== null, nocturno);
    tramos.push({
      inicio: new Date(inicio).toISOString(),
      fin: new Date(fin).toISOString(),
      fechaLocal,
      minutos,
      categoria,
      nocturno,
      extra,
      dominical: motivo,
      recargo: recargoDe(categoria, p, fechaLocal),
      divisor: valorEn(p, 'divisor_hora_mensual', fechaLocal),
    });
  };

  for (const [a, b] of normalizar(entrada.intervalos)) {
    for (const pieza of partir(a, b, entrada.zona, p)) {
      const minutos = Math.round((pieza.fin - pieza.inicio) / MINUTO_MS);
      let ordinarios = minutos;
      if (!exento) {
        // El tope semanal es el que rige el día del tramo (44 h hasta el 14-jul-2026, 42 h desde el 15).
        const legalSemana = valorEn(p, 'jornada_max_semanal', pieza.fechaLocal);
        const topeSemana = 60 * (contrato !== null ? Math.min(contrato, legalSemana) : legalSemana);
        const disponible = Math.max(0, Math.min(topeDia - ordHoy, topeSemana - ordSemana));
        ordinarios = Math.min(minutos, disponible);
      }
      const corte = pieza.inicio + ordinarios * MINUTO_MS;
      empujar(pieza.inicio, corte, pieza.fechaLocal, pieza.nocturno, false);
      empujar(corte, pieza.fin, pieza.fechaLocal, pieza.nocturno, true);
      ordHoy += ordinarios;
      ordSemana += ordinarios;
    }
  }

  const minutos = vacio();
  const porLinea = new Map<string, LineaClasificada>();
  for (const t of tramos) {
    minutos[t.categoria] += t.minutos;
    const clave = `${t.categoria}|${t.fechaLocal}|${t.recargo}|${t.divisor}|${t.dominical ?? ''}`;
    const linea = porLinea.get(clave);
    if (linea) linea.minutos += t.minutos;
    else
      porLinea.set(clave, {
        categoria: t.categoria,
        fecha_local: t.fechaLocal,
        minutos: t.minutos,
        recargo: t.recargo,
        divisor: t.divisor,
        motivo_dominical: t.dominical,
      });
  }
  const extras = tramos.filter((t) => t.extra).reduce((s, t) => s + t.minutos, 0);
  const total = tramos.reduce((s, t) => s + t.minutos, 0);

  const alertas: Alerta[] = [];
  if (extras > 0) {
    const topeDiaExtra = 60 * valorEn(p, 'horas_extra_max_dia', fechaTrabajo);
    if (extras > topeDiaExtra) alertas.push({ codigo: 'extra_supera_tope_diario', minutos: extras, tope_minutos: topeDiaExtra });
    const topeSemanaExtra = 60 * valorEn(p, 'horas_extra_max_semana', fechaTrabajo);
    if (extrasPrevias + extras > topeSemanaExtra) {
      alertas.push({ codigo: 'extra_supera_tope_semanal', minutos: extrasPrevias + extras, tope_minutos: topeSemanaExtra });
    }
  }
  if (entrada.marcacionIncompleta) alertas.push({ codigo: 'marcacion_incompleta' });

  return {
    fechaTrabajo,
    minutos,
    totalMinutos: total,
    ordinarias: total - extras,
    extras,
    lineas: [...porLinea.values()],
    tramos,
    alertas,
    semana: {
      ordinarias: Math.max(0, entrada.semana?.ordinariasPrevias ?? 0) + (total - extras),
      extras: extrasPrevias + extras,
    },
    huella: huellaDe(entrada),
    motor: VERSION_MOTOR,
  };
}

/**
 * Clasifica varios días seguidos encadenando el acumulado de la semana (lunes a
 * domingo). Al cambiar de semana el acumulado vuelve a lo que traiga ese día.
 */
export function clasificarDias(dias: readonly EntradaDia[]): ResultadoDia[] {
  const ordenados = [...dias].sort((a, b) => (a.fechaTrabajo < b.fechaTrabajo ? -1 : a.fechaTrabajo > b.fechaTrabajo ? 1 : 0));
  const out: ResultadoDia[] = [];
  let previo: ResultadoDia | null = null;
  for (const dia of ordenados) {
    const misma = previo !== null && lunesDeLaSemana(previo.fechaTrabajo) === lunesDeLaSemana(dia.fechaTrabajo);
    const entrada: EntradaDia = misma && previo
      ? { ...dia, semana: { ordinariasPrevias: previo.semana.ordinarias, extrasPrevias: previo.semana.extras } }
      : dia;
    previo = clasificarDia(entrada);
    out.push(previo);
  }
  return out;
}
