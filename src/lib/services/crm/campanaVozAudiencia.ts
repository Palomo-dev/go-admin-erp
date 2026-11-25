/**
 * Vista previa de la audiencia de una campaña de voz (asistente, paso 2 ·
 * Figma CRM 1681:856945): cuántos objetivos se llamarán y por qué se excluye
 * al resto, SIN crear filas ni marcar.
 *
 * No reimplementa ninguna regla (regla dura 7):
 *  - los objetivos los arma `buildCampaignTargets`, el mismo que usa la cola;
 *  - la baja voluntaria es `fn_can_contact` aplicado al lote
 *    (`crm_voice_audiencia_bloqueados`, migración 20261115200000);
 *  - la lista de excluidos de la organización es `crm_segment_excluded_phones`
 *    (`crm_excluded_numbers`, la misma que respeta la cola);
 *  - los números de prueba salen de `listarNumerosPrueba`;
 *  - el teléfono se normaliza con `normalizarNumeroRne` (sin teléfono marcable,
 *    la cola tampoco llama).
 *
 * SOLO servidor. Recibe el cliente de la SESIÓN con la organización validada:
 * la RLS de `customers` y los permisos de las RPC vuelven a comprobarlo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCampaignTargets,
  CAMPAIGN_TARGET_SOURCES,
  type CampaignTargetSource,
  type VoiceAgentCampaign,
} from './voiceAgentService';
import { normalizarNumeroRne } from './voiceAgent/rne';
import { listarNumerosPrueba } from './voiceAgent/numerosPrueba';
import { enmascararTelefono } from './telefonoEnmascarado';

/** Objetivos que se revisan uno a uno (lote máximo de las RPC). */
export const MAX_AUDIENCIA_PREVIA = 1000;
/** Filas de muestra que viajan a la pantalla. */
export const MUESTRA_AUDIENCIA = 20;
const LOTE_CLIENTES = 150;

export type EstadoObjetivo = 'llamar' | 'prueba' | 'baja' | 'lista' | 'sin_telefono';

export interface ObjetivoPrevio {
  customer_id: string;
  nombre: string | null;
  /** Enmascarado: «+57 300 *** 4521». `null` = sin teléfono marcable. */
  telefono: string | null;
  stage_id: string | null;
  estado: EstadoObjetivo;
}

export interface AudienciaPrevia {
  /** Objetivos revisados (hasta `MAX_AUDIENCIA_PREVIA`). */
  total: number;
  a_llamar: number;
  excluidos: { baja: number; lista: number; sin_telefono: number };
  /** Había más objetivos que el tope: las cifras cubren los primeros. */
  truncado: boolean;
  muestra: ObjetivoPrevio[];
}

export class AudienciaPreviaError extends Error {
  constructor(mensaje: string, public readonly statusCode = 400) {
    super(mensaje);
    this.name = 'AudienciaPreviaError';
  }
}

/** «+573004521234» → «+57 300 *** 1234». Otros países: prefijo y últimos 4. */
export { enmascararTelefono };

export interface ClientePrevio {
  id: string;
  full_name: string | null;
  phone: string | null;
}

/**
 * Clasifica cada objetivo (puro). Precedencia: sin teléfono → baja voluntaria
 * → lista de excluidos. Un número de prueba sigue sujeto a las tres.
 */
