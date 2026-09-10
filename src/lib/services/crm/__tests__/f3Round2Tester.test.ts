/**
 * F3 — batería adversarial del TESTER en la ronda 2.
 *
 * Cubre los vectores NUEVOS que la ronda 2 no probó: terminales pegajosos con
 * cierres contradictorios, buzón seguido de conversación real, cierre anterior a
 * la detección de contestador y el borrado de grabaciones cuando solo una parte
 * del borrado tiene éxito. Varios tests documentan defectos vivos: llevan
 * `DEFECTO:` en el nombre y afirman el comportamiento ACTUAL para que el cambio
 * sea visible cuando se corrija.
 */

jest.mock('@/lib/services/crm/callManagementService', () => ({ updateCallRecording: jest.fn(async () => null) }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyStatusEvent, applyDialComplete, mergeTerminalOutcome, type CallStateSnapshot } from '@/lib/services/crm/callStateMachine';
import { computeSettlement } from '@/lib/services/crm/callCreditsService';
import { deleteRecording } from '@/lib/services/crm/recordingStorageService';
import { updateCallRecording } from '@/lib/services/crm/callManagementService';
import type { CallStatus } from '@/lib/crm/enums';

const mockUpdateRec = updateCallRecording as jest.MockedFunction<typeof updateCallRecording>;

function snap(status: CallStatus, extra: Partial<CallStateSnapshot> = {}): CallStateSnapshot {
  return { status, answered_at: null, started_at: '2026-09-09T00:00:00.000Z', metadata: {}, ...extra };
}

// ─── Terminales pegajosos: vectores nuevos ───────────────────────────────────

describe('terminales pegajosos — cierres contradictorios', () => {
  test('cierre contradictorio sin duración (busy 0s) sobre completed/120: no degrada ni borra', () => {
    const m = mergeTerminalOutcome({
      currentStatus: 'completed', currentDuration: 120, currentAnsweredAt: 'x',
      incomingStatus: 'busy', incomingDuration: 0,
    });
    expect(m.status).toBeUndefined();
    expect(m.duration_seconds).toBeUndefined();
  });

  test('cierre con duración MENOR que la registrada no rebaja la duración', () => {
    const m = mergeTerminalOutcome({
      currentStatus: 'completed', currentDuration: 180, currentAnsweredAt: 'x',
      incomingStatus: 'completed', incomingDuration: 9,
    });
    expect(m.duration_seconds).toBeUndefined();
  });

  test('DEFECTO: la duración solo puede SUBIR y sin tope — un cierre repetido con más segundos re-tarifa hacia arriba', () => {
    const m = mergeTerminalOutcome({
      currentStatus: 'completed', currentDuration: 120, currentAnsweredAt: 'x',
      incomingStatus: 'completed', incomingDuration: 600,
    });
    expect(m.duration_seconds).toBe(600); // 2 min cobrados → 10 min; la conciliación cobra 8 más
    const s = computeSettlement({ durationSeconds: 600, reservedMinutes: 2, mode: 'browser', recordingEnabled: true, unitCosts: { pstn: 0.0377, sdk: 0.004, recording: 0.0025 } });
    expect(s.extraMinutes).toBe(8);
  });

  test('terminal repetido: applyStatusEvent no cambia el estado y solo aporta ended_at/duración', () => {
    const u = applyStatusEvent(snap('completed', { metadata: { last_seq: { child: 3 } } }), { CallStatus: 'completed', CallDuration: '65', SequenceNumber: '9' }, 'child');
    expect(u?.status).toBeUndefined();
    expect(u?.duration_seconds).toBe(65);
    expect(u?.ended_at).toBeTruthy();
  });

  test('SequenceNumber igual o anterior corta el evento aunque sea terminal', () => {
    expect(applyStatusEvent(snap('ringing', { metadata: { last_seq: { child: 5 } } }), { CallStatus: 'completed', SequenceNumber: '5' }, 'child')).toBeNull();
    expect(applyStatusEvent(snap('ringing', { metadata: { last_seq: { child: 5 } } }), { CallStatus: 'completed', SequenceNumber: '2' }, 'child')).toBeNull();
  });

  test('terminal "sin información" se refina a completed solo si el <Dial> demuestra conversación', () => {
    expect(mergeTerminalOutcome({ currentStatus: 'no_answer', currentDuration: 0, currentAnsweredAt: null, incomingStatus: 'completed', incomingDuration: 42 }).status).toBe('completed');
    expect(mergeTerminalOutcome({ currentStatus: 'no_answer', currentDuration: 0, currentAnsweredAt: null, incomingStatus: 'completed', incomingDuration: 0 }).status).toBeUndefined();
  });
});

// ─── Buzón de voz ────────────────────────────────────────────────────────────

describe('buzón de voz — vectores nuevos', () => {
  test('AMD machine_start: voicemail sin ended_at y con awaiting_close', () => {
    const u = applyStatusEvent(snap('ringing'), { CallStatus: 'in-progress', AnsweredBy: 'machine_start' }, 'child');
    expect(u?.status).toBe('voicemail');
    expect(u?.ended_at).toBeUndefined();
    expect((u?.metadata as { awaiting_close?: boolean }).awaiting_close).toBe(true);
  });

  test('DEFECTO: contestador detectado y LUEGO conversación real — el estado se queda en voicemail', () => {
    // Twilio: AMD dice `machine_start`, después una persona descuelga de verdad.
    const u = applyStatusEvent(snap('voicemail', { metadata: { awaiting_close: true } }), { CallStatus: 'in-progress', AnsweredBy: 'human' }, 'child');
    expect(u?.status).toBeUndefined();       // sigue `voicemail`
    expect(u?.answered_by).toBe('human');    // aunque el propio evento dice que contestó una persona
    // y el desenlace del <Dial> tampoco lo corrige:
    const m = mergeTerminalOutcome({ currentStatus: 'voicemail', currentDuration: 240, currentAnsweredAt: 'x', incomingStatus: 'completed', incomingDuration: 240 });
    expect(m.status).toBeUndefined();
    const d = applyDialComplete(snap('voicemail'), { DialCallStatus: 'completed', DialCallDuration: '240' });
    expect(d.status).toBe('voicemail');
  });

  test('DEFECTO: cierre ANTES de la detección — answered_at se fija después de ended_at', () => {
    const ended = new Date('2026-09-09T10:00:30.000Z');
    const late = new Date('2026-09-09T10:00:45.000Z');
    const close = applyStatusEvent(snap('ringing'), { CallStatus: 'completed', CallDuration: '30', SequenceNumber: '3' }, 'child', ended);
    expect(close?.ended_at).toBe(ended.toISOString());
    const amd = applyStatusEvent(
      { status: 'completed', answered_at: null, started_at: '2026-09-09T10:00:00.000Z', metadata: { last_seq: { child: 3 } } },
      { CallStatus: 'in-progress', AnsweredBy: 'machine_start', SequenceNumber: '7' },
      'child',
      late
    );
    expect(amd?.answered_at).toBe(late.toISOString());           // posterior al cierre
    expect(new Date(amd!.answered_at!) > ended).toBe(true);
    expect(amd?.ring_seconds).toBe(45);                          // ring_seconds contaminado
    expect((amd?.metadata as { awaiting_close?: boolean }).awaiting_close).toBeUndefined(); // al menos no reabre
  });

  test('el cierre real tras el buzón aporta duración y limpia awaiting_close', () => {
    const u = applyStatusEvent(snap('voicemail', { metadata: { awaiting_close: true } }), { CallStatus: 'completed', CallDuration: '35' }, 'child');
    expect(u?.duration_seconds).toBe(35);
    expect(u?.ended_at).toBeTruthy();
    expect((u?.metadata as { awaiting_close?: boolean }).awaiting_close).toBe(false);
  });
});

// ─── deleteRecording: éxito parcial ──────────────────────────────────────────

function recSupabase(opts: { storageError?: string | null; onRemove?: () => void }): SupabaseClient {
  return {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({
        data: { storage_path: 'org_5/2026/09/c.mp3', storage_provider: 'supabase', provider_recording_sid: 'RE1', status: 'ready' },
        error: null,
      });
      return q;
    },
    storage: {
      from: () => ({
        remove: async () => {
          opts.onRemove?.();
          return { error: opts.storageError ? { message: opts.storageError } : null };
        },
      }),
    },
  } as unknown as SupabaseClient;
}

