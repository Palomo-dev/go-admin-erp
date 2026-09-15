/// <reference types="jest" />
/**
 * FASE-16 · ronda 4 · F-4 en la ruta de compatibilidad
 * `POST /api/integrations/whatsapp/send`.
 *
 * El `to` del CUERPO llega cualificado: NO se le completa el indicativo por
 * defecto de la organización (reescribirlo sería inventarse un destinatario).
 * El indicativo sí se usa para BUSCAR al cliente, porque `customers.phone` es
 * texto libre que la organización guardó como quiso.
 *
 * Reversión que muerde: `normalizePhoneDigits(String(to))` →
 * `normalizePhoneDigits(String(to), defaultCountry)` en la ruta.
 */
import { fakeTable, type Row } from '@/lib/services/crm/whatsapp/__tests__/fakeTable';
import { makeSupabase } from '@/lib/services/crm/whatsapp/__tests__/mockSupabase';

const sendWhatsApp = jest.fn(async (input: { customerId: string | null }) => ({ message_id: 'm-1', conversation_id: 'c-1', activity_id: null, customer_id: input.customerId, channel_id: 'chan-1', scheduled: false }));
jest.mock('@/lib/services/crm/whatsapp/outboundService', () => ({ sendWhatsApp: (...a: unknown[]) => sendWhatsApp(...(a as [never])) }));
jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => ({ organizationId: 7, userId: 'user-1', memberId: 3, supabase: {} }),
  OrgContextError: class OrgContextError extends Error { code = 'X'; statusCode = 401; },
}));

let clientes: Row[] = [];
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => makeSupabase({
    provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
    customers: (ops, call) => fakeTable(clientes).resolver(ops, call),
  }).sb,
}));

import { POST } from '../route';

const pedir = (to: string) => POST({ json: async () => ({ channel_id: '11111111-1111-4111-8111-111111111111', to, type: 'text', text: { body: 'hola' } }) } as never);

beforeEach(() => {
  sendWhatsApp.mockClear();
  clientes = [{ id: 'cust-1', organization_id: 7, phone: '310 987 6543', created_at: '2021-01-01T00:00:00Z' }];
});

describe('F16 r4 · F-4 · el `to` del cuerpo no recibe indicativo por defecto', () => {
  it('un `to` en E.164 encuentra al cliente guardado en formato nacional y envía', async () => {
    const res = await pedir('+573109876543');
    expect(res.status).toBe(200);
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect((sendWhatsApp.mock.calls[0] as unknown as [{ customerId: string }])[0].customerId).toBe('cust-1');
  });

  it('un `to` NACIONAL de 10 dígitos NO se completa: 400 y ningún envío', async () => {
    // Con el indicativo aplicado a ciegas, «3109876543» pasaría a
    // 573109876543 y saldría el mensaje; y «4155550100» (EE.UU.) también,
    // hacia un identificador inventado.
    for (const to of ['3109876543', '415 555 0100']) {
      const res = await pedir(to);
      expect(res.status).toBe(400);
    }
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('un `to` de EE.UU. cualificado sin cliente en la organización: 400, no se inventa uno', async () => {
    const res = await pedir('+14155550100');
    expect(res.status).toBe(400);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });
});
