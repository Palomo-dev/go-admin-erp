import {
  MedioDePagoAjenoError,
  asegurarMedioEnCliente,
  cerrarConfirmacionPendiente,
  fijarMedioEnSuscripcion,
  medioParaLaSuscripcion,
  parametrosSetupIntent,
  parametrosSuscripcionEnPrueba,
  resolverMedioDeLaPrueba,
} from '../medioDePagoSuscripcion';

const meta = { organizationId: '1', planCode: 'pro', billingPeriod: 'monthly', usedTrial: 'true' };

describe('parametrosSuscripcionEnPrueba', () => {
  it('con tarjeta deja el medio en la suscripción y no abre otra confirmación', () => {
    const params = parametrosSuscripcionEnPrueba({
      customerId: 'cus_1',
      priceId: 'price_1',
      trialDays: 15,
      paymentMethodId: 'pm_1',
      metadata: meta,
    });
    expect(params.default_payment_method).toBe('pm_1');
    expect(params.payment_behavior).toBeUndefined();
    expect(params.payment_settings).toEqual({ save_default_payment_method: 'on_subscription' });
    expect(params.trial_period_days).toBe(15);
  });

  it('sin tarjeta mantiene el SetupIntent pendiente para agregarla después', () => {
    const params = parametrosSuscripcionEnPrueba({
      customerId: 'cus_1',
      priceId: 'price_1',
      trialDays: 15,
      metadata: meta,
    });
    expect(params.default_payment_method).toBeUndefined();
    expect(params.payment_behavior).toBe('default_incomplete');
  });

  it('pasa el cupón solo cuando hay uno', () => {
    expect(parametrosSuscripcionEnPrueba({
      customerId: 'cus_1',
      priceId: 'price_1',
      trialDays: 15,
      couponId: 'cup_1',
      metadata: meta,
    }).coupon).toBe('cup_1');
  });
});

describe('medioParaLaSuscripcion', () => {
  it('prefiere el id del alta y, si no viene, el predeterminado del cliente', () => {
    const cliente = { invoice_settings: { default_payment_method: 'pm_cliente' } };
    expect(medioParaLaSuscripcion('pm_alta', cliente)).toBe('pm_alta');
    expect(medioParaLaSuscripcion('  ', cliente)).toBe('pm_cliente');
    expect(medioParaLaSuscripcion(undefined, { invoice_settings: { default_payment_method: { id: 'pm_obj' } } })).toBe('pm_obj');
    expect(medioParaLaSuscripcion(undefined, { invoice_settings: { default_payment_method: null } })).toBeUndefined();
  });
});

describe('parametrosSetupIntent', () => {
  it('pide la tarjeta para cobros posteriores', () => {
    expect(parametrosSetupIntent('cus_1', { source: 'signup_flow' })).toEqual({
      customer: 'cus_1',
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { source: 'signup_flow' },
    });
  });
});

describe('resolverMedioDeLaPrueba', () => {
  it('lee la tarjeta que el alta ya dejó en el cliente', async () => {
    const stripe = {
      customers: {
        retrieve: jest.fn(async () => ({ invoice_settings: { default_payment_method: 'pm_guardada' } })),
      },
    };
    await expect(resolverMedioDeLaPrueba(stripe, 'cus_1', undefined)).resolves.toBe('pm_guardada');
    await expect(resolverMedioDeLaPrueba(stripe, 'cus_1', 'pm_body')).resolves.toBe('pm_body');
    expect(stripe.customers.retrieve).toHaveBeenCalledTimes(1);
  });

  it('un cliente borrado no aporta medio', async () => {
    const stripe = { customers: { retrieve: jest.fn(async () => ({ deleted: true })) } };
    await expect(resolverMedioDeLaPrueba(stripe, 'cus_1')).resolves.toBeUndefined();
  });
});

