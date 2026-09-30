/**
 * Tests unitarios para detección de pagos manuales
 * Verifica los criterios de protección contra sobrescritura desde Stripe
 */

import { describe, it, expect } from 'vitest';
import { shouldProtectManualPayment, getProtectionReason } from '../manualPaymentProtection';

describe('shouldProtectManualPayment', () => {
  // Caso 1: metadata.pago_anual.pagado_hasta con fecha futura
  it('debe proteger cuando metadata.pago_anual.pagado_hasta es fecha futura', () => {
    const localSub = {
      current_period_end: '2026-10-15T00:00:00.000Z',
      metadata: {
        pago_anual: {
          pagado_hasta: '2027-09-15',
          fuente: 'pago_manual',
          corregido_por: 'admin',
        },
      },
    };

    const stripeSub = {
      current_period_end: Math.floor(new Date('2026-10-15').getTime() / 1000),
    };

    expect(shouldProtectManualPayment(localSub, stripeSub)).toBe(true);
    
    const reason = getProtectionReason(localSub, stripeSub);
    expect(reason).toContain('metadata.pago_anual.pagado_hasta=2027-09-15');
    expect(reason).toContain('fecha futura');
  });

  // Caso 2: metadata.pago_anual.pagado_hasta con fecha vencida (no proteger)
  it('NO debe proteger cuando metadata.pago_anual.pagado_hasta es fecha vencida', () => {
    const localSub = {
      current_period_end: '2026-10-15T00:00:00.000Z',
      metadata: {
        pago_anual: {
          pagado_hasta: '2025-09-15', // Vencida
          fuente: 'pago_manual',
        },
      },
    };

    const stripeSub = {
      current_period_end: Math.floor(new Date('2026-10-15').getTime() / 1000),
    };

    // Al estar vencida, debe caer al criterio 2 (diferencia de días)
    // En este caso los periodos son iguales, así que NO debe proteger
    expect(shouldProtectManualPayment(localSub, stripeSub)).toBe(false);
  });

  // Caso 3: Sin metadata, periodo local 335 días mayor que Stripe (proteger)
  it('debe proteger cuando periodo local es 335 días mayor sin metadata', () => {
    const localSub = {
      current_period_end: '2027-09-15T00:00:00.000Z', // ~335 días después
      metadata: null,
    };

    const stripeSub = {
      current_period_end: Math.floor(new Date('2026-10-15').getTime() / 1000),
    };

    expect(shouldProtectManualPayment(localSub, stripeSub)).toBe(true);
    
    const reason = getProtectionReason(localSub, stripeSub);
    expect(reason).toContain('2027-09-15');
    expect(reason).toContain('2026-10-15');
    expect(reason).toMatch(/\d{3} días/); // Debe mostrar ~335 días
  });

  // Caso 4: Sin metadata, periodos iguales (no proteger)
  it('NO debe proteger cuando periodos son iguales sin metadata', () => {
    const localSub = {
      current_period_end: '2026-10-15T00:00:00.000Z',
      metadata: null,
    };

    const stripeSub = {
      current_period_end: Math.floor(new Date('2026-10-15').getTime() / 1000),
    };

    expect(shouldProtectManualPayment(localSub, stripeSub)).toBe(false);
  });

  // Caso adicional: Sin suscripción local
  it('NO debe proteger cuando no hay suscripción local', () => {
    const stripeSub = {
      current_period_end: Math.floor(new Date('2026-10-15').getTime() / 1000),
    };

    expect(shouldProtectManualPayment(null, stripeSub)).toBe(false);
  });

  // Caso adicional: metadata.pago_anual presente pero sin pagado_hasta
  it('NO debe proteger cuando metadata.pago_anual existe pero falta pagado_hasta', () => {
    const localSub = {
      current_period_end: '2026-10-15T00:00:00.000Z',
      metadata: {
        pago_anual: {
          fuente: 'pago_manual',
          // pagado_hasta faltante
        },
      },
    };

    const stripeSub = {
      current_period_end: Math.floor(new Date('2026-10-15').getTime() / 1000),
    };

    expect(shouldProtectManualPayment(localSub, stripeSub)).toBe(false);
  });

  // Caso edge: Diferencia exacta de 30 días (no proteger)
  it('NO debe proteger cuando diferencia es exactamente 30 días', () => {
    const localSub = {
      current_period_end: '2026-11-14T00:00:00.000Z', // 30 días después
      metadata: null,
    };

    const stripeSub = {
      current_period_end: Math.floor(new Date('2026-10-15').getTime() / 1000),
    };

    expect(shouldProtectManualPayment(localSub, stripeSub)).toBe(false);
  });

  // Caso edge: Diferencia de 31 días (proteger)
  it('debe proteger cuando diferencia es 31 días', () => {
    const localSub = {
      current_period_end: '2026-11-15T00:00:00.000Z', // 31 días después
      metadata: null,
    };

    const stripeSub = {
      current_period_end: Math.floor(new Date('2026-10-15').getTime() / 1000),
    };

    expect(shouldProtectManualPayment(localSub, stripeSub)).toBe(true);
  });
});
