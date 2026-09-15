/**
 * Reconciliación «nunca acta sin grabación» (F3 ronda 6 · F5 ronda 4).
 *
 * `<Start><Recording>` (agente IA) y `<Dial record=>` (navegador, puente) no
 * tienen señal SÍNCRONA de fallo: si la grabación nunca arranca y Twilio no
 * llega a enviar `absent` (o el `completed` se pierde por red), la fila
 * `calls` queda con `recording_enabled=true`, `consent_given=true` y un acta
 * en `call_consents` para una grabación que no existe en `call_recordings`.
 *
 * Este job cierra ese lazo. Para cada llamada TERMINADA hace más de
 * `minAgeMinutes` (por defecto 10, margen para el callback) y menos de
 * `maxAgeDays` (7; lo más viejo ya lo cubrió una pasada anterior o es un
 * dato histórico que se corrige a mano), con `recording_enabled=true`,
 * `consent_given=true` y SIN fila en `call_recordings`:
 *
 *  1. Pregunta a Twilio por REST (`recordings.list({ callSid })`) —cero
 *     llamadas telefónicas, solo lectura—. Si Twilio SÍ tiene la grabación,
 *     el callback se perdió: se registra `call_recordings` (`processing`,
 *     `storage_provider='twilio'`) y se encola `recording_fetch` con el mismo
 *     dedupe que usaría `/api/voice/recording`. El acta se conserva:
 *     hay grabación y hubo aviso. → `recovered`.
 *  2. Si Twilio no tiene ninguna, la grabación nunca existió:
 *     `voidConsentWithoutRecording` retira el acta y deja la fila honesta
 *     (`recording_enabled=false`, `consent_given=false`,
 *     `metadata.recording_absent_reason='reconcile_no_recording'`). → `voided`.
 *  3. Si Twilio no responde (error de red/credenciales), NO se retira nada:
 *     un acta retirada por un fallo transitorio sería una grabación sin acta
 *     al día siguiente. Se cuenta como `deferred` y la próxima pasada lo
 *     reintenta.
 *
 * Regla (ronda 7, F-1a/F-1b): el acta SOLO se retira con evidencia positiva
 * de ausencia —Twilio responde y no tiene ninguna grabación de la llamada, o
 * la única que tiene es `absent`—, o cuando no hay a quién preguntar (sin
 * `provider_call_sid`). Todo lo demás se difiere:
 *   - una grabación en `processing`/`paused`/`stopped` (transcodificando o a
 *     medias) EXISTE: retirar el acta ahí hacía que el `completed` posterior
 *     no encontrara acta y degradara un aviso REAL a `unverified_announcement`;
 *   - sin credenciales REST (`VoiceNotConfiguredError`) no se puede verificar
 *     nada: la ronda 6 retiraba TODAS las candidatas de esa organización.
 *
 * Ventana y diferimientos (ronda 8, H-1): la ventana de `maxAgeDays` (7) solo
 * evita mirar llamadas antiguas que NUNCA se marcaron (histórico que se
 * corrige a mano). Una llamada diferida queda marcada en `calls.metadata`
 * (`consent_reconcile_deferred_at`, `consent_reconcile_deferrals`) y SIGUE
 * siendo candidata aunque salga de la ventana: sin esto, una llamada diferida
 * siete días pasaba a ser un acta sin grabación permanente (tester r7, C.4;
 * caso real: una acta de 16 s de la org 125). A partir de
 * `RECONCILE_ALERT_AFTER_DEFERRALS` diferimientos o `RECONCILE_ALERT_AFTER_DAYS`
 * días desde `ended_at` se registra un aviso (`consent_reconcile_stale_candidate`,
 * contado en `stale`) y la llamada sigue candidata: el acta NUNCA se retira a
 * ciegas, solo con evidencia positiva. Al resolverse (`recovered`) la marca se
 * retira para que la fila no vuelva a entrar en la consulta de diferidas.
 *
 * Lo ejecuta `runMaintenance` (cron diario de F0, `kind=maintenance`); no hay
 * un scheduler aparte. Scoped por organización en cada escritura.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { buildStoragePath } from './recordingStorageService';
import { getTwilioClientForOrg, VoiceNotConfiguredError } from './voiceContextService';
import { voidConsentWithoutRecording } from './consentService';

export const RECONCILE_MIN_AGE_MINUTES = 10;
export const RECONCILE_MAX_AGE_DAYS = 7;
export const RECONCILE_BATCH = 200;
export const RECONCILE_VOID_REASON = 'reconcile_no_recording';
/** Diferimientos a partir de los cuales se avisa (sin retirar el acta). */
export const RECONCILE_ALERT_AFTER_DEFERRALS = 20;
/** Días desde `ended_at` a partir de los cuales se avisa (sin retirar el acta). */
export const RECONCILE_ALERT_AFTER_DAYS = 30;
/** `calls.metadata` (jsonb, verificado por MCP): última pasada que difirió la llamada. */
export const RECONCILE_DEFERRED_AT_KEY = 'consent_reconcile_deferred_at';
/** `calls.metadata`: número de pasadas que la han diferido (queda como evidencia al resolverse). */
export const RECONCILE_DEFERRALS_KEY = 'consent_reconcile_deferrals';
/** `calls.metadata`: pasada que la resolvió (`recovered`); retira `consent_reconcile_deferred_at`. */
export const RECONCILE_RESOLVED_AT_KEY = 'consent_reconcile_resolved_at';

