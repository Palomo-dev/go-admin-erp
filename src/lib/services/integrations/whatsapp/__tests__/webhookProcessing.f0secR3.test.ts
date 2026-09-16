/// <reference types="jest" />
/**
 * F0-SEC r3 · constructor · `processWebhookPayload` es la SEGUNDA línea de
 * defensa de H1/H2 (la primera es `planWebhookAuthorization`). Aunque el plan
 * ya normaliza y descarta, el servicio es donde se escribe en la base, así que
 * también aquí:
 *
 *  - H2: una actualización de plantilla solo se aplica a las organizaciones
 *    dueñas del WABA de la entrada (`findChannelsByBusinessAccountId`). Sin
 *    WABA resoluble, se descarta: `applyTemplateStatusUpdate` ni se llama.
 *  - H1: el `phone_number_id` pasa por `normalizeMetaId` antes de tocar
 *    PostgREST: un número se consulta como string; un objeto no se consulta.
 *  - H4 (r4): `authorizedOrganizationIds` del plan. Plantillas: se aplican a
 *    `wabaOrgs ∩ authorized`; vacío → no se llama a `applyTemplateStatusUpdate`.
 *    Mensajes: un canal fuera de las autorizadas se salta con aviso. Sin la
 *    opción (ámbito global) no hay intersección. Mutación esperada muerta:
 *    quitar la intersección.
 */
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
jest.mock('@/lib/services/crm/whatsapp/webhookTemplateStatus', () => ({
  parseTemplateStatusUpdate: jest.requireActual('@/lib/services/crm/whatsapp/webhookTemplateStatus').parseTemplateStatusUpdate,
  templateEventKey: jest.requireActual('@/lib/services/crm/whatsapp/webhookTemplateStatus').templateEventKey,
  applyTemplateStatusUpdate: jest.fn(async () => ({ updated: 1, paused_campaigns: 0 })),
}));

import { applyTemplateStatusUpdate } from '@/lib/services/crm/whatsapp/webhookTemplateStatus';
import { normalizeMetaId } from '../webhookAuthorization';
import { whatsappCloudService } from '../whatsappCloudService';
import type { WhatsAppWebhookPayload } from '../whatsappCloudTypes';

const applyMock = applyTemplateStatusUpdate as jest.Mock;
const tpl = { field: 'message_template_status_update', value: { event: 'DISABLED', message_template_id: 'meta-tpl-of-org-8', reason: 'ABUSIVE_CONTENT' } };
const payloadOf = (...entry: unknown[]) => ({ object: 'whatsapp_business_account', entry } as unknown as WhatsAppWebhookPayload);

let byWaba: jest.SpyInstance;
let byPhone: jest.SpyInstance;
beforeEach(() => {
  applyMock.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  byWaba = jest.spyOn(whatsappCloudService, 'findChannelsByBusinessAccountId').mockImplementation(async (wabaId: string) =>
    wabaId === 'waba-b' ? [{ channelId: 'ch-b', organizationId: 8 }, { channelId: 'ch-b2', organizationId: 8 }] : []);
  byPhone = jest.spyOn(whatsappCloudService, 'findChannelByPhoneNumberId').mockImplementation(async () => null);
});
afterEach(() => jest.restoreAllMocks());

describe('H2 · plantillas: solo las organizaciones dueñas del WABA', () => {
  test('WABA conocido → applyTemplateStatusUpdate recibe las organizaciones del WABA (sin duplicados)', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tpl] }));
    expect(byWaba).toHaveBeenCalledWith('waba-b');
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][1]).toBe('waba-b');
    expect(applyMock.mock.calls[0][3]).toEqual([8]);
  });

  test('WABA desconocido → se descarta sin llamar a applyTemplateStatusUpdate', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-nadie', changes: [tpl] }));
    expect(applyMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('template update descartado'), expect.objectContaining({ wabaId: 'waba-nadie' }));
  });

  test('sin entry.id (o con tipo inválido) → se descarta sin consultar', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ changes: [tpl] }, { id: { $ne: null }, changes: [tpl] }));
    expect(byWaba).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  test('entry.id numérico se consulta como string y varias plantillas de la misma entrada resuelven el WABA una sola vez', async () => {
    byWaba.mockImplementation(async (wabaId: string) => (wabaId === '9001' ? [{ channelId: 'ch-n', organizationId: 9 }] : []));
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 9001, changes: [tpl, tpl] }));
    expect(byWaba).toHaveBeenCalledTimes(1);
    expect(byWaba).toHaveBeenCalledWith('9001');
    expect(applyMock).toHaveBeenCalledTimes(2);
    expect(applyMock.mock.calls[0][3]).toEqual([9]);
  });
});

