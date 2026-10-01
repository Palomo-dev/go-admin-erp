/** Procesa contactos reservados por SQL. Publicar no confirma entrega ni consume otra unidad. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { errorWhatsAppDb } from './erroresDbLogica';
import { isWithinAllowedHours, nextAllowedSlot } from './allowedHours';
import { getOrgSettings } from './channelService';
import { rowToCampaign } from './campaignStore';
import { sendWhatsApp } from './outboundService';
import { WhatsAppError, type Campaign, type CampaignContactMeta, type SendWhatsAppInput, type SendWhatsAppResult } from './types';

export const PER_RECIPIENT_MIN_MS = 6000;
export const MAX_THROTTLE_MPS = 80;

export interface BatchDeps {
  send?: (input: SendWhatsAppInput, service: SupabaseClient) => Promise<SendWhatsAppResult>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Presupuesto del job (ms); el lote se corta y reencola el resto. */
  deadlineMs?: number;
  /**
   * Organización del JOB. Si se pasa y no coincide con `campaigns.organization_id`
   * el lote se rechaza (tester r1 · fallo 5: el handler cargaba la campaña por id
   * con service role y usaba la org de la campaña, no la del job).
   */
  expectedOrgId?: number | null;
  signal?: AbortSignal;
  log?: { info: (m: string, e?: Record<string, unknown>) => void; warn: (m: string, e?: Record<string, unknown>) => void };
}

export interface BatchResult {
  campaign_id: string;
  batch_no: number;
  claimed: number;
  sent: number;
  /** Mensajes publicados en cola, pendientes de confirmación del proveedor. */
  prepared: number;
  skipped: number;
  failed: number;
  requeued: number;
  next_batch_no: number | null;
  finished: boolean;
  reason?: string;
}

/** Planificador puro de throttle: cuánto esperar antes del siguiente envío. */
export function planDelay(p: { now: number; lastGlobalAt: number | null; throttleMps: number; lastToRecipientAt: number | null }): number {
  const mps = Math.min(MAX_THROTTLE_MPS, Math.max(1, p.throttleMps));
  const minGap = Math.ceil(1000 / mps);
  let wait = 0;
  if (p.lastGlobalAt !== null) wait = Math.max(wait, p.lastGlobalAt + minGap - p.now);
  if (p.lastToRecipientAt !== null) wait = Math.max(wait, p.lastToRecipientAt + PER_RECIPIENT_MIN_MS - p.now);
  return Math.max(0, wait);
}

export type SendFailureAction = { action: 'skip'; reason: string } | { action: 'pause'; reason: string } | { action: 'retry'; afterMs: number } | { action: 'fail'; code: string; message: string };

/** Clasificación pura de errores de `sendWhatsApp` dentro de un lote. */
export function classifySendError(err: unknown, attempts: number): SendFailureAction {
  if (err instanceof WhatsAppError) {
    switch (err.code) {
      case 'OPTED_OUT': return { action: 'skip', reason: 'opted_out' };
      case 'NO_PHONE': return { action: 'skip', reason: 'no_phone' };
      case 'WINDOW_CLOSED': return { action: 'skip', reason: 'window_required' };
      case 'US_MARKETING_BLOCKED': return { action: 'skip', reason: 'us_marketing' };
      case 'MISSING_VARIABLES': return { action: 'skip', reason: 'missing_variables' };
      case 'CHANNEL_NO_TEMPLATES':
      case 'RNE_REQUIRED':
      case 'DATA_POLICY_REQUIRED':
      case 'TEMPLATE_NOT_APPROVED':
      case 'NO_CHANNEL': return { action: 'pause', reason: err.code.toLowerCase() };
      case 'NO_CREDITS': return { action: 'pause', reason: 'no_credits' };
      case 'DAILY_LIMIT': return { action: 'pause', reason: 'daily_limit' };
      case 'OUTSIDE_HOURS': return { action: 'retry', afterMs: 15 * 60_000 };
      default: break;
    }
  }
  if (attempts < 3) return { action: 'retry', afterMs: 60_000 * attempts };
  return { action: 'fail', code: err instanceof WhatsAppError ? err.code : 'INTERNAL', message: err instanceof Error ? err.message : String(err) };
}

interface ContactRow { id: string; customer_id: string; state: string | null; metadata: CampaignContactMeta | null }
interface ClaimResult { rows: ContactRow[]; campaign: Record<string, unknown>; reason?: string }
interface ContactOutcome { applied: boolean; reason?: string; state?: string }
interface ProgressResult { finished: boolean; reason?: string; next_batch_no?: number }

