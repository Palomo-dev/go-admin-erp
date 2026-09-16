/**
 * Rediseño UX de Secuencias (brief 6.3) — estadísticas de la tarjeta:
 * inscritos activos y tasa de respuesta. Pura: se alimenta de filas.
 */

import { isRepliedEnrollment, responseRate, summarizeEnrollmentRows } from '../sequenceStats';

describe('isRepliedEnrollment', () => {
  it('pausada porque el cliente respondió (fn_pause_sequences_on_reply)', () => {
    expect(isRepliedEnrollment({ status: 'paused', paused_reason: 'customer_replied_whatsapp', exit_reason: null })).toBe(true);
  });
  it('`exit_reason = replied` NO cuenta: ningún código del motor lo escribe (r2 #3)', () => {
    expect(isRepliedEnrollment({ status: 'exited', paused_reason: null, exit_reason: 'replied' })).toBe(false);
  });
  it('desinscrita después de responder sigue contando (el motor conserva paused_reason)', () => {
    expect(isRepliedEnrollment({ status: 'exited', paused_reason: 'customer_replied_sms', exit_reason: 'manual_unenroll' })).toBe(true);
  });
  it('reanudada: el motor borra paused_reason y deja de contar (límite documentado)', () => {
    expect(isRepliedEnrollment({ status: 'active', paused_reason: null, exit_reason: null })).toBe(false);
  });
  it('pausada por otro motivo o completada: no cuenta', () => {
    expect(isRepliedEnrollment({ status: 'paused', paused_reason: 'manual', exit_reason: null })).toBe(false);
    expect(isRepliedEnrollment({ status: 'completed', paused_reason: null, exit_reason: 'all_steps_completed' })).toBe(false);
  });
});

describe('responseRate', () => {
  it('sin inscripciones no hay tasa (null, no 0)', () => {
    expect(responseRate(0, 0)).toBeNull();
  });
  it('fracción redondeada a 2 decimales', () => {
    expect(responseRate(1, 3)).toBe(0.33);
    expect(responseRate(2, 2)).toBe(1);
  });
});

describe('summarizeEnrollmentRows', () => {
  it('agrupa por secuencia con activos, total, respondidas y tasa', () => {
    const out = summarizeEnrollmentRows([
      { sequence_id: 's1', status: 'active', paused_reason: null, exit_reason: null },
      { sequence_id: 's1', status: 'paused', paused_reason: 'customer_replied_email', exit_reason: null },
      { sequence_id: 's1', status: 'completed', paused_reason: null, exit_reason: 'all_steps_completed' },
      { sequence_id: 's1', status: 'exited', paused_reason: 'customer_replied_whatsapp', exit_reason: 'rule_unenroll' },
      { sequence_id: 's2', status: 'active', paused_reason: null, exit_reason: null },
    ]);
    expect(out.s1).toEqual({ active: 2, total: 4, replied: 2, response_rate: 0.5 });
    expect(out.s2).toEqual({ active: 1, total: 1, replied: 0, response_rate: 0 });
  });

  it('una secuencia sin filas no aparece (la UI muestra cero)', () => {
    expect(summarizeEnrollmentRows([])).toEqual({});
  });

  it('«activos» incluye active y paused (siguen inscritos), no completed ni exited', () => {
    const out = summarizeEnrollmentRows([
      { sequence_id: 's1', status: 'paused', paused_reason: 'manual', exit_reason: null },
      { sequence_id: 's1', status: 'exited', paused_reason: null, exit_reason: 'opportunity_won' },
    ]);
    expect(out.s1.active).toBe(1);
  });
});
