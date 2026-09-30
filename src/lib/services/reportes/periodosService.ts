// ============================================================
// Periodos de reporte y de cierre, en días calendario de la organización.
//
// Todo trabaja sobre fechas planas `YYYY-MM-DD`: el «hoy» lo pone quien llama,
// con la zona de la organización (`useFormatDate().getToday()` en el
// navegador, `todayInTz(tz)` en el servidor). Nada de `new Date('YYYY-MM-DD')`
// ni de `startOfDay` del navegador: en Bogotá esa fecha es la medianoche UTC y
// se muestra como el día anterior.
//
// `etiqueta` es el rótulo en español que se congela en el cierre; la interfaz
// pinta el suyo en el idioma del usuario (`etiquetaDePeriodo` del visor).
// ============================================================

import { addPlainDays, todayInTz, DEFAULT_TIMEZONE } from '@/lib/utils/timezone';
import type { PeriodoCierre, TipoCierre } from './types';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

interface Partes {
  anio: number;
  mes: number;
  dia: number;
}

function partes(fecha: string): Partes {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return { anio, mes, dia };
}

function plano(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Último día del mes (1-12). */
function ultimoDia(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Suma meses a un (año, mes) y devuelve el par normalizado. */
function sumarMeses(anio: number, mes: number, n: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + n;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/** Día de la semana ISO de una fecha plana: 1 = lunes … 7 = domingo. */
function diaSemanaIso(fecha: string): number {
  const { anio, mes, dia } = partes(fecha);
  const d = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return d === 0 ? 7 : d;
}

function dm(fecha: string): string {
  const { dia, mes } = partes(fecha);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

function dma(fecha: string): string {
  const { anio } = partes(fecha);
  return `${dm(fecha)}/${anio}`;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Rótulo en español del periodo (el que se congela en el cierre). */
export function etiquetaEspanol(tipo: TipoCierre, fechaInicio: string, fechaFin: string): string {
  const i = partes(fechaInicio);
  const f = partes(fechaFin);
  switch (tipo) {
    case 'diario':
      return `Cierre diario — ${dma(fechaInicio)}`;
    case 'semanal':
      return `Cierre semanal — ${dma(fechaInicio)} al ${dma(fechaFin)}`;
    case 'quincenal':
      return `Cierre quincenal — ${i.dia} al ${f.dia} de ${MESES[i.mes - 1]} ${i.anio}`;
    case 'mensual':
      return `Cierre mensual — ${capitalizar(MESES[i.mes - 1])} ${i.anio}`;
    case 'trimestral':
      return `Cierre trimestral — T${Math.ceil(i.mes / 3)} ${i.anio}`;
    case 'semestral':
      return `Cierre semestral — S${i.mes <= 6 ? 1 : 2} ${i.anio}`;
    case 'anual':
      return `Cierre anual — ${i.anio}`;
    default:
      return `Periodo personalizado — ${dma(fechaInicio)} al ${dma(fechaFin)}`;
  }
}

function periodo(tipo: TipoCierre, fechaInicio: string, fechaFin: string, base?: PeriodoCierre): PeriodoCierre {
  return {
    tipo,
    fechaInicio,
    fechaFin,
    etiqueta: etiquetaEspanol(tipo, fechaInicio, fechaFin),
    horaInicio: base?.horaInicio ?? null,
    horaFin: base?.horaFin ?? null,
  };
}

/** `true` si el texto es una fecha plana válida. */
export function esFechaPlana(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const { anio, mes, dia } = partes(valor);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= ultimoDia(anio, mes);
}

/**
 * Periodo del tipo pedido que contiene el día `hoy`.
 * @param hoy Día calendario de la organización (`YYYY-MM-DD`). El valor por
 *   defecto usa la zona de respaldo: pásalo siempre desde la organización.
 * @param custom Rango del tipo `personalizado` (días incluidos).
 */
export function resolverPeriodo(
  tipo: TipoCierre,
  hoy: string = todayInTz(DEFAULT_TIMEZONE),
  custom?: { from: string; to: string },
): PeriodoCierre {
  const { anio, mes, dia } = partes(hoy);
  switch (tipo) {
    case 'diario':
      return periodo(tipo, hoy, hoy);
    case 'semanal': {
      const inicio = addPlainDays(hoy, 1 - diaSemanaIso(hoy));
      return periodo(tipo, inicio, addPlainDays(inicio, 6));
    }
    case 'quincenal':
      return dia <= 15
        ? periodo(tipo, plano(anio, mes, 1), plano(anio, mes, 15))
        : periodo(tipo, plano(anio, mes, 16), plano(anio, mes, ultimoDia(anio, mes)));
    case 'mensual':
      return periodo(tipo, plano(anio, mes, 1), plano(anio, mes, ultimoDia(anio, mes)));
    case 'trimestral': {
      const primero = Math.floor((mes - 1) / 3) * 3 + 1;
      return periodo(tipo, plano(anio, primero, 1), plano(anio, primero + 2, ultimoDia(anio, primero + 2)));
    }
    case 'semestral':
      return mes <= 6
        ? periodo(tipo, plano(anio, 1, 1), plano(anio, 6, 30))
        : periodo(tipo, plano(anio, 7, 1), plano(anio, 12, 31));
    case 'anual':
      return periodo(tipo, plano(anio, 1, 1), plano(anio, 12, 31));
    case 'personalizado': {
      if (custom && esFechaPlana(custom.from) && esFechaPlana(custom.to)) {
        const [a, b] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
        return periodo(tipo, a, b);
      }
      return periodo(tipo, addPlainDays(hoy, -29), hoy);
    }
    default:
      return periodo('diario', hoy, hoy);
  }
}

/** Días del rango, incluidos los dos extremos. */
function diasDelRango(p: PeriodoCierre): number {
  const a = partes(p.fechaInicio);
  const b = partes(p.fechaFin);
  return Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86_400_000) + 1;
}

/** Periodo anterior del mismo tipo (conserva la franja). */
export function periodoAnterior(p: PeriodoCierre): PeriodoCierre {
  const { anio, mes } = partes(p.fechaInicio);
  const conFranja = (r: PeriodoCierre) => ({ ...r, horaInicio: p.horaInicio ?? null, horaFin: p.horaFin ?? null });
  switch (p.tipo) {
    case 'diario':
    case 'semanal':
    case 'quincenal':
      return conFranja(resolverPeriodo(p.tipo, addPlainDays(p.fechaInicio, -1)));
    case 'mensual': {
      const m = sumarMeses(anio, mes, -1);
      return conFranja(resolverPeriodo('mensual', plano(m.anio, m.mes, 1)));
    }
    case 'trimestral': {
      const m = sumarMeses(anio, mes, -3);
      return conFranja(resolverPeriodo('trimestral', plano(m.anio, m.mes, 1)));
    }
    case 'semestral': {
      const m = sumarMeses(anio, mes, -6);
      return conFranja(resolverPeriodo('semestral', plano(m.anio, m.mes, 1)));
    }
    case 'anual':
      return conFranja(resolverPeriodo('anual', plano(anio - 1, 1, 1)));
    default: {
      const fin = addPlainDays(p.fechaInicio, -1);
      return periodo('personalizado', addPlainDays(fin, 1 - diasDelRango(p)), fin, p);
    }
  }
}

/** Periodo siguiente del mismo tipo, o `null` si empieza después de `hoy`. */
export function periodoSiguiente(p: PeriodoCierre, hoy: string = todayInTz(DEFAULT_TIMEZONE)): PeriodoCierre | null {
  const { anio, mes } = partes(p.fechaInicio);
  let siguiente: PeriodoCierre;
  switch (p.tipo) {
    case 'diario':
    case 'semanal':
    case 'quincenal':
      siguiente = resolverPeriodo(p.tipo, addPlainDays(p.fechaFin, 1));
      break;
    case 'mensual': {
      const m = sumarMeses(anio, mes, 1);
      siguiente = resolverPeriodo('mensual', plano(m.anio, m.mes, 1));
      break;
    }
    case 'trimestral': {
      const m = sumarMeses(anio, mes, 3);
      siguiente = resolverPeriodo('trimestral', plano(m.anio, m.mes, 1));
      break;
    }
    case 'semestral': {
      const m = sumarMeses(anio, mes, 6);
      siguiente = resolverPeriodo('semestral', plano(m.anio, m.mes, 1));
      break;
    }
    case 'anual':
      siguiente = resolverPeriodo('anual', plano(anio + 1, 1, 1));
      break;
    default: {
      const inicio = addPlainDays(p.fechaFin, 1);
      siguiente = periodo('personalizado', inicio, addPlainDays(inicio, diasDelRango(p) - 1));
    }
  }
  if (siguiente.fechaInicio > hoy) return null;
  return { ...siguiente, horaInicio: p.horaInicio ?? null, horaFin: p.horaFin ?? null };
}

/** Mismo periodo del año anterior (comparativo «vs. año anterior»). */
export function periodoAnioAnterior(p: PeriodoCierre): PeriodoCierre {
  const restarAnio = (fecha: string) => {
    const { anio, mes, dia } = partes(fecha);
    return plano(anio - 1, mes, Math.min(dia, ultimoDia(anio - 1, mes)));
  };
  return periodo(p.tipo, restarAnio(p.fechaInicio), restarAnio(p.fechaFin), p);
}

/** `true` si el periodo ya terminó (su último día es anterior a `hoy`). */
export function esCierreCerrado(p: PeriodoCierre, hoy: string = todayInTz(DEFAULT_TIMEZONE)): boolean {
  return p.fechaFin < hoy;
}

/** Tipos de periodo, en el orden del selector. */
export const TIPOS_CIERRE: readonly TipoCierre[] = [
  'diario',
  'semanal',
  'quincenal',
  'mensual',
  'trimestral',
  'semestral',
  'anual',
  'personalizado',
];

export function esTipoCierre(valor: unknown): valor is TipoCierre {
  return typeof valor === 'string' && (TIPOS_CIERRE as readonly string[]).includes(valor);
}

/** Franja `HH:mm` válida (24 h). */
export function esHora(valor: unknown): valor is string {
  return typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

/**
 * Valida y normaliza un periodo que llega del cliente (ruta de cierre, envío
 * programado). Devuelve `null` si no es válido. La etiqueta se recalcula: no
 * se confía en la del cliente.
 */
export function normalizarPeriodo(valor: unknown): PeriodoCierre | null {
  if (!valor || typeof valor !== 'object') return null;
  const v = valor as Record<string, unknown>;
  if (!esTipoCierre(v.tipo) || !esFechaPlana(v.fechaInicio) || !esFechaPlana(v.fechaFin)) return null;
  if (v.fechaInicio > v.fechaFin) return null;
  const conFranja = esHora(v.horaInicio) && esHora(v.horaFin);
  return {
    tipo: v.tipo,
    fechaInicio: v.fechaInicio,
    fechaFin: v.fechaFin,
    etiqueta: etiquetaEspanol(v.tipo, v.fechaInicio, v.fechaFin),
    horaInicio: conFranja ? (v.horaInicio as string) : null,
    horaFin: conFranja ? (v.horaFin as string) : null,
  };
}
