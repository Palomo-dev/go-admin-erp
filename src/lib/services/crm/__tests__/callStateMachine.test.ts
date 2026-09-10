import { applyStatusEvent, applyDialComplete, isTerminalStatus, mapAnsweredBy, defaultOutcomeForStatus, type CallStateSnapshot } from '../callStateMachine';

const now = new Date('2026-09-08T10:00:00.000Z');
const snap = (over: Partial<CallStateSnapshot> = {}): CallStateSnapshot => ({ status: 'dialing', answered_at: null, started_at: '2026-09-08T09:59:50.000Z', metadata: {}, ...over });

describe('callStateMachine (FASE-03 §2.4)', () => {
  test('hijo: initiated → ringing → in-progress → completed con CallDuration', () => {
    const a = applyStatusEvent(snap(), { CallStatus: 'initiated', SequenceNumber: 0 }, 'child', now)!;
    expect(a.status).toBeUndefined();
    const b = applyStatusEvent(snap({ metadata: a.metadata }), { CallStatus: 'ringing', SequenceNumber: 1 }, 'child', now)!;
    expect(b.status).toBe('ringing');
    expect(b.metadata.ringing_at).toBeDefined();
    const c = applyStatusEvent(snap({ status: 'ringing', metadata: b.metadata }), { CallStatus: 'in-progress', SequenceNumber: 2 }, 'child', now)!;
    expect(c.status).toBe('in_progress');
    expect(c.answered_at).toBe(now.toISOString());
    expect(c.ring_seconds).toBe(10);
    const d = applyStatusEvent(snap({ status: 'in_progress', answered_at: c.answered_at!, metadata: c.metadata }), { CallStatus: 'completed', SequenceNumber: 3, CallDuration: '155' }, 'child', now)!;
    expect(d.status).toBe('completed');
    expect(d.duration_seconds).toBe(155);
    expect(d.duration_source).toBe('provider');
    expect(d.ended_at).toBe(now.toISOString());
  });

  test('desorden: SequenceNumber menor o igual se ignora; terminales pegajosos', () => {
    const done = applyStatusEvent(snap({ status: 'in_progress', answered_at: 'x' }), { CallStatus: 'completed', SequenceNumber: 3 }, 'child', now)!;
    expect(done.status).toBe('completed');
    const late = applyStatusEvent(snap({ status: 'completed', answered_at: 'x', metadata: done.metadata }), { CallStatus: 'ringing', SequenceNumber: 1 }, 'child', now);
    expect(late).toBeNull();
    // Mismo seq repetido (reintento de Twilio)
    expect(applyStatusEvent(snap({ status: 'completed', metadata: done.metadata }), { CallStatus: 'completed', SequenceNumber: 3 }, 'child', now)).toBeNull();
    // Terminal sin seq: no degrada
    const noSeq = applyStatusEvent(snap({ status: 'completed', answered_at: 'x' }), { CallStatus: 'ringing' }, 'child', now)!;
    expect(noSeq.status).toBeUndefined();
  });

  test('padre completed sin respuesta → canceled; padre no escribe in_progress si ya hubo respuesta', () => {
    const p = applyStatusEvent(snap({ status: 'ringing' }), { CallStatus: 'completed', SequenceNumber: 1 }, 'parent', now)!;
    expect(p.status).toBe('canceled');
    const q = applyStatusEvent(snap({ status: 'in_progress', answered_at: 'x' }), { CallStatus: 'in-progress', SequenceNumber: 2 }, 'parent', now)!;
    expect(q.status).toBeUndefined();
    // Hijo completed sin answered_at (colgó durante whisper) → completed
    const r = applyStatusEvent(snap({ status: 'ringing' }), { CallStatus: 'completed', SequenceNumber: 5 }, 'child', now)!;
    expect(r.status).toBe('completed');
  });

  test('AnsweredBy machine → voicemail + answered_by; busy/no-answer/failed/canceled', () => {
    const m = applyStatusEvent(snap({ status: 'ringing' }), { CallStatus: 'in-progress', SequenceNumber: 2, AnsweredBy: 'machine_end_beep' }, 'child', now)!;
    expect(m.status).toBe('voicemail');
    expect(m.answered_by).toBe('machine');
    expect(mapAnsweredBy('human')).toBe('human');
    expect(mapAnsweredBy('fax')).toBe('fax');
    expect(mapAnsweredBy('other')).toBe('unknown');
    for (const [tw, db] of [['busy', 'busy'], ['no-answer', 'no_answer'], ['failed', 'failed'], ['canceled', 'canceled']] as const) {
      expect(applyStatusEvent(snap({ status: 'ringing' }), { CallStatus: tw, SequenceNumber: 9, SipResponseCode: '486' }, 'child', now)!.status).toBe(db);
    }
    expect(applyStatusEvent(snap({ status: 'ringing' }), { CallStatus: 'failed', SipResponseCode: '480' }, 'child', now)!.metadata.sip_code).toBe('480');
  });

  test('applyDialComplete mapea DialCallStatus al CHECK, guarda customer_leg_sid y duración', () => {
    const cur = snap({ status: 'in_progress', answered_at: 'x' });
    const c = applyDialComplete(cur, { DialCallStatus: 'completed', DialCallSid: 'CA2', DialCallDuration: '155', DialBridged: 'true' }, now);
    expect(c).toMatchObject({ status: 'completed', duration_seconds: 155, duration_source: 'provider', customer_leg_sid: 'CA2', ended_at: now.toISOString() });
    expect(c.metadata.reason).toBeUndefined();
    expect(applyDialComplete(cur, { DialCallStatus: 'answered' }, now).status).toBe('completed');
    expect(applyDialComplete(cur, { DialCallStatus: 'busy' }, now)).toMatchObject({ status: 'busy', duration_seconds: 0 });
    expect(applyDialComplete(cur, { DialCallStatus: 'no-answer' }, now).status).toBe('no_answer');
    expect(applyDialComplete(cur, { DialCallStatus: 'failed' }, now).status).toBe('failed');
    expect(applyDialComplete(cur, { DialCallStatus: 'canceled' }, now).status).toBe('canceled');
    expect(applyDialComplete(cur, { DialCallStatus: 'weird' }, now).status).toBe('failed');
    // Contestó pero no hubo bridge (colgó durante el consentimiento)
    const hb = applyDialComplete(cur, { DialCallStatus: 'completed', DialBridged: 'false', DialCallDuration: '0' }, now);
    expect(hb.metadata.reason).toBe('hangup_during_consent');
    // voicemail previo (AMD) se conserva
    expect(applyDialComplete(snap({ status: 'voicemail', answered_at: 'x' }), { DialCallStatus: 'completed' }, now).status).toBe('voicemail');
  });

  test('helpers', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('ringing')).toBe(false);
    expect(defaultOutcomeForStatus('completed')).toBe('answered');
    expect(defaultOutcomeForStatus('no_answer')).toBe('no_answer');
    expect(defaultOutcomeForStatus('failed')).toBe('failed');
  });
});
