/**
 * aplicarCheckoutDePlan con una prueba gratis vigente (metadata gratis_365_*): el Checkout no la
 * degrada ni le acorta fechas. Base y Stripe falsos; sin red.
 */
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aplicarCheckoutDePlan } from '../aplicarCheckoutDePlan';

type Fila = Record<string, unknown>;

function baseFalsa(tablas: Record<string, Fila[]>) {
  const cliente = {
    from(tabla: string) {
      const filtros: Array<(f: Fila) => boolean> = [];
      let cambios: Fila | null = null;
      const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((fn) => fn(f)));
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filtros.push((f) => f[c] === v);
          if (cambios) {
            filas().forEach((f) => Object.assign(f, cambios));
            return Promise.resolve({ error: null });
          }
          return q;
        },
        order: () => q,
        limit: () => q,
        update: (c: Fila) => ((cambios = c), q),
        insert: async (fila: Fila) => ((tablas[tabla] ??= []).push(fila), { error: null }),
        upsert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: filas(), error: null }).then(ok),
      };
      return q;
    },
  };
  return cliente as unknown as SupabaseClient;
}

const TRIAL_LOCAL = '2027-11-16T05:00:00.000Z';
const HOY = Math.floor(Date.parse('2026-11-18T05:00:00.000Z') / 1000);

const stripeFalso = (sub: Fila) => ({ subscriptions: { retrieve: async () => sub } }) as unknown as Stripe;
const checkout = { id: 'cs_1', metadata: { organizationId: '120', planCode: 'ultimate', billingPeriod: 'monthly' }, subscription: 'sub_nueva', customer: 'cus_120' };

function tablas(metadata: Fila) {
  return {
    plans: [{ id: 7, code: 'ultimate', name: 'Ultimate' }],
    subscriptions: [{ id: 's1', organization_id: 120, plan_id: 3, stripe_subscription_id: null, status: 'trialing', trial_end: TRIAL_LOCAL, current_period_end: TRIAL_LOCAL, metadata, created_at: '2026-11-16T00:00:00Z' }],
    organizations: [{ id: 120 }],
    modules: [],
  };
}

test('prueba gratis vigente: un Checkout incomplete con fechas de hoy no degrada ni acorta, y lo registra', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const t = tablas({ gratis_365_2026_11_16: true });
  const r = await aplicarCheckoutDePlan(baseFalsa(t), stripeFalso({ status: 'incomplete', trial_end: HOY, current_period_start: HOY, current_period_end: HOY }), checkout);
  expect(r.estado).toBe('aplicado');
  expect(t.subscriptions[0]).toMatchObject({ plan_id: 7, stripe_subscription_id: 'sub_nueva', status: 'trialing', trial_end: TRIAL_LOCAL, current_period_end: TRIAL_LOCAL });
  const meta = t.subscriptions[0].metadata as Fila;
  expect(meta.gratis_365_2026_11_16).toBe(true);
  expect(meta.webhook_ignorados).toEqual([expect.objectContaining({ action: 'updated', stripe_status: 'incomplete' })]);
});

test('prueba gratis vigente: un Checkout active pasa a active sin acortar fechas', async () => {
  const t = tablas({ gratis_365_otra: true });
  await aplicarCheckoutDePlan(baseFalsa(t), stripeFalso({ status: 'active', trial_end: null, current_period_start: HOY, current_period_end: HOY + 86400 * 30 }), checkout);
  expect(t.subscriptions[0]).toMatchObject({ status: 'active', trial_end: TRIAL_LOCAL, current_period_end: TRIAL_LOCAL });
});

test('sin marca: se escribe lo de Stripe, como siempre', async () => {
  const t = tablas({});
  await aplicarCheckoutDePlan(baseFalsa(t), stripeFalso({ status: 'incomplete', trial_end: HOY, current_period_start: HOY, current_period_end: HOY }), checkout);
  expect(t.subscriptions[0]).toMatchObject({ status: 'incomplete', trial_end: '2026-11-18T05:00:00.000Z', current_period_end: '2026-11-18T05:00:00.000Z' });
  expect(t.subscriptions[0].metadata).toEqual({});
});
