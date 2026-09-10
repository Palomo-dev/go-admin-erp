/**
 * Asignación de rol (agente / cliente) a los segmentos de una transcripción.
 *
 * Regla por canal (D1): en una grabación dual de Twilio el canal 0 es la
 * pierna que ORIGINÓ la llamada. Outbound (browser/bridge/ai_agent/manual):
 * canal 0 = agente. Inbound: canal 0 = cliente.
 *
 * Métodos, en orden de preferencia:
 *  1. `channel`  : el STT devolvió `channel_index` por segmento (Scribe con
 *                  `use_multi_channel`, ver stt/elevenLabsScribe.ts). Determinista.
 *  2. `heuristic`: sin canal (mezcla estéreo transcrita diarizada, o mono).
 *                  El hablante de la primera frase es el agente en outbound
 *                  (saluda quien llama) y el cliente en inbound (contesta el
 *                  agente... salvo IVR: por eso en inbound se toma el primer
 *                  hablante como cliente solo si hay ≥2 hablantes; ver abajo).
 *  3. `single`   : un solo hablante (buzón, nota de voz, llamada manual mono).
 *
 * Limitación documentada (FASE-04 §4.5): el plan proponía separar canales con
 * `ffmpeg-static` + `silencedetect`. Ese paquete NO está instalado y no se
 * instala aquí; en su lugar la separación por canal se delega al proveedor
 * (Scribe multicanal) y se activa con `provider_configs.stt.settings.dual_transcribe`
 * (default true cuando `call_recordings.channels = '2'`). Gemini/OpenAI no
 * informan canal → heurística.
 */

import type { TranscriptSegment } from './stt/types';

export type SpeakerRole = 'agent' | 'customer' | 'unknown';
export type RoleMethod = 'channel' | 'heuristic' | 'single';

export interface CallForRoles {
  direction: 'inbound' | 'outbound' | string;
  mode?: string | null;
}

export interface ChannelRoleMap {
  /** Canal → rol. */
  byChannel: Record<'0' | '1', SpeakerRole>;
  /** Etiqueta de hablante → rol. */
  bySpeaker: Record<string, SpeakerRole>;
  method: RoleMethod;
  /** Confianza indicativa del mapeo (1 por canal, 0.6 heurística, 0.5 single). */
  confidence: number;
}

export type RoledSegment = TranscriptSegment & { speaker_role: SpeakerRole };

/** Canal 0 = quien originó la llamada. */
export function channelRoleMap(call: CallForRoles): Record<'0' | '1', SpeakerRole> {
  return call.direction === 'inbound'
    ? { '0': 'customer', '1': 'agent' }
    : { '0': 'agent', '1': 'customer' };
}

function other(role: SpeakerRole): SpeakerRole {
  return role === 'agent' ? 'customer' : role === 'customer' ? 'agent' : 'unknown';
}

/**
 * Construye el mapa de roles a partir de los segmentos y la llamada.
 */
export function buildRoleMap(segments: TranscriptSegment[], call: CallForRoles): ChannelRoleMap {
  const byChannel = channelRoleMap(call);
  const speakers = Array.from(new Set(segments.map((s) => s.speaker_label)));
  const bySpeaker: Record<string, SpeakerRole> = {};

  // 1. Por canal: todos (o casi todos) los segmentos traen channel_index.
  const withChannel = segments.filter((s) => s.channel_index === 0 || s.channel_index === 1);
  if (segments.length > 0 && withChannel.length >= Math.ceil(segments.length * 0.9)) {
    for (const sp of speakers) {
      const own = segments.filter((s) => s.speaker_label === sp);
      const c0 = own.filter((s) => s.channel_index === 0).length;
      const c1 = own.filter((s) => s.channel_index === 1).length;
      bySpeaker[sp] = c0 === c1 ? 'unknown' : c0 > c1 ? byChannel['0'] : byChannel['1'];
    }
    return { byChannel, bySpeaker, method: 'channel', confidence: 1 };
  }

  // 3. Un solo hablante.
  if (speakers.length <= 1) {
    const sp = speakers[0];
    // Outbound mono (nota/llamada manual grabada por el vendedor) → agente;
    // inbound con un solo hablante suele ser buzón/cliente → customer.
    if (sp) bySpeaker[sp] = call.direction === 'inbound' ? 'customer' : 'agent';
    return { byChannel, bySpeaker, method: 'single', confidence: 0.5 };
  }

  // 2. Heurística: quien habla primero.
  const ordered = [...segments].sort((a, b) => a.start_ms - b.start_ms);
  const firstSpeaker = ordered[0].speaker_label;
  const firstRole: SpeakerRole = call.direction === 'inbound' ? 'customer' : 'agent';
  bySpeaker[firstSpeaker] = firstRole;
  // El segundo hablante por tiempo de habla toma el rol opuesto; el resto 'unknown'.
  const talk = new Map<string, number>();
  for (const s of segments) talk.set(s.speaker_label, (talk.get(s.speaker_label) ?? 0) + Math.max(0, s.end_ms - s.start_ms));
  const rest = speakers.filter((sp) => sp !== firstSpeaker).sort((a, b) => (talk.get(b) ?? 0) - (talk.get(a) ?? 0));
  rest.forEach((sp, i) => {
    bySpeaker[sp] = i === 0 ? other(firstRole) : 'unknown';
  });
  return { byChannel, bySpeaker, method: 'heuristic', confidence: 0.6 };
}

/** Aplica el mapa a cada segmento (`speaker_role`). */
export function assignSpeakerRoles(
  segments: TranscriptSegment[],
  call: CallForRoles,
): { segments: RoledSegment[]; map: ChannelRoleMap } {
  const map = buildRoleMap(segments, call);
  const out: RoledSegment[] = segments.map((s) => {
    let role: SpeakerRole | undefined;
    if (map.method === 'channel' && (s.channel_index === 0 || s.channel_index === 1)) {
      role = map.byChannel[String(s.channel_index) as '0' | '1'];
    }
    role = role ?? map.bySpeaker[s.speaker_label] ?? 'unknown';
    return { ...s, speaker_role: role };
  });
  return { segments: out, map };
}

/** Etiqueta legible para UI/LLM. */
export function roleLabel(role: SpeakerRole | null | undefined): 'AGENTE' | 'CLIENTE' | 'DESCONOCIDO' {
  return role === 'agent' ? 'AGENTE' : role === 'customer' ? 'CLIENTE' : 'DESCONOCIDO';
}
