import type Stripe from 'stripe';
import {
  SetupIntentAjenoError,
  TarjetaNoConfirmadaError,
  confirmarTarjetaDelPlan,
  conPredeterminada,
  esRecursoInexistente,
  idSetupIntentValido,
  parametrosClienteDePlan,
} from '../vincularTarjetaPlan';

const META = { source: 'plan_page', organizationId: '7' };

function intent(parcial: Record<string, unknown> = {}) {
  return {
    status: 'succeeded',
    customer: 'cus_org',
    payment_method: 'pm_1',
    metadata: META,
    ...parcial,
  };
}

function stripeDe(actual = intent(), clienteSuscripcion: string | { id: string } = 'cus_org') {
  const pago = jest.fn();
  return {
    invoices: { pay: pago },
    setupIntents: {
      retrieve: jest.fn(async (id: string) => (id === 'seti_plan_ok' ? actual : intent({ customer: 'cus_otro' }))),
      cancel: jest.fn(),
    },
    subscriptions: {
      create: jest.fn(),
      retrieve: jest.fn(async () => ({ customer: clienteSuscripcion, pending_setup_intent: null })),
      update: jest.fn(async () => ({ pending_setup_intent: null })),
    },
    paymentMethods: {
      retrieve: jest.fn(async () => ({ customer: 'cus_org' })),
      attach: jest.fn(),
    },
    customers: { update: jest.fn(async () => ({})) },
    pago,
  };
}

const datos = { customerId: 'cus_org', organizationId: 7, setupIntentId: 'seti_plan_ok' };

describe('confirmarTarjetaDelPlan', () => {
  it('con suscripción del mismo cliente fija el medio y no cobra', async () => {
    const stripe = stripeDe();
    const resultado = await confirmarTarjetaDelPlan(stripe as unknown as Stripe, {
      ...datos,
      subscriptionId: 'sub_1',
    });
    expect(resultado).toEqual({ paymentMethodId: 'pm_1' });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      default_payment_method: 'pm_1',
      payment_settings: { save_default_payment_method: 'on_subscription' },
    });
    expect(stripe.customers.update).toHaveBeenCalledWith('cus_org', {
      invoice_settings: { default_payment_method: 'pm_1' },
    });
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(stripe.pago).not.toHaveBeenCalled();
  });

  it('sin suscripción solo deja la tarjeta en el cliente', async () => {
    const stripe = stripeDe();
    await confirmarTarjetaDelPlan(stripe as unknown as Stripe, datos);
    expect(stripe.customers.update).toHaveBeenCalled();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(stripe.pago).not.toHaveBeenCalled();
  });

  it('rechaza un SetupIntent de otro cliente sin tocar el medio', async () => {
    const stripe = stripeDe(intent({ customer: 'cus_otro' }));
    await expect(confirmarTarjetaDelPlan(stripe as unknown as Stripe, { ...datos, subscriptionId: 'sub_1' })).rejects.toBeInstanceOf(
      SetupIntentAjenoError,
    );
    expect(stripe.customers.update).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('rechaza un SetupIntent que no nació en Plan', async () => {
    const stripe = stripeDe(intent({ metadata: { source: 'signup_flow', organizationId: '7' } }));
    await expect(confirmarTarjetaDelPlan(stripe as unknown as Stripe, datos)).rejects.toBeInstanceOf(SetupIntentAjenoError);
    expect(stripe.customers.update).not.toHaveBeenCalled();
  });

  it('rechaza un SetupIntent de otra organización aunque el cliente coincida', async () => {
    const stripe = stripeDe(intent({ metadata: { source: 'plan_page', organizationId: '8' } }));
    await expect(confirmarTarjetaDelPlan(stripe as unknown as Stripe, datos)).rejects.toBeInstanceOf(SetupIntentAjenoError);
  });

  it('no fija una tarjeta que el navegador no confirmó', async () => {
    const stripe = stripeDe(intent({ status: 'requires_payment_method' }));
    await expect(confirmarTarjetaDelPlan(stripe as unknown as Stripe, datos)).rejects.toBeInstanceOf(TarjetaNoConfirmadaError);
    expect(stripe.customers.update).not.toHaveBeenCalled();
  });

  it('si la suscripción es de otro cliente, guarda la tarjeta solo en el de la organización', async () => {
    const stripe = stripeDe(intent(), 'cus_otro');
    await confirmarTarjetaDelPlan(stripe as unknown as Stripe, { ...datos, subscriptionId: 'sub_ajena' });
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(stripe.customers.update).toHaveBeenCalledWith('cus_org', {
      invoice_settings: { default_payment_method: 'pm_1' },
    });
    expect(stripe.pago).not.toHaveBeenCalled();
  });
});

describe('parametrosClienteDePlan', () => {
  it('identifica a la organización y no inventa un correo', () => {
    expect(parametrosClienteDePlan({ organizationId: 7, name: '  Tienda  ', email: '  Ana@Example.com ' })).toEqual({
      name: 'Tienda',
      email: 'ana@example.com',
      metadata: { organizationId: '7', source: 'plan_page', status: 'active' },
    });
    expect(parametrosClienteDePlan({ organizationId: 7, name: 'Tienda', email: 'sin-arroba' }).email).toBeUndefined();
    expect(parametrosClienteDePlan({ organizationId: 7, name: 'Tienda', email: null }).email).toBeUndefined();
  });
});

describe('conPredeterminada', () => {
  it('marca solo el medio que Stripe tiene como predeterminado', () => {
    expect(conPredeterminada([{ id: 'pm_1' }, { id: 'pm_2' }], 'pm_2')).toEqual([
      { id: 'pm_1', isDefault: false },
      { id: 'pm_2', isDefault: true },
    ]);
    expect(conPredeterminada([{ id: 'pm_1' }], null)[0].isDefault).toBe(false);
  });
});

describe('idSetupIntentValido', () => {
  it('acepta el id de Stripe y rechaza cualquier otra cosa', () => {
    expect(idSetupIntentValido('seti_1PlanOkAbcd')).toBe(true);
    expect(idSetupIntentValido('pm_1')).toBe(false);
    expect(idSetupIntentValido('seti_x')).toBe(false);
  });
});

describe('esRecursoInexistente', () => {
  it('reconoce el código de Stripe y nada más', () => {
    expect(esRecursoInexistente({ code: 'resource_missing' })).toBe(true);
    expect(esRecursoInexistente({ code: 'card_declined' })).toBe(false);
    expect(esRecursoInexistente(new Error('resource_missing'))).toBe(false);
  });
});
