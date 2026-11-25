/**
 * Segmentos en el servidor (Figma CRM 1384:17). «Importar lista»: crea un segmento ESTÁTICO
 * con los clientes de una lista pegada o subida (correos, teléfonos o
 * documentos). SOLO servidor.
 *
 * - La búsqueda de clientes va con la sesión del usuario (RLS): nunca entra a
 *   la lista un cliente que el usuario no puede ver.
 * - El guardado es UNA RPC transaccional (`crm_save_segment`, service role con
 *   el actor de la sesión): segmento + `segment_members` + evento, y la base
 *   vuelve a exigir `crm.segments.manage`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError } from './crmRouteSupport';
import { colaTelefono, esCorreo, MAX_VALORES_IMPORTACION, variantesTelefono } from './segmentosImportacionLogica';

const LOTE = 200;

export interface ResultadoImportacion {
  segmento_id: string;
  encontrados: number;
  no_encontrados: number;
}

function enLotes<T>(xs: readonly T[], n = LOTE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Ids de clientes (no fusionados) que coinciden con algún valor, y cuántos valores no encontraron a nadie. */
export async function buscarClientesDeLista(
  supabase: SupabaseClient,
  orgId: number,
  valores: readonly string[],
): Promise<{ ids: string[]; noEncontrados: number }> {
  const correos = valores.filter(esCorreo).map((v) => v.toLowerCase());
  const otros = valores.filter((v) => !esCorreo(v));
  const ids = new Set<string>();
  const halladoPor = new Set<string>();

  const consultar = async (columna: 'email' | 'identification_number' | 'phone', lote: string[]) => {
    const { data, error } = await supabase
      .from('customers')
      .select('id, email, identification_number, phone, status')
      .eq('organization_id', orgId)
      .in(columna, lote);
    if (error) throw error;
    return (data ?? []) as { id: string; email: string | null; identification_number: string | null; phone: string | null; status: string | null }[];
  };

  for (const lote of enLotes(correos)) {
    for (const c of await consultar('email', lote)) {
      if (c.status === 'merged') continue;
      ids.add(c.id);
      if (c.email) halladoPor.add(c.email.toLowerCase());
    }
  }
  for (const lote of enLotes(otros)) {
    for (const c of await consultar('identification_number', lote)) {
      if (c.status === 'merged') continue;
      ids.add(c.id);
      if (c.identification_number) halladoPor.add(c.identification_number.trim());
    }
  }
  const telefonos = otros.filter((v) => !halladoPor.has(v.trim()));
  const variantes = telefonos.flatMap(variantesTelefono);
  for (const lote of enLotes(variantes)) {
    for (const c of await consultar('phone', lote)) {
      if (c.status === 'merged') continue;
      ids.add(c.id);
      if (c.phone) halladoPor.add(`tel:${colaTelefono(c.phone)}`);
    }
  }

  const noEncontrados = valores.filter((v) =>
    esCorreo(v) ? !halladoPor.has(v.toLowerCase()) : !halladoPor.has(v.trim()) && !halladoPor.has(`tel:${colaTelefono(v)}`),
  ).length;
  return { ids: [...ids], noEncontrados };
}

export interface EntradaImportacion {
  nombre: string;
  descripcion: string | null;
  valores: string[];
}

/** Valida el cuerpo de `POST /api/crm/segments/import`. */
export function leerEntradaImportacion(body: Record<string, unknown>): EntradaImportacion {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (nombre.length < 1 || nombre.length > 120) throw new CrmHttpError(400, 'nombre_invalido', 'Nombre inválido');
  const descripcion = typeof body.descripcion === 'string' && body.descripcion.trim() ? body.descripcion.trim().slice(0, 1000) : null;
  const valores = Array.isArray(body.valores)
    ? body.valores.filter((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200).map((v) => v.trim())
    : [];
  if (valores.length === 0) throw new CrmHttpError(400, 'lista_vacia', 'La lista no tiene valores');
  if (valores.length > MAX_VALORES_IMPORTACION) throw new CrmHttpError(400, 'lista_muy_larga', 'La lista supera el máximo');
  return { nombre, descripcion, valores };
}

export async function importarListaComoSegmento(
  sesion: SupabaseClient,
  servicio: SupabaseClient,
  orgId: number,
  actor: string,
  entrada: EntradaImportacion,
): Promise<ResultadoImportacion> {
  const { ids, noEncontrados } = await buscarClientesDeLista(sesion, orgId, entrada.valores);
  if (ids.length === 0) throw new CrmHttpError(400, 'sin_coincidencias', 'Ningún valor de la lista coincide con un cliente', { no_encontrados: noEncontrados });
  const { data, error } = await servicio.rpc('crm_save_segment', {
    p_org: orgId,
    p_actor: actor,
    p_id: null,
    p_name: entrada.nombre,
    p_description: entrada.descripcion,
    p_filter: [],
    p_dynamic: false,
    p_count: ids.length,
    p_members: ids,
    p_expected: null,
  });
  if (error) throw error;
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'string') throw new Error('crm_save_segment sin id');
  return { segmento_id: id, encontrados: ids.length, no_encontrados: noEncontrados };
}

/**
 * ¿Hay una campaña EN CURSO con este segmento? WhatsApp/correo enviando
 * (`campaigns.status = 'sending'`, por `segment_id` o por la audiencia en
 * `statistics`) o voz programada/en marcha (`voice_agent_campaigns`).
 * Mismas referencias que `crm_segment_usages`.
 */
export async function campanaEnCursoDeSegmento(supabase: SupabaseClient, orgId: number, segmentoId: string): Promise<boolean> {
  const [porColumna, porAudiencia, voz] = await Promise.all([
    supabase.from('campaigns').select('id').eq('organization_id', orgId).eq('segment_id', segmentoId).eq('status', 'sending').limit(1),
    supabase.from('campaigns').select('id').eq('organization_id', orgId).eq('statistics->audience->>segment_id', segmentoId).eq('status', 'sending').limit(1),
    supabase.from('voice_agent_campaigns').select('id').eq('organization_id', orgId).eq('target_config->>segment_id', segmentoId).in('status', ['scheduled', 'running']).limit(1),
  ]);
  for (const r of [porColumna, porAudiencia, voz]) if (r.error) throw r.error;
  return [porColumna, porAudiencia, voz].some((r) => (r.data ?? []).length > 0);
}