describe('deleteRecording — éxito parcial (riesgo nuevo de la ronda 2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('DEFECTO: Storage SÍ borra y el proveedor falla → lanza, y la fila sigue `ready` apuntando a un objeto que ya no existe', async () => {
    let removed = false;
    const sb = recSupabase({ onRemove: () => { removed = true; } });
    const twilio = { recordings: () => ({ remove: async () => { throw new Error('500 Internal Server Error'); } }) };
    await expect(deleteRecording('r1', 5, sb, twilio)).rejects.toThrow(/no se pudo eliminar/i);
    expect(removed).toBe(true);          // el audio YA se borró de Storage…
    expect(mockUpdateRec).not.toHaveBeenCalled(); // …pero la fila queda `ready` (el player dará 404)
  });

  test('404 del proveedor: se considera borrado y la fila pasa a `deleted` (sin huérfanas)', async () => {
    const sb = recSupabase({});
    const twilio = { recordings: () => ({ remove: async () => { throw new Error('Request failed with status code 404'); } }) };
    await expect(deleteRecording('r1', 5, sb, twilio)).resolves.toBeUndefined();
    expect(mockUpdateRec).toHaveBeenCalledWith('r1', 5, { status: 'deleted' }, sb);
  });

  test('"not found" textual del proveedor también cuenta como borrado', async () => {
    const sb = recSupabase({});
    const twilio = { recordings: () => ({ remove: async () => { throw new Error('The requested resource was not found'); } }) };
    await expect(deleteRecording('r1', 5, sb, twilio)).resolves.toBeUndefined();
    expect(mockUpdateRec).toHaveBeenCalled();
  });

  test('sin cliente del proveedor solo se exige el borrado de Storage', async () => {
    const sb = recSupabase({});
    await expect(deleteRecording('r1', 5, sb, null)).resolves.toBeUndefined();
    expect(mockUpdateRec).toHaveBeenCalledWith('r1', 5, { status: 'deleted' }, sb);
  });

  test('DEFECTO: un error PERMANENTE del proveedor (401) deja la fila `ready` para siempre; el lote diario la reintenta sin límite', async () => {
    const sb = recSupabase({});
    const twilio = { recordings: () => ({ remove: async () => { throw new Error('401 Authenticate'); } }) };
    for (let i = 0; i < 3; i++) {
      await expect(deleteRecording('r1', 5, sb, twilio)).rejects.toThrow(/no se pudo eliminar/i);
    }
    expect(mockUpdateRec).not.toHaveBeenCalled();
  });
});