export function campaignClientRequestId(campaignId: string, customerId: string): string {
  return `campaign:${campaignId}:${customerId}`;
}

async function loadCampaign(orgId: number, id: string, service: SupabaseClient): Promise<Campaign | null> {
  const { data, error } = await service.from('campaigns').select('id, organization_id, name, channel, status, scheduled_at, template_id, segment_id, content, statistics, created_by, created_at, updated_at').eq('organization_id', orgId).eq('id', id).maybeSingle();
  if (error) throw errorWhatsAppDb(error);
  return data ? rowToCampaign(data as Record<string, unknown>) : null;
}

async function rpc<T>(service: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await service.rpc(name, args);
  if (error) throw errorWhatsAppDb(error);
  if (!data || typeof data !== 'object') throw new WhatsAppError('INTERNAL', `Respuesta inválida de ${name}`, 500);
  return data as T;
}

async function recentByRecipient(orgId: number, recipients: string[], service: SupabaseClient, now: number): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!recipients.length) return result;
  const since = new Date(now - PER_RECIPIENT_MIN_MS).toISOString();
  for (let start = 0; ; start += 500) {
    const { data, error } = await service.from('messages').select('id, created_at, metadata').eq('organization_id', orgId).eq('direction', 'outbound').gte('created_at', since).in('metadata->>to', recipients).order('created_at', { ascending: false }).order('id').range(start, start + 499);
    if (error) throw errorWhatsAppDb(error);
    const rows = (data ?? []) as Array<{ created_at: string; metadata: { to?: string } | null }>;
    for (const row of rows) if (row.metadata?.to) result.set(row.metadata.to, Math.max(result.get(row.metadata.to) ?? 0, Date.parse(row.created_at)));
    if (rows.length < 500) return result;
  }
}

