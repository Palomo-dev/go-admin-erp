/**
 * Filas de `pos_scales` (RPC `pos_basculas_para_pos` / `pos_basculas_listar`)
 * a `ConfigBascula`, y la elección de la báscula de este equipo. Puro.
 */

import { esProtocolo } from './protocolos';
import type { ConfigBascula, Paridad, TransporteBasculaId } from './tipos';
import { transporteDisponible, type EntornoBascula } from './transportes';

/** Fila tal como la devuelven las RPC (snake_case). */
export interface FilaBascula {
  id: string;
  name: string;
  transport: string;
  protocol: string;
  custom_pattern?: string | null;
  device_hint?: string | null;
  baud_rate?: number | null;
  data_bits?: number | null;
  parity?: string | null;
  stop_bits?: number | null;
  unit_code?: string | null;
  decimals?: number | null;
  capacity_max?: number | string | null;
  min_division?: number | string | null;
  stable_ms?: number | null;
  pos_terminal_id?: string | null;
  print_agent_id?: string | null;
  asignada_a_este_equipo?: boolean;
  asignada_a_otro_equipo?: boolean;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Normaliza una fila; null si el transporte o el protocolo no son conocidos. */
export function configDesdeFila(f: FilaBascula): ConfigBascula | null {
  if (!f || typeof f.id !== 'string') return null;
  if (f.transport !== 'desktop_serial' && f.transport !== 'web_serial') return null;
  if (!esProtocolo(f.protocol)) return null;
  const paridad: Paridad = f.parity === 'even' || f.parity === 'odd' ? f.parity : 'none';
  const capacidad = num(f.capacity_max);
  const division = num(f.min_division);
  return {
    id: f.id,
    nombre: f.name,
    transporte: f.transport as TransporteBasculaId,
    protocolo: f.protocol,
    patron: f.custom_pattern ?? null,
    dispositivo: f.device_hint ?? null,
    baudios: num(f.baud_rate) ?? 9600,
    bitsDatos: num(f.data_bits) === 7 ? 7 : 8,
    paridad,
    bitsParada: num(f.stop_bits) === 2 ? 2 : 1,
    unidad: (f.unit_code ?? 'KG').trim().toUpperCase() || 'KG',
    decimales: Math.max(0, Math.min(4, num(f.decimals) ?? 3)),
    capacidad: capacidad !== null && capacidad > 0 ? capacidad : null,
    division: division !== null && division > 0 ? division : null,
    estableMs: Math.max(0, Math.min(5000, num(f.stable_ms) ?? 500)),
  };
}

/**
 * La báscula de este equipo:
 * 1. la elegida en este navegador («Usar en este equipo»), si sigue activa y se
 *    puede leer desde aquí;
 * 2. si no, la primera que se pueda leer desde aquí y no esté asignada a otra
 *    caja o equipo (la RPC ya las ordena: esta caja, este equipo, sin asignar).
 */
export function elegirBasculaDelEquipo(
  filas: readonly FilaBascula[],
  entorno: EntornoBascula,
  preferidaId: string | null,
): ConfigBascula | null {
  const configs = filas
    .map((f) => ({ f, c: configDesdeFila(f) }))
    .filter((x): x is { f: FilaBascula; c: ConfigBascula } => x.c !== null && transporteDisponible(x.c.transporte, entorno));
  if (preferidaId) {
    const pref = configs.find((x) => x.c.id === preferidaId);
    if (pref) return pref.c;
  }
  const libre = configs.find((x) => x.f.asignada_a_este_equipo || !x.f.asignada_a_otro_equipo);
  return libre?.c ?? null;
}

/** Clave de localStorage de la báscula elegida en este navegador. */
export function claveBasculaEquipo(orgId: number, branchId: number): string {
  return `pos_bascula_equipo_${orgId}_${branchId}`;
}
