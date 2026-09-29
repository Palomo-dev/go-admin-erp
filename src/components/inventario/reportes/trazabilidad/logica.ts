/**
 * Lógica de presentación de la trazabilidad (inventario B4), sin React:
 * búsquedas recientes (solo en este navegador, por organización), estado de
 * vencimiento de un lote (días planos) y qué parece el código escrito.
 */
import { diasEntre } from '@/components/inventario/productos/logica/seriales';

const CLAVE_RECIENTES = 'go-admin:trazabilidad-recientes:';
export const MAX_RECIENTES = 5;

/** Lista nueva con `codigo` al principio, sin repetidos (sin distinguir mayúsculas) y con tope. */
export function conReciente(lista: readonly string[], codigo: string, max = MAX_RECIENTES): string[] {
  const limpio = codigo.trim();
  if (!limpio) return [...lista];
  return [limpio, ...lista.filter((x) => x.toLowerCase() !== limpio.toLowerCase())].slice(0, max);
}

export function leerRecientes(org: number): string[] {
  try {
    const crudo = typeof window === 'undefined' ? null : window.localStorage.getItem(`${CLAVE_RECIENTES}${org}`);
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string' && x.length <= 120).slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}

export function agregarReciente(org: number, codigo: string): string[] {
  const lista = conReciente(leerRecientes(org), codigo);
  try {
    window.localStorage.setItem(`${CLAVE_RECIENTES}${org}`, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento (modo privado): los recientes solo duran la sesión de la página.
  }
  return lista;
}

export type VencimientoLote = 'vencido' | 'por_vencer' | 'vigente';

/** Días para «por vencer» (el mismo corte de 30 días del resto del módulo). */
export const DIAS_POR_VENCER_LOTE = 30;

/** `vence` es una columna `date`; `hoy`, el día de la organización. */
export function estadoVencimientoLote(vence: string | null | undefined, hoy: string): VencimientoLote | null {
  if (!vence || !/^\d{4}-\d{2}-\d{2}/.test(vence) || !/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return null;
  const dias = diasEntre(hoy, vence.slice(0, 10));
  if (dias < 0) return 'vencido';
  return dias <= DIAS_POR_VENCER_LOTE ? 'por_vencer' : 'vigente';
}

export type TipoCodigo = 'documento' | 'lote' | 'codigo';

/** Qué parece el código (solo para el texto de «sin resultados»; quien decide es la RPC). */
export function tipoCodigoProbable(codigo: string): TipoCodigo {
  const c = codigo.trim().toUpperCase();
  if (/^(OC|TR|AJ|GAR|FV|FE|VTA|FACT|PED)[-\s]?\d+/.test(c)) return 'documento';
  if (/^(L|LOTE)[-\s]/.test(c)) return 'lote';
  return 'codigo';
}
