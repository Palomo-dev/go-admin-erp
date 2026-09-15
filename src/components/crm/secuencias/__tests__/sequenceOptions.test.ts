/**
 * Rediseño UX de Secuencias (brief 6.3), ronda 3 — funciones puras de la
 * interfaz que en la ronda 2 no tenían prueba (tester r2 T5–T7) y las que se
 * extrajeron de `EnrollDialog` para poder probarlas sin jsdom.
 */

import {
  activeStepCount,
  enrollBlockReason,
  enrollErrorText,
  enrollWarning,
  enrollmentTitle,
  hoursError,
  joinChannelNames,
  responseSummary,
  stepsCountLabel,
  unsupportedExitConditions,
} from '../sequenceOptions';

describe('responseSummary — tasa de respuesta honesta (T5, r2 #3)', () => {
  it('sin inscripciones: «sin inscritos», con o sin pausa por respuesta', () => {
    expect(responseSummary(undefined, true)).toBe('sin inscritos');
    expect(responseSummary(null, false)).toBe('sin inscritos');
    expect(responseSummary({ replied: 0, total: 0 }, true)).toBe('sin inscritos');
  });
  it('con pausa por respuesta activa, la etiqueta dice QUÉ cuenta: «pausadas por respuesta: 2 de 8»', () => {
    expect(responseSummary({ replied: 2, total: 8 }, true)).toBe('pausadas por respuesta: 2 de 8');
    expect(responseSummary({ replied: 0, total: 3 }, true)).toBe('pausadas por respuesta: 0 de 3');
  });
  it('`pause_on_reply` ausente se trata como activa (default de la BD)', () => {
    expect(responseSummary({ replied: 1, total: 1 }, undefined)).toBe('pausadas por respuesta: 1 de 1');
  });
  it('con «Pausar si el cliente responde» desactivada NO se muestra un cero falso', () => {
    expect(responseSummary({ replied: 0, total: 5 }, false)).toBe('no se registran respuestas');
  });
  it('desactivada pero con respuestas anteriores: se muestran y se avisa de que ya no se registran', () => {
    expect(responseSummary({ replied: 2, total: 5 }, false)).toBe('pausadas por respuesta: 2 de 5 · ya no se registran');
  });
  it('invertir numerador y denominador muere', () => {
    expect(responseSummary({ replied: 2, total: 8 }, true)).not.toContain('8 de 2');
  });
});

describe('enrollmentTitle — nombre visible (T6)', () => {
  it('prefiere la oportunidad, luego el cliente', () => {
    expect(enrollmentTitle({ id: 'e1', opportunity_name: 'Alfa', customer_name: 'Ana' })).toBe('Alfa');
    expect(enrollmentTitle({ id: 'e1', opportunity_name: null, customer_name: 'Ana' })).toBe('Ana');
  });
  it('sin nombres, lleva el id corto (dos «sin nombre» eran indistinguibles)', () => {
    const title = enrollmentTitle({ id: 'abcdef12-3456-7890-abcd-ef1234567890', opportunity_name: null, customer_name: null });
    expect(title).toBe('Oportunidad sin nombre · abcdef12');
  });
});

describe('hoursError — 0–23 como la BD (T7)', () => {
  it.each([0, 1, 23])('%i pasa', (h) => expect(hoursError(h)).toBeNull());
  it.each([24, -1, 1.5, 'abc', NaN])('%p se rechaza con el mensaje del campo', (h) => {
    expect(hoursError(h)).toBe('Entre 0 y 23 horas.');
  });
});

describe('enrollWarning — advertencia por canal extraída de EnrollDialog', () => {
  const email = { channel: 'email' };
  const wa = { channel: 'whatsapp' };
  const task = { channel: 'task' };

  it('sin canales que lleguen a una persona: no hay envío real', () => {
    expect(enrollWarning([task, { channel: 'wait' }], { customer_email: null })).toEqual({
      sendsToCustomer: false,
      channelNames: '',
      needsEmail: false,
      contactNote: '',
    });
  });
  it('nombra los canales reales sin repetir y en orden de aparición', () => {
    const w = enrollWarning([wa, email, wa, task], { customer_email: 'ana@example.com' });
    expect(w.sendsToCustomer).toBe(true);
    expect(w.channelNames).toBe('WhatsApp y Email');
  });
  it('tres canales: «Email, WhatsApp y SMS», no «Email y WhatsApp y SMS» (tester r3)', () => {
    const w = enrollWarning([email, wa, { channel: 'sms' }], { customer_email: 'ana@example.com' });
    expect(w.channelNames).toBe('Email, WhatsApp y SMS');
    expect(w.needsEmail).toBe(true);
    expect(w.contactNote).toBe(' (ana@example.com)');
  });
  it('hay paso de email y la oportunidad no tiene email: avisa de que los correos fallarán', () => {
    expect(enrollWarning([email], { customer_email: null }).contactNote).toBe(' (sin email: los correos fallarán)');
  });
  it('sin email pero sin paso de email: no avisa de nada', () => {
    expect(enrollWarning([wa], { customer_email: null }).contactNote).toBe('');
    expect(enrollWarning([wa], { customer_email: null }).needsEmail).toBe(false);
  });
});