describe('H4 (r4) · authorizedOrganizationIds: el servicio interseca lo que resuelve con lo que el plan autorizó', () => {
  test('authorizedOrganizationIds = [7] + WABA de [8] → applyTemplateStatusUpdate NO se llama y se registra', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tpl] }), { authorizedOrganizationIds: [7] });
    expect(byWaba).toHaveBeenCalledWith('waba-b');
    expect(applyMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('ninguna organización autorizada'),
      expect.objectContaining({ wabaId: 'waba-b', wabaOrganizationIds: [8], authorizedOrganizationIds: [7] }),
    );
  });

  test('authorizedOrganizationIds = [8, 9] + WABA de [8] → se aplica exactamente a la intersección [8]', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tpl] }), { authorizedOrganizationIds: [8, 9] });
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][3]).toEqual([8]);
  });

  test('ámbito global (sin opción) → sin intersección: se aplica a las organizaciones del WABA', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tpl] }));
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][3]).toEqual([8]);
  });

  test('authorizedOrganizationIds = [] → nadie está autorizado (fail-closed): no se aplica', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tpl] }), { authorizedOrganizationIds: [] });
    expect(applyMock).not.toHaveBeenCalled();
  });

  test('un field de plantilla con metadata.phone_number_id se resuelve por el WABA de la entrada (el número ni se consulta)', async () => {
    const tplWithPhone = { ...tpl, value: { ...tpl.value, metadata: { phone_number_id: 'pn-a' } } };
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tplWithPhone] }), { authorizedOrganizationIds: [7] });
    expect(byPhone).not.toHaveBeenCalled();
    expect(byWaba).toHaveBeenCalledWith('waba-b');
    expect(applyMock).not.toHaveBeenCalled();
  });

  test('messages: el canal del número pertenece a una organización NO autorizada → se salta con aviso, sin insertar', async () => {
    byPhone.mockImplementation(async () => ({ channelId: 'ch-b', organizationId: 8 }));
    const msg = { field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '57300', phone_number_id: 'pn-b' }, messages: [{ from: '5730000', id: 'wamid.x', timestamp: '1', type: 'text', text: { body: 'hola' } }] } };
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [msg] }), { authorizedOrganizationIds: [7] });
    expect(byPhone).toHaveBeenCalledWith('pn-b');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('mensajes descartados'),
      expect.objectContaining({ phoneNumberId: 'pn-b', organizationId: 8, authorizedOrganizationIds: [7] }),
    );
  });
});

describe('H1 · phone_number_id normalizado antes de PostgREST', () => {
  const msg = (phoneNumberId: unknown) => ({ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '57300', phone_number_id: phoneNumberId }, messages: [] } });

  test('número → se consulta como STRING; objeto/booleano → no se consulta', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-x', changes: [msg(123), msg({ $gt: 0 }), msg(true), msg(' pn-s ')] }));
    expect(byPhone.mock.calls.map((c) => c[0])).toEqual(['123', 'pn-s']);
    expect(byPhone.mock.calls.every((c) => typeof c[0] === 'string')).toBe(true);
  });
});

describe('normalizeMetaId · la única conversión válida de identificadores de Meta (plan y procesamiento la comparten)', () => {
  test.each<[unknown, string | null]>([
    ['123', '123'],
    ['  pn-a  ', 'pn-a'],
    ['1e3', '1e3'],            // un string se conserva tal cual: no se interpreta como número
    ['', null],
    ['   ', null],
    [123, '123'],              // entero seguro → EXACTAMENTE lo que PostgREST interpolaría
    [0, '0'],
    [-0, '0'],
    [9007199254740991, '9007199254740991'],
    [9007199254740992, null], // fuera del rango seguro: no se puede representar sin ambigüedad
    [-1, null],
    [1.5, null],
    [1e21, null],
    [NaN, null],
    [Infinity, null],
    [true, null],
    [null, null],
    [undefined, null],
    [{ $gt: 0 }, null],
    [['123'], null],
    [BigInt(123), null],
  ])('%p → %p', (raw, expected) => {
    expect(normalizeMetaId(raw)).toBe(expected);
  });
});
