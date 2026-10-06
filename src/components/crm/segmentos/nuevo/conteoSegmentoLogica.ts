/**
 * Lógica pura del conteo en vivo del constructor de segmentos (Figma CRM
 * 1384:825677 y 1388:1979). Sin React.
 */
import type { FilterRule } from '../types';

export const ESPERA_CONTEO_MS = 600;

/** Una regla lista para contar: tiene campo y operador, y valor si el operador lo pide. */
export function reglaCompleta(r: FilterRule): boolean {
  if (!r.field || !r.operator) return false;
  if (r.operator === 'is_empty' || r.operator === 'is_not_empty') return true;
  if (Array.isArray(r.value)) return r.value.length > 0 && r.value.every((v) => String(v).trim() !== '');
  return String(r.value ?? '').trim() !== '';
}

/** Grupos que viajan al servidor: solo reglas completas y sin grupos vacíos. */
export function gruposParaContar(grupos: readonly FilterRule[][]): FilterRule[][] {
  return grupos.map((g) => g.filter(reglaCompleta)).filter((g) => g.length > 0);
}

export type EstadoConteo = 'contando' | 'listo' | 'tardio' | 'noDisponible' | 'invalido' | 'sinPermiso' | 'error';

/** Estado de la pantalla según el código HTTP de `POST /api/crm/segments/preview`. */
export function estadoDeError(status: number): EstadoConteo {
  if (status === 504) return 'tardio';
  if (status === 503) return 'noDisponible';
  if (status === 400) return 'invalido';
  if (status === 401 || status === 403) return 'sinPermiso';
  return 'error';
}

/** «3,7 % de tu base» con un decimal; 0 sin base. */
export function porcentajeDeBase(coinciden: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((1000 * coinciden) / base) / 10;
}

/** Clave estable de los grupos para no recontar lo mismo. */
export const claveGrupos = (grupos: readonly FilterRule[][]): string => JSON.stringify(gruposParaContar(grupos));
