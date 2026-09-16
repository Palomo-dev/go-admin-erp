/// <reference types="jest" />
/**
 * F12 — máquina de estados pura de referidos.
 * pending → contacted → qualified → converted | rejected. `converted` exige
 * `opportunity_id` o `referred_customer_id`; los terminales no se mueven.
 */
import {
  REFERRAL_STATUSES,
  canTransitionReferral,
  checkReferralTransition,
  assertReferralTransition,
  nextReferralStatuses,
  isReferralStatus,
  ReferralTransitionError,
} from '../referralStateMachine';

const NO_LINKS = { opportunity_id: null, referred_customer_id: null };

describe('referralStateMachine · transiciones', () => {
  it('conoce exactamente los cinco estados del CHECK de la BD', () => {
    expect([...REFERRAL_STATUSES]).toEqual(['pending', 'contacted', 'qualified', 'converted', 'rejected']);
    expect(isReferralStatus('qualified')).toBe(true);
    expect(isReferralStatus('won')).toBe(false);
  });

  it.each([
    ['pending', 'contacted', true],
    ['contacted', 'qualified', true],
    ['qualified', 'converted', true],
    ['pending', 'rejected', true],
    ['contacted', 'rejected', true],
    ['qualified', 'rejected', true],
    ['pending', 'qualified', false],
    ['pending', 'converted', false],
    ['contacted', 'converted', false],
    ['contacted', 'pending', false],
    ['qualified', 'contacted', false],
    ['converted', 'rejected', false],
    ['converted', 'qualified', false],
    ['rejected', 'pending', false],
    ['rejected', 'contacted', false],
    ['pending', 'pending', false],
  ])('%s -> %s = %s', (from, to, expected) => {
    expect(canTransitionReferral(from as never, to as never)).toBe(expected);
  });

  it('lista los siguientes estados posibles (terminales: ninguno)', () => {
    expect(nextReferralStatuses('pending')).toEqual(['contacted', 'rejected']);
    expect(nextReferralStatuses('qualified')).toEqual(['converted', 'rejected']);
    expect(nextReferralStatuses('converted')).toEqual([]);
    expect(nextReferralStatuses('rejected')).toEqual([]);
  });
});

describe('referralStateMachine · checkReferralTransition', () => {
  it('rechaza un estado destino desconocido con 400', () => {
    const r = checkReferralTransition('pending', 'won', NO_LINKS);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_STATUS', statusCode: 400 });
  });

  it('rechaza un estado origen corrupto (la fila no está en un estado conocido)', () => {
    const r = checkReferralTransition('???', 'contacted', NO_LINKS);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_STATUS' });
  });

  it('una transición no permitida es 409 INVALID_TRANSITION', () => {
    const r = checkReferralTransition('pending', 'converted', { opportunity_id: 'o1', referred_customer_id: null });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_TRANSITION', statusCode: 409 });
  });

  it('converted sin oportunidad ni cliente referido es 409 CONVERSION_REQUIRES_LINK', () => {
    const r = checkReferralTransition('qualified', 'converted', NO_LINKS);
    expect(r).toMatchObject({ ok: false, code: 'CONVERSION_REQUIRES_LINK', statusCode: 409 });
  });

  it('converted con cliente referido (sin oportunidad) es válido', () => {
    expect(checkReferralTransition('qualified', 'converted', { opportunity_id: null, referred_customer_id: 'c1' })).toEqual({ ok: true });
  });

  it('converted con oportunidad (sin cliente) es válido', () => {
    expect(checkReferralTransition('qualified', 'converted', { opportunity_id: 'o1', referred_customer_id: null })).toEqual({ ok: true });
  });

  it('una cadena vacía no cuenta como enlace', () => {
    const r = checkReferralTransition('qualified', 'converted', { opportunity_id: '', referred_customer_id: '   ' });
    expect(r).toMatchObject({ ok: false, code: 'CONVERSION_REQUIRES_LINK' });
  });

  it('assertReferralTransition lanza ReferralTransitionError con statusCode', () => {
    expect(() => assertReferralTransition('converted', 'pending', NO_LINKS)).toThrow(ReferralTransitionError);
    try {
      assertReferralTransition('converted', 'pending', NO_LINKS);
    } catch (e) {
      expect((e as ReferralTransitionError).statusCode).toBe(409);
      expect((e as ReferralTransitionError).code).toBe('INVALID_TRANSITION');
    }
    expect(() => assertReferralTransition('pending', 'contacted', NO_LINKS)).not.toThrow();
  });
});
