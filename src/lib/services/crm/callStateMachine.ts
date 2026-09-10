/**
 * Máquina de estados de `calls.status` (FASE-03 §2.4) — funciones puras.
 *
 * - Terminales pegajosos: `completed|busy|no_answer|failed|canceled|voicemail`
 *   no se degradan a `ringing/in_progress` (reintentos y desorden de Twilio).
 * - Idempotencia por `SequenceNumber` por leg (`metadata.last_seq.{parent|child}`).
 * - El leg padre (`client:` / entrante PSTN) nunca escribe `in_progress` en
 *   salientes browser: lo hace el hijo (`ParentCallSid` presente).
 * - `dial-complete` (action de <Dial>) fija el estado final y la duración
 *   conversada (`DialCallDuration`), fuente `provider`.
 * - Ronda 2: un terminal NUNCA se degrada ni pierde la duración ya conocida
 *   (`mergeTerminalOutcome`), el buzón detectado por AMD no cierra la llamada
 *   (`voicemail` + `awaiting_close`) y un `CallStatus` desconocido se ignora
 *   en vez de matar la llamada como `failed`.
 */

import { twilioCallStatusToDb, type CallStatus } from '@/lib/crm/enums';

export const TERMINAL_STATUSES: readonly CallStatus[] = ['completed', 'busy', 'no_answer', 'failed', 'canceled', 'voicemail'];

export function isTerminalStatus(status: string | null | undefined): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(String(status));
}

/** `CallStatus` que Twilio documenta hoy (cualquier otro se ignora, no mata la llamada). */
export const KNOWN_TWILIO_CALL_STATUSES: readonly string[] = [
  'queued',
  'initiated',
  'ringing',
  'in-progress',
  'answered',
  'completed',
  'busy',
  'failed',
  'no-answer',
  'canceled',
];

export function isKnownTwilioCallStatus(status: string | null | undefined): boolean {
  return KNOWN_TWILIO_CALL_STATUSES.includes(String(status ?? '').toLowerCase());
}

export type CallLeg = 'parent' | 'child';

export interface CallStateSnapshot {
  status: CallStatus;
  answered_at: string | null;
  started_at: string | null;
  metadata: Record<string, unknown>;
}

export interface TwilioStatusEvent {
  CallStatus: string;
  SequenceNumber?: string | number | null;
  CallDuration?: string | number | null;
  AnsweredBy?: string | null;
  SipResponseCode?: string | null;
  Timestamp?: string | null;
}

export interface StateUpdate {
  status?: CallStatus;
  answered_at?: string;
  ended_at?: string;
  ring_seconds?: number;
  duration_seconds?: number;
  duration_source?: 'provider';
  answered_by?: 'human' | 'machine' | 'fax' | 'unknown';
  metadata: Record<string, unknown>;
}

export function mapAnsweredBy(value: string | null | undefined): StateUpdate['answered_by'] | null {
  if (!value) return null;
  if (value === 'human') return 'human';
  if (value.startsWith('machine')) return 'machine';
  if (value === 'fax') return 'fax';
  return 'unknown';
}

function lastSeq(meta: Record<string, unknown>, leg: CallLeg): number {
  const ls = (meta.last_seq ?? {}) as Record<string, unknown>;
  const n = Number(ls[leg]);
  return Number.isFinite(n) ? n : -1;
}

/**
 * Aplica un status callback. Devuelve `null` si el evento debe ignorarse
 * (secuencia repetida/antigua, o transición inválida sobre terminal).
 */
