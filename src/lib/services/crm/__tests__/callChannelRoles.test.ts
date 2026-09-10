/**
 * Roles agente/cliente por canal y heurística (FASE-04 §9.1, D1).
 * Regla: canal 0 = quien originó la llamada (outbound → agente, inbound → cliente).
 */
import { assignSpeakerRoles, buildRoleMap, channelRoleMap, roleLabel } from '../callChannelRoles';
import { mapScribeResponse } from '../stt';
import { scribeMultiChannel, scribeSingleChannel } from './fixtures/sttFixtures';
import type { TranscriptSegment } from '../stt/types';

const seg = (label: string, start: number, end: number, channel: number | null = null, text = 'x'): TranscriptSegment => ({
  speaker_label: label,
  start_ms: start,
  end_ms: end,
  text,
  confidence: null,
  channel_index: channel,
});

describe('channelRoleMap', () => {
  it('outbound: canal 0 agente / canal 1 cliente; inbound al revés', () => {
    expect(channelRoleMap({ direction: 'outbound' })).toEqual({ '0': 'agent', '1': 'customer' });
    expect(channelRoleMap({ direction: 'inbound' })).toEqual({ '0': 'customer', '1': 'agent' });
  });
});

describe('assignSpeakerRoles', () => {
  it('caso 1 — outbound dual (Scribe multicanal): ch0=AGENTE, ch1=CLIENTE, método channel', () => {
    const r = mapScribeResponse(scribeMultiChannel as never, { language: 'spa', durationSeconds: null });
    const { segments, map } = assignSpeakerRoles(r.segments, { direction: 'outbound', mode: 'browser' });
    expect(map.method).toBe('channel');
    expect(map.confidence).toBe(1);
    expect(map.bySpeaker).toEqual({ ch0: 'agent', ch1: 'customer' });
    expect(segments.find((s) => s.text.startsWith('Buenas tardes, le habla Ana'))?.speaker_role).toBe('agent');
    expect(segments.find((s) => s.text.includes('precio es muy alto'))?.speaker_role).toBe('customer');
  });

  it('caso 2 — inbound dual: ch0=CLIENTE (quien llama), ch1=AGENTE', () => {
    const segs = [seg('ch0', 0, 1000, 0, 'Hola, quiero información'), seg('ch1', 1200, 2500, 1, 'Claro, con gusto'), seg('ch0', 2600, 3000, 0, 'Gracias')];
    const { segments, map } = assignSpeakerRoles(segs, { direction: 'inbound', mode: 'inbound' });
    expect(map.method).toBe('channel');
    expect(segments.map((s) => s.speaker_role)).toEqual(['customer', 'agent', 'customer']);
  });

  it('caso 3 — sin canal (mono/Gemini) outbound: quien habla primero es el AGENTE (heurística, confianza 0.6)', () => {
    const segs = [seg('speaker_0', 0, 2000), seg('speaker_1', 2500, 4000), seg('speaker_0', 4200, 5000)];
    const { segments, map } = assignSpeakerRoles(segs, { direction: 'outbound', mode: 'bridge' });
    expect(map.method).toBe('heuristic');
    expect(map.confidence).toBe(0.6);
    expect(map.bySpeaker).toEqual({ speaker_0: 'agent', speaker_1: 'customer' });
    expect(segments.map((s) => s.speaker_role)).toEqual(['agent', 'customer', 'agent']);
  });

  it('caso 4 — sin canal inbound: quien habla primero es el CLIENTE (fixture Scribe single-channel)', () => {
    const r = mapScribeResponse(scribeSingleChannel as never, { language: 'spa', durationSeconds: 8 });
    const { segments, map } = assignSpeakerRoles(r.segments, { direction: 'inbound', mode: 'inbound' });
    expect(map.method).toBe('heuristic');
    expect(map.bySpeaker).toEqual({ speaker_0: 'customer', speaker_1: 'agent' });
    expect(segments[0]).toMatchObject({ speaker_label: 'speaker_0', speaker_role: 'customer' });
    expect(segments[1]).toMatchObject({ speaker_label: 'speaker_1', speaker_role: 'agent' });
    // La misma transcripción como outbound invierte los roles
    const out = assignSpeakerRoles(r.segments, { direction: 'outbound' });
    expect(out.map.bySpeaker).toEqual({ speaker_0: 'agent', speaker_1: 'customer' });
  });

  it('un solo hablante: outbound → agente (nota grabada), inbound → cliente (buzón); método single', () => {
    const one = [seg('speaker_0', 0, 3000)];
    expect(assignSpeakerRoles(one, { direction: 'outbound', mode: 'manual' }).segments[0].speaker_role).toBe('agent');
    const inb = assignSpeakerRoles(one, { direction: 'inbound' });
    expect(inb.segments[0].speaker_role).toBe('customer');
    expect(inb.map.method).toBe('single');
    expect(inb.map.confidence).toBe(0.5);
  });

  it('tres hablantes sin canal: el tercero (menos tiempo de habla) queda unknown', () => {
    const segs = [seg('a', 0, 1000), seg('b', 1000, 5000), seg('c', 5000, 5500)];
    const { map } = assignSpeakerRoles(segs, { direction: 'outbound' });
    expect(map.bySpeaker).toEqual({ a: 'agent', b: 'customer', c: 'unknown' });
  });

  it('canal parcial (< 90 % de segmentos con channel_index) cae a heurística', () => {
    const segs = [seg('s0', 0, 1000, 0), seg('s1', 1000, 2000, null), seg('s0', 2000, 3000, null)];
    expect(buildRoleMap(segs, { direction: 'outbound' }).method).toBe('heuristic');
  });

  it('roleLabel', () => {
    expect(roleLabel('agent')).toBe('AGENTE');
    expect(roleLabel('customer')).toBe('CLIENTE');
    expect(roleLabel(null)).toBe('DESCONOCIDO');
  });
});
