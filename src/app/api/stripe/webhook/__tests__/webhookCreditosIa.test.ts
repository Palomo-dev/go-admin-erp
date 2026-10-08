/**
 * GO-seguridad 2026-10-08: webhook de Stripe y compra de créditos IA.
 *
 * - La firma se verifica con el `constructEvent` real de Stripe: sin cabecera,
 *   con firma inválida o sin secreto configurado, el webhook responde 400 y no
 *   toca la base (falla cerrado).
 * - Una compra pagada suma sus créditos una vez; el mismo evento entregado dos
 *   veces no vuelve a sumar.
 * - El código nunca escribe `ai_settings`: la suma es del trigger
 *   `trg_aplicar_creditos_compra_ia` (migración 20261008013059). La base falsa
 *   de abajo reproduce ese trigger tal como se ensayó en la base viva: suma al
 *   quedar `completed` sin `credits_applied_at` y pone la marca.
 */
import Stripe from 'stripe';
import { NextRequest } from 'next/server';

const SECRETO = 'whsec_prueba_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_prueba_local';
process.env.STRIPE_WEBHOOK_SECRET = SECRETO;

type Fila = {
  id: string;
  organization_id: number;
  credits_amount: number;
  status: string;
  stripe_checkout_session_id: string | null;
  credits_applied_at: string | null;
  [k: string]: unknown;
};

/** Base en memoria: ai_credit_purchases + saldo, con la semántica del trigger. */
function baseFalsa(filas: Fila[]) {
  const saldo: Record<number, number> = {};
  const escrituras: string[] = [];
  let fallarEscritura = false;

  const trigger = (nueva: Fila, vieja: Fila | null) => {
    nueva.credits_applied_at = vieja ? vieja.credits_applied_at : null;
    if (nueva.status === 'completed' && !nueva.credits_applied_at) {
      saldo[nueva.organization_id] = (saldo[nueva.organization_id] ?? 0) + nueva.credits_amount;
      nueva.credits_applied_at = new Date().toISOString();
    }
  };

  const cliente = {
    from(tabla: string) {
      const filtros: Array<(f: Fila) => boolean> = [];
      let cambios: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => (filtros.push((f) => f[col] === val), q),
        is: (col: string, val: unknown) => (filtros.push((f) => (f[col] ?? null) === val), q),
        update: (c: Record<string, unknown>) => {
          escrituras.push(`${tabla}:update`);
          cambios = c;
          return q;
        },
        insert: async (fila: Record<string, unknown>) => {
          escrituras.push(`${tabla}:insert`);
          if (fallarEscritura) return { error: { code: 'XX000', message: 'caída' } };
          if (filas.some((f) => f.stripe_checkout_session_id && f.stripe_checkout_session_id === fila.stripe_checkout_session_id)) {
            return { error: { code: '23505', message: 'duplicate key' } };
          }
          const nueva = { id: `f${filas.length + 1}`, ...fila } as Fila;
          trigger(nueva, null);
          filas.push(nueva);
          return { error: null };
        },
        maybeSingle: async () => {
          const hallada = filas.filter((f) => filtros.every((fn) => fn(f)));
          if (!cambios) return { data: hallada[0] ?? null, error: null };
          if (fallarEscritura) return { data: null, error: { code: 'XX000', message: 'caída' } };
          for (const f of hallada) {
            const vieja = { ...f };
            Object.assign(f, cambios);
            trigger(f, vieja);
          }
          return { data: hallada[0] ? { id: hallada[0].id } : null, error: null };
        },
      };
      return q;
    },
  };
  return { cliente, saldo, escrituras, filas, fallar: () => (fallarEscritura = true) };
}

