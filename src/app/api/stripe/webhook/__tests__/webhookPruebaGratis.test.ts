/**
 * Webhook de Stripe con una prueba gratis vigente (metadata gratis_365_*): eventos firmados con el
 * `constructEvent` real y una base en memoria. Comprueba lo que de verdad se escribe en
 * `subscriptions` y que no se desactivan módulos. Sin red ni base real.
 */
import Stripe from 'stripe';
import { NextRequest } from 'next/server';

const SECRETO = 'whsec_prueba_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_prueba_local';
process.env.STRIPE_WEBHOOK_SECRET = SECRETO;

type Fila = Record<string, unknown>;

/** Base en memoria con lo que usa updateSubscriptionInDatabase (select/eq/or/limit/single, update, not). */
function baseFalsa(tablas: Record<string, Fila[]>) {
  const escrituras: Array<{ tabla: string; op: 'update' | 'insert'; valores: Fila }> = [];
  const cliente = {
    from(tabla: string) {
      const filtros: Array<(f: Fila) => boolean> = [];
      let cambios: Fila | null = null;
      const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((fn) => fn(f)));
      const aplicar = () => {
        const rs = filas();
        if (cambios) {
          escrituras.push({ tabla, op: 'update', valores: cambios });
          rs.forEach((f) => Object.assign(f, cambios));
        }
        return rs;
      };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
        not: () => q,
        limit: () => q,
        or: (expr: string) => {
          const partes = expr.split(',').map((p) => p.split('.eq.'));
          filtros.push((f) => partes.some(([c, v]) => String(f[c]) === v));
          return q;
        },
        update: (c: Fila) => ((cambios = c), q),
        insert: async (fila: Fila) => {
          escrituras.push({ tabla, op: 'insert', valores: fila });
          (tablas[tabla] ??= []).push(fila);
          return { error: null };
        },
        single: async () => ({ data: aplicar()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: aplicar()[0] ?? null, error: null }),
        then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: aplicar(), error: null }).then(ok),
      };
      return q;
    },
  };
  return { cliente, tablas, escrituras };
}

