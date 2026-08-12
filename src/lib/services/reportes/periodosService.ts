// ============================================================
// Servicio de resolución de períodos de cierre
// Convierte un TipoCierre en un PeriodoCierre con fechas concretas
// ============================================================

import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  subDays,
  subWeeks,
  subMonths,
  subQuarters,
  subYears,
  getQuarter,
  getYear,
  getDate,
  lastDayOfMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';

import type { PeriodoCierre, TipoCierre } from './types';

/** Formatea una fecha como dd/MM/yyyy */
function fmt(date: Date): string {
  return format(date, 'dd/MM/yyyy', { locale: es });
}

/** Convierte un Date a ISO date string (yyyy-mm-dd) */
function toISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Resuelve un TipoCierre en un PeriodoCierre con fechas concretas.
 * @param tipo Tipo de cierre
 * @param referencia Fecha de referencia (default: hoy)
 * @param custom Rango personalizado (solo para tipo 'personalizado')
 */
export function resolverPeriodo(
  tipo: TipoCierre,
  referencia: Date = new Date(),
  custom?: { from: string; to: string },
): PeriodoCierre {
  const ref = startOfDay(referencia);

  switch (tipo) {
    case 'diario': {
      return {
        tipo,
        fechaInicio: toISO(ref),
        fechaFin: toISO(ref),
        etiqueta: `Cierre Diario — ${fmt(ref)}`,
      };
    }

    case 'semanal': {
      const inicio = startOfWeek(ref, { weekStartsOn: 1 });
      const fin = endOfWeek(ref, { weekStartsOn: 1 });
      return {
        tipo,
        fechaInicio: toISO(inicio),
        fechaFin: toISO(fin),
        etiqueta: `Cierre Semanal — ${fmt(inicio)} al ${fmt(fin)}`,
      };
    }

    case 'quincenal': {
      const dia = getDate(ref);
      if (dia <= 15) {
        const inicio = startOfMonth(ref);
        const fin = addDays(startOfMonth(ref), 14);
        return {
          tipo,
          fechaInicio: toISO(inicio),
          fechaFin: toISO(fin),
          etiqueta: `Cierre Quincenal — 1 al 15 ${format(ref, 'MMMM yyyy', { locale: es })}`,
        };
      }
      const inicio = addDays(startOfMonth(ref), 15);
      const fin = endOfMonth(ref);
      return {
        tipo,
        fechaInicio: toISO(inicio),
        fechaFin: toISO(fin),
        etiqueta: `Cierre Quincenal — 16 al ${fmt(fin)} ${format(ref, 'MMMM yyyy', { locale: es })}`,
      };
    }

    case 'mensual': {
      const inicio = startOfMonth(ref);
      const fin = endOfMonth(ref);
      return {
        tipo,
        fechaInicio: toISO(inicio),
        fechaFin: toISO(fin),
        etiqueta: `Cierre Mensual — ${format(ref, 'MMMM yyyy', { locale: es })}`,
      };
    }

    case 'trimestral': {
      const q = getQuarter(ref);
      const year = getYear(ref);
      const inicio = startOfMonth(addQuarters(startOfYear(ref), q - 1));
      const fin = endOfMonth(addQuarters(startOfYear(ref), q - 1 + 2) );
      const etiquetas = ['Q1', 'Q2', 'Q3', 'Q4'];
      return {
        tipo,
        fechaInicio: toISO(inicio),
        fechaFin: toISO(fin),
        etiqueta: `Cierre Trimestral — ${etiquetas[q - 1]} ${year}`,
      };
    }

    case 'semestral': {
      const year = getYear(ref);
      const mitad = getQuarter(ref) <= 2 ? 1 : 2;
      if (mitad === 1) {
        return {
          tipo,
          fechaInicio: toISO(startOfYear(ref)),
          fechaFin: toISO(endOfMonth(addMonths(startOfYear(ref), 5))),
          etiqueta: `Cierre Semestral — S1 ${year}`,
        };
      }
      return {
        tipo,
        fechaInicio: toISO(addMonths(startOfYear(ref), 6)),
        fechaFin: toISO(endOfYear(ref)),
        etiqueta: `Cierre Semestral — S2 ${year}`,
      };
    }

    case 'anual': {
      return {
        tipo,
        fechaInicio: toISO(startOfYear(ref)),
        fechaFin: toISO(endOfYear(ref)),
        etiqueta: `Cierre Anual — ${getYear(ref)}`,
      };
    }

    case 'personalizado': {
      if (custom?.from && custom?.to) {
        return {
          tipo,
          fechaInicio: custom.from,
          fechaFin: custom.to,
          etiqueta: `Período Personalizado — ${fmt(new Date(custom.from))} al ${fmt(new Date(custom.to))}`,
        };
      }
      // Fallback: últimos 30 días
      const fin = endOfDay(referencia);
      const inicio = subDays(fin, 29);
      return {
        tipo,
        fechaInicio: toISO(inicio),
        fechaFin: toISO(fin),
        etiqueta: `Período Personalizado — ${fmt(inicio)} al ${fmt(fin)}`,
      };
    }

    default: {
      return {
        tipo: 'diario',
        fechaInicio: toISO(ref),
        fechaFin: toISO(ref),
        etiqueta: `Cierre Diario — ${fmt(ref)}`,
      };
    }
  }
}

/**
 * Navega al período anterior del mismo tipo.
 */
