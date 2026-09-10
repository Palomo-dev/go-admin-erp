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
import { WhatsAppError, contactState, type Campaign, type CampaignContactMeta, type SendWhatsAppInput, type SendWhatsAppResult } from './types';

export const PER_RECIPIENT_MIN_MS = 6000;
export const MAX_THROTTLE_MPS = 80;

/**
 * Un claim se considera CADUCADO pasado este tiempo: el lote que lo tomó
 * murió (timeout de la función, despliegue, crash) y dejó la fila en
 * `metadata.state='queued'` para siempre. El presupuesto de un lote son 25 s
 * (`deadlineMs`), así que 15 min es holgadísimo y no roba trabajo a un lote
 * vivo (tester F16 r2 · F-2).
 */
export const STALE_CLAIM_MS = 15 * 60_000;

/**
 * Lotes consecutivos sin reclamar nada tras los que la campaña se PAUSA en vez
 * de seguir encadenando trabajos. Antes, un lote muerto dejaba `queued > 0`
 * para siempre: `remaining` nunca bajaba a 0, así que cada ejecución encolaba
 * el siguiente lote indefinidamente (verificado en vivo: 4 ejecuciones →
 * 5 jobs, claimed 0, queued 2 constantes).
 */
export const MAX_STALLED_BATCHES = 5;

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

/**
 * Clave de idempotencia del envío de campaña. **Estable por (campaña, cliente)**:
 * antes incluía el número de intento, así que un rescate tras un fallo a medias
 * (proceso muerto entre la respuesta del proveedor y `fn_campaign_mark_sent`)
 * generaba una clave DISTINTA y el mensaje salía dos veces
 * (tester F16 r3 · N-5). `sendWhatsApp` la comprueba contra `messages` antes de
 * insertar.
 */
export function campaignClientRequestId(campaignId: string, customerId: string): string {
  return `campaign:${campaignId}:${customerId}`;
}

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
  /**
   * Instante (ms) más cercano en el que ALGÚN candidato no reclamado vuelve a
   * ser reclamable: fin del backoff de un reintento o caducidad del testigo de
   * otro lote. `null` = no queda nada esperando.
   */
  wakeAt: number | null;
}

/**
 * ¿A partir de qué instante es reclamable esta fila? `0` = ya lo es,
 * `null` = nunca (está enviada, saltada o fallida).
 *
 * Es el ÚNICO sitio donde se decide, para que el corte por «lotes sin
 * progreso» y el retardo del encadenado no puedan divergir (tester F16 r3 ·
 * N-2: el corte saltaba a los ~5 s y el rescate de testigos a los 15 min, así
 * que el rescate no llegaba a ejecutarse nunca).
 */
export function claimableAt(row: Pick<ContactRow, 'state' | 'metadata'>, staleMs = STALE_CLAIM_MS): number | null {
  const st = contactState(row);
  if (st === 'queued') {
    const at = row.metadata?.claimed_at ? Date.parse(String(row.metadata.claimed_at)) : NaN;
    // Sin `claimed_at` no hay forma de saber cuándo se reclamó: se considera
    // caducada (viene de una versión anterior o de una escritura parcial).
    if (Number.isNaN(at)) return 0;
    return at + staleMs;
  }
  if (st !== 'pending') return null;
  const ra = row.metadata?.retry_after ? Date.parse(String(row.metadata.retry_after)) : 0;
  return !ra || Number.isNaN(ra) ? 0 : ra;
}

/**
 * ¿Es una fila `queued` cuyo lote murió? Se mide por `claimed_at`, que hasta
 * la ronda 3 se escribía y NUNCA se leía (tester F16 r2 · F-2).
 */
export function isStaleClaim(meta: CampaignContactMeta | null | undefined, nowMs: number, staleMs = STALE_CLAIM_MS): boolean {
  if (!meta || meta.state !== 'queued') return false;
  const at = claimableAt({ state: null, metadata: meta }, staleMs);
  return at !== null && at <= nowMs;
}

/**
 * Reclamación ATÓMICA de contactos (tester r1 · fallo 2) y RECUPERACIÓN de
 * claims caducados (tester r2 · F-2).
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
 *
 * Además vuelve a reclamar las filas que quedaron en `queued` con un
 * `claim_token` cuyo lote murió (`isStaleClaim`). Sin eso quedaban bloqueadas
 * para siempre, `remaining` nunca bajaba a 0 y cada ejecución encolaba el
 * siguiente lote sin fin.
 */
