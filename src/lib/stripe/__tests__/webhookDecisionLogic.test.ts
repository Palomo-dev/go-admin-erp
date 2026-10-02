/**
 * Tests de lógica de decisión del webhook de Stripe
 */

import { describe, it, expect } from 'vitest';
import { decidirAccionDeleted, decidirAccionPaymentFailed } from '../webhookDecisionLogic';
import type { SubscriptionData } from '../manualPaymentProtection';

describe('decidirAccionDeleted', () => {
  const ahora = Math.floor(Date.now() / 1000);
  const evento = {
    stripeSubscriptionId: 'sub_stripe_123',
    stripePeriodEnd: ahora + 86400, // +1 día desde ahora
  };

  it('deleted de cortesía 143 encontrada por fallback → proteger', () => {
    const filaLocal: SubscriptionData & { stripe_subscription_id?: string | null } = {
      current_period_end: '2027-09-29T00:00:00.000Z',
      metadata: {
        cortesia: true, // Cortesía
      },
      stripe_subscription_id: null, // Sin ID de Stripe
    };

    const accion = decidirAccionDeleted(evento, filaLocal, 'organization_id_fallback');

    expect(accion).toBe('proteger');
  });

  it('deleted normal por stripe_subscription_id → cancelar', () => {
    // Usar periodo cercano al de Stripe para no activar protección por diferencia
    const periodoLocal = new Date((ahora + 86400) * 1000).toISOString(); // Mismo que Stripe
    const filaLocal: SubscriptionData & { stripe_subscription_id?: string | null } = {
      current_period_end: periodoLocal,
      metadata: null,
      stripe_subscription_id: 'sub_stripe_123', // Mismo ID
    };

    const accion = decidirAccionDeleted(evento, filaLocal, 'stripe_subscription_id');

    expect(accion).toBe('cancelar');
  });

  it('deleted por fallback sin protección → ignorar', () => {
    // Usar periodo cercano al de Stripe
    const periodoLocal = new Date((ahora + 86400) * 1000).toISOString();
    const filaLocal: SubscriptionData & { stripe_subscription_id?: string | null } = {
      current_period_end: periodoLocal,
      metadata: null,
      stripe_subscription_id: null,
    };

    const accion = decidirAccionDeleted(evento, filaLocal, 'organization_id_fallback');

    expect(accion).toBe('ignorar');
  });

  it('deleted por fallback con otro stripe_subscription_id local → ignorar', () => {
    // Usar periodo cercano al de Stripe
    const periodoLocal = new Date((ahora + 86400) * 1000).toISOString();
    const filaLocal: SubscriptionData & { stripe_subscription_id?: string | null } = {
      current_period_end: periodoLocal,
      metadata: null,
      stripe_subscription_id: 'sub_otro_456', // ID diferente
    };

    const accion = decidirAccionDeleted(evento, filaLocal, 'organization_id_fallback');

    expect(accion).toBe('ignorar');
  });

  it('deleted protegida por pago anual encontrada por stripe_subscription_id → proteger', () => {
    const filaLocal: SubscriptionData & { stripe_subscription_id?: string | null } = {
      current_period_end: '2027-09-15T00:00:00.000Z',
      metadata: {
        pago_anual: {
          pagado_hasta: '2027-09-15', // Fecha futura
          fuente: 'manual',
        },
      },
      stripe_subscription_id: 'sub_stripe_123',
    };

    const accion = decidirAccionDeleted(evento, filaLocal, 'stripe_subscription_id');

    expect(accion).toBe('proteger');
  });

  it('deleted sin fila local → ignorar', () => {
    const accion = decidirAccionDeleted(evento, null, 'stripe_subscription_id');

    expect(accion).toBe('ignorar');
  });
});

describe('decidirAccionPaymentFailed', () => {
  const ahora = Math.floor(Date.now() / 1000);
  const stripePeriodEnd = ahora + 86400; // +1 día

  it('payment_failed de cortesía → ignorar (no notificar)', () => {
    const filaLocal: SubscriptionData = {
      current_period_end: '2027-09-29T00:00:00.000Z',
      metadata: {
        cortesia: true,
      },
    };

    const accion = decidirAccionPaymentFailed(filaLocal, stripePeriodEnd);

    expect(accion).toBe('ignorar');
  });

  it('payment_failed normal → notificar', () => {
    // Usar periodo cercano al de Stripe para no activar protección por diferencia
    const periodoLocal = new Date(stripePeriodEnd * 1000).toISOString();
    const filaLocal: SubscriptionData = {
      current_period_end: periodoLocal,
      metadata: null,
    };

    const accion = decidirAccionPaymentFailed(filaLocal, stripePeriodEnd);

    expect(accion).toBe('notificar');
  });

  it('payment_failed con pago anual vigente → ignorar', () => {
    const filaLocal: SubscriptionData = {
      current_period_end: '2027-09-15T00:00:00.000Z',
      metadata: {
        pago_anual: {
          pagado_hasta: '2027-09-15',
        },
      },
    };

    const accion = decidirAccionPaymentFailed(filaLocal, stripePeriodEnd);

    expect(accion).toBe('ignorar');
  });

  it('payment_failed sin fila local → ignorar', () => {
    const accion = decidirAccionPaymentFailed(null, stripePeriodEnd);

    expect(accion).toBe('ignorar');
  });
});