let base = baseFalsa([]);
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => base.cliente }));
jest.mock('@/lib/stripe/paymentService', () => ({ processSuccessfulPayment: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require('../route') as typeof import('../route');
const stripe = new Stripe('sk_test_prueba_local');

function eventoCompra(sesion: string, extra: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: `evt_${sesion}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sesion,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        payment_intent: `pi_${sesion}`,
        amount_total: 2000,
        currency: 'usd',
        metadata: { type: 'ai_credit_purchase', organizationId: '120', creditsAmount: '500', unitPriceCents: '4' },
        ...extra,
      },
    },
  };
}

function peticion(cuerpo: string, firma?: string | null): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (firma !== null) headers['stripe-signature'] = firma ?? stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: SECRETO });
  return new NextRequest('http://localhost/api/stripe/webhook', { method: 'POST', body: cuerpo, headers });
}

function pendiente(sesion: string): Fila {
  return { id: 'p1', organization_id: 120, credits_amount: 500, status: 'pending', stripe_checkout_session_id: sesion, credits_applied_at: null };
}

beforeEach(() => {
  base = baseFalsa([]);
  process.env.STRIPE_WEBHOOK_SECRET = SECRETO;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('firma del webhook: falla cerrado', () => {
  test('sin cabecera stripe-signature → 400 y no toca la base', async () => {
    const res = await POST(peticion(JSON.stringify(eventoCompra('cs_1')), null));
    expect(res.status).toBe(400);
    expect(base.escrituras).toEqual([]);
  });

  test('firma inválida → 400 y no toca la base', async () => {
    base = baseFalsa([pendiente('cs_1')]);
    const res = await POST(peticion(JSON.stringify(eventoCompra('cs_1')), 't=1,v1=deadbeef'));
    expect(res.status).toBe(400);
    expect(base.escrituras).toEqual([]);
    expect(base.saldo[120]).toBeUndefined();
  });

  test('cuerpo alterado después de firmar → 400', async () => {
    base = baseFalsa([pendiente('cs_1')]);
    const original = JSON.stringify(eventoCompra('cs_1'));
    const firma = stripe.webhooks.generateTestHeaderString({ payload: original, secret: SECRETO });
    const alterado = original.replace('"500"', '"500000"');
    const res = await POST(peticion(alterado, firma));
    expect(res.status).toBe(400);
    expect(base.saldo[120]).toBeUndefined();
  });

  test('sin STRIPE_WEBHOOK_SECRET configurado → 400 (no procesa "porque no hay secreto")', async () => {
    base = baseFalsa([pendiente('cs_1')]);
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(peticion(JSON.stringify(eventoCompra('cs_1'))));
    expect(res.status).toBe(400);
    expect(base.escrituras).toEqual([]);
  });
});

describe('compra de créditos IA: una sola suma por compra', () => {
  test('la compra pagada suma sus créditos una vez y el código no escribe ai_settings', async () => {
    base = baseFalsa([pendiente('cs_1')]);
    const res = await POST(peticion(JSON.stringify(eventoCompra('cs_1'))));
    expect(res.status).toBe(200);
    expect(base.saldo[120]).toBe(500);
    expect(base.filas[0].status).toBe('completed');
    expect(base.filas[0].stripe_payment_intent_id).toBe('pi_cs_1');
    expect(base.escrituras).toEqual(['ai_credit_purchases:update']);
  });

  test('el mismo evento entregado dos veces no suma dos veces', async () => {
    base = baseFalsa([pendiente('cs_1')]);
    const cuerpo = JSON.stringify(eventoCompra('cs_1'));
    expect((await POST(peticion(cuerpo))).status).toBe(200);
    expect((await POST(peticion(cuerpo))).status).toBe(200);
    expect(base.saldo[120]).toBe(500);
    expect(base.escrituras.filter((e) => e.startsWith('ai_settings'))).toEqual([]);
  });

  test('si no quedó la fila pendiente, la registra completada una vez (reenvío incluido)', async () => {
    const cuerpo = JSON.stringify(eventoCompra('cs_2'));
    await POST(peticion(cuerpo));
    await POST(peticion(cuerpo));
    expect(base.filas).toHaveLength(1);
    expect(base.filas[0]).toMatchObject({ organization_id: 120, credits_amount: 500, status: 'completed', total_price_cents: 2000 });
    expect(base.saldo[120]).toBe(500);
  });

  test('un Checkout aún sin pagar no acredita nada', async () => {
    base = baseFalsa([pendiente('cs_1')]);
    await POST(peticion(JSON.stringify(eventoCompra('cs_1', { payment_status: 'unpaid' }))));
    expect(base.saldo[120]).toBeUndefined();
    expect(base.escrituras).toEqual([]);
  });

  test('la organización de la fila manda: metadata de otra organización no acredita', async () => {
    base = baseFalsa([{ ...pendiente('cs_1'), organization_id: 77 }]);
    await POST(peticion(JSON.stringify(eventoCompra('cs_1'))));
    expect(base.saldo[120]).toBeUndefined();
    expect(base.saldo[77]).toBeUndefined();
  });

  test('si la base falla, responde 500 para que Stripe reintente', async () => {
    base = baseFalsa([pendiente('cs_1')]);
    base.fallar();
    const res = await POST(peticion(JSON.stringify(eventoCompra('cs_1'))));
    expect(res.status).toBe(500);
    expect(base.saldo[120]).toBeUndefined();
  });
});
