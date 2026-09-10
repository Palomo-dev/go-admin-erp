/**
 * TwiML del bridge móvil (FASE-05 §4.5.1/§4.5.2/§4.5.3) — funciones puras.
 *
 * Vive fuera de `twimlBuilders.ts` (propiedad de F3) para no tocar un archivo
 * compartido; reutiliza sus primitivas (`escapeXml`, `buildCallbackUrl`,
 * `clampTimeout`, `CONSENT_LANGUAGE`, `CONSENT_VOICE`, `RECORDING_EVENTS`,
 * `STATUS_EVENTS`), así que el idioma y la voz son los mismos que los del resto
 * de la telefonía (`es-MX` + `Polly.Mia-Neural`; `es-CO` NO existe en Twilio).
 *
 * Reglas que el TwiML anterior incumplía y que aquí son estructurales:
 * - `statusCallback` cuelga del `<Number>`, NUNCA del `<Dial>` (TwiML solo lo
 *   soporta en los sustantivos anidados: Twilio lo ignora en el verbo).
 * - El `<Dial>` lleva `action` → `/api/voice/dial-complete?callId=…`, que es
 *   quien fija el desenlace y `duration_seconds = DialCallDuration`.
 * - El aviso de grabación al CLIENTE va en `<Number url=consent-whisper>`: lo
 *   oye quien entra a la llamada, no el vendedor, y queda dentro de la
 *   grabación dual (Ley 1581, D9).
 * - `recordingStatusCallbackEvent="completed absent"` para enterarse también de
 *   las grabaciones ausentes.
 */

import {
  CONSENT_LANGUAGE,
  CONSENT_VOICE,
  RECORDING_EVENTS,
  STATUS_EVENTS,
  clampTimeout,
  escapeXml,
} from './twimlBuilders';

/**
 * Espera de un `<Gather>` de DTMF: 3–30 s. `clampTimeout` (F3) sirve para el
 * timbre de un `<Dial>` y su mínimo es 10 s; el doc §4.5.1 pide 8 s para el
 * dígito de confirmación, así que este verbo tiene su propio rango.
 */
function clampGatherTimeout(seconds: number | null | undefined, fallback = 8): number {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(30, Math.max(3, Math.round(n)));
}

function say(text: string): string {
  return `  <Say language="${CONSENT_LANGUAGE}" voice="${CONSENT_VOICE}">${escapeXml(text)}</Say>`;
}