export function applyStatusEvent(
  current: CallStateSnapshot,
  ev: TwilioStatusEvent,
  leg: CallLeg,
  now: Date = new Date()
): StateUpdate | null {
  // Un CallStatus que no está en el vocabulario de Twilio se ignora: mapearlo a
  // `failed` mataría (y liquidaría) una llamada viva si Twilio añade un valor.
  if (!isKnownTwilioCallStatus(ev.CallStatus)) return null;
  const seq = ev.SequenceNumber === undefined || ev.SequenceNumber === null || ev.SequenceNumber === '' ? null : Number(ev.SequenceNumber);
  const meta: Record<string, unknown> = { ...(current.metadata ?? {}) };
  if (seq !== null && Number.isFinite(seq)) {
    if (seq <= lastSeq(meta, leg)) return null;
    meta.last_seq = { ...((meta.last_seq as Record<string, unknown>) ?? {}), [leg]: seq };
  }

  const nowIso = now.toISOString();
  const mapped = twilioCallStatusToDb(ev.CallStatus);
  const update: StateUpdate = { metadata: meta };
  const currentTerminal = isTerminalStatus(current.status);

  const answeredBy = mapAnsweredBy(ev.AnsweredBy);
  if (answeredBy) update.answered_by = answeredBy;
  if (ev.SipResponseCode) meta.sip_code = ev.SipResponseCode;

  if (mapped === 'ringing') {
    if (!currentTerminal && current.status === 'dialing') update.status = 'ringing';
    meta.ringing_at = meta.ringing_at ?? nowIso;
    return update;
  }

  if (mapped === 'in_progress') {
    if (leg === 'parent' && current.answered_at) return update; // el padre no mueve a in_progress si ya hay respuesta
    if (!currentTerminal) update.status = 'in_progress';
    if (!current.answered_at) {
      update.answered_at = nowIso;
      const started = current.started_at ? new Date(current.started_at).getTime() : now.getTime();
      update.ring_seconds = Math.max(0, Math.round((now.getTime() - started) / 1000));
    }
    if (answeredBy === 'machine' && !currentTerminal) {
      // Contestador: la llamada SIGUE viva (se está dejando el mensaje). Se marca
      // `voicemail` para la UI, pero no se cierra ni se liquida hasta que llegue
      // el evento de cierre con la duración real (`awaiting_close`).
      update.status = 'voicemail';
      meta.voicemail_detected_at = meta.voicemail_detected_at ?? nowIso;
      meta.awaiting_close = true;
    }
    return update;
  }

  if (mapped === 'dialing') {
    // initiated/queued: sin cambio de estado (ya estamos en dialing o más adelante)
    return update;
  }

  // Terminales
  const dur = ev.CallDuration === undefined || ev.CallDuration === null || ev.CallDuration === '' ? NaN : Number(ev.CallDuration);
  const durationSeconds = Number.isFinite(dur) && leg === 'child' ? Math.max(0, Math.round(dur)) : undefined;

  if (currentTerminal) {
    // Terminal pegajoso: el estado no se degrada, pero el evento de cierre SÍ
    // aporta `ended_at` y la duración real. Caso buzón: se marcó `voicemail` al
    // contestar el contestador y la llamada siguió viva; aquí es cuando cierra
    // (y cuando el llamador debe liquidar). El llamador solo rellena huecos.
    update.ended_at = nowIso;
    if (durationSeconds !== undefined) {
      update.duration_seconds = durationSeconds;
      update.duration_source = 'provider';
    }
    if (meta.awaiting_close) meta.awaiting_close = false;
    return update;
  }

  let finalStatus: CallStatus = mapped;
  if (mapped === 'completed' && !current.answered_at && !update.answered_at) {
    // El padre terminó sin que nadie contestara (agente colgó antes de timbrar / cliente no atendió)
    finalStatus = leg === 'parent' ? 'canceled' : 'completed';
  }
  update.status = finalStatus;
  update.ended_at = nowIso;
  if (durationSeconds !== undefined) {
    update.duration_seconds = durationSeconds;
    update.duration_source = 'provider';
  }
  return update;
}

export interface DialCompleteEvent {
  DialCallStatus: string;
  DialCallSid?: string | null;
  DialCallDuration?: string | number | null;
  DialBridged?: string | null;
}

export interface DialCompleteUpdate {
  status: CallStatus;
  ended_at: string;
  duration_seconds: number;
  duration_source: 'provider';
  customer_leg_sid?: string;
  metadata: Record<string, unknown>;
}