let base = baseFalsa({});
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => base.cliente }));
jest.mock('@/lib/stripe/paymentService', () => ({ processSuccessfulPayment: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require('../route') as typeof import('../route');
const stripe = new Stripe('sk_test_prueba_local');

const TRIAL_LOCAL = '2027-11-16T05:00:00.000Z';
const HOY = Math.floor(Date.parse('2026-11-18T05:00:00.000Z') / 1000);

function filaLocal(o: Fila = {}): Fila {
  return {
    id: 's1',
    organization_id: 120,
    stripe_subscription_id: 'sub_120',
    status: 'trialing',
    trial_end: TRIAL_LOCAL,
    current_period_end: TRIAL_LOCAL,
    metadata: { gratis_365_2026_11_16: { por: 'soporte' } },
    ...o,
  };
}

function evento(tipo: string, sub: Partial<Stripe.Subscription>) {
  return {
    id: `evt_${tipo}`,
    object: 'event',
    type: tipo,
    data: {
      object: {
        id: 'sub_120',
        object: 'subscription',
        customer: 'cus_120',
        status: 'past_due',
        trial_end: HOY,
        current_period_start: HOY - 86400 * 30,
        current_period_end: HOY,
        cancel_at_period_end: false,
        cancel_at: null,
        canceled_at: null,
        livemode: false,
        metadata: { organizationId: '120' },
        ...sub,
      },
    },
  };
}

function peticion(cuerpo: unknown): NextRequest {
  const payload = JSON.stringify(cuerpo);
  const firma = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRETO });
  return new NextRequest('http://localhost/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'content-type': 'application/json', 'stripe-signature': firma } });
}

let avisos: string[] = [];
beforeEach(() => {
  avisos = [];
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation((m: unknown) => void avisos.push(String(m)));
});
afterEach(() => jest.restoreAllMocks());

const moduloActivo = () => [{ organization_id: 120, module_code: 'crm', is_active: true }];

describe('webhook con prueba gratis vigente', () => {
  test('subscription.updated con past_due y fechas de hoy: queda trialing con las fechas locales y el registro', async () => {
    base = baseFalsa({ subscriptions: [filaLocal()], plans: [], organization_modules: moduloActivo(), modules: [] });
    const res = await POST(peticion(evento('customer.subscription.updated', {})));
    expect(res.status).toBe(200);
    const fila = base.tablas.subscriptions[0];
    expect(fila).toMatchObject({ status: 'trialing', trial_end: TRIAL_LOCAL, current_period_end: TRIAL_LOCAL });
    const meta = fila.metadata as Record<string, unknown>;
    expect(meta.gratis_365_2026_11_16).toEqual({ por: 'soporte' });
    expect(meta.webhook_ignorados).toEqual([expect.objectContaining({ action: 'updated', stripe_status: 'past_due', stripe_trial_end: '2026-11-18T05:00:00.000Z' })]);
    expect(avisos.some((a) => a.includes('org 120') && a.includes('sub_120') && a.includes('stripe_status=past_due'))).toBe(true);
  });

  test('subscription.deleted: no se cancela, no se desactivan módulos y queda el registro', async () => {
    base = baseFalsa({ subscriptions: [filaLocal()], organization_modules: moduloActivo(), modules: [] });
    const res = await POST(peticion(evento('customer.subscription.deleted', { status: 'canceled', canceled_at: HOY })));
    expect(res.status).toBe(200);
    expect(base.tablas.subscriptions[0]).toMatchObject({ status: 'trialing', trial_end: TRIAL_LOCAL });
    expect(base.escrituras.filter((e) => e.tabla === 'organization_modules')).toEqual([]);
    expect(base.tablas.organization_modules[0].is_active).toBe(true);
    const meta = base.tablas.subscriptions[0].metadata as Record<string, unknown>;
    expect(meta.webhook_ignorados).toEqual([expect.objectContaining({ action: 'deleted', stripe_status: 'canceled' })]);
    expect(meta.gratis_365_2026_11_16).toBeDefined();
  });

  test('active con un periodo más corto: pasa a active sin acortar fechas', async () => {
    base = baseFalsa({ subscriptions: [filaLocal()], plans: [] });
    await POST(peticion(evento('customer.subscription.updated', { status: 'active', trial_end: null })));
    expect(base.tablas.subscriptions[0]).toMatchObject({ status: 'active', trial_end: TRIAL_LOCAL, current_period_end: TRIAL_LOCAL });
  });
});

describe('webhook sin protección: como siempre', () => {
  test('sin marca: past_due y fechas de Stripe', async () => {
    base = baseFalsa({ subscriptions: [filaLocal({ metadata: {} })], plans: [] });
    await POST(peticion(evento('customer.subscription.updated', {})));
    expect(base.tablas.subscriptions[0]).toMatchObject({ status: 'past_due', trial_end: '2026-11-18T05:00:00.000Z', current_period_end: '2026-11-18T05:00:00.000Z' });
    expect(base.tablas.subscriptions[0].metadata).toEqual({});
    expect(avisos).toEqual([]);
  });

  test('marca con trial_end local vencido: deleted cancela y desactiva módulos', async () => {
    base = baseFalsa({ subscriptions: [filaLocal({ trial_end: '2026-11-01T05:00:00.000Z' })], organization_modules: moduloActivo(), modules: [] });
    await POST(peticion(evento('customer.subscription.deleted', { status: 'canceled', canceled_at: HOY })));
    expect(base.tablas.subscriptions[0].status).toBe('canceled');
    expect(base.escrituras.some((e) => e.tabla === 'organization_modules' && e.valores.is_active === false)).toBe(true);
  });
});