export function periodoAnterior(periodo: PeriodoCierre): PeriodoCierre {
  const ref = new Date(periodo.fechaInicio + 'T12:00:00');

  switch (periodo.tipo) {
    case 'diario':
      return resolverPeriodo('diario', subDays(ref, 1));
    case 'semanal':
      return resolverPeriodo('semanal', subWeeks(ref, 1));
    case 'quincenal': {
      const dia = getDate(ref);
      if (dia <= 15) {
        // Estamos en 1-15, ir a 16-fin del mes anterior
        const mesAnterior = subMonths(ref, 1);
        return resolverPeriodo('quincenal', addDays(startOfMonth(mesAnterior), 16));
      }
      // Estamos en 16-fin, ir a 1-15 del mismo mes
      return resolverPeriodo('quincenal', startOfMonth(ref));
    }
    case 'mensual':
      return resolverPeriodo('mensual', subMonths(ref, 1));
    case 'trimestral':
      return resolverPeriodo('trimestral', subQuarters(ref, 1));
    case 'semestral': {
      const mitad = getQuarter(ref) <= 2 ? 1 : 2;
      if (mitad === 1) {
        // S1 → S2 del año anterior
        return resolverPeriodo('semestral', addMonths(startOfYear(subYears(ref, 1)), 6));
      }
      // S2 → S1 del mismo año
      return resolverPeriodo('semestral', startOfYear(ref));
    }
    case 'anual':
      return resolverPeriodo('anual', subYears(ref, 1));
    case 'personalizado': {
      const inicio = new Date(periodo.fechaInicio + 'T12:00:00');
      const fin = new Date(periodo.fechaFin + 'T12:00:00');
      const duracion = addDays(fin, 1).getTime() - inicio.getTime();
      const nuevoFin = subDays(inicio, 1);
      const nuevoInicio = new Date(nuevoFin.getTime() - duracion);
      return {
        tipo: 'personalizado',
        fechaInicio: toISO(nuevoInicio),
        fechaFin: toISO(nuevoFin),
        etiqueta: `Período Personalizado — ${fmt(nuevoInicio)} al ${fmt(nuevoFin)}`,
      };
    }
    default:
      return resolverPeriodo('diario', subDays(ref, 1));
  }
}

/**
 * Navega al período siguiente del mismo tipo.
 * No navega hacia el futuro si el siguiente período aún no ha terminado.
 */
export function periodoSiguiente(periodo: PeriodoCierre): PeriodoCierre | null {
  const ref = new Date(periodo.fechaInicio + 'T12:00:00');
  const hoy = new Date();

  let siguiente: PeriodoCierre;

  switch (periodo.tipo) {
    case 'diario':
      siguiente = resolverPeriodo('diario', addDays(ref, 1));
      break;
    case 'semanal':
      siguiente = resolverPeriodo('semanal', addWeeks(ref, 1));
      break;
    case 'quincenal': {
      const dia = getDate(ref);
      if (dia <= 15) {
        siguiente = resolverPeriodo('quincenal', addDays(startOfMonth(ref), 16));
      } else {
        siguiente = resolverPeriodo('quincenal', startOfMonth(addMonths(ref, 1)));
      }
      break;
    }
    case 'mensual':
      siguiente = resolverPeriodo('mensual', addMonths(ref, 1));
      break;
    case 'trimestral':
      siguiente = resolverPeriodo('trimestral', addQuarters(ref, 1));
      break;
    case 'semestral': {
      const mitad = getQuarter(ref) <= 2 ? 1 : 2;
      if (mitad === 1) {
        siguiente = resolverPeriodo('semestral', addMonths(startOfYear(ref), 6));
      } else {
        siguiente = resolverPeriodo('semestral', startOfYear(addYears(ref, 1)));
      }
      break;
    }
    case 'anual':
      siguiente = resolverPeriodo('anual', addYears(ref, 1));
      break;
    case 'personalizado': {
      const inicio = new Date(periodo.fechaInicio + 'T12:00:00');
      const fin = new Date(periodo.fechaFin + 'T12:00:00');
      const duracion = addDays(fin, 1).getTime() - inicio.getTime();
      const nuevoInicio = addDays(fin, 1);
      const nuevoFin = new Date(nuevoInicio.getTime() + duracion);
      siguiente = {
        tipo: 'personalizado',
        fechaInicio: toISO(nuevoInicio),
        fechaFin: toISO(nuevoFin),
        etiqueta: `Período Personalizado — ${fmt(nuevoInicio)} al ${fmt(nuevoFin)}`,
      };
      break;
    }
    default:
      siguiente = resolverPeriodo('diario', addDays(ref, 1));
  }

  // No navegar al futuro si el período siguiente aún no ha comenzado
  if (new Date(siguiente.fechaInicio + 'T00:00:00') > hoy) {
    return null;
  }

  return siguiente;
}

/**
 * Determina si un cierre es "oficial" (ya cerró).
 * @returns true si la fechaFin del período es anterior a hoy
 */
export function esCierreCerrado(periodo: PeriodoCierre): boolean {
  const fin = new Date(periodo.fechaFin + 'T23:59:59');
  return fin < new Date();
}

/**
 * Lista de tipos de cierre disponibles para el selector.
 */
export const TIPOS_CIERRE: { value: TipoCierre; label: string }[] = [
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'personalizado', label: 'Personalizado' },
];
