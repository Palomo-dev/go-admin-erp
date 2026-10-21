import { esSuscripcionAusente, respuestaDeErrorAlCancelar } from '@/lib/stripe/erroresStripe';
import { exigeClaveLive, modoDeClaveStripe, validarModoClaveStripe } from '@/lib/stripe/modoClave';
import {
  accionAlDesactivar,
  cierreTocoFila,
  parcheSuscripcionAusente,
  suscripcionCobrara,
  tieneMedioDeCobro,
} from '@/lib/stripe/suscripcionAusente';

describe('modo de la clave de Stripe', () => {
  it('producción exige live; el build y un preview no', () => {
    expect(exigeClaveLive({ VERCEL_ENV: 'production', NODE_ENV: 'production' })).toBe(true);
    expect(exigeClaveLive({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(false);
    expect(exigeClaveLive({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })).toBe(false);
    expect(exigeClaveLive({ NODE_ENV: 'test' })).toBe(false);
    expect(modoDeClaveStripe('sk_live_abc')).toBe('live');
    expect(modoDeClaveStripe('sk_test_abc')).toBe('test');
  });

  it('una clave de prueba en producción no arranca', () => {
    expect(() => validarModoClaveStripe('sk_test_abc', true)).toThrow(/no es de live/);
    expect(() => validarModoClaveStripe('sk_live_abc', true)).not.toThrow();
    expect(() => validarModoClaveStripe(undefined, true)).not.toThrow();
  });
});

describe('cancelar cuando el id no está en la cuenta', () => {
  it('resource_missing de la suscripción es éxito; un cupón ausente no olvida el id', () => {
    expect(respuestaDeErrorAlCancelar({ code: 'resource_missing', statusCode: 404, param: 'id', message: 'No such subscription' })).toEqual({
      success: true,
      missingInStripe: true,
    });
    expect(esSuscripcionAusente({ code: 'resource_missing', statusCode: 404, param: 'subscription' })).toBe(true);
    expect(respuestaDeErrorAlCancelar({ raw: { code: 'resource_missing', statusCode: 404 }, message: 'No such subscription' }).success).toBe(true);
    expect(esSuscripcionAusente({ code: 'resource_missing' })).toBe(false);
    expect(esSuscripcionAusente({ code: 'resource_missing', statusCode: 400, param: 'coupon' })).toBe(false);
    expect(respuestaDeErrorAlCancelar(Object.assign(new Error('No such coupon'), { code: 'resource_missing', statusCode: 400, param: 'coupon' }))).toEqual({
      success: false,
      code: 'resource_missing',
      error: 'No such coupon',
    });
    expect(respuestaDeErrorAlCancelar(Object.assign(new Error('tarjeta'), { code: 'card_declined' }))).toEqual({
      success: false,
      code: 'card_declined',
      error: 'tarjeta',
    });
  });

  it('cero filas no cuentan como cierre', () => {
    expect(cierreTocoFila(null, [])).toBe(false);
    expect(cierreTocoFila(null, null)).toBe(false);
    expect(cierreTocoFila({ message: 'falló' }, [{ id: 1 }])).toBe(false);
    expect(cierreTocoFila(null, [{ id: 9 }])).toBe(true);
  });

  it('el parche olvida el id y conserva el metadata', () => {
    const parche = parcheSuscripcionAusente(
      { stripe_subscription_id: 'sub_test', stripe_customer_id: 'cus_test', metadata: { plan: 'pro' } },
      '2026-10-21T00:00:00.000Z',
    );
    expect(parche).toMatchObject({
      status: 'canceled',
      cancel_at_period_end: false,
      stripe_subscription_id: null,
      canceled_at: '2026-10-21T00:00:00.000Z',
      cancel_at: '2026-10-21T00:00:00.000Z',
      metadata: {
        plan: 'pro',
        stripe_missing_live: true,
        stripe_subscription_id_test: 'sub_test',
        stripe_customer_id_test: 'cus_test',
      },
    });
  });
});

describe('qué suscripción bloquea desactivar', () => {
  it('cobra una activa o una prueba con tarjeta; no un id ausente ni una prueba sin medio', () => {
    expect(suscripcionCobrara({ existe: true, status: 'active', tieneMedio: true })).toBe(true);
    expect(suscripcionCobrara({ existe: true, status: 'past_due', tieneMedio: false })).toBe(true);
    expect(suscripcionCobrara({ existe: true, status: 'trialing', tieneMedio: true })).toBe(true);
    expect(suscripcionCobrara({ existe: true, status: 'trialing', tieneMedio: false })).toBe(false);
    expect(suscripcionCobrara({ existe: false, status: '', tieneMedio: false })).toBe(false);
    expect(accionAlDesactivar({ existe: false, status: '', tieneMedio: false })).toBe('ausente');
    expect(accionAlDesactivar({ existe: true, status: 'trialing', tieneMedio: false })).toBe('cancelar_prueba');
    expect(accionAlDesactivar({ existe: true, status: 'active', tieneMedio: true })).toBe('bloquear');
    expect(accionAlDesactivar({ existe: true, status: 'paused', tieneMedio: true })).toBe('bloquear');
    expect(accionAlDesactivar({ existe: true, status: 'incomplete', tieneMedio: false })).toBe('bloquear');
    expect(accionAlDesactivar({ existe: true, status: 'unpaid', tieneMedio: false })).toBe('bloquear');
    expect(suscripcionCobrara({ existe: true, status: 'active', tieneMedio: true, cancelaAlFinal: true })).toBe(false);
    expect(accionAlDesactivar({ existe: true, status: 'active', tieneMedio: true, cancelaAlFinal: true })).toBe('ya_programada');
  });

  it('el medio puede estar en la suscripción o en el cliente', () => {
    expect(tieneMedioDeCobro({ default_payment_method: null }, { invoice_settings: { default_payment_method: 'pm_1' } })).toBe(true);
    expect(tieneMedioDeCobro({ default_payment_method: 'pm_sub' }, null)).toBe(true);
    expect(tieneMedioDeCobro({ default_payment_method: null }, { invoice_settings: { default_payment_method: null } })).toBe(false);
    expect(tieneMedioDeCobro({}, { deleted: true, invoice_settings: { default_payment_method: 'pm_1' } })).toBe(false);
  });
});
