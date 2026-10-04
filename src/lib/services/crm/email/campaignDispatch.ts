/** Compuerta y recibo de campaña; el proveedor sólo lo invoca el deliver nativo. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailError, type EmailMessage } from './types';

export interface DeliveryBudget {
  signal?: AbortSignal;
  deadlineAt?: number;
  timeoutMs?: number;
}
interface DispatchReceipt { allowed?: boolean; applied?: boolean; reason?: string; token?: string; message?: EmailMessage }

/** campaign_id también enlaza correos manuales; sólo el contacto identifica el lote. */
export function isCampaignBridgeMessage(msg: EmailMessage): boolean {
  return !!(msg.metadata?.campaign_id && msg.metadata?.campaign_contact_id);
}

export function checkDeliveryBudget(options: DeliveryBudget = {}) {
  if (options.signal?.aborted || (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt)) {
    throw new EmailError('DELIVERY_ABORTED', 'Presupuesto de envío agotado', 503);
  }
}

export async function campaignDispatch(msg: EmailMessage, action: 'begin' | 'sent' | 'failed' | 'blocked', service: SupabaseClient, token?: string, providerId?: string, errorText?: string): Promise<DispatchReceipt> {
  const campaign = msg.metadata?.campaign_id;
  if (!isCampaignBridgeMessage(msg)) throw new EmailError('VALIDATION', 'Falta contacto de campaña para el recibo', 400);
  const { data, error } = await service.rpc('crm_email_campaign_dispatch', {
    p_org: msg.organization_id, p_campaign: campaign, p_message: msg.id, p_action: action,
    p_token: token ?? null, p_provider_id: providerId ?? null, p_error: errorText ?? null,
  });
  if (error) throw new EmailError('DB', `Recibo de campaña: ${error.message}`, 503);
  if (!data || typeof data !== 'object') throw new EmailError('DB', 'Recibo de campaña inválido', 503);
  const receipt = data as DispatchReceipt;
  if (receipt.message && (receipt.message.id !== msg.id || receipt.message.organization_id !== msg.organization_id || receipt.message.metadata?.campaign_id !== campaign)) {
    throw new EmailError('DB', 'Recibo de otra campaña u organización', 503);
  }
  return receipt;
}

/** El timeout corta la espera, nunca transforma un resultado incierto en failed. */
export async function withinDeliveryBudget<T>(effect: Promise<T>, options: DeliveryBudget = {}): Promise<T> {
  const timeout = Math.min(options.timeoutMs ?? 15_000, options.deadlineAt === undefined ? Infinity : Math.max(0, options.deadlineAt - Date.now()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listener: (() => void) | undefined;
  const stop = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EmailError('PROVIDER_TIMEOUT', 'Envío pendiente de conciliación', 503)), timeout);
    listener = () => reject(new EmailError('DELIVERY_ABORTED', 'Envío interrumpido; se conserva el recibo', 503));
    options.signal?.addEventListener('abort', listener, { once: true });
    if (options.signal?.aborted) listener();
  });
  try { return await Promise.race([effect, stop]); }
  finally { clearTimeout(timer); if (listener) options.signal?.removeEventListener('abort', listener); }
}
