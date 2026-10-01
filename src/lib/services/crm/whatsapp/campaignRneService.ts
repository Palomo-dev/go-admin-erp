/** Solo servidor: lectura propia con sesión e importación privada tras autorizar la ruta. */
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { exportCampaignContacts } from './campaignService';
import { errorWhatsAppDb } from './erroresDbLogica';
import { WhatsAppError } from './types';
import { filtrarContraRne, leerArchivoRne, MAX_BYTES_ARCHIVO_RNE, normalizarNumeroRne, VIGENCIA_RNE_DIAS } from '../voiceAgent/rne';

export interface CampaignRneCheck {
  check_id?: string;
  id: string;
  checked_at: string;
  valid_until: string;
  numbers_in_file: number;
  checked_targets: number;
  excluded_targets: number;
  skipped_contacts: number;
  file_name?: string | null;
}
export interface CampaignCompliance {
  data_policy_url: string | null;
  data_policy_valid: boolean;
  rne: CampaignRneCheck | null;
  rne_current: boolean;
  allowed: boolean;
  reason: 'data_policy_required' | 'rne_required' | null;
}

function validCheck(value: unknown): value is CampaignRneCheck {
  if (!value || typeof value !== 'object') return false;
  const r = value as CampaignRneCheck;
  return typeof r.id === 'string' && Number.isFinite(Date.parse(r.checked_at)) && Number.isFinite(Date.parse(r.valid_until))
    && [r.numbers_in_file, r.checked_targets, r.excluded_targets, r.skipped_contacts].every(n => Number.isSafeInteger(n) && n >= 0)
    && r.numbers_in_file > 0 && r.excluded_targets <= r.checked_targets && r.skipped_contacts <= r.excluded_targets;
}

export async function getCampaignCompliance(orgId: number, campaignId: string, session: SupabaseClient): Promise<CampaignCompliance> {
  const { data, error } = await session.rpc('crm_campaign_compliance_status', { p_org: orgId, p_campaign: campaignId });
  if (error) throw errorWhatsAppDb(error);
  const r = data as CampaignCompliance | null;
  if (!r || ![r.data_policy_valid, r.rne_current, r.allowed].every(v => typeof v === 'boolean')
    || (r.data_policy_url !== null && typeof r.data_policy_url !== 'string')
    || (r.rne !== null && !validCheck(r.rne))
    || ![null, 'data_policy_required', 'rne_required'].includes(r.reason)
    || r.allowed !== (r.data_policy_valid && r.rne_current))
    throw new WhatsAppError('INTERNAL', 'Cumplimiento sin resultado válido', 500);
  return r;
}

export async function registerCampaignRne(orgId: number, campaignId: string, actorId: string,
  archivo: { nombre: string | null; contenido: string }, session: SupabaseClient, service: SupabaseClient,
): Promise<CampaignRneCheck & { descartados: number }> {
  if (!archivo.contenido.trim()) throw new WhatsAppError('VALIDATION', 'El archivo está vacío', 400);
  if (Buffer.byteLength(archivo.contenido, 'utf8') > MAX_BYTES_ARCHIVO_RNE)
    throw new WhatsAppError('VALIDATION', 'El archivo supera 8 MB', 413);
  let lectura;
  try { lectura = leerArchivoRne(archivo.contenido); }
  catch (error) { throw new WhatsAppError('VALIDATION', error instanceof Error ? error.message : 'Archivo ilegible', 400); }
  if (!lectura.numeros.length) throw new WhatsAppError('VALIDATION', 'El archivo no contiene números de teléfono reconocibles', 400);
  // Una sola lectura completa: no reutilizar el límite de 5.000 objetivos de voz.
  const audiencia = await exportCampaignContacts(orgId, campaignId, {}, session);
  const objetivos = audiencia.data.map(row => {
    if (!row.customer || row.customer.id !== row.customer_id || (row.customer.phone !== null && typeof row.customer.phone !== 'string'))
      throw new WhatsAppError('INTERNAL', 'Audiencia sin teléfono propio verificable', 500);
    return { customer_id: row.customer_id, phone: row.customer.phone };
  });
  const { excluidos } = filtrarContraRne(objetivos, lectura.numeros);
  const { data, error } = await service.rpc('crm_register_campaign_rne', {
    p_org: orgId, p_campaign: campaignId, p_actor: actorId,
    p_numbers: lectura.numeros,
    p_excluded: excluidos.map(row => ({ ...row, phone_e164: normalizarNumeroRne(row.phone) })),
    p_file: (archivo.nombre || 'rne.csv').slice(0, 255),
    p_sha256: createHash('sha256').update(archivo.contenido, 'utf8').digest('hex'), p_days: VIGENCIA_RNE_DIAS,
  });
  if (error) throw errorWhatsAppDb(error);
  if (!validCheck(data)) throw new WhatsAppError('INTERNAL', 'Verificación sin resultado válido', 500);
  return { ...data, descartados: lectura.descartados };
}
