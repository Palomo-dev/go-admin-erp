/**
 * Tester SEC-0 r1: opt-out/opt-in por palabra clave (twilioWebhook.ts) y
 * registro de consentimiento en `contact_consents`.
 *
 * - `isOptOutMessage` / `isOptInMessage`: acentos, mayúsculas, puntuación,
 *   falsos positivos ("no cancelar la cita").
 * - `recordConsentChange`: canal sms vs whatsapp, flag en customers.metadata y
 *   comportamiento frente al UNIQUE (organization_id, customer_id, channel)
 *   real de `contact_consents` (el insert plano falla la segunda vez →
 *   `test.failing` documenta el bug hasta que se use upsert).
 */

jest.mock('@/lib/supabase/server-service', () => {
  const state = {
    customers: [{ id: 'c1', phone: '+57 300 111 2233', metadata: { foo: 'bar' } }],
    consents: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
  };
  const consentKey = (r: Record<string, unknown>) => `${r.organization_id}|${r.customer_id}|${r.channel}`;
  const client = {
    from: (table: string) => {
      if (table === 'customers') {
        return {
          select: () => ({ eq: () => ({ ilike: () => ({ limit: async () => ({ data: state.customers }) }) }) }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({ eq: async () => { state.updates.push(payload); return { error: null }; } }),
          }),
        };
      }
      if (table === 'contact_consents') {
        return {
          insert: async (row: Record<string, unknown>) => {
            // Simula el UNIQUE real (organization_id, customer_id, channel)
            if (state.consents.some((r) => consentKey(r) === consentKey(row))) {
              return { error: { code: '23505', message: 'duplicate key value violates unique constraint "contact_consents_organization_id_customer_id_channel_key"' } };
            }
            state.consents.push(row);
            return { error: null };
          },
          upsert: async (row: Record<string, unknown>) => {
            const idx = state.consents.findIndex((r) => consentKey(r) === consentKey(row));
            if (idx >= 0) state.consents[idx] = row; else state.consents.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`tabla no mockeada: ${table}`);
    },
  };
  return { getServiceClient: () => client, __state: state };
});

import { isOptOutMessage, isOptInMessage, recordConsentChange } from '../twilioWebhook';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __state: state } = require('@/lib/supabase/server-service') as {
  __state: { customers: unknown[]; consents: Array<Record<string, unknown>>; updates: Array<Record<string, unknown>> };
};

describe('isOptOutMessage / isOptInMessage', () => {
  test.each(['STOP', 'stop', ' Stop. ', 'BAJA', 'baja!', 'CANCELAR', 'Cancelar', 'NO MAS', 'No más', 'NO MÁS', 'nomás', 'UNSUBSCRIBE', 'salir', 'DETENER', 'Detener.'])(
    'opt-out: %j',
    (body) => expect(isOptOutMessage(body)).toBe(true)
  );

  test.each(['no cancelar la cita', 'quiero cancelar mi pedido', 'STOP calling me', 'hola', '', 'baja la persiana', 'no', 'SI'])(
    'NO es opt-out (falso positivo): %j',
    (body) => expect(isOptOutMessage(body)).toBe(false)
  );

  test.each(['START', 'start', 'ALTA', 'iniciar', 'Sí quiero', 'ACEPTO'])('opt-in: %j', (body) => expect(isOptInMessage(body)).toBe(true));

  test('STOP no es opt-in y START no es opt-out', () => {
    expect(isOptInMessage('STOP')).toBe(false);
    expect(isOptOutMessage('START')).toBe(false);
  });
});

describe('recordConsentChange', () => {
  beforeEach(() => {
    state.consents.length = 0;
    state.updates.length = 0;
  });

  test('opt-out por WhatsApp → contact_consents(channel=whatsapp, opted_out) + metadata.do_not_whatsapp=true', async () => {
    await recordConsentChange({ orgId: 105, phone: '+573001112233', channel: 'whatsapp', status: 'opted_out', messageSid: 'SM1', body: 'STOP' });
    expect(state.consents).toHaveLength(1);
    expect(state.consents[0]).toMatchObject({ organization_id: 105, customer_id: 'c1', channel: 'whatsapp', status: 'opted_out', source: 'inbound_keyword' });
    expect(state.updates[0]).toMatchObject({ metadata: { foo: 'bar', do_not_whatsapp: true } });
  });

  test('opt-out por SMS → channel=sms y flag do_not_sms (no toca do_not_whatsapp)', async () => {
    await recordConsentChange({ orgId: 105, phone: '+573001112233', channel: 'sms', status: 'opted_out' });
    expect(state.consents[0]).toMatchObject({ channel: 'sms', status: 'opted_out' });
    const meta = state.updates[0].metadata as Record<string, unknown>;
    expect(meta.do_not_sms).toBe(true);
    expect(meta.do_not_whatsapp).toBeUndefined();
  });

  test('teléfono sin cliente en la org → no inserta ni actualiza nada', async () => {
    await recordConsentChange({ orgId: 105, phone: '+15550000000', channel: 'sms', status: 'opted_out' });
    expect(state.consents).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  // BUG documentado (tester SEC-0 r1): contact_consents tiene UNIQUE(organization_id, customer_id, channel)
  // y recordConsentChange hace .insert() → el segundo cambio (STOP tras START, o START tras STOP)
  // viola el UNIQUE, se traga el error en try/catch y la fila conserva el estado anterior.
  // fn_can_contact lee contact_consents.status → un cliente que hizo STOP nunca puede volver a
  // hacer START (y viceversa la fila no refleja el STOP si antes hubo START).
  test.failing('opt-in tras opt-out actualiza la fila (requiere upsert onConflict org+customer+channel)', async () => {
    await recordConsentChange({ orgId: 105, phone: '+573001112233', channel: 'whatsapp', status: 'opted_out' });
    await recordConsentChange({ orgId: 105, phone: '+573001112233', channel: 'whatsapp', status: 'opted_in' });
    expect(state.consents).toHaveLength(1);
    expect(state.consents[0].status).toBe('opted_in');
  });
});
