/**
 * Lógica del calendario de marca del kit (Figma `DateRange` 104:3343, panel
 * «Calendario» 104:3219), sin React: la usan `CalendarioMes`, `CampoFecha` y
 * `DateRangeButton`, y se prueba sola.
 *
 * Todo son días calendario PUROS (`YYYY-MM-DD`) y meses `YYYY-MM`. La
 * aritmética va sobre `Date.UTC`, nunca sobre la hora de pared del navegador,
 * así el día elegido es el mismo con `TZ=UTC` que con `TZ=America/Bogota`.
 * «Hoy» no se calcula aquí: llega ya resuelto en la zona de la organización
 * (`useFormatDate().getToday()`), ver docs/reglas-fechas-timezone.md.
 */
import { addPlainDays } from '@/lib/utils/dateCore';
import { esFechaPlana } from './rangoFechas';

export { esFechaPlana };

/** Mes calendario `YYYY-MM`. */
export type MesPlano = string;

export interface CeldaDia {
  /** Día `YYYY-MM-DD`. */
  dia: string;
  /** Número del día («1»…«31»). */
  numero: number;
  /** `false` para los días del mes anterior o siguiente que completan la grilla. */
  delMes: boolean;
}

function dos(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function partes(dia: string): { a: number; m: number; d: number } {
  const [a, m, d] = dia.split('-').map(Number);
  return { a, m, d };
}

/** Instante a mediodía UTC del día: formatearlo en UTC nunca corre el día. */
export function mediodiaUtc(dia: string): Date {
  const { a, m, d } = partes(dia);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

function diasDelMes(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Mes (`YYYY-MM`) de un día. */
export function mesDe(dia: string): MesPlano {
  return dia.slice(0, 7);
}

/** Primer día del mes. */
export function primerDiaDelMes(mes: MesPlano): string {
  return `${mes}-01`;
}

/** Mes desplazado `n` meses. */
export function sumarMeses(mes: MesPlano, n: number): MesPlano {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${dos((total % 12) + 1)}`;
}

/** Día desplazado `n` meses; si el mes destino es más corto, queda en su último día (31 ene + 1 → 28/29 feb). */
export function sumarMesesDia(dia: string, n: number): string {
  const { d } = partes(dia);
  const destino = sumarMeses(mesDe(dia), n);
  const [a, m] = destino.split('-').map(Number);
  return `${destino}-${dos(Math.min(d, diasDelMes(a, m)))}`;
}

/** Día de la semana (0 = domingo … 6 = sábado). */
export function diaDeSemana(dia: string): number {
  return mediodiaUtc(dia).getUTCDay();
}

function idiomaCorto(locale: string | null | undefined): string {
  return (locale ?? 'es').split('-')[0].toLowerCase();
}

/**
 * Primer día de la semana del idioma: lunes en español (Figma: «L M X J V S D»)
 * y francés; domingo en inglés (EE. UU.) y portugués (Brasil).
 */
export function primerDiaDeSemana(locale: string | null | undefined): 0 | 1 {
  const corto = idiomaCorto(locale);
  return corto === 'en' || corto === 'pt' ? 0 : 1;
}

/** Iniciales en español de Figma, de domingo a sábado (miércoles = «X»). */
const INICIALES_ES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export interface NombreDiaSemana {
  /** Inicial de la cabecera («L», «M», «X»…). */
  corto: string;
  /** Nombre completo para lectores de pantalla («lunes»). */
  largo: string;
}

/** Cabecera de la grilla en el orden del idioma. */
export function diasDeSemana(locale: string, primerDia: 0 | 1 = primerDiaDeSemana(locale)): NombreDiaSemana[] {
  const corto = idiomaCorto(locale);
  let fCorto: Intl.DateTimeFormat | null = null;
  let fLargo: Intl.DateTimeFormat | null = null;
  try {
    fCorto = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
    fLargo = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  } catch {
    // Locale desconocido: iniciales en español.
  }
  const salida: NombreDiaSemana[] = [];
  for (let i = 0; i < 7; i++) {
    const dow = (primerDia + i) % 7;
    // 2026-09-27 fue domingo: + dow da el día de la semana buscado.
    const fecha = new Date(Date.UTC(2026, 8, 27 + dow, 12));
    salida.push({
      corto: corto === 'es' || !fCorto ? INICIALES_ES[dow] : fCorto.format(fecha).toUpperCase(),
      largo: fLargo ? fLargo.format(fecha) : INICIALES_ES[dow],
    });
  }
  return salida;
}

/** Grilla fija de 6 semanas (42 celdas) del mes, como en Figma. */
export function grillaMes(mes: MesPlano, primerDia: 0 | 1): CeldaDia[] {
  const inicio = primerDiaDelMes(mes);
  const retroceso = (diaDeSemana(inicio) - primerDia + 7) % 7;
  const primero = addPlainDays(inicio, -retroceso);
  const celdas: CeldaDia[] = [];
  for (let i = 0; i < 42; i++) {
    const dia = addPlainDays(primero, i);
    celdas.push({ dia, numero: partes(dia).d, delMes: mesDe(dia) === mes });
  }
  return celdas;
}

function capitalizar(texto: string, locale: string): string {
  return texto ? texto.charAt(0).toLocaleUpperCase(locale) + texto.slice(1) : texto;
}

/** «Septiembre 2026», «September 2026», «Septembre 2026», «Setembro 2026». */
export function nombreMes(mes: MesPlano, locale: string): string {
  const fecha = mediodiaUtc(primerDiaDelMes(mes));
  try {
    const nombre = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(fecha);
    return `${capitalizar(nombre, locale)} ${fecha.getUTCFullYear()}`;
  } catch {
    return mes;
  }
}

/** Nombre completo del día para lectores de pantalla («lunes, 28 de septiembre de 2026»). */
export function etiquetaDiaCompleta(dia: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(mediodiaUtc(dia));
  } catch {
    return dia;
  }
}

/** Meses cortos de Figma en español («1 sep 2026»). */
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function esEspanol(locale: string): boolean {
  return /^es(-|$)/i.test(locale);
}

/** Día corto del pie («1 sep», «Sep 1»). */
export function etiquetaDiaCorta(dia: string, locale: string): string {
  if (esEspanol(locale)) {
    const { m, d } = partes(dia);
    return `${d} ${MESES_ES[m - 1]}`;
  }
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(mediodiaUtc(dia))
      .replace('.', '');
  } catch {
    return dia;
  }
}

/** `true` si el día queda fuera de `[min, max]` (extremos incluidos; vacíos = sin tope). */
export function fueraDeLimites(dia: string, min?: string | null, max?: string | null): boolean {
  if (esFechaPlana(min) && dia < min) return true;
  if (esFechaPlana(max) && dia > max) return true;
  return false;
}

/** Acerca el día a `[min, max]`. */
export function acotarDia(dia: string, min?: string | null, max?: string | null): string {
  if (esFechaPlana(min) && dia < min) return min;
  if (esFechaPlana(max) && dia > max) return max;
  return dia;
}

/**
 * Día al que pasa el foco con una tecla dentro de la grilla (patrón «date
 * picker dialog» de WAI-ARIA): flechas ±1 día / ±1 semana, Inicio/Fin de la
 * semana, RePág/AvPág ±1 mes y, con Mayús, ±1 año. `null` si la tecla no
 * mueve el foco.
 */
export function moverFoco(dia: string, tecla: string, primerDia: 0 | 1, conMayus = false): string | null {
  switch (tecla) {
    case 'ArrowLeft':
      return addPlainDays(dia, -1);
    case 'ArrowRight':
      return addPlainDays(dia, 1);
    case 'ArrowUp':
      return addPlainDays(dia, -7);
    case 'ArrowDown':
      return addPlainDays(dia, 7);
    case 'Home':
      return addPlainDays(dia, -((diaDeSemana(dia) - primerDia + 7) % 7));
    case 'End':
      return addPlainDays(dia, 6 - ((diaDeSemana(dia) - primerDia + 7) % 7));
    case 'PageUp':
      return sumarMesesDia(dia, conMayus ? -12 : -1);
    case 'PageDown':
      return sumarMesesDia(dia, conMayus ? 12 : 1);
    default:
      return null;
  }
}

/** `true` si el mes entero queda antes de `min` o después de `max`. */
export function mesFueraDeLimites(mes: MesPlano, min?: string | null, max?: string | null): boolean {
  if (esFechaPlana(max) && primerDiaDelMes(mes) > max) return true;
  if (esFechaPlana(min)) {
    const [a, m] = mes.split('-').map(Number);
    if (`${mes}-${dos(diasDelMes(a, m))}` < min) return true;
  }
  return false;
}

/**
 * Selección de rango en dos clics: el primero fija el ancla (rango de un día),
 * el segundo cierra el rango en el orden correcto.
 */
export function elegirEnRango(
  ancla: string | null,
  dia: string,
): { ancla: string | null; desde: string; hasta: string; completo: boolean } {
  if (!ancla) return { ancla: dia, desde: dia, hasta: dia, completo: false };
  return ancla <= dia
    ? { ancla: null, desde: ancla, hasta: dia, completo: true }
    : { ancla: null, desde: dia, hasta: ancla, completo: true };
}

/**
 * Texto de un día para mostrar en el disparador: «28 sep 2026» (español, el
 * formato de Figma) o el de `Intl` en otro idioma.
 */
export function etiquetaDiaTrigger(dia: string, locale: string): string {
  if (esEspanol(locale)) {
    const { a, m, d } = partes(dia);
    return `${d} ${MESES_ES[m - 1]} ${a}`;
  }
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      mediodiaUtc(dia),
    );
  } catch {
    return dia;
  }
}
