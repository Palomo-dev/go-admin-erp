/**
 * Enums del CRM — única fuente de verdad sincronizada con los CHECK de la BD.
 *
 * Los valores de este archivo deben coincidir EXACTAMENTE con los CHECK
 * constraints de Postgres (ver `src/lib/crm/__fixtures__/db-checks.json`,
 * generado con una consulta a `pg_constraint`; el guardarraíl #9 los compara).
 *
 * Valores marcados como "F0 amplía" existen aquí porque la migración de F0
 * los añade al CHECK; hasta que la migración corra, la BD los rechaza.
 */

// ─── calls ───────────────────────────────────────────────────────────────────

export const CALL_MODES = ['browser', 'bridge', 'ai_agent', 'manual', 'inbound'] as const;
export type CallMode = (typeof CALL_MODES)[number];

export const CALL_STATUSES = [
  'dialing',
  'ringing',
  'in_progress',
  'completed',
  'failed',
  'busy',
  'no_answer',
  'canceled',
  'voicemail',
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const CALL_DIRECTIONS = ['inbound', 'outbound'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const BRIDGE_MODES = ['agent_leg', 'customer_leg', 'full_bridge'] as const;
export type BridgeMode = (typeof BRIDGE_MODES)[number];

export const DURATION_SOURCES = ['provider', 'estimated', 'manual'] as const;
export type DurationSource = (typeof DURATION_SOURCES)[number];

// ─── call_recordings / call_transcripts / call_analyses ─────────────────────

export const RECORDING_STATUSES = ['processing', 'ready', 'failed', 'deleted'] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export const TRANSCRIPT_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

/** F0 amplía: + 'mixed' */
export const SENTIMENTS = ['positive', 'neutral', 'negative', 'mixed'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

// ─── activities ──────────────────────────────────────────────────────────────

/** F0 amplía: + sms, meeting, ai_call, task */
export const ACTIVITY_TYPES = [
  'call',
  'email',
  'whatsapp',
  'sms',
  'meeting',
  'visit',
  'note',
  'system',
  'ai_call',
  'task',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// ─── tasks ───────────────────────────────────────────────────────────────────

export const TASK_STATUSES = ['open', 'in_progress', 'done', 'canceled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'med', 'high', 'critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// ─── voice_agents / voice_agent_calls / mobile_call_bridges ─────────────────

export const VOICE_AGENT_ENGINES = [
  'conversation_relay',
  'elevenlabs_agent',
  'openai_realtime',
  'gemini_live',
] as const;
export type VoiceAgentEngine = (typeof VOICE_AGENT_ENGINES)[number];

/** F0 amplía: + sell_product, book_meeting */
export const VOICE_AGENT_PURPOSES = [
  'qualify_lead',
  'confirm_demo',
  'follow_up_proposal',
  'reactivate_cold',
  'collect_payment',
  'nps_survey',
  'renewal_reminder',
  'sell_product',
  'book_meeting',
  'custom',
] as const;
export type VoiceAgentPurpose = (typeof VOICE_AGENT_PURPOSES)[number];

export const VOICE_AGENT_CALL_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'transferred',
] as const;
export type VoiceAgentCallStatus = (typeof VOICE_AGENT_CALL_STATUSES)[number];

export const MOBILE_BRIDGE_STATUSES = [
  'initiating',
  'agent_ringing',
  'agent_answered',
  'customer_dialing',
  'in_progress',
  'completed',
  'failed',
  'agent_no_answer',
  'agent_rejected',
] as const;
export type MobileBridgeStatus = (typeof MOBILE_BRIDGE_STATUSES)[number];

// ─── sequences / automation_rules ───────────────────────────────────────────

export const SEQUENCE_STEP_CHANNELS = [
  'email',
  'whatsapp',
  'sms',
  'call',
  'task',
  'wait',
  'condition',
] as const;
export type SequenceStepChannel = (typeof SEQUENCE_STEP_CHANNELS)[number];

export const AUTOMATION_TRIGGER_TYPES = [
  'stage_change',
  'field_change',
  'schedule',
  'event',
  'manual',
] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

// ─── email_messages ──────────────────────────────────────────────────────────

export const EMAIL_MESSAGE_STATUSES = [
  'pending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'unsubscribed',
  'failed',
] as const;
export type EmailMessageStatus = (typeof EMAIL_MESSAGE_STATUSES)[number];

// ─── messages (chat) ─────────────────────────────────────────────────────────

export const MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_ROLES = ['customer', 'agent', 'ai', 'system'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_CONTENT_TYPES = [
  'text',
  'image',
  'file',
  'audio',
  'video',
  'location',
  'template',
] as const;
export type MessageContentType = (typeof MESSAGE_CONTENT_TYPES)[number];

// ─── outbound_jobs (cola, F0) ────────────────────────────────────────────────

export const JOB_KINDS = [
  'email',
  'whatsapp',
  'sms',
  'ai_call',
  'sequence_step',
  'automation',
  'transcribe',
  'analyze',
  'recording_fetch', // presente en el CHECK real de BD (verificado 2026-09-08)
  'recording_cleanup',
  'campaign_batch',
  'crm_event',
  'maintenance',
  'noop', // solo pruebas del runner; en el CHECK real desde DB-r2 (`crm_v4_f00_12_kind_noop_…`, 2026-09-08)
  'time_events', // F8: eventos horarios (crm_v4_f08_01_engine_schema)
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'dead'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// ─── contact_consents (F0) ───────────────────────────────────────────────────

export const CONSENT_CHANNELS = ['email', 'whatsapp', 'sms', 'voice'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_STATUSES = ['opted_in', 'opted_out', 'unknown'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

// ─── Mapeos Twilio → BD ──────────────────────────────────────────────────────

/**
 * Estados de llamada que envía Twilio (CallStatus del status callback) → CHECK de `calls.status`.
 * Cualquier valor desconocido se mapea a 'failed' para no violar el CHECK.
 */
const TWILIO_CALL_STATUS_TO_DB: Record<string, CallStatus> = {
  queued: 'dialing',
  initiated: 'dialing',
  ringing: 'ringing',
  'in-progress': 'in_progress',
  answered: 'in_progress',
  completed: 'completed',
  busy: 'busy',
  failed: 'failed',
  'no-answer': 'no_answer',
  canceled: 'canceled',
};

export function twilioCallStatusToDb(status: string): CallStatus {
  return TWILIO_CALL_STATUS_TO_DB[status] ?? 'failed';
}

/** Alias con el nombre usado en FASE-00 §4.5.3. */
export const mapTwilioCallStatus = twilioCallStatusToDb;

/**
 * RecordingStatus de Twilio → CHECK de `call_recordings.status`.
 */
const TWILIO_RECORDING_STATUS_TO_DB: Record<string, RecordingStatus> = {
  'in-progress': 'processing',
  completed: 'ready',
  absent: 'failed',
  failed: 'failed',
  deleted: 'deleted',
};

export function twilioRecordingStatusToDb(status: string): RecordingStatus {
  return TWILIO_RECORDING_STATUS_TO_DB[status] ?? 'processing';
}

/** Tabla de todos los enums (para el guardarraíl que los compara con la BD). */
export const DB_CHECK_ENUMS: Record<string, readonly string[]> = {
  'calls.mode': CALL_MODES,
  'calls.status': CALL_STATUSES,
  'calls.direction': CALL_DIRECTIONS,
  'calls.bridge_mode': BRIDGE_MODES,
  'calls.duration_source': DURATION_SOURCES,
  'call_recordings.status': RECORDING_STATUSES,
  'call_transcripts.status': TRANSCRIPT_STATUSES,
  'call_analyses.sentiment': SENTIMENTS,
  'activities.activity_type': ACTIVITY_TYPES,
  'tasks.status': TASK_STATUSES,
  'tasks.priority': TASK_PRIORITIES,
  'voice_agents.engine': VOICE_AGENT_ENGINES,
  'voice_agents.purpose_type': VOICE_AGENT_PURPOSES,
  'voice_agent_calls.status': VOICE_AGENT_CALL_STATUSES,
  'mobile_call_bridges.status': MOBILE_BRIDGE_STATUSES,
  'sequence_steps.channel': SEQUENCE_STEP_CHANNELS,
  'automation_rules.trigger_type': AUTOMATION_TRIGGER_TYPES,
  'email_messages.status': EMAIL_MESSAGE_STATUSES,
  'messages.direction': MESSAGE_DIRECTIONS,
  'messages.role': MESSAGE_ROLES,
  'messages.content_type': MESSAGE_CONTENT_TYPES,
  'outbound_jobs.kind': JOB_KINDS,
  'outbound_jobs.status': JOB_STATUSES,
  'contact_consents.channel': CONSENT_CHANNELS,
  'contact_consents.status': CONSENT_STATUSES,
};
