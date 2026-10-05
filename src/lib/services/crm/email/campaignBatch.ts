/** Orquestación de correo de campaña: reservas SQL y escritor/proveedor nativos. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailError } from './types';
import { sendEmail } from './sendService';
import { sendPendingBatch } from './batchService';
import { isUuid } from './messageStore';
import { rowToCampaign } from '../whatsapp/campaignStore';
import { campaignClientRequestId, type BatchResult } from '../whatsapp/campaignBatch';
import type { Campaign, CampaignContactMeta } from '../whatsapp/types';

interface Contact { id: string; customer_id: string; metadata: CampaignContactMeta | null }
interface Claim { rows: Contact[]; campaign: Record<string, unknown>; reason?: string }
interface Progress { finished: boolean; reason?: string; next_batch_no?: number }
export interface EmailCampaignBatchDeps {
  expectedOrgId?: number | null; signal?: AbortSignal; deadlineMs?: number; now?: () => number;
  prepare?: typeof sendEmail; sendBatch?: typeof sendPendingBatch;
  log?: { info: (message: string, extra?: Record<string, unknown>) => void; warn: (message: string, extra?: Record<string, unknown>) => void };
}
async function rpc<T>(service: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await service.rpc(name, args);
  if (error || !data || typeof data !== 'object') throw new EmailError('DB', `${name}: ${error?.message ?? 'respuesta inválida'}`, 503);
  return data as T;
}
function htmlText(value: string): string {
  return `<p>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br />')}</p>`;
}

export async function runEmailCampaignBatch(payload: { campaign_id: string; batch_no?: number }, service: SupabaseClient, deps: EmailCampaignBatchDeps, initial: Campaign): Promise<BatchResult> {
  const org = deps.expectedOrgId;
  if (!Number.isInteger(org) || !org || initial.organization_id !== org || initial.id !== payload.campaign_id || initial.channel !== 'email') throw new EmailError('VALIDATION', 'Campaña discordante con el job', 400);
  const batch = payload.batch_no ?? 1;
  if (!Number.isInteger(batch) || batch < 1) throw new EmailError('VALIDATION', 'Lote inválido', 400);
  const clock = deps.now ?? Date.now, deadline = clock() + (deps.deadlineMs ?? 25_000);
  const remaining = () => !deps.signal?.aborted && clock() < deadline;
  const base: BatchResult = { campaign_id: initial.id, batch_no: batch, claimed: 0, prepared: 0, sent: 0, skipped: 0, failed: 0, requeued: 0, next_batch_no: null, finished: false };
  const progress = async (notBefore?: Date) => {
    const p = await rpc<Progress>(service, 'crm_email_campaign_batch_progress', { p_org: org, p_campaign: initial.id, p_batch: batch, p_not_before: notBefore?.toISOString() ?? null });
    if (typeof p.finished !== 'boolean') throw new EmailError('DB', 'Progreso de correo inválido', 503);
    return { ...base, finished: p.finished, reason: p.reason, next_batch_no: p.next_batch_no ?? null };
  };
  if (!['sending', 'scheduled'].includes(initial.effective_status)) return { ...base, finished: true, reason: `status_${initial.effective_status}` };
  if (initial.scheduled_at && Date.parse(initial.scheduled_at) > clock()) return progress(new Date(initial.scheduled_at));
  if (!remaining()) return progress();
  const claim = await rpc<Claim>(service, 'crm_claim_email_campaign_batch', { p_org: org, p_campaign: initial.id, p_batch: batch, p_limit: 50 });
  if (!Array.isArray(claim.rows) || claim.rows.length > 50 || claim.campaign?.organization_id !== org || claim.campaign?.id !== initial.id || claim.campaign?.channel !== 'email') throw new EmailError('DB', 'Reserva de correo inválida', 503);
  if (claim.reason) return progress();
  const campaign = rowToCampaign(claim.campaign);
  const ids: string[] = [];
  base.claimed = claim.rows.length;
  const finish = async (row: Contact, action: 'release' | 'skip' | 'fail' | 'pause', reason: string) => {
    const r = await rpc<{ applied: boolean }>(service, 'crm_finish_campaign_contact', { p_org: org, p_campaign: campaign.id, p_contact: row.id, p_token: row.metadata?.claim_token ?? null, p_action: action, p_reason: reason, p_retry_at: action === 'release' ? new Date(clock() + 60_000).toISOString() : null });
    if (r.applied) { if (action === 'skip') base.skipped++; else if (action === 'fail') base.failed++; else base.requeued++; }
  };
  let processed = 0;
  for (const row of claim.rows) {
    if (!remaining()) break;
    if (!isUuid(row.id) || !isUuid(row.customer_id) || !isUuid(row.metadata?.claim_token)) throw new EmailError('DB', 'Contacto de reserva inválido', 503);
    processed++;
    const existing = row.metadata?.email_message_id ?? row.metadata?.message_id;
    if (existing) { if (!isUuid(existing)) throw new EmailError('DB', 'Vínculo de correo inválido', 503); ids.push(existing); continue; }
    try {
      const result = await (deps.prepare ?? sendEmail)(org, { userId: campaign.created_by }, {
        to: [row.metadata?.recipient ?? ''], to_customer_id: row.customer_id,
        subject: campaign.name,
        content: campaign.template_id ? { template_id: campaign.template_id, variables: { ...campaign.statistics.default_variables, ...row.metadata?.variables } } : { html: htmlText(campaign.content ?? ''), text: campaign.content ?? '', variables: { ...campaign.statistics.default_variables, ...row.metadata?.variables } },
        kind: campaign.statistics.purpose === 'marketing' ? 'marketing' : 'transactional',
        related_type: row.metadata?.opportunity_id ? 'opportunity' : 'customer', related_id: row.metadata?.opportunity_id ?? row.customer_id,
        campaign_id: campaign.id, client_request_id: campaignClientRequestId(campaign.id, row.customer_id),
        prepare_only: true, campaign_claim: { contact_id: row.id, token: row.metadata!.claim_token! },
      }, service);
      if (result.message.organization_id !== org || result.message.to_customer_id !== row.customer_id || result.message.metadata?.campaign_id !== campaign.id || !isUuid(result.message.id)) throw new EmailError('DB', 'Correo preparado discordante', 503);
      ids.push(result.message.id); base.prepared++;
    } catch (error) {
      if (error instanceof EmailError && error.code === 'CONTACT_OPTED_OUT') await finish(row, 'skip', 'opted_out');
      else if (error instanceof EmailError && ['VALIDATION', 'MISSING_VARIABLES', 'NOT_FOUND', 'TOO_MANY_RECIPIENTS'].includes(error.code)) await finish(row, 'fail', error.code);
      else if (error instanceof EmailError && error.code === 'NO_SENDER') { await finish(row, 'pause', 'email_sender_unavailable'); break; }
      else await finish(row, 'release', 'email_preparation_retry');
      deps.log?.warn('email_campaign_preparation', { campaign_id: campaign.id, contact_id: row.id, code: error instanceof EmailError ? error.code : 'INTERNAL' });
    }
  }
  for (const row of claim.rows.slice(processed)) if (!row.metadata?.email_message_id && !row.metadata?.message_id) await finish(row, 'release', 'batch_interrupted');
  if (ids.length && remaining()) {
    const result = await (deps.sendBatch ?? sendPendingBatch)(org, Array.from(new Set(ids)), service, { signal: deps.signal, deadlineAt: Date.now() + Math.max(0, deadline - clock()) });
    base.sent = result.sent.length; base.failed += result.failed.filter(r => !r.retryable).length; base.skipped += result.skipped.length; base.requeued += result.failed.filter(r => r.retryable).length;
  }
  return progress();
}
