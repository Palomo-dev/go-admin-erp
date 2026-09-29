/**
 * Detección de contestadora (AMD de Twilio) para el agente de voz.
 *
 * Módulo PURO. Lo usan `voiceAgentService.dialClaimedCall` (parámetros de
 * `calls.create`) y `/api/voice/twiml/ai-agent` (qué hacer cuando contestó una
 * máquina), y las pruebas.
 *
 * Parámetros verificados en la documentación de Twilio (Answering Machine
 * Detection, 2026-09-29):
 *  - `MachineDetection`: `Enable` | `DetectMessageEnd`.
 *  - Con `AsyncAmd=false` (el valor por defecto) Twilio espera a tener el
 *    veredicto y lo manda como `AnsweredBy` en la petición a la `Url` del
 *    TwiML. Por eso aquí se usa el modo SÍNCRONO: la decisión se toma en el
 *    mismo webhook que abre el ConversationRelay, sin segundo callback y sin
 *    llegar a abrir la sesión con el modelo si contestó una máquina.
 *  - `AnsweredBy` con `Enable`: `human`, `machine_start`, `fax`, `unknown`.
 *    Con `DetectMessageEnd`: `human`, `machine_end_beep`, `machine_end_silence`,
 *    `machine_end_other`, `fax`, `unknown`.
 *
 * `DetectMessageEnd` solo tiene sentido si se va a dejar mensaje (espera al
 * pitido). Hoy ni la campaña ni el agente tienen un campo de «mensaje de buzón»
 * (verificado por MCP en `voice_agent_campaigns` y `voice_agents`), así que se
 * usa `Enable` y se cuelga. Si mañana existe el campo, basta con pasar el
 * mensaje a `parametrosAmd`.
 */

export type ClaseRespuesta = 'humano' | 'buzon' | 'fax' | 'desconocido';

/**
 * Clasifica `AnsweredBy`. `unknown` (Twilio no pudo decidir) se trata como
 * humano a propósito: colgarle a una persona es peor que hablarle a un buzón,
 * y el agente se identifica en la primera frase.
 */
export function clasificarAnsweredBy(answeredBy: string | null | undefined): ClaseRespuesta {
  const v = (answeredBy || '').trim().toLowerCase();
  if (!v) return 'desconocido';
  if (v === 'human') return 'humano';
  if (v.startsWith('machine')) return 'buzon';
  if (v === 'fax') return 'fax';
  return 'desconocido';
}

/** true si hay que colgar sin abrir la conversación con el modelo. */
export function debeColgarPorAmd(answeredBy: string | null | undefined): boolean {
  const c = clasificarAnsweredBy(answeredBy);
  return c === 'buzon' || c === 'fax';
}

/** Desenlace que queda en `voice_agent_calls.outcome`. */
export const OUTCOME_BUZON = 'buzon';
export const OUTCOME_FAX = 'fax';

/**
 * Estado y desenlace con que se cierra la fila cuando contesta una máquina.
 * `voicemail` y `no_answer` están en el CHECK real de `voice_agent_calls.status`
 * (verificado por MCP). Ninguno cuenta como contacto efectivo.
 */
export function cierrePorAmd(answeredBy: string | null | undefined): { status: 'voicemail' | 'no_answer'; outcome: string } | null {
  const c = clasificarAnsweredBy(answeredBy);
  if (c === 'buzon') return { status: 'voicemail', outcome: OUTCOME_BUZON };
  if (c === 'fax') return { status: 'no_answer', outcome: OUTCOME_FAX };
  return null;
}

/** Parámetros de AMD para `client.calls.create` (SDK de Node de Twilio). */
export function parametrosAmd(mensajeBuzon?: string | null): { machineDetection: 'Enable' | 'DetectMessageEnd' } {
  return { machineDetection: mensajeBuzon && mensajeBuzon.trim() ? 'DetectMessageEnd' : 'Enable' };
}