export interface ReconcileOptions {
  now?: Date;
  minAgeMinutes?: number;
  maxAgeDays?: number;
  batch?: number;
  signal?: AbortSignal;
  log?: { warn: (msg: string, data?: Record<string, unknown>) => void; info: (msg: string, data?: Record<string, unknown>) => void };
}

export interface ReconcileResult extends Record<string, unknown> {
  candidates: number;
  recovered: number;
  voided: number;
  deferred: number;
  /** Diferidas que superan el umbral de diferimientos o de días: avisadas, NO retiradas. */
  stale: number;
  errors: number;
}

type CandidateRow = { id: string; organization_id: number; provider_call_sid: string | null; started_at: string | null; ended_at: string | null; metadata: Record<string, unknown> | null };
const CANDIDATE_COLUMNS = 'id, organization_id, provider_call_sid, started_at, ended_at, metadata';
type ProviderRecording = { sid: string; status?: string; uri?: string; channels?: number; duration?: string | number | null };
/** Subconjunto del cliente REST de Twilio que usa la reconciliación (solo lectura). */
type ProviderClient = { recordings: { list: (o: { callSid: string; limit?: number }) => Promise<ProviderRecording[]> } };

const noopLog = { warn: () => undefined, info: () => undefined };

export async function reconcileConsentsWithoutRecording(supabase: SupabaseClient, opts: ReconcileOptions = {}): Promise<ReconcileResult> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? noopLog;
  const minAge = new Date(now.getTime() - (opts.minAgeMinutes ?? RECONCILE_MIN_AGE_MINUTES) * 60_000).toISOString();
  const maxAge = new Date(now.getTime() - (opts.maxAgeDays ?? RECONCILE_MAX_AGE_DAYS) * 24 * 3600 * 1000).toISOString();
  const batch = opts.batch ?? RECONCILE_BATCH;
  const result: ReconcileResult = { candidates: 0, recovered: 0, voided: 0, deferred: 0, stale: 0, errors: 0 };

  // (1) Dentro de la ventana: marcadas o no.
  const { data: fresh, error } = await supabase
    .from('calls')
    .select(CANDIDATE_COLUMNS)
    .eq('recording_enabled', true)
    .eq('consent_given', true)
    .not('ended_at', 'is', null)
    .lt('ended_at', minAge)
    .gt('ended_at', maxAge)
    .order('ended_at', { ascending: true })
    .limit(batch);
  if (error) throw new Error(`reconcile: calls select: ${error.message}`);

  // (2) Fuera de la ventana SOLO las ya diferidas (H-1): una pasada anterior
  // las vio y no pudo resolverlas; siguen siendo candidatas hasta resolverse.
  const { data: deferredOld, error: deferredErr } = await supabase
    .from('calls')
    .select(CANDIDATE_COLUMNS)
    .eq('recording_enabled', true)
    .eq('consent_given', true)
    .not('ended_at', 'is', null)
    .lte('ended_at', maxAge)
    .not(`metadata->>${RECONCILE_DEFERRED_AT_KEY}`, 'is', null)
    .order('ended_at', { ascending: true })
    .limit(batch);
  if (deferredErr) throw new Error(`reconcile: calls select (diferidas): ${deferredErr.message}`);

  const seen = new Set<string>();
  const calls = [...((deferredOld ?? []) as CandidateRow[]), ...((fresh ?? []) as CandidateRow[])]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, batch);
  if (calls.length === 0) return result;

  // Las que ya tienen grabación registrada no son candidatas.
  const ids = calls.map((c) => c.id);
  const { data: recs, error: recErr } = await supabase.from('call_recordings').select('call_id').in('call_id', ids);
  if (recErr) throw new Error(`reconcile: call_recordings select: ${recErr.message}`);
  const withRecording = new Set(((recs ?? []) as { call_id: string }[]).map((r) => r.call_id));
  const candidates = calls.filter((c) => !withRecording.has(c.id));
  result.candidates = candidates.length;

  for (const call of candidates) {
    if (opts.signal?.aborted) break;
    try {
      const outcome = await reconcileOne(supabase, call, log);
      result[outcome] += 1;
      if (outcome === 'deferred') {
        const deferrals = await markDeferred(supabase, call, now, log);
        const ageDays = call.ended_at ? (now.getTime() - new Date(call.ended_at).getTime()) / (24 * 3600 * 1000) : 0;
        if (deferrals >= RECONCILE_ALERT_AFTER_DEFERRALS || ageDays >= RECONCILE_ALERT_AFTER_DAYS) {
          // Aviso, nunca retirada a ciegas: sigue candidata hasta que haya
          // evidencia positiva (o se corrija a mano).
          result.stale += 1;
          log.warn('consent_reconcile_stale_candidate', { org_id: call.organization_id, call_id: call.id, deferrals, age_days: Math.floor(ageDays), ended_at: call.ended_at });
        }
      } else if (outcome === 'recovered' && call.metadata && call.metadata[RECONCILE_DEFERRED_AT_KEY] != null) {
        await markResolved(supabase, call, now, log);
      }
    } catch (err) {
      result.errors += 1;
      log.warn('consent_reconcile_failed', { call_id: call.id, org_id: call.organization_id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  log.info('consent_reconcile_done', { ...result });
  return result;
}

/**
 * Deja constancia del diferimiento en `calls.metadata` (fusionando: la fila
 * lleva otras claves —disposición, costes— que no se tocan). Devuelve el
 * contador acumulado. Un fallo al marcar se registra y NO cuenta como error
 * de la reconciliación: la llamada sigue diferida y, mientras esté en la
 * ventana, la próxima pasada la vuelve a ver.
 */
async function markDeferred(supabase: SupabaseClient, call: CandidateRow, now: Date, log: NonNullable<ReconcileOptions['log']>): Promise<number> {
  const prev = Number(call.metadata?.[RECONCILE_DEFERRALS_KEY] ?? 0);
  const deferrals = (Number.isFinite(prev) && prev > 0 ? prev : 0) + 1;
  const metadata = { ...(call.metadata ?? {}), [RECONCILE_DEFERRED_AT_KEY]: now.toISOString(), [RECONCILE_DEFERRALS_KEY]: deferrals };
  const { error } = await supabase.from('calls').update({ metadata }).eq('id', call.id).eq('organization_id', call.organization_id);
  if (error) log.warn('consent_reconcile_defer_mark_failed', { org_id: call.organization_id, call_id: call.id, error: error.message });
  return deferrals;
}

/** Retira la marca de diferimiento (conserva el contador como evidencia) al recuperar la grabación. */
async function markResolved(supabase: SupabaseClient, call: CandidateRow, now: Date, log: NonNullable<ReconcileOptions['log']>): Promise<void> {
  const { [RECONCILE_DEFERRED_AT_KEY]: _deferredAt, ...rest } = call.metadata ?? {};
  const metadata = { ...rest, [RECONCILE_RESOLVED_AT_KEY]: now.toISOString() };
  const { error } = await supabase.from('calls').update({ metadata }).eq('id', call.id).eq('organization_id', call.organization_id);
  if (error) log.warn('consent_reconcile_resolve_mark_failed', { org_id: call.organization_id, call_id: call.id, error: error.message });
}

/** Estados de Twilio que significan «la grabación NO existe» (evidencia positiva de ausencia). */
const ABSENT_STATUSES = new Set(['absent', 'deleted']);

async function reconcileOne(supabase: SupabaseClient, call: CandidateRow, log: NonNullable<ReconcileOptions['log']>): Promise<'recovered' | 'voided' | 'deferred'> {
  const orgId = call.organization_id;

  if (call.provider_call_sid) {
    let client: ProviderClient;
    try {
      client = (await getTwilioClientForOrg(orgId)).client as unknown as ProviderClient;
    } catch (err) {
      if (!(err instanceof VoiceNotConfiguredError)) throw err;
      // F-1b: sin credenciales REST no hay forma de verificar. Retirar aquí
      // vaciaba todas las actas de la organización sin mirar nada.
      log.warn('consent_reconcile_deferred_without_twilio', { org_id: orgId, call_id: call.id });
      return 'deferred';
    }

    let list: ProviderRecording[];
    try {
      list = (await client.recordings.list({ callSid: call.provider_call_sid, limit: 5 })) ?? [];
    } catch (err) {
      // Twilio no responde: no se retira nada por un fallo transitorio.
      log.warn('consent_reconcile_deferred', { org_id: orgId, call_id: call.id, error: err instanceof Error ? err.message : String(err) });
      return 'deferred';
    }

    const real = list.filter((r) => r && r.sid && !ABSENT_STATUSES.has(String(r.status ?? 'completed')));
    const completed = real.find((r) => (r.status ?? 'completed') === 'completed') ?? null;
    if (completed) {
      await registerRecoveredRecording(supabase, call, completed);
      log.warn('consent_reconcile_recovered', { org_id: orgId, call_id: call.id, recording_sid: completed.sid });
      return 'recovered';
    }
    if (real.length > 0) {
      // F-1a: existe pero aún no está `completed` (processing…). El callback
      // llegará; retirar el acta ahora degradaría un aviso real.
      log.warn('consent_reconcile_deferred_pending', { org_id: orgId, call_id: call.id, recording_sid: real[0].sid, status: real[0].status ?? null });
      return 'deferred';
    }
  }

  // Evidencia positiva de ausencia (Twilio respondió y no hay grabación real)
  // o nadie a quien preguntar (sin `provider_call_sid`).
  await voidConsentWithoutRecording(call.id, orgId, supabase, RECONCILE_VOID_REASON);
  log.warn('consent_reconcile_voided', { org_id: orgId, call_id: call.id });
  return 'voided';
}

/** Lo mismo que haría `/api/voice/recording` con el `completed` que se perdió. */
async function registerRecoveredRecording(supabase: SupabaseClient, call: CandidateRow, rec: ProviderRecording): Promise<void> {
  const channels = String(rec.channels ?? '1');
  const duration = rec.duration != null && Number.isFinite(Number(rec.duration)) ? Number(rec.duration) : null;
  const startedAt = call.started_at ? new Date(call.started_at) : new Date();
  const recordingUrl = rec.uri ? `https://api.twilio.com${String(rec.uri).replace(/\.json$/i, '')}` : '';

  const { data: existing } = await supabase.from('call_recordings').select('id').eq('provider_recording_sid', rec.sid).limit(1).maybeSingle();
  let recordingId = (existing as { id: string } | null)?.id ?? null;
  if (!recordingId) {
    const { data: created, error } = await supabase
      .from('call_recordings')
      .insert({
        organization_id: call.organization_id,
        call_id: call.id,
        provider_recording_sid: rec.sid,
        channels,
        duration_seconds: duration,
        storage_path: buildStoragePath(call.organization_id, call.id, 'mp3', Number.isNaN(startedAt.getTime()) ? new Date() : startedAt),
        storage_provider: 'twilio',
        status: 'processing',
      })
      .select('id')
      .single();
    if (error || !created) throw new Error(`call_recordings insert: ${error?.message ?? 'sin datos'}`);
    recordingId = (created as { id: string }).id;
  }

  await enqueueJob({
    organizationId: call.organization_id,
    kind: 'recording_fetch',
    payload: { call_id: call.id, recording_id: recordingId, recording_url: recordingUrl, recording_sid: rec.sid, channels, reconciled: true },
    dedupeKey: `recording_fetch:${rec.sid}`,
    maxAttempts: 6,
    supabase,
  });
}