/** Mapea el `action` de <Dial>: completed|answered → completed, busy, no-answer, failed, canceled. */
export function applyDialComplete(current: CallStateSnapshot, ev: DialCompleteEvent, now: Date = new Date()): DialCompleteUpdate {
  const meta: Record<string, unknown> = { ...(current.metadata ?? {}) };
  const raw = String(ev.DialCallStatus || '').toLowerCase();
  let status: CallStatus = raw === 'answered' ? 'completed' : twilioCallStatusToDb(raw);
  const dur = ev.DialCallDuration === undefined || ev.DialCallDuration === null || ev.DialCallDuration === '' ? 0 : Number(ev.DialCallDuration);
  const duration = Number.isFinite(dur) ? Math.max(0, Math.round(dur)) : 0;

  if (status === 'completed' && ev.DialBridged !== undefined && ev.DialBridged !== null && String(ev.DialBridged) === 'false') {
    meta.reason = 'hangup_during_consent';
  }
  if (isTerminalStatus(current.status) && current.status === 'voicemail') status = 'voicemail';

  meta.dial_call_status = raw;
  const out: DialCompleteUpdate = {
    status,
    ended_at: now.toISOString(),
    duration_seconds: duration,
    duration_source: 'provider',
    metadata: meta,
  };
  if (ev.DialCallSid) out.customer_leg_sid = ev.DialCallSid;
  return out;
}

export interface TerminalMergeInput {
  currentStatus: CallStatus;
  currentDuration: number | null | undefined;
  currentAnsweredAt: string | null;
  incomingStatus: CallStatus;
  incomingDuration: number;
}

/**
 * Fusiona el desenlace que trae `dial-complete` con el que ya tiene la fila.
 *
 * Reglas (ronda 2, defecto A1):
 * - Un estado terminal NO se degrada: si `status` ya es terminal, el nuevo
 *   estado se ignora salvo que el evento aporte conversación real
 *   (`completed` con duración > 0) sobre un terminal "sin información"
 *   (`canceled`/`no_answer`/`failed`/`busy` con duración 0).
 * - La duración nunca se pisa con 0: `DialCallDuration` ausente significa "no
 *   sé", no "duró 0 s" (Twilio no garantiza el orden entre el `action` del
 *   `<Dial>` y el status callback del leg hijo).
 * - `voicemail` sobrevive a cualquier desenlace (el buzón sí atendió).
 *
 * Devuelve solo los campos que hay que escribir (`undefined` = no tocar).
 */
export function mergeTerminalOutcome(input: TerminalMergeInput): { status?: CallStatus; duration_seconds?: number } {
  const currentDuration = Number.isFinite(Number(input.currentDuration)) ? Number(input.currentDuration) : null;
  const out: { status?: CallStatus; duration_seconds?: number } = {};

  if (input.incomingDuration > 0 && (currentDuration === null || input.incomingDuration > currentDuration)) {
    out.duration_seconds = input.incomingDuration;
  }

  if (!isTerminalStatus(input.currentStatus)) {
    out.status = input.incomingStatus;
    return out;
  }
  if (input.currentStatus === 'voicemail') return out; // el buzón manda
  const currentHasConversation = input.currentStatus === 'completed' || (currentDuration ?? 0) > 0;
  if (!currentHasConversation && input.incomingStatus === 'completed' && input.incomingDuration > 0) {
    out.status = 'completed'; // el <Dial> demuestra que sí hubo conversación
  }
  return out;
}

/**
 * Resultado por defecto de la actividad según el estado final (si no hay
 * disposición manual). Mismo vocabulario que `callActivityService.mapCallStatusToOutcome`
 * (F4) para que análisis y disposición no se pisen.
 */
export function defaultOutcomeForStatus(status: string): string {
  switch (status) {
    case 'completed':
      return 'answered';
    case 'no_answer':
      return 'no_answer';
    case 'busy':
      return 'busy';
    case 'voicemail':
      return 'voicemail';
    case 'canceled':
      return 'canceled';
    default:
      return 'failed';
  }
}