async function claimContacts(campaignId: string, batchNo: number, limit: number, service: SupabaseClient, nowMs: number): Promise<ClaimOutcome> {
  const { data } = await service.from('campaign_contacts').select('id, customer_id, state, metadata').eq('campaign_id', campaignId).is('state', null).order('created_at', { ascending: true }).limit(limit * 4);
  const candidates: ContactRow[] = [];
  // Cuándo vuelve a haber trabajo si ahora mismo no hay ninguno reclamable.
  let wakeAt: number | null = null;
  for (const r of (data ?? []) as ContactRow[]) {
    // Recuperación de claims caducados: una fila 'queued' cuyo lote murió
    // vuelve a ser reclamable. Sin esto quedaba bloqueada para siempre y la
    // campaña nunca llegaba a 'sent'.
    const at = claimableAt(r);
    if (at === null) continue;
    if (at <= nowMs) candidates.push(r);
    else if (wakeAt === null || at < wakeAt) wakeAt = at;
  }
  const claimed: ContactRow[] = [];
  let contested = 0;
  for (const r of candidates) {
    if (claimed.length >= limit) break;
    const prevState = r.metadata?.state ?? null;
    const prevToken = typeof r.metadata?.claim_token === 'string' ? r.metadata.claim_token : null;
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
    let guarded = prevState === null ? q.is('metadata->>state', null) : q.eq('metadata->>state', prevState);
    // Al recuperar un claim caducado, `metadata->>state` ya es 'queued' para
    // todos los recuperadores: la condición que desempata es el token viejo,
    // que solo uno puede sustituir.
    if (prevState === 'queued' && prevToken) guarded = guarded.eq('metadata->>claim_token', prevToken);
    const { data: upd } = await guarded.select('id').maybeSingle();
    if (upd) claimed.push({ ...r, metadata: meta });
    else contested += 1;
  }
  return { rows: claimed, contested, wakeAt };
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
        clientRequestId: campaignClientRequestId(campaignId, row.customer_id),
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
    // Cortocircuito de lotes muertos (tester F16 r2 · F-2): si el lote no ha
    // reclamado NADA, `remaining` no ha bajado y encolar el siguiente repite
    // el ciclo eternamente. Se cuentan los lotes seguidos sin progreso y, al
    // llegar al tope, la campaña se pausa para que alguien la mire en vez de
    // seguir quemando jobs.
    const stalledPrev = Number(c.statistics.stalled_batches ?? 0) || 0;
    const progreso = base.sent + base.skipped + base.failed + base.requeued > 0;
    // ESPERANDO ≠ ATASCADA (tester F16 r3 · N-1). Si no se reclamó nada porque
    // todos los candidatos están en backoff de reintento o bajo el testigo de
    // un lote aún vivo, la campaña no está atascada: hay una fecha en la que
    // vuelve a haber trabajo. Antes esos lotes contaban como «sin progreso» y,
    // como el retardo del encadenado era de 1 s, los 5 lotes se agotaban en
    // ~5 s y CUALQUIER error transitorio del proveedor pausaba la campaña.
    const esperando = base.claimed === 0 && claim.wakeAt !== null && claim.wakeAt > now();
    const stalled = progreso ? 0 : esperando ? stalledPrev : stalledPrev + 1;
    if (!esperando && stalled >= MAX_STALLED_BATCHES) {
      log.warn('campaign_stalled', { campaign_id: campaignId, batch_no: batchNo, remaining, stalled });
      await patchCampaignStats(campaignId, {
        counts, pending: remaining, error_summary: errorSummary, stalled_batches: stalled,
        state: 'paused', paused_at: new Date(now()).toISOString(), pause_reason: 'stalled_no_progress',
      }, service);
      return { ...base, finished: false, reason: 'stalled_no_progress' };
    }
    const nextNo = batchNo + 1;
    const delayS = Math.max(1, Math.ceil(Math.min(remaining, CAMPAIGN_BATCH_SIZE) / throttle));
    // Si no hay nada reclamable AHORA, el siguiente lote se programa para
    // cuando de verdad vuelva a haberlo, no dentro de 1 s: ese desfase era lo
    // que quemaba los 5 lotes antes de que venciera el primer backoff.
    const runAt = esperando ? Math.max(claim.wakeAt as number, now() + 1000) : now() + delayS * 1000;
    if (esperando) log.info('campaign_batch_waiting', { campaign_id: campaignId, batch_no: batchNo, next_at: new Date(runAt).toISOString() });
    await enqueueBatch(orgId, campaignId, nextNo, new Date(runAt), service);
    await patchCampaignStats(campaignId, { counts, pending: remaining, next_batch_no: nextNo, error_summary: errorSummary, stalled_batches: stalled }, service);
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