describe('asegurarMedioEnCliente', () => {
  it('adjunta solo si la tarjeta todavía no tiene cliente', async () => {
    const stripe = {
      paymentMethods: {
        retrieve: jest.fn(async () => ({ customer: null })),
        attach: jest.fn(async () => ({})),
      },
      customers: { update: jest.fn(async () => ({})) },
    };
    await asegurarMedioEnCliente(stripe, 'cus_1', 'pm_1');
    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith('pm_1', { customer: 'cus_1' });
    expect(stripe.customers.update).toHaveBeenCalledWith('cus_1', {
      invoice_settings: { default_payment_method: 'pm_1' },
    });
  });

  it('no vuelve a adjuntar la tarjeta que ya es de este cliente', async () => {
    const stripe = {
      paymentMethods: {
        retrieve: jest.fn(async () => ({ customer: 'cus_1' })),
        attach: jest.fn(),
      },
      customers: { update: jest.fn(async () => ({})) },
    };
    await asegurarMedioEnCliente(stripe, 'cus_1', 'pm_1');
    expect(stripe.paymentMethods.attach).not.toHaveBeenCalled();
  });

  it('rechaza la tarjeta de otro cliente', async () => {
    const stripe = {
      paymentMethods: {
        retrieve: jest.fn(async () => ({ customer: 'cus_otro' })),
        attach: jest.fn(),
      },
      customers: { update: jest.fn() },
    };
    await expect(asegurarMedioEnCliente(stripe, 'cus_1', 'pm_ajena')).rejects.toBeInstanceOf(MedioDePagoAjenoError);
    expect(stripe.paymentMethods.attach).not.toHaveBeenCalled();
    expect(stripe.customers.update).not.toHaveBeenCalled();
  });
});

describe('cerrarConfirmacionPendiente', () => {
  it('cancela la confirmación que sigue abierta', async () => {
    const stripe = {
      setupIntents: {
        retrieve: jest.fn(async () => ({ status: 'requires_confirmation' })),
        cancel: jest.fn(async () => ({})),
      },
    };
    await cerrarConfirmacionPendiente(stripe, 'seti_1');
    expect(stripe.setupIntents.cancel).toHaveBeenCalledWith('seti_1');
  });

  it('no cancela una confirmación que ya salió bien', async () => {
    const stripe = {
      setupIntents: {
        retrieve: jest.fn(async () => ({ status: 'succeeded' })),
        cancel: jest.fn(),
      },
    };
    await cerrarConfirmacionPendiente(stripe, 'seti_ok');
    expect(stripe.setupIntents.cancel).not.toHaveBeenCalled();
  });
});

describe('fijarMedioEnSuscripcion', () => {
  it('deja la tarjeta en el cliente y en la suscripción, y cierra la confirmación colgada', async () => {
    const stripe = {
      subscriptions: {
        retrieve: jest.fn(async () => ({ customer: 'cus_1', pending_setup_intent: 'seti_viejo' })),
        update: jest.fn(async () => ({ pending_setup_intent: 'seti_viejo' })),
      },
      paymentMethods: {
        retrieve: jest.fn(async () => ({ customer: 'cus_1' })),
        attach: jest.fn(),
      },
      customers: { update: jest.fn(async () => ({})) },
      setupIntents: {
        retrieve: jest.fn(async () => ({ status: 'requires_confirmation' })),
        cancel: jest.fn(async () => ({})),
      },
    };
    await fijarMedioEnSuscripcion(stripe, 'sub_1', 'pm_1');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      default_payment_method: 'pm_1',
      payment_settings: { save_default_payment_method: 'on_subscription' },
    });
    expect(stripe.customers.update).toHaveBeenCalled();
    expect(stripe.setupIntents.cancel).toHaveBeenCalledWith('seti_viejo');
  });

  it('no cancela nada si la suscripción ya no tiene confirmación pendiente', async () => {
    const stripe = {
      subscriptions: {
        retrieve: jest.fn(async () => ({ customer: 'cus_1', pending_setup_intent: 'seti_viejo' })),
        update: jest.fn(async () => ({ pending_setup_intent: null })),
      },
      paymentMethods: {
        retrieve: jest.fn(async () => ({ customer: 'cus_1' })),
        attach: jest.fn(),
      },
      customers: { update: jest.fn(async () => ({})) },
      setupIntents: { retrieve: jest.fn(), cancel: jest.fn() },
    };
    await fijarMedioEnSuscripcion(stripe, 'sub_1', 'pm_1');
    expect(stripe.setupIntents.cancel).not.toHaveBeenCalled();
  });
});
