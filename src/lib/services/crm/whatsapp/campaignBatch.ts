/**
 * Lote de campaña (FASE-16 §4.4 `runBatch`): ≤50 contactos por job,
 * throttle global `throttle_mps` (≤80 mps) y 1 msg / 6 s por wa_id, recheck de
 * consentimiento, errores 422 → skipped, 402 → pausa, siguiente lote con
 * dedupe `campaign_batch:{id}:{n+1}`, fin → `sent`.
 *
 * Los errores del proveedor (131049/131056/130429) llegan asincrónicamente por
 * `message_events` (Edge Function / webhook): `syncCampaignFromEvents` los
 * aplica al inicio de cada lote (ver campaignEvents.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isWithinAllowedHours, nextAllowedSlot } from './allowedHours';
import { canContact } from './consent';
import { getOrgSettings } from './channelService';
import { computeCampaignCounts, enqueueBatch, CAMPAIGN_BATCH_SIZE, skipPending } from './campaignService';
import { patchCampaignStats, rowToCampaign } from './campaignStore';
import { syncCampaignFromEvents } from './campaignEvents';
import { sendWhatsApp } from './outboundService';
import { WhatsAppError, contactState, effectiveCampaignStatus, type Campaign, type CampaignContactMeta, type SendWhatsAppInput, type SendWhatsAppResult } from './types';

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

async function loadCampaign(campaignId: string, service: SupabaseClient): Promise<Campaign | null> {
  const { data } = await service.from('campaigns').select('id, organization_id, name, channel, status, scheduled_at, template_id, segment_id, content, statistics, created_by, created_at, updated_at').eq('id', campaignId).maybeSingle();
  return data ? rowToCampaign(data as Record<string, unknown>) : null;
}

function newClaimToken(batchNo: number): string {
  const rnd = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `b${batchNo}:${rnd}`;
}

export interface ClaimOutcome {
  /** Filas efectivamente reclamadas por ESTE lote. */
  rows: ContactRow[];
  /** Candidatos que otro lote reclamó antes (evidencia de concurrencia). */
  contested: number;
}

/**
 * Reclamación ATÓMICA de contactos (tester r1 · fallo 2).
 *
 * Antes el UPDATE solo filtraba por `.is('state', null)`, condición que NO
 * cambia al reclamar (el estado real vive en `metadata.state`), así que dos
 * lotes simultáneos reclamaban las MISMAS filas y enviaban el mensaje dos
 * veces (8 contactos → 16 mensajes).
 *
 * Ahora el UPDATE lleva la condición sobre el estado previo
 * (`metadata->>state`) y escribe un `claim_token` propio del lote. Postgres
 * reevalúa el WHERE tras tomar el lock de la fila (READ COMMITTED /
 * EvalPlanQual), así que de dos UPDATE simultáneos solo uno encuentra
 * `pending`: el otro no actualiza nada y `data` vuelve `null`. Como se pierden
 * candidatos por el camino, se sobre-consulta (`limit*4`) y se reintenta con
 * el siguiente candidato hasta completar el lote.
 */
async function claimContacts(campaignId: string, batchNo: number, limit: number, service: SupabaseClient, nowMs: number): Promise<ClaimOutcome> {
  const { data } = await service.from('campaign_contacts').select('id, customer_id, state, metadata').eq('campaign_id', campaignId).is('state', null).order('created_at', { ascending: true }).limit(limit * 4);
  const candidates = ((data ?? []) as ContactRow[]).filter((r) => {
    if (contactState(r) !== 'pending') return false;
    const ra = r.metadata?.retry_after ? Date.parse(String(r.metadata.retry_after)) : 0;
    return !ra || ra <= nowMs;
  });
  const claimed: ContactRow[] = [];
  let contested = 0;
  for (const r of candidates) {
    if (claimed.length >= limit) break;
    const prevState = r.metadata?.state ?? null;
    const meta = {
      ...(r.metadata ?? {}),
      state: 'queued' as const,
      batch_no: batchNo,
      attempts: (r.metadata?.attempts ?? 0) + 1,
      retry_after: null,
      claim_token: newClaimToken(batchNo),
      claimed_at: new Date(nowMs).toISOString(),
    };
    const q = service.from('campaign_contacts').update({ metadata: meta, updated_at: new Date().toISOString() }).eq('id', r.id).is('state', null);
    // Condición de reclamación: el estado previo debe seguir siendo el que leímos.
    const guarded = prevState === null ? q.is('metadata->>state', null) : q.eq('metadata->>state', prevState);
    const { data: upd } = await guarded.select('id').maybeSingle();
    if (upd) claimed.push({ ...r, metadata: meta });
    else contested += 1;
  }
  return { rows: claimed, contested };
}

/**
 * Escritura de metadata de un contacto RECLAMADO: si la fila lleva
 * `claim_token`, el UPDATE exige que siga siendo el nuestro, de modo que un
 * lote que perdió la carrera no pisa el trabajo del que la ganó.
 */
