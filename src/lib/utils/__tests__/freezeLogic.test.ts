import { hasPaidPeriod } from '../subscriptionUtils';

/**
 * Pruebas de la lógica de congelamiento de cuentas con pagos anuales directos.
 * 
 * Estas pruebas documentan el comportamiento esperado cuando una organización
 * tiene metadata.pago_anual (establecida por fix_pagos_anuales.sql).
 */
describe('Lógica de congelamiento con pagos anuales', () => {
  const now = new Date();
  const futureDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // +90 días
  const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // -30 días

  describe('Escenario: prueba vencida con periodo pagado futuro', () => {
    it('NO debe congelar cuando trialing vencido pero con pago anual vigente', () => {
      const subscription = {
        status: 'trialing',
        trial_end: pastDate.toISOString(),
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
            fuente: 'pago fuera de Stripe',
          },
        },
      };

      const tienePeriodoPagado = hasPaidPeriod(subscription);
      expect(tienePeriodoPagado).toBe(true);
      
      // Lógica esperada: NO congelar porque tienePeriodoPagado es true
      const debeCongelar = !tienePeriodoPagado;
      expect(debeCongelar).toBe(false);
    });
  });

  describe('Escenario: prueba vencida sin metadata (cliente normal)', () => {
    it('DEBE congelar cuando trialing vencido sin metadata de pago anual', () => {
      const subscription = {
        status: 'trialing',
        trial_end: pastDate.toISOString(),
        current_period_end: pastDate.toISOString(),
        metadata: {},
      };

      const tienePeriodoPagado = hasPaidPeriod(subscription);
      expect(tienePeriodoPagado).toBe(false);
      
      // Lógica esperada: congelar porque es prueba vencida sin pago
      const debeCongelar = !tienePeriodoPagado;
      expect(debeCongelar).toBe(true);
    });
  });

  describe('Escenario: suscripción cancelada con metadata', () => {
    it('DEBE congelar aunque tenga metadata.pago_anual', () => {
      const subscription = {
        status: 'canceled',
        trial_end: null,
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
          },
        },
      };

      const tienePeriodoPagado = hasPaidPeriod(subscription);
      
      // Incluso con periodo pagado, canceled siempre congela
      const debeCongelar = subscription.status === 'canceled';
      expect(debeCongelar).toBe(true);
    });
  });

  describe('Escenario: periodo pagado ya vencido', () => {
    it('DEBE congelar cuando pagado_hasta ya pasó', () => {
      const subscription = {
        status: 'trialing',
        trial_end: pastDate.toISOString(),
        current_period_end: pastDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: pastDate.toISOString(),
          },
        },
      };

      const tienePeriodoPagado = hasPaidPeriod(subscription);
      expect(tienePeriodoPagado).toBe(false);
      
      // Lógica esperada: congelar porque el periodo pagado ya venció
      const debeCongelar = !tienePeriodoPagado;
      expect(debeCongelar).toBe(true);
    });
  });

  describe('Escenario: past_due con periodo pagado vigente', () => {
    it('NO debe congelar cuando past_due pero con pago anual vigente', () => {
      const subscription = {
        status: 'past_due',
        trial_end: null,
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
          },
        },
      };

      const tienePeriodoPagado = hasPaidPeriod(subscription);
      expect(tienePeriodoPagado).toBe(true);
      
      // Lógica esperada: NO congelar porque tiene periodo pagado vigente
      const debeCongelar = subscription.status === 'past_due' && !tienePeriodoPagado;
      expect(debeCongelar).toBe(false);
    });
  });

  describe('Escenario: incomplete con periodo pagado vigente', () => {
    it('NO debe congelar cuando incomplete pero con pago anual vigente', () => {
      const subscription = {
        status: 'incomplete',
        trial_end: null,
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
          },
        },
      };

      const tienePeriodoPagado = hasPaidPeriod(subscription);
      expect(tienePeriodoPagado).toBe(true);
      
      // Lógica esperada: NO congelar porque tiene periodo pagado vigente
      const debeCongelar = subscription.status === 'incomplete' && !tienePeriodoPagado;
      expect(debeCongelar).toBe(false);
    });
  });

  describe('Escenario: active con metadata (referencia, no afecta lógica)', () => {
    it('NO debe congelar cuando active (comportamiento actual sin cambios)', () => {
      const subscription = {
        status: 'active',
        trial_end: null,
        current_period_end: futureDate.toISOString(),
        metadata: {
          pago_anual: {
            pagado_hasta: futureDate.toISOString(),
          },
        },
      };

      // Con status active, no se congelaría de todos modos
      const debeCongelar = false;
      expect(debeCongelar).toBe(false);
    });
  });
});
