/**
 * Clonar mi voz — guion, consentimiento y validación del flujo (brief UX 6.1).
 *
 * Módulo puro e isomorfo: lo usan el asistente en pasos del navegador y la
 * ruta del servidor que guarda la evidencia en `voices.consent_evidence`.
 *
 * D9 · Ley 1581 de 2012 (Habeas Data) y política de ElevenLabs: solo se clona
 * la voz propia, con consentimiento explícito. Se guarda la huella del texto
 * aceptado (no el texto) y los datos de la muestra (no el audio).
 */

export const CLONE_SCRIPT_VERSION = 'es-1';

/**
 * Guion en español neutro, 60–90 s a ritmo normal (≈150 palabras/min).
 * Cubre ñ, rr, ll, j, ch, z/ce/ci, gue/gui, diptongos, números, preguntas y
 * exclamaciones para que la clonación capte la entonación completa.
 */
export const CLONE_SCRIPT_ES = [
  'Hola, gracias por llamar. Mi nombre aparece en pantalla y hoy quiero contarle, con calma, cómo trabajamos.',
  'Cada mañana revisamos los pedidos, contamos el inventario y seguimos cada correo de los clientes que esperan una respuesta. Nada se queda sin atender.',
  '¿Le parece bien si le explico las opciones? Tenemos tres planes: el básico cuesta 45.000 pesos, el intermedio 120.000 y el completo 250.000 al mes.',
  'Con el plan completo, su equipo recibe un informe cada jueves, un resumen de las ventas de la semana y una guía para mejorar el servicio.',
  'Por cierto, la señora Muñoz nos escribió desde Cartagena: quería saber si el envío llega en tres días o en cinco. Llega en tres, siempre que el pago se registre antes del mediodía.',
  '¡Qué alegría poder ayudarle! Si tiene alguna duda, puede escribirnos, llamarnos o pasar por la oficina: la puerta está abierta de lunes a viernes, y siempre hay chocolate caliente para quien nos visita.',
  'Recuerde: cuidamos cada detalle, respondemos rápido y cumplimos lo que prometemos. Que tenga un excelente día y hasta pronto.',
].join('\n\n');

export const HABEAS_DATA_TEXT =
  'Declaro que la voz que voy a grabar es la mía, o la de una persona de mi equipo que ha dado su ' +
  'consentimiento previo, expreso e informado para que se cree una réplica sintética de su voz con el ' +
  'proveedor ElevenLabs, con el único fin de que los agentes de esta organización la usen en llamadas y ' +
  'mensajes. Conforme a la Ley 1581 de 2012 y sus decretos reglamentarios, sé que la muestra de audio se ' +
  'envía a ElevenLabs para generar la voz y no se conserva en esta plataforma, que puedo retirar el ' +
  'consentimiento y pedir que la voz clonada se elimine en cualquier momento desde esta misma pantalla, y ' +
  'que no está permitido clonar la voz de un tercero sin su autorización.';

/** Duración mínima y máxima (sumada) de las muestras que aceptamos enviar al proveedor. */
export const MIN_SAMPLE_SECONDS = 20;
export const MAX_SAMPLE_SECONDS = 180;
/** Peso máximo por archivo (la ruta lo aplica a cada uno). */
export const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;
/** Muestras por clon: la ruta y el proveedor aceptan hasta 5; más muestras, mejor clon. */
export const MAX_CLONE_SAMPLES = 5;
export const NAME_MIN = 2;
export const NAME_MAX = 60;

/**
 * Formatos que el grabador del navegador intenta, en orden de preferencia.
 * Fuente única (H1 · ronda 3): el `File` conserva el tipo con parámetros
 * (`audio/webm;codecs=opus`) y la lista blanca del servidor lo compara por tipo base.
 */
export const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'] as const;

/** Tipos base que el servidor acepta como muestra (el proveedor admite estos contenedores). */
export const ALLOWED_SAMPLE_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'];

/**
 * Alias que NO son `audio/*` pero llegan con ficheros de audio legítimos.
 * Ronda 4: Chrome etiqueta un `.webm` elegido con el selector de archivos como
 * `video/webm` (el contenedor es el mismo que produce MediaRecorder; el tipo
 * sale de la extensión, no del contenido), así que se acepta SOLO ese alias.
 * `video/mp4`, `video/ogg` y el resto siguen fuera: ahí sí puede haber vídeo.
 */
export const SAMPLE_MIME_ALIASES: Record<string, string> = { 'video/webm': 'audio/webm' };