function wrap(parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${parts.join('\n')}\n</Response>`;
}

/** `<Say>` + `<Hangup/>` (bridge inexistente, terminal, buzón, cancelación). */
export function buildBridgeHangupTwiml(text?: string): string {
  const parts: string[] = [];
  if (text) parts.push(say(text));
  parts.push('  <Hangup/>');
  return wrap(parts);
}

export interface AgentLegTwimlParams {
  /** Texto que oye el vendedor al contestar (ya sin escapar). */
  whisper: string;
  /** `action` del `<Gather>`: `/api/voice/twiml/customer-leg?bridgeId=…&t=…`. */
  actionUrl: string;
  /** false → sin `<Gather>`: se marca al cliente directamente tras el whisper. */
  confirmDigit: boolean;
  /** Segundos de espera del dígito (8 s por defecto, §4.5.1). */
  timeout?: number;
  /** TwiML del `<Dial>` al cliente cuando `confirmDigit` es false. */
  directDial?: string;
}

/**
 * §4.5.1 — leg del vendedor. Con confirmación: `<Gather numDigits="1">` con
 * "1 para conectar, 2 para cancelar" y fallback `<Say>+<Hangup/>` (cuando el
 * `<Gather>` expira Twilio NO llama al `action`, sigue con el verbo siguiente).
 */
export function buildAgentLegTwiml(p: AgentLegTwimlParams): string {
  if (!p.confirmDigit) {
    const inner = (p.directDial ?? '').trim();
    const dial = inner
      ? inner.replace(/^<\?xml[^>]*\?>\s*<Response>\s*/i, '').replace(/\s*<\/Response>\s*$/i, '')
      : '  <Hangup/>';
    return wrap([say(p.whisper), dial]);
  }
  return wrap([
    `  <Gather numDigits="1" action="${escapeXml(p.actionUrl)}" method="POST" timeout="${clampGatherTimeout(p.timeout)}">`,
    `  ${say(p.whisper)}`,
    '  </Gather>',
    say('No recibimos confirmación. Hasta luego.'),
    '  <Hangup/>',
  ]);
}

export interface CustomerLegTwimlParams {
  /** Destino en E.164. */
  to: string;
  /** Caller id de la ORGANIZACIÓN (nunca el número global de la plataforma). */
  callerId: string;
  recordingEnabled: boolean;
  /** `/api/voice/recording`. */
  recordingCallbackUrl: string;
  /** `/api/voice/bridge/status?bridgeId=…&t=…&leg=customer` (va en `<Number>`). */
  statusCallbackUrl: string;
  /** `/api/voice/twiml/consent-whisper?callId=…` (aviso AL CLIENTE). */
  consentUrl?: string | null;
  /** `action` del `<Dial>`: `/api/voice/dial-complete?callId=…`. */
  dialCompleteUrl: string;
  /** Timbre del cliente (30 s por defecto). */
  timeout?: number;
  timeLimitSeconds?: number;
  /** Aviso que oye el VENDEDOR mientras se marca (no es el del cliente). */
  agentNotice?: string | null;
}

/**
 * §4.5.2 — leg del cliente. El `<Say>` inicial lo oye el vendedor; el aviso de
 * grabación del cliente llega por `<Number url=consent-whisper>`.
 */
export function buildCustomerLegTwiml(p: CustomerLegTwimlParams): string {
  const parts: string[] = [];
  if (p.agentNotice) parts.push(say(p.agentNotice));

  const dialAttrs = [
    `callerId="${escapeXml(p.callerId)}"`,
    `timeout="${clampTimeout(p.timeout ?? 30)}"`,
    `timeLimit="${Math.max(60, Math.min(14400, p.timeLimitSeconds ?? 7200))}"`,
    'answerOnBridge="true"',
    `action="${escapeXml(p.dialCompleteUrl)}"`,
    'method="POST"',
  ];
  if (p.recordingEnabled) {
    dialAttrs.push(
      'record="record-from-answer-dual"',
      `recordingStatusCallback="${escapeXml(p.recordingCallbackUrl)}"`,
      `recordingStatusCallbackEvent="${RECORDING_EVENTS}"`,
      'recordingStatusCallbackMethod="POST"'
    );
  }

  const numberAttrs = [
    `statusCallback="${escapeXml(p.statusCallbackUrl)}"`,
    `statusCallbackEvent="${STATUS_EVENTS}"`,
    'statusCallbackMethod="POST"',
  ];
  // El aviso de grabación AL CLIENTE. Es lo que hace legal la grabación: sin
  // esta URL el <Dial> graba y el cliente no oye nada. El 2026-09-10 llegó a
  // HEAD con un `if (false && …)` delante —una mutación de prueba que nadie
  // restauró— y las cuatro pruebas F5-38/39/40/55 se pusieron rojas: la red
  // mordió, la restauración falló. Si vuelves a ver un `false &&` aquí, es eso.
  if (p.recordingEnabled && p.consentUrl) numberAttrs.push(`url="${escapeXml(p.consentUrl)}"`, 'method="POST"');

  parts.push(`  <Dial ${dialAttrs.join(' ')}>`);
  parts.push(`    <Number ${numberAttrs.join(' ')}>${escapeXml(p.to)}</Number>`);
  parts.push('  </Dial>');
  return wrap(parts);
}

export interface AgentDialGatherTwimlParams {
  /** Texto del IVR (§2.3, variante opcional). */
  prompt: string;
  /** `action` del `<Gather>`: `/api/voice/twiml/agent-dial?userId=…&orgId=…&t=…`. */
  actionUrl: string;
  timeout?: number;
}

/** §4.5.3 — IVR "sin abrir la app": pide el número del cliente terminado en `#`. */
export function buildAgentDialGatherTwiml(p: AgentDialGatherTwimlParams): string {
  return wrap([
    `  <Gather input="dtmf" finishOnKey="#" timeout="${clampGatherTimeout(p.timeout)}" action="${escapeXml(p.actionUrl)}" method="POST">`,
    `  ${say(p.prompt)}`,
    '  </Gather>',
    say('No recibimos un número. Hasta luego.'),
    '  <Hangup/>',
  ]);
}
