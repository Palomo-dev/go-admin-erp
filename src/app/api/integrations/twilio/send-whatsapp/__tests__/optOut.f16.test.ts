/// <reference types="jest" />
/**
 * FASE-16 · ronda 4 · GEMELO de F-12 encontrado en la pasada de gemelos.
 *
 * `POST /api/integrations/twilio/send-whatsapp` llama a Twilio DIRECTAMENTE:
 * no inserta en `messages`, así que no lo cubre ni `whatsappOutboundService`
 * ni el disparador `trigger_channel_dispatch`, que es donde vive el punto
 * único de opt-out. Resultado: se le podía escribir por WhatsApp a alguien que
 * había pedido la baja (Ley 1581 de 2012).
 */

const sendWhatsAppTwilio = jest.fn(async () => ({ success: true, messageSid: 'SM1', status: 'queued', creditsUsed: 1 }));
jest.mock('@/lib/services/integrations/twilio', () => ({ twilioService: { sendWhatsApp: (...a: unknown[]) => sendWhatsAppTwilio(...(a as [])) } }));
jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => ({ organizationId: 7, userId: 'user-1' }),
  OrgContextError: class OrgContextError extends Error { code = 'X'; statusCode = 401; },
}));

let puedeContactar = true;
let clientes: Array<{ id: string; organization_id: number; phone: string; created_at: string }> = [];

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const ops: Array<{ m: string; a: unknown[] }> = [];
      const proxy: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => {
              if (table === 'provider_configs') return resolve({ data: { settings: { default_country_code: '57' } }, error: null });
              if (table === 'customers') {
                const org = ops.find((o) => o.m === 'eq' && o.a[0] === 'organization_id')?.a[1];
                const inList = ops.find((o) => o.m === 'in')?.a[1] as string[] | undefined;
                const like = ops.find((o) => o.m === 'ilike')?.a[1] as string | undefined;
                let out = clientes.filter((c) => c.organization_id === Number(org));
                if (inList) out = out.filter((c) => inList.includes(c.phone));
                if (like) { const suf = like.replace(/%/g, ''); out = out.filter((c) => c.phone.endsWith(suf)); }
                return resolve({ data: out, error: null });
              }
              return resolve({ data: null, error: null });
            };
          }
          if (prop === 'catch' || prop === 'finally') return undefined;
          return (...a: unknown[]) => { ops.push({ m: prop, a }); return proxy; };
        },
      });
      return proxy;
    },
    rpc: async (fn: string) => ({ data: fn === 'fn_can_contact' ? puedeContactar : null, error: null }),
  }),
}));

import { POST } from '../route';

const pedir = (to: string) => POST({ json: async () => ({ to, message: 'hola' }) } as never);

beforeEach(() => {
  sendWhatsAppTwilio.mockClear();
  puedeContactar = true;
  clientes = [{ id: 'cust-1', organization_id: 7, phone: '+57 310 987 6543', created_at: '2021-01-01T00:00:00Z' }];
});

describe('F16 r4 · Twilio /send-whatsapp respeta el opt-out', () => {
  it('un cliente que pidió la baja NO recibe el mensaje', async () => {
    puedeContactar = false;
    const res = await pedir('+573109876543');
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'OPTED_OUT' });
    expect(sendWhatsAppTwilio).not.toHaveBeenCalled();
  });

  it('también si el número llega en formato nacional (la baja se busca, no se adivina)', async () => {
    puedeContactar = false;
    const res = await pedir('310 987 6543');
    expect(res.status).toBe(422);
    expect(sendWhatsAppTwilio).not.toHaveBeenCalled();
  });

  it('un cliente sin baja sí lo recibe', async () => {
    const res = await pedir('+573109876543');
    expect(res.status).toBe(200);
    expect(sendWhatsAppTwilio).toHaveBeenCalledTimes(1);
  });

  it('un número que no es cliente de la organización no se bloquea', async () => {
    puedeContactar = false;
    const res = await pedir('+14155550100');
    expect(res.status).toBe(200);
    expect(sendWhatsAppTwilio).toHaveBeenCalledTimes(1);
  });
});
