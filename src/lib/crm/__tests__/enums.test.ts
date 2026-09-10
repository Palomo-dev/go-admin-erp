/// <reference types="jest" />
import { twilioCallStatusToDb, twilioRecordingStatusToDb, CALL_STATUSES, RECORDING_STATUSES } from '../enums';

describe('enums: mapeos Twilio → BD', () => {
  test('todos los CallStatus de Twilio mapean a un valor del CHECK', () => {
    const twilio = ['queued', 'initiated', 'ringing', 'in-progress', 'answered', 'completed', 'busy', 'failed', 'no-answer', 'canceled'];
    for (const s of twilio) {
      expect(CALL_STATUSES).toContain(twilioCallStatusToDb(s));
    }
    expect(twilioCallStatusToDb('queued')).toBe('dialing');
    expect(twilioCallStatusToDb('in-progress')).toBe('in_progress');
    expect(twilioCallStatusToDb('no-answer')).toBe('no_answer');
    expect(twilioCallStatusToDb('whatever')).toBe('failed');
  });

  test('RecordingStatus de Twilio mapea al CHECK de call_recordings', () => {
    for (const s of ['in-progress', 'completed', 'absent', 'failed', 'deleted', 'x']) {
      expect(RECORDING_STATUSES).toContain(twilioRecordingStatusToDb(s));
    }
    expect(twilioRecordingStatusToDb('completed')).toBe('ready');
  });
});