async function setMeta(row: ContactRow, patch: Partial<CampaignContactMeta>, service: SupabaseClient): Promise<void> {
  const q = service.from('campaign_contacts').update({ metadata: { ...(row.metadata ?? {}), ...patch }, updated_at: new Date().toISOString() }).eq('id', row.id);
  const token = row.metadata?.claim_token;
  await (typeof token === 'string' && token ? q.eq('metadata->>claim_token', token) : q);
}

export async function runCampaignBatch(payload: { campaign_id: string; batch_no?: number }, service: SupabaseClient, deps: BatchDeps = {}): Promise<BatchResult> {
  const send = deps.send ?? ((i, s) => sendWhatsApp(i, s, s));
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? { info: () => undefined, warn: () => undefined };
  const started = now();
  const deadline = started + (deps.deadlineMs ?? 25_000);
  const campaignId = payload.campaign_id;
  const batchNo = Number(payload.batch_no ?? 1) || 1;
  const base: BatchResult = { campaign_id: campaignId, batch_no: batchNo, claimed: 0, sent: 0, skipped: 0, failed: 0, requeued: 0, next_batch_no: null, finished: false };

  const c = await loadCampaign(campaignId, service);
  if (!c) return { ...base, finished: true, reason: 'campaign_not_found' };
  const orgId = c.organization_id;
  if (deps.expectedOrgId != null && Number(deps.expectedOrgId) !== orgId) {
    log.warn('campaign_org_mismatch', { campaign_id: campaignId, job_org: deps.expectedOrgId, campaign_org: orgId });
    return { ...base, finished: true, reason: 'org_mismatch' };
  }
  if (c.channel !== 'whatsapp') return { ...base, finished: true, reason: 'not_whatsapp' };
  const eff = c.effective_status;
  if (eff === 'paused' || eff === 'canceled' || eff === 'sent' || eff === 'draft') return { ...base, finished: true, reason: `status_${eff}` };
  if (eff === 'scheduled') {
    const at = c.scheduled_at ? Date.parse(c.scheduled_at) : 0;
    if (at > now() + 60_000) {
      await enqueueBatch(orgId, campaignId, batchNo, new Date(at), service);
      return { ...base, finished: false, reason: 'scheduled_future', next_batch_no: batchNo };
    }
    await patchCampaignStats(campaignId, { started_at: c.statistics.started_at ?? new Date(now()).toISOString() }, service, { status: 'sending' });
  }

  await syncCampaignFromEvents(campaignId, service).catch((e) => log.warn('sync_events_failed', { error: e instanceof Error ? e.message : String(e) }));

  const settings = await getOrgSettings(orgId, service);
  if (c.statistics.respect_allowed_hours !== false && settings.allowed_hours && !isWithinAllowedHours(settings.allowed_hours, new Date(now()))) {
    const next = nextAllowedSlot(settings.allowed_hours, new Date(now()));
    await enqueueBatch(orgId, campaignId, batchNo, next, service);
    return { ...base, finished: false, reason: 'outside_allowed_hours', next_batch_no: batchNo };
  }

  const throttle = Math.min(MAX_THROTTLE_MPS, Math.max(1, Number(c.statistics.throttle_mps ?? 10)));
  const claim = await claimContacts(campaignId, batchNo, CAMPAIGN_BATCH_SIZE, service, now());
  const contacts = claim.rows;
  base.claimed = contacts.length;
  if (claim.contested > 0) log.info('campaign_claim_contested', { campaign_id: campaignId, batch_no: batchNo, contested: claim.contested });
  const purpose = c.statistics.purpose === 'marketing' ? 'marketing' : 'utility';
  const defaults = (c.statistics.default_variables ?? {}) as Record<string, unknown>;

  // Últimos envíos a los mismos destinatarios (regla 1 msg / 6 s por wa_id)
  const lastByRecipient = new Map<string, number>();
  const recipients = contacts.map((r) => r.metadata?.recipient).filter((x): x is string => !!x);
  if (recipients.length) {
    const since = new Date(now() - PER_RECIPIENT_MIN_MS).toISOString();
    const { data } = await service.from('messages').select('created_at, metadata').eq('organization_id', orgId).eq('direction', 'outbound').gte('created_at', since).in('metadata->>to', recipients).limit(200);
    for (const m of (data ?? []) as Array<{ created_at: string; metadata: { to?: string } | null }>) {
      const to = m.metadata?.to;
      if (to) lastByRecipient.set(to, Math.max(lastByRecipient.get(to) ?? 0, Date.parse(m.created_at)));
    }
  }

  let lastGlobalAt: number | null = null;
  let stop: string | null = null;
  let processed = 0;
  for (const row of contacts) {
    if (deps.signal?.aborted || now() > deadline) { stop = 'deadline'; break; }
    if (processed > 0 && processed % 10 === 0) {
      const fresh = await loadCampaign(campaignId, service);
      if (!fresh || fresh.effective_status !== 'sending') { stop = `status_${fresh?.effective_status ?? 'missing'}`; break; }
      await patchCampaignStats(campaignId, { counts: await computeCampaignCounts(campaignId, service) }, service).catch(() => undefined);
    }
    processed += 1;
    const meta = row.metadata ?? {};
    if (!(await canContact(orgId, row.customer_id, 'whatsapp', purpose, service))) {
      await setMeta(row, { state: 'skipped', skipped_reason: 'opted_out' }, service);
      base.skipped += 1;
      continue;
    }
    const recipient = meta.recipient ?? null;
    const wait = planDelay({ now: now(), lastGlobalAt, throttleMps: throttle, lastToRecipientAt: recipient ? (lastByRecipient.get(recipient) ?? null) : null });
    if (wait > 0) await sleep(wait);
    try {
      const r = await send({
        orgId,
        channelId: c.statistics.channel_id ?? null,
        customerId: row.customer_id,
        opportunityId: meta.opportunity_id ?? null,
        text: c.template_id ? null : c.content,
        // Las campañas de texto libre también interpolan `{{...}}`.
        variables: c.template_id ? null : { ...defaults, ...((meta.variables ?? {}) as Record<string, unknown>) },
        template: c.template_id ? { templateId: c.template_id, variables: { ...defaults, ...((meta.variables ?? {}) as Record<string, unknown>) } } : null,
        source: 'campaign',
        campaignId,
        purpose,
        role: 'agent',
        senderUserId: c.created_by,
        force: true,
        clientRequestId: `campaign:${campaignId}:${row.customer_id}:${meta.attempts ?? 1}`,
      }, service);
      lastGlobalAt = now();
      if (recipient) lastByRecipient.set(recipient, lastGlobalAt);
      await service.rpc('fn_campaign_mark_sent', { p_campaign_id: campaignId, p_customer_id: row.customer_id });
      await setMeta(row, { state: 'sent', message_id: r.message_id, conversation_id: r.conversation_id, error_code: null, error_message: null }, service);
      base.sent += 1;
    } catch (err) {
      const action = classifySendError(err, meta.attempts ?? 1);
      log.warn('campaign_send_failed', { customer_id: row.customer_id, action: action.action, error: err instanceof Error ? err.message : String(err) });
      if (action.action === 'skip') {
        await setMeta(row, { state: 'skipped', skipped_reason: action.reason, error_message: err instanceof Error ? err.message : null }, service);
        base.skipped += 1;
      } else if (action.action === 'retry') {
        await setMeta(row, { state: 'pending', retry_after: new Date(now() + action.afterMs).toISOString(), error_message: err instanceof Error ? err.message : null, claim_token: null }, service);
        base.requeued += 1;
      } else if (action.action === 'fail') {
        await setMeta(row, { state: 'failed', error_code: action.code, error_message: action.message, failed_at: new Date(now()).toISOString() }, service);
        base.failed += 1;
      } else {
        await setMeta(row, { state: 'pending', retry_after: null, claim_token: null }, service);
        base.requeued += 1;
        // La razón va SOLO en `pause_reason` (antes también como clave dinámica
        // `[action.reason]: true`, que ensuciaba `statistics`/`CampaignConfig`).
        await patchCampaignStats(campaignId, { state: 'paused', paused_at: new Date(now()).toISOString(), pause_reason: action.reason }, service);
        stop = `paused_${action.reason}`;
        break;
      }
    }
  }

  // Lo reclamado y no procesado del lote vuelve a pending (y suelta el claim)
  for (const row of contacts.slice(processed)) {
    if (row.metadata?.state === 'queued') await setMeta(row, { state: 'pending', claim_token: null }, service);
  }

  const counts = await computeCampaignCounts(campaignId, service);
  const remaining = counts.pending + counts.queued;
  const errorSummary = { ...(c.statistics.error_summary ?? {}) };
  if (stop?.startsWith('paused_')) {
    await patchCampaignStats(campaignId, { counts, pending: remaining }, service);
    return { ...base, finished: false, reason: stop };
  }
  if (remaining > 0 && stop !== 'status_paused' && stop !== 'status_canceled') {
    const nextNo = batchNo + 1;
    const delayS = Math.max(1, Math.ceil(Math.min(remaining, CAMPAIGN_BATCH_SIZE) / throttle));
    await enqueueBatch(orgId, campaignId, nextNo, new Date(now() + delayS * 1000), service);
    await patchCampaignStats(campaignId, { counts, pending: remaining, next_batch_no: nextNo, error_summary: errorSummary }, service);
    return { ...base, finished: false, next_batch_no: nextNo, reason: stop ?? undefined };
  }
  if (remaining === 0) {
    await patchCampaignStats(campaignId, { counts, pending: 0, finished_at: new Date(now()).toISOString(), next_batch_no: batchNo + 1, error_summary: errorSummary }, service, { status: 'sent' });
    return { ...base, finished: true, reason: 'completed' };
  }
  await patchCampaignStats(campaignId, { counts, pending: remaining }, service);
  return { ...base, finished: false, reason: stop ?? undefined };
}

/** Utilidad para cancelaciones desde el handler (reexport). */
export { skipPending };
