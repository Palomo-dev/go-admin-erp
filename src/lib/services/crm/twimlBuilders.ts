/**
 * TwiML builders — todo el TwiML de FASE-03 sale de aquí (testeable, sin I/O).
 * GO Admin ERP — FASE-03 §4.5
 *
 * Reglas:
 * - `&` en atributos siempre `&amp;` (C9) vía `escapeXml`.
 * - `<Say>` en español: `language="es-MX"` + `voice="Polly.Mia-Neural"`
 *   (es-CO no existe en Twilio; docs-twilio-voice.md).
 * - El consentimiento al cliente va en `<Number url>` (whisper) para que lo
 *   oiga el cliente y quede dentro de la grabación dual (§11).
 */

export const CONSENT_LANGUAGE = 'es-MX';
export const CONSENT_VOICE = 'Polly.Mia-Neural';
export const STATUS_EVENTS = 'initiated ringing answered completed';
export const RECORDING_EVENTS = 'completed absent';
export const MAX_CLIENTS_PER_DIAL = 10;

export function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `${origin}${path}?a=1&b=2` con `encodeURIComponent` (el `&` se escapa al meterlo en atributos). */
export function buildCallbackUrl(origin: string, path: string, query?: Record<string, string | number | null | undefined>): string {
  const base = origin.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
  if (!query) return base;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${base}?${qs}` : base;
}

export function clampTimeout(seconds: number | null | undefined, fallback = 30): number {
  if (seconds === null || seconds === undefined) return fallback;
  const n = Number(seconds);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(60, Math.max(10, Math.round(n)));
}

function say(text: string, language = CONSENT_LANGUAGE, voice = CONSENT_VOICE): string {
  return `  <Say language="${escapeXml(language)}" voice="${escapeXml(voice)}">${escapeXml(text)}</Say>`;
}

function wrap(parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${parts.join('\n')}\n</Response>`;
}

export function buildHangupTwiml(sayText?: string): string {
  const parts: string[] = [];
  if (sayText) parts.push(say(sayText));
  parts.push('  <Hangup/>');
  return wrap(parts);
}

/** `/api/voice/twiml/consent-whisper`: lo oye solo el cliente antes del bridge. */
export function buildConsentTwiml(text: string, language = CONSENT_LANGUAGE, voice = CONSENT_VOICE): string {
  return wrap([say(text, language, voice)]);
}

export interface OutboundTwimlParams {
  origin: string;
  callId: string;
  to: string;
  callerId: string;
  recordingEnabled: boolean;
  ringTimeoutSeconds: number;
  /** Texto breve que oye el AGENTE mientras marca (opcional). */
  agentPrompt?: string | null;
  /** Detección de contestador (cuesta $0.0075/llamada); apagado por defecto. */
  machineDetection?: boolean;
  timeLimitSeconds?: number;
}

/**
 * TwiML saliente client-originated (§4.5.1):
 * <Dial callerId record=… recordingStatusCallback action=dial-complete answerOnBridge>
 *   <Number statusCallback url=consent-whisper>+57…</Number>
 * </Dial>
 */
export function buildOutboundBrowserTwiml(p: OutboundTwimlParams): string {
  const parts: string[] = [];
  if (p.agentPrompt) parts.push(say(p.agentPrompt));

  const action = buildCallbackUrl(p.origin, '/api/voice/dial-complete', { callId: p.callId });
  const statusCb = buildCallbackUrl(p.origin, '/api/voice/status');
  const recordingCb = buildCallbackUrl(p.origin, '/api/voice/recording');
  const whisper = buildCallbackUrl(p.origin, '/api/voice/twiml/consent-whisper', { callId: p.callId });

  const dialAttrs = [
    `callerId="${escapeXml(p.callerId)}"`,
    `timeout="${clampTimeout(p.ringTimeoutSeconds)}"`,
    `timeLimit="${Math.max(60, Math.min(14400, p.timeLimitSeconds ?? 7200))}"`,
    'answerOnBridge="true"',
    `action="${escapeXml(action)}"`,
    'method="POST"',
  ];
  if (p.recordingEnabled) {
    dialAttrs.push(
      'record="record-from-answer-dual"',
      `recordingStatusCallback="${escapeXml(recordingCb)}"`,
      `recordingStatusCallbackEvent="${RECORDING_EVENTS}"`,
      'recordingStatusCallbackMethod="POST"'
    );
  }

  const numberAttrs = [
    `statusCallback="${escapeXml(statusCb)}"`,
    `statusCallbackEvent="${STATUS_EVENTS}"`,
    'statusCallbackMethod="POST"',
  ];
  if (p.recordingEnabled) numberAttrs.push(`url="${escapeXml(whisper)}"`, 'method="POST"');
  if (p.machineDetection) numberAttrs.push('machineDetection="Enable"');

  parts.push(`  <Dial ${dialAttrs.join(' ')}>`);
  parts.push(`    <Number ${numberAttrs.join(' ')}>${escapeXml(p.to)}</Number>`);
  parts.push('  </Dial>');
  return wrap(parts);
}

