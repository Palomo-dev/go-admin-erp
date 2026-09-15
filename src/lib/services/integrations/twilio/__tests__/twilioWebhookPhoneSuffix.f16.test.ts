/**
 * FASE-16 · ronda 5 · T-2 (cumplimiento): la baja por palabra clave que llega
 * por Twilio se PERDÍA cuando el teléfono del cliente estaba guardado con
 * separadores dentro de los últimos 10 dígitos.
 *
 * `recordConsentChange` buscaba con `ilike '%<últimos 10 dígitos>'`, que exige
 * los 10 dígitos contiguos: «+57 310 987 65 43» no pasa. Medido el
 * 2026-09-14: 9.298 de 12.846 teléfonos (72 %) no lo pasaban, así que el
 * STOP de esos clientes no apuntaba la baja y se les seguía escribiendo (es el
 * riesgo de la Ley 1581 de 2012 que el propio comentario del código invoca).
 *
 * Ahora usa el mismo prefiltro que `findCustomerIdByPhone`
 * (`phoneSuffixPattern` con `imatch`) y compara en memoria con
 * `normalizePhoneDigits` y el indicativo de la organización.
 *
 * `fakeTable` evalúa DE VERDAD el `filter(imatch)` y el `eq(organization_id)`:
 * volver al `ilike` pone en rojo el primer caso.
 */
import { fakeTable, type Row } from '@/lib/services/crm/whatsapp/__tests__/fakeTable';
import { makeSupabase, type TableResolver } from '@/lib/services/crm/whatsapp/__tests__/mockSupabase';

const ctx: { sb: unknown } = { sb: null };
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => ctx.sb }));

import { recordConsentChange } from '../twilioWebhook';

const ORG = 7;

function cliente(id: string, phone: string | null, organization_id = ORG): Row {
  return { id, organization_id, phone, metadata: { foo: 'bar' }, created_at: '2026-01-01T00:00:00.000Z' };
}

function setup(customersRows: Row[], defaultCountry: string | null = '57') {
  const customers = fakeTable(customersRows);
  const consents = fakeTable([]);
  const providerConfigs: TableResolver = () => ({ data: defaultCountry ? { settings: { default_country_code: defaultCountry } } : null });
  const { sb, calls } = makeSupabase({ customers: customers.resolver, contact_consents: consents.resolver, provider_configs: providerConfigs });
  ctx.sb = sb;
  return { customers, consents, calls };
}

const optOut = (phone: string, orgId = ORG) => recordConsentChange({ orgId, phone, channel: 'whatsapp', status: 'opted_out', messageSid: 'SM1', body: 'STOP' });

