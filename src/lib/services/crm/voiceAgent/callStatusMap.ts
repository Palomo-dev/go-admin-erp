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

/**
 * Estados «vivos» de `voice_agent_calls`: los ÚNICOS desde los que se puede
 * escribir `in_progress`. Una fila que ya cerró no vuelve atrás.
 *
 * Incidente 2026-10-06 (org 125): la 2ª pasada del TwiML del agente (tras el
 * aviso de grabación) tarda cientos de ms; si la persona colgaba en ese lapso,
 * el `completed` del `statusCallback` cerraba la fila y DESPUÉS el TwiML la
 * reabría con `in_progress` (escritura incondicional, última gana). Cinco filas
 * así ocuparon para siempre los cinco cupos de concurrencia de la organización.
 * Toda escritura de un estado vivo va con `.in('status', ESTADOS_VIVOS_VAC)`.
 */
export const ESTADOS_VIVOS_VAC: string[] = ['pending', 'queued', 'in_progress'];

/** Estados «vivos» de `calls`. Uno vivo solo se escribe si `ended_at` sigue nulo. */
export const ESTADOS_VIVOS_CALLS = ['dialing', 'ringing', 'in_progress'];

/** ¿Es un estado de `voice_agent_calls` que todavía no cerró la llamada? */
export function esEstadoVivoVac(status: string | null | undefined): boolean {
  return !!status && ESTADOS_VIVOS_VAC.includes(status);
}

/**
 * Minutos sin actualizarse tras los que una fila `in_progress` se considera
 * colgada. Holgura de 3× sobre el tope de duración de los agentes (300 s; el
 * mayor configurado en la base el 2026-10-07 es 300). Lo usan el recolector
 * (`fn_vac_recoger_colgadas`) y los conteos de concurrencia.
 */
export const MINUTOS_LLAMADA_COLGADA = 15;

/** Instante (ISO) antes del cual una fila `in_progress` sin tocar está colgada. */
export function corteLlamadaColgada(ahora: Date = new Date(), minutos: number = MINUTOS_LLAMADA_COLGADA): string {
  return new Date(ahora.getTime() - minutos * 60 * 1000).toISOString();
}