export function clasificarAudiencia(
  objetivos: ReadonlyArray<{ customer_id: string; stage_id: string | null }>,
  clientes: ReadonlyMap<string, ClientePrevio>,
  bloqueados: ReadonlySet<string>,
  excluidosE164: ReadonlySet<string>,
  pruebaE164: ReadonlySet<string>,
  truncado: boolean,
): AudienciaPrevia {
  const excluidos = { baja: 0, lista: 0, sin_telefono: 0 };
  let aLlamar = 0;
  const muestra: ObjetivoPrevio[] = [];
  for (const o of objetivos) {
    const c = clientes.get(o.customer_id);
    const e164 = normalizarNumeroRne(c?.phone ?? null);
    let estado: EstadoObjetivo;
    if (!e164) estado = 'sin_telefono';
    else if (bloqueados.has(o.customer_id)) estado = 'baja';
    else if (excluidosE164.has(e164)) estado = 'lista';
    else estado = pruebaE164.has(e164) ? 'prueba' : 'llamar';
    if (estado === 'llamar' || estado === 'prueba') aLlamar += 1;
    else excluidos[estado] += 1;
    if (muestra.length < MUESTRA_AUDIENCIA) {
      muestra.push({
        customer_id: o.customer_id,
        nombre: c?.full_name ?? null,
        telefono: enmascararTelefono(e164),
        stage_id: o.stage_id,
        estado,
      });
    }
  }
  return { total: objetivos.length, a_llamar: aLlamar, excluidos, truncado, muestra };
}

function trozos<T>(lista: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

export async function previsualizarAudiencia(
  orgId: number,
  supabase: SupabaseClient,
  entrada: { target_source: unknown; target_config: unknown },
): Promise<AudienciaPrevia> {
  const fuente = entrada.target_source as CampaignTargetSource;
  if (!CAMPAIGN_TARGET_SOURCES.includes(fuente)) throw new AudienciaPreviaError('target_source inválido');
  const config =
    entrada.target_config && typeof entrada.target_config === 'object' && !Array.isArray(entrada.target_config)
      ? (entrada.target_config as Record<string, unknown>)
      : {};

  const campana = { organization_id: orgId, target_source: fuente, target_config: config } as unknown as VoiceAgentCampaign;
  const crudos = await buildCampaignTargets(supabase, orgId, campana, MAX_AUDIENCIA_PREVIA + 1);
  const vistos = new Set<string>();
  const objetivos = crudos.filter((o) => (vistos.has(o.customer_id) ? false : (vistos.add(o.customer_id), true)));
  const truncado = objetivos.length > MAX_AUDIENCIA_PREVIA;
  const revisar = objetivos.slice(0, MAX_AUDIENCIA_PREVIA);
  const ids = revisar.map((o) => o.customer_id);
  if (ids.length === 0) return clasificarAudiencia([], new Map(), new Set(), new Set(), new Set(), false);

  const clientes = new Map<string, ClientePrevio>();
  for (const lote of trozos(ids, LOTE_CLIENTES)) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, phone')
      .eq('organization_id', orgId)
      .in('id', lote);
    if (error) throw new Error(`customers: ${error.message}`);
    for (const c of (data ?? []) as ClientePrevio[]) clientes.set(c.id, c);
  }

  const { data: bloqueadosData, error: bloqueadosError } = await supabase.rpc('crm_voice_audiencia_bloqueados', {
    p_org: orgId,
    p_customers: ids,
  });
  if (bloqueadosError) throw new Error(`crm_voice_audiencia_bloqueados: ${bloqueadosError.message}`);
  const bloqueados = new Set<string>((bloqueadosData ?? []) as string[]);

  const telefonos = [...new Set([...clientes.values()].map((c) => normalizarNumeroRne(c.phone)).filter((p): p is string => !!p))];
  const excluidosE164 = new Set<string>();
  if (telefonos.length > 0) {
    const { data: exc, error: excError } = await supabase.rpc('crm_segment_excluded_phones', { p_org: orgId, p_phones: telefonos });
    if (excError) throw new Error(`crm_segment_excluded_phones: ${excError.message}`);
    for (const fila of (exc ?? []) as Array<{ phone: string }>) excluidosE164.add(fila.phone);
  }

  // Los números de prueba solo los lee un administrador (RLS): sin permiso, la
  // vista previa simplemente no los distingue de un número normal.
  let pruebaE164 = new Set<string>();
  try {
    pruebaE164 = new Set((await listarNumerosPrueba(supabase, orgId)).map((n) => n.phone_e164));
  } catch {
    pruebaE164 = new Set();
  }

  return clasificarAudiencia(revisar, clientes, bloqueados, excluidosE164, pruebaE164, truncado);
}