describe('F16 r5 · T-2 · recordConsentChange encuentra al cliente aunque el teléfono guardado lleve separadores', () => {
  beforeEach(() => { delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE; });

  it('«+57 310 987 65 43» (espacio dentro de los últimos 10 dígitos): la baja SE APUNTA', async () => {
    const { customers, consents } = setup([cliente('c-1', '+57 310 987 65 43')]);
    await optOut('+573109876543');
    expect(consents.rows).toHaveLength(1);
    expect(consents.rows[0]).toMatchObject({ organization_id: ORG, customer_id: 'c-1', channel: 'whatsapp', status: 'opted_out', source: 'inbound_keyword' });
    expect((customers.rows[0].metadata as Record<string, unknown>).do_not_whatsapp).toBe(true);
  });

  it.each([
    ['+57 310 987 6543'],
    ['+57 (310) 987-6543'],
    ['57 310 987 6543'],
    ['310 987 6543'],       // nacional, completado con el indicativo de la org
    ['3109876543'],
    ['573109876543'],
    ['+573109876543'],
    ['310 9876543<|'],      // basura al final
  ])('formato guardado %p → la baja se apunta', async (guardado) => {
    const { consents } = setup([cliente('c-1', guardado)]);
    await optOut('+573109876543');
    expect(consents.rows).toHaveLength(1);
    expect(consents.rows[0].customer_id).toBe('c-1');
  });

  it('un cliente de OTRA organización con el mismo teléfono NO recibe la baja', async () => {
    const { consents, customers } = setup([cliente('c-otra', '+57 310 987 65 43', ORG + 1)]);
    await optOut('+573109876543');
    expect(consents.rows).toHaveLength(0);
    expect((customers.rows[0].metadata as Record<string, unknown>).do_not_whatsapp).toBeUndefined();
  });

  it('un número de OTRO país que comparte los últimos 10 dígitos («+1 310 987 6543») NO recibe la baja: la normalización decide, no el sufijo', async () => {
    const { consents, customers } = setup([cliente('c-us', '+1 310 987 6543'), cliente('c-co', '+57 310 987 6543')]);
    await optOut('+573109876543');
    expect(consents.rows.map((r) => r.customer_id)).toEqual(['c-co']);
    expect((customers.rows[0].metadata as Record<string, unknown>).do_not_whatsapp).toBeUndefined();
  });

  it('un teléfono guardado que NO normaliza («3109876543» sin indicativo en una org sin indicativo válido) cae a la red ancha del sufijo', async () => {
    // Con indicativo '999' (sin patrón nacional) `normalizePhoneDigits` devuelve
    // null para el nacional de 10 dígitos; ante la duda, la baja se apunta.
    const { consents } = setup([cliente('c-1', '3109876543')], '999');
    await optOut('+573109876543');
    expect(consents.rows).toHaveLength(1);
  });

  it('otro número que solo comparte los últimos 4 dígitos NO recibe la baja', async () => {
    const { consents } = setup([cliente('c-1', '+57 311 000 6543'), cliente('c-2', '+52 55 1234 6543')]);
    await optOut('+573109876543');
    expect(consents.rows).toHaveLength(0);
  });

  it('varios clientes con el mismo teléfono en la org: la baja se apunta a TODOS (ante la duda, ancho)', async () => {
    const { consents } = setup([cliente('c-1', '+57 310 987 65 43'), cliente('c-2', '3109876543'), cliente('c-3', '+57 311 987 6543')]);
    await optOut('+573109876543');
    expect(consents.rows.map((r) => r.customer_id).sort()).toEqual(['c-1', 'c-2']);
  });

  it('el prefiltro va EN la consulta: `filter(phone, imatch, …)` y `eq(organization_id)`, nunca `ilike`', async () => {
    const { customers } = setup([cliente('c-1', '+57 310 987 65 43')]);
    await optOut('+573109876543');
    const sel = customers.selects[0];
    expect(sel.some((o) => o.method === 'ilike')).toBe(false);
    expect(sel.some((o) => o.method === 'eq' && o.args[0] === 'organization_id' && o.args[1] === ORG)).toBe(true);
    const f = sel.find((o) => o.method === 'filter');
    expect(f).toBeDefined();
    expect(f!.args[0]).toBe('phone');
    expect(f!.args[1]).toBe('imatch');
    expect(String(f!.args[2])).toMatch(/6\\D\*5\\D\*4\\D\*3\\D\*\$$/);
  });

  it('sin indicativo en la org y sin variable de entorno, el nacional se completa con 57 (último recurso)', async () => {
    const { consents } = setup([cliente('c-1', '310 987 6543')], null);
    await optOut('+573109876543');
    expect(consents.rows).toHaveLength(1);
  });

  it('el indicativo de la ORG decide el nacional: con indicativo 1, «310 987 6543» es +1 310…, no recibe la baja del +57 y sí la del +1', async () => {
    const a = setup([cliente('c-us', '310 987 6543')], '1');
    await optOut('+573109876543');
    expect(a.consents.rows).toHaveLength(0);
    const b = setup([cliente('c-us', '310 987 6543')], '1');
    await optOut('+13109876543');
    expect(b.consents.rows.map((r) => r.customer_id)).toEqual(['c-us']);
  });

  it('con indicativo 52 en la org, «55 1234 5678» nacional es +52 y la baja de +525512345678 lo encuentra', async () => {
    const { consents } = setup([cliente('c-mx', '55 1234 5678')], '52');
    await optOut('+525512345678');
    expect(consents.rows).toHaveLength(1);
    expect(consents.rows[0].customer_id).toBe('c-mx');
  });
});
