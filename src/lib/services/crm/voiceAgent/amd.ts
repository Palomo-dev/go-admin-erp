/**
 * Detección de contestadora (AMD de Twilio) para el agente de voz.
 *
 * Módulo PURO. Lo usan `voiceAgentService.dialClaimedCall` (parámetros de
 * `calls.create`), `/api/voice/ai-agent/amd` (veredicto asíncrono),
 * `/api/voice/twiml/ai-agent` (veredicto síncrono de llamadas antiguas) y las
 * pruebas.
 *
 * AMD ASÍNCRONO (2026-10-07). Antes la llamada se creaba con AMD síncrono
 * (`AsyncAmd=false`, el valor por defecto): Twilio RETIENE la llamada en
 * silencio hasta tener veredicto y solo entonces pide el TwiML. Con
 * `MachineDetectionTimeout` por defecto (30 s), una persona que contesta y no
 * habla lo bastante oye hasta 30 s de silencio y el veredicto sale `unknown`.
 * Llamada de prueba del 2026-10-07 (org 125): marcada a las 16:25:04Z, 68 s
 * facturados hasta las 16:26:25Z (contestó ~16:25:17Z); `AnsweredBy=unknown`
 * (agotó los 30 s → ~16:25:47Z, calculado) y, tras el aviso de grabación, el
 * agente habló a las 16:25:54Z: ~37 s de silencio. En la campaña hay muchas
 * llamadas atendidas de 7–13 s sin conversación: colgaron en ese silencio.
 *
 * Ahora el TwiML (aviso + ConversationRelay) se pide al contestar y el
 * veredicto llega APARTE a `asyncAmdStatusCallback`. Si es máquina o fax, esa
 * ruta cuelga por la API, cierra la fila y devuelve la reserva.
 *
 * Parámetros verificados (2026-10-07) en el SDK instalado (`twilio` 6.1.0,
 * `rest/api/v2010/account/call.d.ts`, `CallListInstanceCreateOptions`) y en la
 * documentación de Answering Machine Detection:
 *  - `machineDetection`: `Enable` | `DetectMessageEnd`.
 *  - `asyncAmd`: STRING `'true'` | `'false'` (default `'false'`, bloquea la
 *    llamada hasta el veredicto).
 *  - `asyncAmdStatusCallback`: URL a la que Twilio manda el veredicto con
 *    `CallSid`, `AccountSid`, `AnsweredBy` y `MachineDetectionDuration` (ms).
 *    Va firmada con `X-Twilio-Signature` como cualquier webhook.
 *  - `asyncAmdStatusCallbackMethod`: `GET` | `POST` (default `POST`).
 *  - `machineDetectionTimeout`: segundos antes de responder `unknown`
 *    (default 30). Se deja en el default: en modo asíncrono ya no retiene a
 *    nadie, y un tope menor solo daría más `unknown` (= persona).
 *  - El AMD asíncrono ocupa uno de los cuatro «forks» de audio por llamada
 *    (compartidos con Media Streams, SIPREC y transcripción en tiempo real).
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

/** Ruta que recibe el veredicto asíncrono (`asyncAmdStatusCallback`). */
export const RUTA_AMD_ASINCRONO = '/api/voice/ai-agent/amd';

export interface ParametrosAmd {
  machineDetection: 'Enable' | 'DetectMessageEnd';
  asyncAmd: 'true';
  asyncAmdStatusCallback: string;
  asyncAmdStatusCallbackMethod: 'POST';
}

/**
 * Parámetros de AMD ASÍNCRONO para `client.calls.create` (SDK de Node de
 * Twilio). `callbackUrl` es la URL absoluta de `RUTA_AMD_ASINCRONO` con el
 * `callId` de la fila; la organización la resuelve la ruta desde esa fila.
 */
export function parametrosAmd(callbackUrl: string, mensajeBuzon?: string | null): ParametrosAmd {
  return {
    machineDetection: mensajeBuzon && mensajeBuzon.trim() ? 'DetectMessageEnd' : 'Enable',
    asyncAmd: 'true',
    asyncAmdStatusCallback: callbackUrl,
    asyncAmdStatusCallbackMethod: 'POST',
  };
}
