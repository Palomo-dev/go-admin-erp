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
 *  4. Una sola RPC transaccional (`crm_voice_campaign_rne_snapshot`) guarda la
 *     constancia con su vigencia, los números excluidos y omite las llamadas
 *     pendientes de esos objetivos.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCampaignTargets, type VoiceAgentCampaign } from '@/lib/services/crm/voiceAgentService';
import { normalizarNumeroRne, leerArchivoRne, MAX_BYTES_ARCHIVO_RNE, VIGENCIA_RNE_DIAS } from './rne';

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
  campaign_updated_at: string;
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
  archivo: { nombre: string | null; contenido: string; expectedUpdatedAt?: string }
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
    .is('stats->>archived_at', null)
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

  const objetivos = await buildCampaignTargets(supabase, orgId, campaign);
  const ids = Array.from(new Set(objetivos.map((o) => o.customer_id)));
  const conTelefono: Array<{ customer_id: string; phone: string | null }> = [];
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500);
    const res = await supabase.from('customers').select('id, phone').eq('organization_id', orgId).neq('status', 'merged').in('id', lote);
    if (res.error) throw new Error(`customers: ${res.error.message}`);
    for (const c of (res.data ?? []) as Array<{ id: string; phone: string | null }>) {
      conTelefono.push({ customer_id: c.id, phone: c.phone });
    }
  }

  const sha256 = createHash('sha256').update(archivo.contenido, 'utf8').digest('hex');
  const { data, error } = await supabase.rpc('crm_voice_campaign_rne_snapshot', {
    p_org: orgId,
    p_campaign: campaignId,
    p_version: archivo.expectedUpdatedAt ?? campaign.updated_at,
    p_numeros: lectura.numeros,
    p_targets: conTelefono.map(target => ({ ...target, phone_e164: normalizarNumeroRne(target.phone) })),
    p_archivo: (archivo.nombre || 'rne.csv').slice(0, 255),
    p_sha256: sha256,
    p_usuario: userId,
    p_vigencia_dias: VIGENCIA_RNE_DIAS,
  });
  if (error) throw error;
  const r = data as Omit<ResultadoVerificacionRne, 'descartados'>;
  return { ...r, descartados: lectura.descartados };
}
