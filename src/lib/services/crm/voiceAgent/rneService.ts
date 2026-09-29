/**
 * Verificación de una campaña de voz contra el Registro de Números Excluidos
 * (RNE, CRC). SOLO servidor: la ruta ya validó sesión, organización y permiso,
 * y pasa un cliente service-role.
 *
 * Qué hace, en este orden:
 *  1. Comprueba que la campaña es de la organización.
 *  2. Lee el archivo (`leerArchivoRne`): números normalizados a E.164.
 *  3. Calcula los objetivos ACTUALES de la campaña con `buildCampaignTargets`
 *     (el mismo que usa la cola; regla dura 7) y separa los excluidos.
 *  4. Una sola RPC transaccional (`fn_rne_registrar_verificacion`) guarda la
 *     constancia con su vigencia, los números excluidos y omite las llamadas
 *     pendientes de esos objetivos.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCampaignTargets, type VoiceAgentCampaign } from '@/lib/services/crm/voiceAgentService';
import { filtrarContraRne, leerArchivoRne, MAX_BYTES_ARCHIVO_RNE, VIGENCIA_RNE_DIAS } from './rne';

/** Objetivos que se revisan por verificación (tope de la cola por campaña × margen). */
export const MAX_OBJETIVOS_REVISADOS = 5000;

export class RneValidationError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'RneValidationError';
    this.statusCode = statusCode;
  }
}

export interface ResultadoVerificacionRne {
  check_id: string;
  checked_at: string;
  valid_until: string;
  numbers_in_file: number;
  checked_targets: number;
  excluded_targets: number;
  skipped_calls: number;
  descartados: number;
}

export async function registrarVerificacionRne(
  supabase: SupabaseClient,
  orgId: number,
  campaignId: string,
  userId: string | null,
  archivo: { nombre: string | null; contenido: string }
): Promise<ResultadoVerificacionRne> {
  if (typeof archivo.contenido !== 'string' || !archivo.contenido.trim()) {
    throw new RneValidationError('El archivo está vacío.');
  }
  if (Buffer.byteLength(archivo.contenido, 'utf8') > MAX_BYTES_ARCHIVO_RNE) {
    throw new RneValidationError('El archivo supera 8 MB.', 413);
  }

  const campRes = await supabase
    .from('voice_agent_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (campRes.error) throw new Error(`voice_agent_campaigns: ${campRes.error.message}`);
  const campaign = campRes.data as VoiceAgentCampaign | null;
  if (!campaign) throw new RneValidationError('Campaña no encontrada', 404);

  let lectura;
  try {
    lectura = leerArchivoRne(archivo.contenido);
  } catch (err) {
    throw new RneValidationError(err instanceof Error ? err.message : 'Archivo ilegible');
  }
  if (lectura.numeros.length === 0) {
    throw new RneValidationError('El archivo no contiene ningún número de teléfono reconocible.');
  }

  const objetivos = await buildCampaignTargets(supabase, orgId, campaign, MAX_OBJETIVOS_REVISADOS);
  const ids = Array.from(new Set(objetivos.map((o) => o.customer_id)));
  const conTelefono: Array<{ customer_id: string; phone: string | null }> = [];
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500);
    const res = await supabase.from('customers').select('id, phone').eq('organization_id', orgId).in('id', lote);
    if (res.error) throw new Error(`customers: ${res.error.message}`);
    for (const c of (res.data ?? []) as Array<{ id: string; phone: string | null }>) {
      conTelefono.push({ customer_id: c.id, phone: c.phone });
    }
  }
  const { excluidos } = filtrarContraRne(conTelefono, lectura.numeros);

  const sha256 = createHash('sha256').update(archivo.contenido, 'utf8').digest('hex');
  const { data, error } = await supabase.rpc('fn_rne_registrar_verificacion', {
    p_org: orgId,
    p_campaign: campaignId,
    p_numeros: lectura.numeros,
    p_clientes_excluidos: excluidos.map((e) => e.customer_id),
    p_objetivos_revisados: conTelefono.length,
    p_archivo: (archivo.nombre || 'rne.csv').slice(0, 255),
    p_sha256: sha256,
    p_usuario: userId,
    p_vigencia_dias: VIGENCIA_RNE_DIAS,
  });
  if (error) throw new Error(`fn_rne_registrar_verificacion: ${error.message}`);
  const r = data as Omit<ResultadoVerificacionRne, 'descartados'>;
  return { ...r, descartados: lectura.descartados };
}
