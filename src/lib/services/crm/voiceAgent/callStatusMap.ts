/**
 * Traducción de los `CallStatus` de Twilio a los CHECK reales de la base (FASE 06).
 *
 * Módulo puro (sin dependencias de Next ni de proveedores) para que el webhook
 * `/api/voice/ai-agent/status` y las pruebas usen exactamente la misma tabla.
 */

export type VoiceAgentCallLiveStatus =
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'voicemail'
  | 'canceled'
  | 'transferred';

/** Estados terminales: cierran la fila y fijan `completed_at`. */
export const TERMINAL_VAC_STATUSES: VoiceAgentCallLiveStatus[] = [
  'completed',
  'failed',
  'no_answer',
  'voicemail',
  'canceled',
];

/** CallStatus de Twilio → estado de `voice_agent_calls` (CHECK real). */
export function mapTwilioCallStatus(
  callStatus: string,
  answeredBy?: string | null
): VoiceAgentCallLiveStatus | null {
  if (answeredBy && /^machine/.test(answeredBy) && callStatus === 'completed') return 'voicemail';
  switch (callStatus) {
    case 'queued':
    case 'initiated':
    case 'ringing':
    case 'in-progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'busy':
    case 'failed':
      return 'failed';
    case 'no-answer':
      return 'no_answer';
    case 'canceled':
      return 'canceled';
    default:
      return null;
  }
}

/** CallStatus de Twilio → estado de `calls` (CHECK real). */
export function mapTwilioToCallsStatus(callStatus: string, answeredBy?: string | null): string | null {
  if (answeredBy && /^machine/.test(answeredBy) && callStatus === 'completed') return 'voicemail';
  switch (callStatus) {
    case 'queued':
    case 'initiated':
      return 'dialing';
    case 'ringing':
      return 'ringing';
    case 'in-progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'busy':
      return 'busy';
    case 'failed':
      return 'failed';
    case 'no-answer':
      return 'no_answer';
    case 'canceled':
      return 'canceled';
    default:
      return null;
  }
}

/** Estados de `calls` que implican que la llamada terminó. */
export const ENDED_CALL_STATUSES = ['completed', 'failed', 'busy', 'no_answer', 'canceled', 'voicemail'];