export async function runCampaignBatch(payload: { campaign_id: string; batch_no?: number }, service: SupabaseClient, deps: BatchDeps = {}): Promise<BatchResult> {
  const orgId = deps.expectedOrgId;
  if (!Number.isInteger(orgId) || !orgId) throw new WhatsAppError('VALIDATION', 'Se requiere la organización del job', 400);
  const org = orgId as number;
  const campaignId = payload.campaign_id;
  const batchNo = payload.batch_no ?? 1;
  if (!Number.isInteger(batchNo) || batchNo < 1) throw new WhatsAppError('VALIDATION', 'Número de lote inválido', 400);
  const base: BatchResult = { campaign_id: campaignId, batch_no: batchNo, claimed: 0, sent: 0, prepared: 0, skipped: 0, failed: 0, requeued: 0, next_batch_no: null, finished: false };
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.deadlineMs ?? 25_000);
  const send = deps.send ?? ((input, client) => sendWhatsApp(input, client, client));
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = deps.log ?? { info: () => undefined, warn: () => undefined };
  let c = await loadCampaign(org, campaignId, service);
  if (!c) return { ...base, finished: true, reason: 'campaign_not_found' };
  if (c.organization_id !== org) throw new WhatsAppError('INTERNAL', 'Campaña discordante con el job', 500);
  if (c.channel !== 'whatsapp') return { ...base, finished: true, reason: 'not_whatsapp' };
  if (!['sending', 'scheduled'].includes(c.effective_status)) return { ...base, finished: true, reason: `status_${c.effective_status}` };
  const progress = async (notBefore?: Date): Promise<BatchResult> => {
    const r = await rpc<ProgressResult>(service, 'crm_campaign_batch_progress', { p_org: org, p_campaign: campaignId, p_batch: batchNo, p_not_before: notBefore?.toISOString() ?? null });
    if (typeof r.finished !== 'boolean') throw new WhatsAppError('INTERNAL', 'Progreso de lote inválido', 500);
    return { ...base, finished: r.finished, next_batch_no: r.next_batch_no ?? null, reason: r.reason };
  };
  if (c.scheduled_at && Date.parse(c.scheduled_at) > now()) return progress(new Date(c.scheduled_at));
  if (deps.signal?.aborted) throw new WhatsAppError('INTERNAL', 'Lote cancelado antes de reservar contactos', 500);
  const settings = await getOrgSettings(org, service);
  // Una campaña no puede desactivar el horario configurado ni usar force para saltarlo.
  if (settings.allowed_hours && !isWithinAllowedHours(settings.allowed_hours, new Date(now()))) return progress(nextAllowedSlot(settings.allowed_hours, new Date(now())));
  const claim = await rpc<ClaimResult>(service, 'crm_claim_campaign_batch', { p_org: org, p_campaign: campaignId, p_batch: batchNo, p_limit: 50 });
  if (!Array.isArray(claim.rows) || claim.rows.length > 50 || claim.campaign?.organization_id !== org || claim.campaign?.id !== campaignId) throw new WhatsAppError('INTERNAL', 'Reserva de lote inválida', 500);
  c = rowToCampaign(claim.campaign);
  if (claim.reason) return progress();
  const contacts = claim.rows;
  base.claimed = contacts.length;
  const recipients = contacts.map((r) => r.metadata?.recipient).filter((r): r is string => !!r);
  const lastByRecipient = await recentByRecipient(org, recipients, service, now());
  const throttle = Math.min(MAX_THROTTLE_MPS, Math.max(1, Number(c.statistics.throttle_mps ?? 10)));
  const defaults = c.statistics.default_variables ?? {};
  let lastGlobalAt: number | null = null;
  let processed = 0;
  const finish = (row: ContactRow, action: string, reason: string | null = null, retryAt: Date | null = null) => rpc<ContactOutcome>(service, 'crm_finish_campaign_contact', {
    p_org: org, p_campaign: campaignId, p_contact: row.id, p_token: row.metadata?.claim_token ?? null,
    p_action: action, p_reason: reason, p_retry_at: retryAt?.toISOString() ?? null,
  });
  for (const row of contacts) {
    if (deps.signal?.aborted || now() >= deadline) break;
    if (processed > 0 && processed % 10 === 0) {
      const fresh = await loadCampaign(org, campaignId, service);
      if (!fresh || !['sending', 'scheduled'].includes(fresh.effective_status)) break;
    }
    const meta = row.metadata ?? {};
    const recipient = meta.recipient ?? null;
    const wait = planDelay({ now: now(), lastGlobalAt, throttleMps: throttle, lastToRecipientAt: recipient ? lastByRecipient.get(recipient) ?? null : null });
    if (now() + wait >= deadline) break;
    if (wait > 0) await sleep(wait);
    if (deps.signal?.aborted || now() >= deadline) break;
    processed += 1;
    let result: SendWhatsAppResult;
    try {
      result = await send({ orgId: org, channelId: c.statistics.channel_id ?? null, customerId: row.customer_id,
        opportunityId: meta.opportunity_id ?? null, text: c.template_id ? null : c.content,
        variables: c.template_id ? null : { ...defaults, ...(meta.variables ?? {}) },
        template: c.template_id ? { templateId: c.template_id, variables: { ...defaults, ...(meta.variables ?? {}) } } : null,
        source: 'campaign', campaignId, campaignClaimToken: meta.claim_token ?? null, purpose: c.statistics.purpose === 'marketing' ? 'marketing' : 'utility',
        role: 'agent', senderUserId: c.created_by, force: false, clientRequestId: campaignClientRequestId(campaignId, row.customer_id),
      }, service);
      if (!result.message_id || result.scheduled || result.customer_id !== row.customer_id) throw new WhatsAppError('INTERNAL', 'Mensaje preparado inválido', 500);
    } catch (error) {
      const action = classifySendError(error, meta.attempts ?? 1);
      log.warn('campaign_preparation_failed', { campaign_id: campaignId, contact_id: row.id, action: action.action });
      if (action.action === 'skip') { const r = await finish(row, 'skip', action.reason); if (r.applied) base.skipped += 1; }
      else if (action.action === 'fail') { const r = await finish(row, 'fail', action.code); if (r.applied) base.failed += 1; }
      else if (action.action === 'retry') { const r = await finish(row, 'release', 'preparation_retry', new Date(now() + action.afterMs)); if (r.applied) base.requeued += 1; }
      else { const r = await finish(row, 'pause', action.reason); if (r.applied) base.requeued += 1; break; }
      continue;
    }
    // La preparación ya publicó su vínculo. Esta RPC verifica el estado sin marcar sent.
    await finish(row, 'prepared');
    base.prepared += 1;
    lastGlobalAt = now();
    if (recipient) lastByRecipient.set(recipient, lastGlobalAt);
    log.info('campaign_message_prepared', { campaign_id: campaignId, message_id: result.message_id, duplicate: result.duplicate === true });
  }
  for (const row of contacts.slice(processed)) await finish(row, 'release', 'batch_interrupted');
  return progress();
}
