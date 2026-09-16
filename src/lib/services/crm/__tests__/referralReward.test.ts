/// <reference types="jest" />
/**
 * F12 — recompensa del referido (puro): solo se paga en `converted`, una
 * sola vez, y solo si hay programa. La descripción no cablea moneda.
 */
import { checkRewardPayable, describeReward, rewardPaidPatch, REWARD_TYPES, REWARD_TO } from '../referralReward';

describe('referralReward · checkRewardPayable', () => {
  const base = { status: 'converted' as const, reward_paid: false, program_id: 'p1' };

  it('convertido, no pagado y con programa -> ok', () => {
    expect(checkRewardPayable(base)).toEqual({ ok: true });
  });

  it.each(['pending', 'contacted', 'qualified', 'rejected'] as const)('en %s no se paga (409 NOT_CONVERTED)', (status) => {
    expect(checkRewardPayable({ ...base, status })).toMatchObject({ ok: false, code: 'NOT_CONVERTED', statusCode: 409 });
  });

  it('ya pagada -> 409 ALREADY_PAID (nunca dos veces)', () => {
    expect(checkRewardPayable({ ...base, reward_paid: true })).toMatchObject({ ok: false, code: 'ALREADY_PAID', statusCode: 409 });
  });

  it('sin programa no hay recompensa que pagar -> 409 NO_PROGRAM', () => {
    expect(checkRewardPayable({ ...base, program_id: null })).toMatchObject({ ok: false, code: 'NO_PROGRAM', statusCode: 409 });
  });

  it('rewardPaidPatch fija reward_paid=true y reward_paid_at = ahora (ISO)', () => {
    const now = new Date('2026-09-15T14:30:00.000Z');
    expect(rewardPaidPatch(now)).toEqual({ reward_paid: true, reward_paid_at: '2026-09-15T14:30:00.000Z' });
  });
});

describe('referralReward · describeReward', () => {
  it('enumera los CHECK de la BD', () => {
    expect([...REWARD_TYPES]).toEqual(['credit', 'discount', 'cash', 'gift']);
    expect([...REWARD_TO]).toEqual(['referrer', 'referred', 'both']);
  });

  it('sin programa -> null', () => {
    expect(describeReward(null, 'COP')).toBeNull();
  });

  it('descuento es porcentaje, sin moneda', () => {
    const d = describeReward({ reward_type: 'discount', reward_amount: 10, reward_to: 'both' }, 'COP');
    expect(d).toMatchObject({ type: 'Descuento', to: 'Ambos' });
    expect(d?.amount).toBe('10 %');
    expect(d?.amount).not.toMatch(/COP|\$/);
  });

  it('crédito y efectivo llevan la moneda de la organización, nunca una cableada', () => {
    const cop = describeReward({ reward_type: 'cash', reward_amount: 50000, reward_to: 'referrer' }, 'COP');
    const usd = describeReward({ reward_type: 'credit', reward_amount: 25, reward_to: 'referred' }, 'USD');
    expect(cop?.amount).toMatch(/50.?000/);
    expect(cop?.amount).toMatch(/COP|\$/);
    expect(usd?.amount).toMatch(/25/);
    expect(usd?.amount).toMatch(/USD|US\$|\$/);
    expect(cop?.to).toBe('Referidor');
    expect(usd?.to).toBe('Referido');
  });

  it('sin moneda configurada, la cifra va sin símbolo y lo dice', () => {
    const d = describeReward({ reward_type: 'cash', reward_amount: 50000, reward_to: 'referrer' }, null);
    expect(d?.amount).toMatch(/50.?000/);
    expect(d?.amount).not.toMatch(/COP|\$/);
    expect(d?.summary).toMatch(/sin moneda/i);
  });

  it('regalo: sin importe si es 0', () => {
    const d = describeReward({ reward_type: 'gift', reward_amount: 0, reward_to: 'both' }, 'COP');
    expect(d?.type).toBe('Regalo');
    expect(d?.amount).toBe('');
  });

  it('un tipo desconocido no revienta: se muestra tal cual', () => {
    const d = describeReward({ reward_type: 'points', reward_amount: 3, reward_to: 'x' }, 'COP');
    expect(d?.type).toBe('points');
    expect(d?.to).toBe('x');
  });
});
