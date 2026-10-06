/**
 * Conteo en vivo de un segmento en el SERVIDOR (Figma CRM 1384:825677 y
 * 1388:1979). Antes se contaba en el navegador con PostgREST, solo con Y y con
 * campos que `customers` no tiene.
 *
 * Una RPC (`crm_segment_preview`, migración PENDIENTE 20261006230100) cuenta
 * base y coincidencias con la sesión del usuario (permiso
 * `crm.customers.view`, miembro activo, sucursal) y desglosa por canal con
 * `fn_can_contact`. Aquí solo se normaliza el filtro, se pone el tope de 5 s y
 * se traducen los fallos a códigos que la pantalla sabe pintar:
 *  - 503 `conteo_no_disponible`: la migración aún no está aplicada;
 *  - 504 `conteo_tardio`: tardó más de 5 s («puedes guardar igual»);
 *  - 400 `filtro_invalido`: campo u operador fuera de la lista blanca.
 * SOLO servidor.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError } from './crmRouteSupport';
import { filtroDentroDeLimites, normalizarFiltroSegmento } from './segmentosFiltroLogica';

export const TIEMPO_MAXIMO_CONTEO_MS = 5000;

export interface DesgloseSegmento {
  telefono: number;
  no_llamar: number;
  correo: number;
  whatsapp: number;
  /** true = calculado sobre una muestra (`sobre` clientes) y extrapolado. */
  estimado: boolean;
  sobre: number;
}

export interface ConteoSegmento {
  base: number;
  coinciden: number;
  desglose: DesgloseSegmento | null;
  muestra: { id: string; nombre: string | null; empresa: string | null }[];
  calculado_en: string;
}

function rpcInexistente(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? ''));
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function normalizarConteo(raw: Record<string, unknown>): ConteoSegmento {
  const d = raw.desglose as Record<string, unknown> | null | undefined;
  return {
    base: num(raw.base),
    coinciden: num(raw.coinciden),
    desglose: d
      ? { telefono: num(d.telefono), no_llamar: num(d.no_llamar), correo: num(d.correo), whatsapp: num(d.whatsapp), estimado: d.estimado === true, sobre: num(d.sobre) }
      : null,
    muestra: Array.isArray(raw.muestra) ? (raw.muestra as ConteoSegmento['muestra']) : [],
    calculado_en: String(raw.calculado_en ?? ''),
  };
}

export async function contarSegmento(
  orgId: number,
  supabase: SupabaseClient,
  filtro: unknown,
  tiempoMaximoMs = TIEMPO_MAXIMO_CONTEO_MS,
): Promise<ConteoSegmento> {
  const f = normalizarFiltroSegmento(filtro);
  if (!f || !filtroDentroDeLimites(f)) throw new CrmHttpError(400, 'filtro_invalido', 'El filtro del segmento no es válido');
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new CrmHttpError(504, 'conteo_tardio', 'El conteo tardó demasiado')), tiempoMaximoMs);
  });
  try {
    const { data, error } = await Promise.race([
      supabase.rpc('crm_segment_preview', { p_org: orgId, p_filter: f, p_muestra: 3 }),
      tarde,
    ]);
    if (rpcInexistente(error)) throw new CrmHttpError(503, 'conteo_no_disponible', 'El conteo en el servidor aún no está disponible');
    if (error?.code === '57014') throw new CrmHttpError(504, 'conteo_tardio', 'El conteo tardó demasiado');
    if (error) throw error;
    return normalizarConteo((data ?? {}) as Record<string, unknown>);
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}