/** `audio/webm;codecs=opus` → `audio/webm`. Vacío si no hay tipo. */
export function baseMimeType(type: string | null | undefined): string {
  return (type ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * MediaRecorder produce `audio/webm;codecs=opus` (Chrome/Edge) o
 * `audio/ogg;codecs=opus` (Firefox) y el `File` conserva los parámetros, así
 * que se compara el tipo base. Sin tipo, decide el proveedor.
 */
export function isAllowedSampleMime(type: string | null | undefined): boolean {
  const base = baseMimeType(type);
  return base === '' || ALLOWED_SAMPLE_MIME.includes(SAMPLE_MIME_ALIASES[base] ?? base);
}

/**
 * Ronda 3: cuando el servidor pudo medir la muestra, aplica el mismo MIN/MAX
 * que el asistente. `null` si no midió (`client_reported`) o si está en rango.
 */
export function measuredDurationError(measured: number | null): string | null {
  if (measured === null) return null;
  const shown = `${Math.round(measured * 10) / 10} s`;
  if (measured < MIN_SAMPLE_SECONDS) {
    return `La muestra dura ${shown} según el servidor: necesita al menos ${MIN_SAMPLE_SECONDS} segundos. Lee el guion completo.`;
  }
  if (measured > MAX_SAMPLE_SECONDS) {
    return `La muestra dura ${shown} según el servidor: el máximo son ${MAX_SAMPLE_SECONDS} segundos. Vuelve a grabar solo el guion.`;
  }
  return null;
}

export function estimateReadingSeconds(text: string, wordsPerMinute = 150): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.round((words / wordsPerMinute) * 60);
}

export interface CloneSampleInfo {
  durationSeconds: number;
  bytes: number;
}

export interface CloneFlowState {
  consent: boolean;
  sample: CloneSampleInfo | null;
  name: string;
}

/** Varias muestras cuentan juntas: la duración se suma y el peso que se valida es el del archivo mayor. */
export function summarizeSamples(samples: CloneSampleInfo[]): CloneSampleInfo | null {
  if (samples.length === 0) return null;
  return {
    durationSeconds: samples.reduce((acc, s) => acc + s.durationSeconds, 0),
    bytes: samples.reduce((acc, s) => Math.max(acc, s.bytes), 0),
  };
}

/**
 * Errores que impiden avanzar desde el paso dado (1 consentimiento, 2 grabar,
 * 3 escuchar, 4 nombrar). Cada paso arrastra los requisitos de los anteriores:
 * no se puede llegar al final saltándose el consentimiento.
 */
export function validateCloneStep(step: 1 | 2 | 3 | 4, state: CloneFlowState): string[] {
  const errors: string[] = [];
  if (!state.consent) errors.push('Marca la casilla de consentimiento para continuar.');
  if (step >= 2) {
    if (!state.sample) {
      errors.push('Graba el guion (o sube un archivo) antes de continuar.');
    } else if (state.sample.durationSeconds < MIN_SAMPLE_SECONDS) {
      errors.push(`La muestra es muy corta: necesita al menos ${MIN_SAMPLE_SECONDS} segundos. Lee el guion completo.`);
    } else if (state.sample.durationSeconds > MAX_SAMPLE_SECONDS) {
      errors.push(`La muestra es demasiado larga (máximo ${MAX_SAMPLE_SECONDS} segundos). Vuelve a grabar solo el guion.`);
    } else if (state.sample.bytes > MAX_SAMPLE_BYTES) {
      errors.push('La muestra pesa más de 10 MB. Graba de nuevo o usa un archivo más ligero.');
    }
  }
  if (step >= 4) {
    const name = state.name.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      errors.push(`Ponle un nombre a la voz de ${NAME_MIN} a ${NAME_MAX} caracteres.`);
    }
  }
  return errors;
}

// ─── Evidencia de consentimiento ─────────────────────────────────────────────

const CONSENT_AT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CONSENT_AT_MAX_SKEW_MS = 5 * 60 * 1000;

/**
 * R9 · `consent_at` llega del navegador: se acepta solo si es una fecha válida
 * de las últimas 24 h (con 5 min de holgura de reloj); si no, manda el servidor.
 */
export function sanitizeConsentAt(raw: string, nowMs: number): string {
  const t = Date.parse(raw);
  if (Number.isFinite(t) && t <= nowMs + CONSENT_AT_MAX_SKEW_MS && t >= nowMs - CONSENT_AT_MAX_AGE_MS) {
    return new Date(t).toISOString();
  }
  return new Date(nowMs).toISOString();
}

export interface ConsentEvidenceInput {
  acceptedAt: string;
  /** Sello del servidor (R9): cuándo se recibió la muestra. */
  recordedAt?: string | null;
  userId: string | null;
  sample: { durationSeconds: number; bytes: number; mimeType: string };
  /** De dónde sale `duration_seconds`: medida en el servidor o reportada por el cliente. */
  durationSource?: 'server_measured' | 'client_reported';
  userAgent?: string | null;
}

export function buildConsentEvidence(input: ConsentEvidenceInput): Record<string, unknown> {
  return {
    method: 'instant_voice_cloning',
    script_version: CLONE_SCRIPT_VERSION,
    habeas_data_sha256: sha256Hex(HABEAS_DATA_TEXT),
    accepted_at: input.acceptedAt,
    recorded_at: input.recordedAt ?? null,
    accepted_by: input.userId,
    confirmed_in_ui: true,
    sample: {
      duration_seconds: input.sample.durationSeconds,
      bytes: input.sample.bytes,
      mime_type: input.sample.mimeType,
    },
    duration_source: input.durationSource ?? 'client_reported',
    user_agent: input.userAgent ?? null,
  };
}

// SHA-256 puro (sin `node:crypto`) para que el módulo cargue igual en navegador y servidor.
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}