describe('stepsCountLabel — plural correcto en el aria-label de la lista de pasos', () => {
  it('1 paso, 2 pasos', () => {
    expect(stepsCountLabel(1)).toBe('1 paso, empezando por el primero');
    expect(stepsCountLabel(2)).toBe('2 pasos, empezando por el primero');
  });
});

describe('unsupportedExitConditions — condiciones heredadas que el motor no evalúa', () => {
  it('devuelve las que no ofrece el formulario, sin duplicar, aceptando string u objeto', () => {
    expect(unsupportedExitConditions(['won_lost', 'stage_changed', { type: 'replied' }, 'stage_changed', 'opted_out']))
      .toEqual(['stage_changed', 'replied']);
  });
  it('sin heredadas: vacío', () => {
    expect(unsupportedExitConditions(['won_lost'])).toEqual([]);
    expect(unsupportedExitConditions(undefined)).toEqual([]);
  });
});

describe('joinChannelNames — lista en castellano', () => {
  it('0, 1, 2 y 3 elementos', () => {
    expect(joinChannelNames([])).toBe('');
    expect(joinChannelNames(['Email'])).toBe('Email');
    expect(joinChannelNames(['Email', 'WhatsApp'])).toBe('Email y WhatsApp');
    expect(joinChannelNames(['Email', 'WhatsApp', 'SMS'])).toBe('Email, WhatsApp y SMS');
  });
  it('no repite la «y»', () => {
    expect(joinChannelNames(['A', 'B', 'C', 'D'])).toBe('A, B, C y D');
  });
});

describe('activeStepCount — la tarjeta cuenta lo mismo que el preview (solo pasos activos)', () => {
  it('descarta los pasos con is_active=false; sin el campo cuentan (default de la BD)', () => {
    expect(activeStepCount([{ is_active: true }, { is_active: false }, {}])).toBe(2);
    expect(activeStepCount([{ is_active: false }])).toBe(0);
    expect(activeStepCount(undefined)).toBe(0);
  });
});

describe('enrollBlockReason — por qué «Inscribir» está deshabilitado (tester r3: promesa falsa del botón)', () => {
  const step = { is_active: true };
  it('activa y con pasos activos: sin bloqueo', () => {
    expect(enrollBlockReason({ is_active: true, steps: [step] })).toBeNull();
  });
  it('inactiva: `fn_enroll_in_sequence` lanzaría sequence_inactive, así que se dice antes', () => {
    expect(enrollBlockReason({ is_active: false, steps: [step] })).toBe('Activa la secuencia para inscribir.');
  });
  it('sin pasos activos manda sobre inactiva: primero hay que editarla', () => {
    const r = enrollBlockReason({ is_active: false, steps: [{ is_active: false }] });
    expect(r).toMatch(/^Sin pasos/);
    expect(enrollBlockReason({ is_active: true, steps: [] })).toBe(r);
    expect(enrollBlockReason({ is_active: true })).toBe(r);
  });
});

describe('enrollErrorText — códigos de fn_enroll_in_sequence / fn_resume_sequence_enrollment en castellano', () => {
  // Leídos de `pg_proc` (solo lectura) el 2026-09-15: RAISE EXCEPTION y `reason` de las dos RPC.
  const RPC_CODES = [
    'invalid_arguments', 'opportunity_or_customer_required', 'forbidden_org', 'sequence_not_found',
    'sequence_inactive', 'opportunity_not_found', 'customer_not_found', 'already_active',
    'sequence_has_no_active_steps', 'enrollment_not_found', 'not_paused', 'no_pending_steps',
  ];
  it.each(RPC_CODES)('%s se traduce (no se muestra el código en crudo)', (code) => {
    const text = enrollErrorText(code);
    expect(text).not.toBe(code);
    expect(text).not.toMatch(/[a-z]_[a-z]/);
  });
  it('sequence_inactive y no_pending_steps dicen qué hacer', () => {
    expect(enrollErrorText('sequence_inactive')).toBe('La secuencia está inactiva: actívala para inscribir.');
    expect(enrollErrorText('no_pending_steps')).toBe('No quedan pasos pendientes que reanudar.');
  });
  it('acepta el prefijo con el que `enrollInSequence` envuelve el error de la RPC', () => {
    expect(enrollErrorText('enrollInSequence: sequence_inactive')).toBe(enrollErrorText('sequence_inactive'));
  });
  it('un código desconocido se muestra en crudo, nunca vacío', () => {
    expect(enrollErrorText('algo_nuevo')).toBe('algo_nuevo');
    expect(enrollErrorText('')).toBe('');
    expect(enrollErrorText(undefined)).toBe('');
  });
});
