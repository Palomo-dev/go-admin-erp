/**
 * Inicio de Contabilidad (Figma 987:622311 con avisos · 987:623198 todo en
 * orden · 987:624072 cargando · 988:626299 tableta · 989:77178 móvil). Sin React.
 */
import { rejillaDelAnio, mesesSinCerrar, type PeriodoBasico } from './periodosLogica';

export interface PeriodoActual {
  /** Mes en curso (1-12) del día de la organización. */
  mes: number;
  anio: number;
  /** Estado del periodo mensual del mes; `null` si no se ha generado. */
  estado: PeriodoBasico['status'] | null;
  /** Meses pasados del año que siguen abiertos (los que hay que cerrar). */
  sinCerrar: number[];
}

export function periodoActual(periodos: readonly PeriodoBasico[], hoy: string): PeriodoActual {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const celdas = rejillaDelAnio(periodos, anio, hoy);
  return { mes, anio, estado: celdas[mes - 1]?.periodo?.status ?? null, sinCerrar: mesesSinCerrar(celdas) };
}

/** Nombre del mes en el idioma de la persona, sin pasar por la zona horaria. */
export function nombreMes(mes: number, anio: number, locale: string, conAnio = false): string {
  const nombre = new Intl.DateTimeFormat(locale, { month: 'long', ...(conAnio ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(
    new Date(Date.UTC(anio, mes - 1, 15)),
  );
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/** Cuentas agrupadoras: las que tienen subcuentas en el plan. */
export function contarAgrupadoras(codigos: readonly string[]): number {
  const lista = codigos.map((c) => c.trim());
  return lista.filter((c) => lista.some((x) => x !== c && x.startsWith(c))).length;
}

export type TonoAvisoInicio = 'peligro' | 'advertencia' | null;

/** La banda roja sale si hay pendientes; ámbar si solo hay descuadres. Lo que no se pudo leer no pinta banda. */
export function tonoAvisoInicio(pendientes: number | null, descuadres: number | null): TonoAvisoInicio {
  if ((pendientes ?? 0) > 0) return 'peligro';
  if ((descuadres ?? 0) > 0) return 'advertencia';
  return null;
}
