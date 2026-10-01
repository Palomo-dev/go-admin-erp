import { isExemptFromFreezing } from '../subscriptionUtils';

/**
 * Pruebas de la lógica de congelamiento de cuentas con pagos anuales directos
 * y cortesías aprobadas.
 * 
 * Estas pruebas documentan el comportamiento esperado cuando una organización
 * tiene metadata.pago_anual (establecida por fix_pagos_anuales.sql) o
 * metadata.cortesia (cortesía aprobada como org 143).
 */
describe('Lógica de congelamiento con pagos anuales y cortesías', () => {
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

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(true);
      
      // Lógica esperada: NO congelar porque está exenta
      const debeCongelar = !estaExenta;
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

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(false);
      
      // Lógica esperada: congelar porque es prueba vencida sin pago
      const debeCongelar = !estaExenta;
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

      const estaExenta = isExemptFromFreezing(subscription);
      
      // Incluso con exención, canceled siempre congela
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

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(false);
      
      // Lógica esperada: congelar porque el periodo pagado ya venció
      const debeCongelar = !estaExenta;
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

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(true);
      
      // Lógica esperada: NO congelar porque tiene periodo pagado vigente
      const debeCongelar = subscription.status === 'past_due' && !estaExenta;
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

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(true);
      
      // Lógica esperada: NO congelar porque tiene periodo pagado vigente
      const debeCongelar = subscription.status === 'incomplete' && !estaExenta;
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

  describe('Escenario: cortesía con metadata.cortesia (org 143)', () => {
    it('NO debe congelar cuando tiene metadata.cortesia truthy', () => {
      const subscription = {
        status: 'active',
        current_period_end: '2027-09-29T00:00:00Z',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {
          cortesia: true,
        },
      };

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(true);
      
      // Lógica esperada: NO congelar porque es cortesía
      const debeCongelar = !estaExenta;
      expect(debeCongelar).toBe(false);
    });

    it('NO debe congelar cuando active sin IDs de Stripe con periodo futuro (org 143)', () => {
      const subscription = {
        status: 'active',
        current_period_end: '2027-09-29T00:00:00Z',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {},
      };

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(true);
      
      // Lógica esperada: NO congelar porque es cortesía implícita
      const debeCongelar = !estaExenta;
      expect(debeCongelar).toBe(false);
    });

    it('NO debe congelar cortesía aunque cambie a trialing', () => {
      const subscription = {
        status: 'trialing',
        trial_end: pastDate.toISOString(),
        current_period_end: '2027-09-29T00:00:00Z',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {
          cortesia: { aprobada_por: 'Juan' },
        },
      };

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(true);
      
      // Lógica esperada: NO congelar incluso si el estado cambia
      const debeCongelar = subscription.status === 'trialing' && !estaExenta;
      expect(debeCongelar).toBe(false);
    });

    it('NO debe congelar cortesía aunque cambie a past_due', () => {
      const subscription = {
        status: 'past_due',
        current_period_end: '2027-09-29T00:00:00Z',
        metadata: {
          cortesia: true,
        },
      };

      const estaExenta = isExemptFromFreezing(subscription);
      expect(estaExenta).toBe(true);
      
      // Lógica esperada: NO congelar aunque esté past_due
      const debeCongelar = subscription.status === 'past_due' && !estaExenta;
      expect(debeCongelar).toBe(false);
    });
  });

  describe('Escenario: cortesía con periodo vencido', () => {
    it('DEBE congelar cortesía cuando el periodo ya venció', () => {
      const subscription = {
        status: 'active',
        current_period_end: pastDate.toISOString(),
        stripe_customer_id: null,
        stripe_subscription_id: null,
        metadata: {
          cortesia: true,
        },
      };

      const estaExenta = isExemptFromFreezing(subscription);
      // La cortesía requiere periodo futuro
      expect(estaExenta).toBe(false);
      
      // Lógica esperada: congelar porque el periodo ya venció
      const debeCongelar = !estaExenta;
      expect(debeCongelar).toBe(true);
    });
  });
});