export interface InboundTwimlParams {
  origin: string;
  callId: string;
  /** Número que llama (se usa como callerId hacia el <Client>). */
  from: string;
  /** Número llamado (fallback de callerId si la llamada es anónima). */
  calledNumber?: string | null;
  identities: string[];
  recordingEnabled: boolean;
  consentMessage: string;
  ringTimeoutSeconds: number;
  greeting?: string | null;
  /**
   * N-4 (Ley 1581): URL a la que Twilio vuelve cuando el `<Say>` del aviso de
   * grabación YA se ha reproducido. Con ella, el aviso viaja en su PROPIO
   * documento TwiML y el consentimiento solo se registra en la segunda pasada;
   * `null` significa "el aviso ya sonó" (o no hay grabación) y devuelve el
   * `<Dial>`.
   */
  consentRedirectUrl?: string | null;
  /**
   * `true` en la SEGUNDA pasada del flujo de dos documentos. El saludo ya se
   * dijo en la primera (junto al aviso), así que repetirlo aquí se lo haría oír
   * dos veces al cliente. Con una sola pasada (sin grabación) queda `false` y el
   * saludo se emite normalmente.
   */
  announced?: boolean;
}

/** TwiML entrante (§4.5.4): <Say consent/> + <Dial><Client>identity</Client>…</Dial>. */
export function buildInboundTwiml(p: InboundTwimlParams): string {
  const parts: string[] = [];
  const ids = p.identities.slice(0, MAX_CLIENTS_PER_DIAL);
  // El saludo pertenece a la PRIMERA pasada. En la segunda ya sonó (A-5).
  const greeting = p.announced ? null : p.greeting;
  if (ids.length === 0) {
    if (greeting) parts.push(say(greeting));
    parts.push(say('En este momento no hay agentes disponibles. Por favor intente más tarde.'));
    parts.push('  <Hangup/>');
    return wrap(parts);
  }

  // Primera pasada con grabación: solo el aviso. Twilio no pide el `<Redirect>`
  // hasta que el `<Say>` termina de sonar, así que quien cuelgue durante el
  // aviso no deja un consentimiento registrado que nunca existió.
  if (p.consentRedirectUrl && p.recordingEnabled && p.consentMessage) {
    if (greeting) parts.push(say(greeting));
    parts.push(say(p.consentMessage));
    parts.push(`  <Redirect method="POST">${escapeXml(p.consentRedirectUrl)}</Redirect>`);
    return wrap(parts);
  }
  if (greeting) parts.push(say(greeting));

  const action = buildCallbackUrl(p.origin, '/api/voice/dial-complete', { callId: p.callId });
  const statusCb = buildCallbackUrl(p.origin, '/api/voice/status');
  const recordingCb = buildCallbackUrl(p.origin, '/api/voice/recording');

  // Llamada anónima (`From` vacío): Twilio rechaza `callerId=""` (13214/21212).
  // Se cae al número llamado, que siempre es un número válido de la cuenta.
  const inboundCallerId = (p.from || '').trim() || (p.calledNumber || '').trim() || 'anonymous';
  const dialAttrs = [
    `callerId="${escapeXml(inboundCallerId)}"`,
    `timeout="${clampTimeout(p.ringTimeoutSeconds, 25)}"`,
    'answerOnBridge="true"',
    `action="${escapeXml(action)}"`,
    'method="POST"',
  ];
  if (p.recordingEnabled) {
    dialAttrs.push(
      'record="record-from-answer-dual"',
      `recordingStatusCallback="${escapeXml(recordingCb)}"`,
      `recordingStatusCallbackEvent="${RECORDING_EVENTS}"`,
      'recordingStatusCallbackMethod="POST"'
    );
  }
  parts.push(`  <Dial ${dialAttrs.join(' ')}>`);
  for (const id of ids) {
    parts.push(
      `    <Client statusCallback="${escapeXml(statusCb)}" statusCallbackEvent="${STATUS_EVENTS}" statusCallbackMethod="POST">${escapeXml(id)}</Client>`
    );
  }
  parts.push('  </Dial>');
  return wrap(parts);
}

/** Respuesta vacía (status/recording callbacks). */
export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>';

export function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/xml' } });
}
