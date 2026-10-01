import { hasPaidPeriod, isCourtesySubscription, isExemptFromFreezing } from '../subscriptionUtils';

describe('subscriptionUtils', () => {
  describe('hasPaidPeriod', () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // +1 año
    const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // -30 días

    it('devuelve true cuando metadata.pago_anual.pagado_hasta y current_period_end son futuros', () => {
      const subscription = {
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
            fuente: 'manual',
          },
        },
      };

      expect(hasPaidPeriod(subscription)).toBe(true);
    });

    it('devuelve false cuando metadata.pago_anual no existe', () => {
      const subscription = {
        current_period_end: futureDate.toISOString(),
        metadata: {},
      };

      expect(hasPaidPeriod(subscription)).toBe(false);
    });

    it('devuelve false cuando metadata.pago_anual.pagado_hasta no existe', () => {
      const subscription = {
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            fuente: 'manual',
          },
        },
      };

      expect(hasPaidPeriod(subscription)).toBe(false);
    });

    it('devuelve false cuando pagado_hasta ya venció', () => {
      const subscription = {
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: pastDate.toISOString(),
          },
        },
      };

      expect(hasPaidPeriod(subscription)).toBe(false);
    });

    it('devuelve false cuando current_period_end ya venció', () => {
      const subscription = {
        current_period_end: pastDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
          },
        },
      };

      expect(hasPaidPeriod(subscription)).toBe(false);
    });

    it('devuelve false cuando ambas fechas ya vencieron', () => {
      const subscription = {
        current_period_end: pastDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: pastDate.toISOString(),
          },
        },
      };

      expect(hasPaidPeriod(subscription)).toBe(false);
    });

    it('devuelve false cuando current_period_end es null', () => {
      const subscription = {
        current_period_end: null,
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
          },
        },
      };

      expect(hasPaidPeriod(subscription)).toBe(false);
    });

    it('devuelve false cuando metadata es null', () => {
      const subscription = {
        current_period_end: futureDate.toISOString(),
        metadata: null,
      };

      expect(hasPaidPeriod(subscription)).toBe(false);
    });

    it('devuelve false cuando la suscripción es null', () => {
      expect(hasPaidPeriod(null as any)).toBe(false);
    });

    it('devuelve false cuando pagado_hasta no es un string válido', () => {
      const subscription = {
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: 123456,
          },
        },
      };

      expect(hasPaidPeriod(subscription as any)).toBe(false);
    });

    it('devuelve false cuando pagado_hasta es una fecha inválida', () => {
      const subscription = {
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: 'fecha-invalida',
          },
        },
      };

      expect(hasPaidPeriod(subscription)).toBe(false);
    });
  });

  describe('isCourtesySubscription', () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // +1 año
    const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // -30 días

    it('devuelve true cuando tiene metadata.cortesia truthy', () => {
      const subscription = {
        status: 'active',
        current_period_end: futureDate.toISOString(),
        metadata: {
          cortesia: true,
        },
      };

      expect(isCourtesySubscription(subscription)).toBe(true);
    });

    it('devuelve true cuando tiene metadata.cortesia como objeto', () => {
      const subscription = {
        status: 'active',
        current_period_end: futureDate.toISOString(),
        metadata: {
          cortesia: { aprobada_por: 'Juan', fecha: '2026-01-01' },
        },
      };

      expect(isCourtesySubscription(subscription)).toBe(true);
    });

    it('devuelve true cuando está active sin IDs de Stripe con periodo futuro (org 143)', () => {
      const subscription = {
        status: 'active',
        current_period_end: '2027-09-29T00:00:00Z',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {},
      };

      expect(isCourtesySubscription(subscription)).toBe(true);
    });

    it('devuelve false cuando está active con IDs de Stripe', () => {
      const subscription = {
        status: 'active',
        current_period_end: futureDate.toISOString(),
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        metadata: {},
      };

      expect(isCourtesySubscription(subscription)).toBe(false);
    });

    it('devuelve false cuando está active sin IDs pero el periodo ya venció', () => {
      const subscription = {
        status: 'active',
        current_period_end: pastDate.toISOString(),
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {},
      };

      expect(isCourtesySubscription(subscription)).toBe(false);
    });

    it('devuelve false cuando NO está active aunque no tenga IDs de Stripe', () => {
      const subscription = {
        status: 'trialing',
        current_period_end: futureDate.toISOString(),
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {},
      };

      expect(isCourtesySubscription(subscription)).toBe(false);
    });

    it('devuelve false cuando metadata.cortesia es falsy pero cumple el caso 2', () => {
      const subscription = {
        status: 'active',
        current_period_end: futureDate.toISOString(),
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {
          cortesia: false,
        },
      };

      // Aunque cortesia sea falsy, cumple el caso 2 (active sin IDs con periodo futuro)
      expect(isCourtesySubscription(subscription)).toBe(true);
    });

    it('devuelve false cuando metadata.cortesia es falsy y NO cumple el caso 2', () => {
      const subscription = {
        status: 'trialing',
        current_period_end: futureDate.toISOString(),
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        metadata: {
          cortesia: false,
        },
      };

      expect(isCourtesySubscription(subscription)).toBe(false);
    });

    it('devuelve false cuando la suscripción es null', () => {
      expect(isCourtesySubscription(null as any)).toBe(false);
    });
  });

  describe('isExemptFromFreezing', () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // +1 año

    it('devuelve true cuando tiene pago anual vigente', () => {
      const subscription = {
        status: 'trialing',
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
          },
        },
      };

      expect(isExemptFromFreezing(subscription)).toBe(true);
    });

    it('devuelve true cuando es cortesía con metadata.cortesia', () => {
      const subscription = {
        status: 'active',
        current_period_end: futureDate.toISOString(),
        metadata: {
          cortesia: true,
        },
      };

      expect(isExemptFromFreezing(subscription)).toBe(true);
    });

    it('devuelve true cuando es cortesía active sin IDs de Stripe (org 143)', () => {
      const subscription = {
        status: 'active',
        current_period_end: '2027-09-29T00:00:00Z',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {},
      };

      expect(isExemptFromFreezing(subscription)).toBe(true);
    });

    it('devuelve false cuando NO cumple ninguna de las condiciones', () => {
      const subscription = {
        status: 'trialing',
        current_period_end: futureDate.toISOString(),
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        metadata: {},
      };

      expect(isExemptFromFreezing(subscription)).toBe(false);
    });
  });
});
