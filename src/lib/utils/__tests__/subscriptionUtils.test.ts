import { hasPaidPeriod } from '../subscriptionUtils';

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
});
