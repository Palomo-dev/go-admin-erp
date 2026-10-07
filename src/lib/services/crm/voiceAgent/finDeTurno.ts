/**
 * Detección de fin de turno del agente de voz (ConversationRelay).
 *
 * Problema (llamada de prueba de la org 125, 2026-10-07): «A las… a la una de
 * la tarde» llegó partido en DOS prompts. Con Deepgram `nova-3-general` el fin
 * de turno es por silencio (endpointing acústico): una pausa a media frase
 * cierra el turno, el modelo contesta a medias y el resto llega como
 * interrupción.
 *
 * Deepgram **Flux** detecta el fin de turno por contenido: cada pausa recibe
 * una probabilidad de que el turno haya terminado y el prompt solo se cierra
 * al superar `eotThreshold`. «A las…» puntúa bajo y espera; «Sí.» puntúa alto
 * y se cierra enseguida. Por eso puede reaccionar antes y cortar menos.
 * Atributos de `<ConversationRelay>` (doc de Twilio y changelog del
 * 2026-05-06 «Conversation Relay now supports Deepgram Flux»):
 *  - `speechModel="flux"`, con `transcriptionProvider="Deepgram"`.
 *  - Idioma `multi` → Flux Multilingual (`flux-general-multi`, incluye español).
 *  - `eotThreshold` 0.5–0.9 (default 0.8): confianza para cerrar el turno.
 *    Más bajo = responde antes; más alto = espera más.
 *  - `speechTimeout` 600–5000 ms (default `auto`): con Flux es el TECHO de
 *    silencio tras el que se cierra el turno aunque la confianza no llegue.
 *
 * Por defecto NO cambia nada: `nova-3-general`, como hasta hoy. Flux con
 * español no se ha verificado en una llamada real de este sistema, así que
 * se activa explícitamente y se revierte sin desplegar:
 *  1. por agente: `voice_agents.voice_settings.fin_de_turno`
 *     `{ "modelo": "flux", "umbral": 0.7, "silencio_max_ms": 1500 }`;
 *  2. por entorno (Vercel, donde se genera el TwiML): `VOICE_FIN_DE_TURNO=flux`,
 *     `VOICE_EOT_THRESHOLD`, `VOICE_SPEECH_TIMEOUT_MS`.
 * Valores fuera de rango se descartan (no se emite un atributo que Twilio
 * rechazaría y dejaría la llamada sin agente).
 *
 * Módulo puro: sin base ni red.
 */

export type ModeloFinDeTurno = 'nova-3' | 'flux';

/** Umbral por defecto con Flux: algo más ágil que el 0.8 de Twilio. */
export const UMBRAL_FLUX_POR_DEFECTO = 0.7;

export interface AtributosFinDeTurno {
  modelo: ModeloFinDeTurno;
  /** Valor de `speechModel`. */
  speechModel: string;
  /** Valor de `transcriptionLanguage`. */
  transcriptionLanguage: string;
  eotThreshold?: number;
  speechTimeout?: number;
  /** De dónde salió la configuración (para el log). */
  origen: 'agente' | 'entorno' | 'default';
}

function umbralValido(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0.5 && n <= 0.9 ? Math.round(n * 100) / 100 : undefined;
}

function silencioValido(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= 600 && n <= 5000 ? n : undefined;
}

function modeloValido(v: unknown): ModeloFinDeTurno | undefined {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'flux') return 'flux';
  if (s === 'nova-3' || s === 'nova3' || s === 'nova-3-general') return 'nova-3';
  return undefined;
}

/**
 * Atributos de STT y fin de turno para `<ConversationRelay>`.
 * Solo aplica a Deepgram: con otro proveedor devuelve `null` (no se emite nada).
 */
export function resolverFinDeTurno(
  agente: { stt_provider: string | null | undefined; voice_settings?: Record<string, unknown> | null },
  idioma: string,
  env: Record<string, string | undefined> = process.env
): AtributosFinDeTurno | null {
  if ((agente.stt_provider || '').toLowerCase() !== 'deepgram') return null;

  const cfg = (agente.voice_settings?.fin_de_turno ?? null) as Record<string, unknown> | null;
  const modeloAgente = cfg && typeof cfg === 'object' ? modeloValido(cfg.modelo) : undefined;
  const modeloEntorno = modeloValido(env.VOICE_FIN_DE_TURNO);
  const modelo: ModeloFinDeTurno = modeloAgente ?? modeloEntorno ?? 'nova-3';
  const origen: AtributosFinDeTurno['origen'] = modeloAgente ? 'agente' : modeloEntorno ? 'entorno' : 'default';

  if (modelo === 'nova-3') {
    return { modelo, speechModel: 'nova-3-general', transcriptionLanguage: idioma, origen };
  }

  const deAgente = origen === 'agente' && cfg ? cfg : {};
  const umbral = umbralValido(deAgente.umbral) ?? umbralValido(env.VOICE_EOT_THRESHOLD) ?? UMBRAL_FLUX_POR_DEFECTO;
  const silencio = silencioValido(deAgente.silencio_max_ms) ?? silencioValido(env.VOICE_SPEECH_TIMEOUT_MS);
  return {
    modelo,
    speechModel: 'flux',
    // Flux Multilingual: Twilio lo selecciona con el idioma `multi`. La voz
    // (`ttsLanguage`) sigue en el idioma del agente.
    transcriptionLanguage: 'multi',
    eotThreshold: umbral,
    ...(silencio !== undefined ? { speechTimeout: silencio } : {}),
    origen,
  };
}
