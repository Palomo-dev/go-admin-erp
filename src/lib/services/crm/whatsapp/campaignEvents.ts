/**
 * Solo constancias guardadas por el webhook con firma verificada pueden
 * sincronizar estados y liquidar reservas. message_events es una proyección.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppWebhookStatus } from '@/lib/services/integrations/whatsapp/whatsappCloudTypes';
import { countryFromPhone } from '@/lib/services/crm/phoneNormalize';
import { getUnitCost } from '@/lib/services/crm/pricingService';
import { WhatsAppError } from './types';

export type ProviderErrorAction = { state: 'skipped'; skipped_reason: string; retry_after?: null } | { state: 'pending'; retry_after_ms: number } | { state: 'failed' };

/** Clasificación compartida; SQL exige rechazo verificado antes de reintentar. */
export function providerErrorAction(code: string | null | undefined): ProviderErrorAction {
  const c = String(code ?? '');
  if (c === '131049' || c === '131048') return { state: 'skipped', skipped_reason: 'rate_limited_24h' };
  if (c === '131056') return { state: 'pending', retry_after_ms: 6_000 };
  if (c === '130429' || c === '429') return { state: 'pending', retry_after_ms: 30_000 };
  return { state: 'failed' };
}

export interface ProviderReceiptResult {
  receipt_id: string;
  applied: boolean;
  pending: boolean;
  already_applied?: boolean;
  state?: string;
  reason?: string | null;
  message_id?: string;
}

/** Precio configurado; un país/categoría desconocidos conservan costo desconocido. */
async function providerUnitCost(status: WhatsAppWebhookStatus): Promise<number | null> {
  if (!['delivered', 'read'].includes(status.status) || !status.pricing) return null;
  if (status.pricing.billable === false) return 0;
  const country = countryFromPhone(status.recipient_id);
  const category = status.pricing.category.toLowerCase();
  if (country === 'other' || !['utility', 'marketing', 'authentication'].includes(category)) return null;
  const value = await getUnitCost('meta', `wa_${category}_${country}`);
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Solo para el consumidor del webhook, después de verificar firma y canal. */
export async function recordWhatsAppProviderStatus(
  orgId: number, channelId: string, status: WhatsAppWebhookStatus, service: SupabaseClient,
): Promise<ProviderReceiptResult> {
  const { data, error } = await service.rpc('crm_record_provider_status', {
    p_org: orgId, p_channel: channelId, p_status: status, p_unit_cost: await providerUnitCost(status),
  });
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  const result = data as Partial<ProviderReceiptResult> | null;
  if (!result || typeof result.receipt_id !== 'string' || typeof result.applied !== 'boolean' || typeof result.pending !== 'boolean') {
    throw new WhatsAppError('INTERNAL', 'Respuesta inválida al guardar el evento del proveedor.', 500);
  }
  return result as ProviderReceiptResult;
}

/** Respaldo del webhook: aplica constancias privadas, sin leer eventos editables. */
export async function syncCampaignProviderReceipts(orgId: number, campaignId: string, service: SupabaseClient): Promise<number> {
  const { data, error } = await service.rpc('crm_reconcile_provider_status', { p_org: orgId, p_message: null, p_campaign: campaignId });
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
    throw new WhatsAppError('INTERNAL', 'Respuesta inválida al conciliar la campaña.', 500);
  }
  return data;
}
