/**
 * Respaldo de TTS del agente de voz (ConversationRelay).
 *
 * Por qué existe (llamada de prueba del 2026-09-30, org 125): con
 * `ttsProvider="ElevenLabs"` y una voz de la biblioteca comunitaria de
 * ElevenLabs, Twilio no pudo sintetizar NI el saludo (`welcomeGreeting`, texto
 * fijo que no pasa por el modelo) y mandó por el WebSocket
 * `{"type":"error","description":"Error converting tokens to speech, code: 64111, …"}`.
 * El cliente oyó silencio. ConversationRelay no cambia de proveedor solo: si la
 * voz configurada falla, la llamada se queda muda hasta colgar.
 *
 * Mecanismo documentado por Twilio que se usa aquí:
 *  1. En el TwiML, un `<Language code="es-US" ttsProvider="Google" voice="…"/>`
 *     hijo de `<ConversationRelay>` declara una segunda configuración de TTS.
 *  2. Ante el primer error de TTS, el ws-server manda
 *     `{"type":"language","ttsLanguage":"es-US"}`, que cambia el TTS de las
 *     síntesis SIGUIENTES a esa configuración (la transcripción no se toca), y
 *     reenvía la frase que no sonó.
 *
 * El respaldo sale de configuración (`VOICE_AGENT_TTS_FALLBACK_*`, ver
 * `.env.example`); los valores por defecto son una voz de Google en español
 * que la documentación de ConversationRelay lista. Con
 * `VOICE_AGENT_TTS_FALLBACK_PROVIDER=off` no se declara respaldo.
 *
 * Este archivo lo importan el TwiML (Next, Vercel) y el ws-server (Railway):
 * no puede importar nada de la web.
 */

export type TtsProvider = 'ElevenLabs' | 'Google' | 'Amazon';

export interface TtsFallbackConfig {
  /** Código del `<Language>` de respaldo (y valor de `ttsLanguage` al cambiar). */
  code: string;
  ttsProvider: TtsProvider;
  /** `null` = la voz por defecto del proveedor para ese idioma. */
  voice: string | null;
}

/** Defaults: voz de Google es-US que la guía «Picking a voice» de ConversationRelay lista. */
export const DEFAULT_TTS_FALLBACK: TtsFallbackConfig = {
  code: 'es-US',
  ttsProvider: 'Google',
  voice: 'es-US-Journey-D',
};

/** Nombre del `<Parameter>` con el que el TwiML le dice al ws-server que hay respaldo. */
export const TTS_FALLBACK_PARAM = 'ttsFallbackLanguage';

function parseProvider(raw: string | undefined): TtsProvider | 'off' | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case '':
      return null;
    case 'off':
    case 'none':
    case 'false':
      return 'off';
    case 'google':
      return 'Google';
    case 'amazon':
      return 'Amazon';
    case 'elevenlabs':
      return 'ElevenLabs';
    default:
      return null;
  }
}

/**
 * Configuración de respaldo para una llamada, o `null` si no aplica:
 * - desactivado por entorno;
 * - el respaldo es EXACTAMENTE la voz principal (no aporta nada);
 * - el código del respaldo coincide con el idioma principal: un `<Language>`
 *   con el mismo código sustituiría la configuración principal, no la respaldaría.
 */
export function resolveTtsFallback(
  primary: { ttsProvider: TtsProvider; voice: string | null },
  primaryLanguage: string,
  env: Record<string, string | undefined> = process.env
): TtsFallbackConfig | null {
  const provider = parseProvider(env.VOICE_AGENT_TTS_FALLBACK_PROVIDER);
  if (provider === 'off') return null;

  // Variable vacía = no definida (así se copian de `.env.example`).
  const voiceEnv = env.VOICE_AGENT_TTS_FALLBACK_VOICE?.trim();
  const cfg: TtsFallbackConfig = {
    code: env.VOICE_AGENT_TTS_FALLBACK_LANGUAGE?.trim() || DEFAULT_TTS_FALLBACK.code,
    ttsProvider: provider ?? DEFAULT_TTS_FALLBACK.ttsProvider,
    // Sin voz explícita: la del default si el proveedor es el del default; si
    // no, la voz por defecto de ese proveedor (la de Google no le sirve).
    voice:
      voiceEnv ||
      (provider && provider !== DEFAULT_TTS_FALLBACK.ttsProvider ? null : DEFAULT_TTS_FALLBACK.voice),
  };

  if (cfg.code.toLowerCase() === primaryLanguage.trim().toLowerCase()) return null;
  if (cfg.ttsProvider === primary.ttsProvider && (cfg.voice ?? '') === (primary.voice ?? '')) return null;
  return cfg;
}

/**
 * ¿El mensaje `error` de ConversationRelay es un fallo de TTS?
 * 64111 = fallo del servicio del proveedor de TTS; 64112 = fallo de conversión
 * (voz/modelo/parámetros). Twilio los manda como texto en `description`.
 */
export function isTtsError(description: string | null | undefined): boolean {
  if (!description) return false;
  return /tokens to speech|\bcode:\s*6411[12]\b/i.test(description);
}

/** Código de error de Twilio dentro de la descripción (para el log). */
export function twilioErrorCode(description: string | null | undefined): string | null {
  return description?.match(/\bcode:\s*(\d{5})\b/)?.[1] ?? null;
}

export interface TtsSwitch {
  /** Mensaje a enviar por el WebSocket para cambiar el TTS. */
  switchMessage: { type: 'language'; ttsLanguage: string };
  /** Texto que no sonó y hay que reenviar ('' si aún no se conoce). */
  resend: string;
  /** `true` si la frase estaba completa (se reenvía con `last: true`). */
  resendIsComplete: boolean;
}

/**
 * Estado del TTS de UNA conexión: qué se ha enviado y si ya se cambió al
 * respaldo. El cambio se hace una sola vez: si el respaldo también falla, se
 * registra y no se entra en bucle.
 */
export class TtsFallbackTracker {
  private switched = false;
  private current = '';
  private lastComplete = '';
  private welcomePending = false;

  constructor(readonly fallbackLanguage: string | null) {}

  get hasSwitched(): boolean {
    return this.switched;
  }

  /** Registra un `text` enviado a Twilio. */
  recordSent(token: string, last: boolean): void {
    this.current += token;
    if (last) {
      if (this.current.trim()) this.lastComplete = this.current;
      this.current = '';
    }
  }

  /**
   * Registra una frase que Twilio dice por su cuenta (`welcomeGreeting`).
   * Si el TTS ya falló antes de conocerla (el error del saludo puede llegar
   * mientras el `setup` aún lee la base), devuelve el texto a reenviar.
   */
  seedSpoken(text: string): string | null {
    if (!this.current && !this.lastComplete) this.lastComplete = text;
    if (this.welcomePending) {
      this.welcomePending = false;
      return text;
    }
    return null;
  }

  /** Primer error de TTS → cambio al respaldo. Después, `null`. */
  onTtsError(): TtsSwitch | null {
    if (!this.fallbackLanguage || this.switched) return null;
    this.switched = true;
    const inProgress = this.current.trim().length > 0;
    const resend = inProgress ? this.current : this.lastComplete;
    if (!resend) this.welcomePending = true;
    return {
      switchMessage: { type: 'language', ttsLanguage: this.fallbackLanguage },
      resend,
      resendIsComplete: !inProgress,
    };
  }
}
