/**
 * F16 · Consolidación de las rondas (2026-09-21) — TELÉFONOS: normalización
 * (F-4), cascada del indicativo por defecto, `findCustomerIdByPhone` (N-4,
 * T-4) y `resolveRecipient`.
 *
 * Casos únicos rescatados de: builder r4 (`round4.test.ts`), builder r5
 * (`round5.test.ts`), tester r4 (`testerR4.test.ts`). Las unidades de
 * `normalizePhoneDigits` de `round3.test.ts` se descartaron: la tabla del
 * tester r4 las contiene todas. Con `fakeTable` los filtros se evalúan de
 * verdad: quitar un `eq`, un `order` o cambiar el prefiltro pone en rojo su caso.
 */
import { countryFromPhone, defaultCountryOf, findCustomerIdByPhone, normalizePhoneDigits, phoneSuffixPattern, resolveRecipient } from '../channelService';
import { resolveDefaultCountry } from '@/lib/services/crm/phoneNormalize';
import { zSettingsBody } from '../schemas';
import { makeSupabase } from './mockSupabase';
import { fakeTable, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));

beforeEach(() => { delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE; });

// ─── F-4 · normalización medida con la función real (tester r4 · builder r4) ────

describe('normalizePhoneDigits', () => {
  it.each([
    ['415 555 0100', '57', null],
    ['415 555 0100', '1', '14155550100'],
    ['415 555 0100', null, null],
    ['4155550100', '57', null],
    ['(415) 555-0100', '57', null],
    ['+1 (415) 555-0100', '57', '14155550100'],
    ['+1 (415) 555-0100', null, '14155550100'],
    ['001 415 555 0100', '57', '14155550100'],
    ['310 987 6543', '57', '573109876543'],
    ['310 987 6543', null, null],
    ['310-987-6543', '1', '13109876543'],
    ['+57 310 987 65 43', null, '573109876543'],
    ['0057 310 987 6543', null, '573109876543'],
    ['573109876543@s.whatsapp.net', null, '573109876543'],
    ['3109876543@s.whatsapp.net', null, null],
    ['3109876543', '57', '573109876543'],
    ['3109876543', '999', null],
    ['601 234 5678', '57', '576012345678'],
    ['6012345678', '57', '576012345678'],
    ['1234567', '57', null],
    ['1020304050', '57', null], // cédula de 10 dígitos
    ['55 1234 5678', '52', '525512345678'],
    ['5512345678', '57', null],
    ['+52 55 1234 5678', '57', '525512345678'],
    ['', '57', null],
    ['abc', '57', null],
    ['+', '57', null],
  ])('T4.F4 · normalizePhoneDigits(%p, %p) → %p', (phone, cc, esperado) => {
    expect(normalizePhoneDigits(phone, cc)).toBe(esperado);
  });

  it('B4.F4 · los 6 teléfonos reales (cédulas y números de EE.UU. en el campo teléfono) que se convertirían en un destinatario inventado quedan fuera', () => {
    for (const malo of ['1036395459', '1010062107', '1000406387', '1151441736', '4072899547', '8325517404']) expect(normalizePhoneDigits(malo, '57')).toBeNull();
  });

  it('T4.F4 · país: 415 nacional con 57 no llega a ningún país; con 1 llega a «us»; 310 con 57 a «co»', () => {
    expect(normalizePhoneDigits('415 555 0100', '57')).toBeNull();
    expect(countryFromPhone(normalizePhoneDigits('415 555 0100', '1')!)).toBe('us');
    expect(countryFromPhone(normalizePhoneDigits('310 987 6543', '57')!)).toBe('co');
  });

  it('T4.F4 · patrón de sufijo: ancla al final, ignora separadores y basura final, no acepta dígitos intercalados ni otro orden', () => {
    const re = new RegExp(phoneSuffixPattern('573109876543'), 'i');
    expect(re.test('+57 310 987 65 43')).toBe(true);
    expect(re.test('310 9876543<|')).toBe(true);
    expect(re.test('+57 310 987 6543,')).toBe(true);
    expect(re.test('+57 310 987 65 4 3 ')).toBe(true);
    expect(re.test('6 5 4 3')).toBe(true);
    expect(re.test('+57 310 987 6543 ext 9')).toBe(false);
    expect(re.test('+57 310 987 6534')).toBe(false);
  });
});

// ─── F-4 · el indicativo sale de la configuración, no del código ────────────────

describe('indicativo por defecto', () => {
  it('B4.F4 · defaultCountryOf: ajuste de la organización → variable de entorno → último recurso (57)', () => {
    expect(defaultCountryOf({ default_country_code: '52' })).toBe('52');
    process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '1';
    expect(defaultCountryOf({ default_country_code: null })).toBe('1');
    delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
    expect(defaultCountryOf({ default_country_code: null })).toBe('57');
  });

  it('T4.F4 · resolveDefaultCountry limpia el «+» y trata vacío/undefined como ausente', () => {
    expect(resolveDefaultCountry('52')).toBe('52');
    expect(resolveDefaultCountry('+52')).toBe('52');
    process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '1';
    expect(resolveDefaultCountry(null)).toBe('1');
    expect(resolveDefaultCountry('')).toBe('1');
    delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
    expect(resolveDefaultCountry(undefined)).toBe('57');
  });

  it('B4.F4 · zSettingsBody admite el indicativo (dígitos o null) y rechaza «+57» y «co»', () => {
    expect(zSettingsBody.parse({ default_country_code: '52' })).toMatchObject({ default_country_code: '52' });
    expect(zSettingsBody.parse({ default_country_code: null })).toMatchObject({ default_country_code: null });
    expect(() => zSettingsBody.parse({ default_country_code: '+57' })).toThrow();
    expect(() => zSettingsBody.parse({ default_country_code: 'co' })).toThrow();
  });
});

// ─── N-4 / T-4 · findCustomerIdByPhone con un doble que SÍ evalúa los filtros ───

describe('findCustomerIdByPhone', () => {
  const clientes = (rows: Row[]) => makeSupabase({ customers: fakeTable(rows).resolver });
  const fila = (id: string, phone: string, created_at: string, organization_id = 7): Row => ({ id, organization_id, phone, created_at });

  it('B4.N4 · encuentra al cliente guardado con separadores usando el prefiltro `imatch` (la igualdad exacta NO acierta)', async () => {
    const { sb, calls } = clientes([fila('c-1', '+57 310 987 6543', '2021-01-01T00:00:00Z')]);
    await expect(findCustomerIdByPhone(7, '573109876543', sb, { defaultCountry: '57' })).resolves.toBe('c-1');
    expect(calls.some((c) => c.ops.some((o) => o.method === 'filter' && o.args[1] === 'imatch'))).toBe(true);
  });

  it('B4.N4 · no engancha por sufijo, no cruza de organización, y sin indicativo un nacional guardado NO se da por bueno', async () => {
    await expect(findCustomerIdByPhone(7, '573109876543', clientes([fila('c-otro', '+57 320 111 6543', '2021-01-01T00:00:00Z')]).sb, { defaultCountry: '57' })).resolves.toBeNull();
    await expect(findCustomerIdByPhone(7, '573109876543', clientes([fila('c-ajeno', '+57 310 987 6543', '2021-01-01T00:00:00Z', 8)]).sb, { defaultCountry: '57' })).resolves.toBeNull();
    const nacional = [fila('c-1', '310 987 6543', '2021-01-01T00:00:00Z')];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(nacional).sb)).resolves.toBeNull();
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(nacional).sb, { defaultCountry: '57' })).resolves.toBe('c-1');
  });

  it('B4.N4 · con 2 clientes en colisión devuelve SIEMPRE el más antiguo, en cualquier orden de llegada, por ambos caminos', async () => {
    const lento: Row[] = [fila('c-nuevo', '310 987 6543', '2024-05-05T00:00:00Z'), fila('c-viejo', '+57 310-987-6543', '2019-02-02T00:00:00Z')];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(lento).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo');
    await expect(findCustomerIdByPhone(7, '573109876543', clientes([...lento].reverse()).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo');
    const rapido: Row[] = [fila('c-nuevo', '+573109876543', '2024-05-05T00:00:00Z'), fila('c-viejo', '573109876543', '2019-02-02T00:00:00Z')];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(rapido).sb)).resolves.toBe('c-viejo');
  });

  it('B5.T4 · «siempre el más antiguo» también ENTRE formatos: ficha vieja con separadores o nacional + ficha nueva canónica → la VIEJA', async () => {
    const a: Row[] = [fila('c-nuevo-canonico', '+573109876543', '2024-05-05T00:00:00Z'), fila('c-viejo-separadores', '+57 310 987 6543', '2019-02-02T00:00:00Z')];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(a).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo-separadores');
    await expect(findCustomerIdByPhone(7, '573109876543', clientes([...a].reverse()).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo-separadores');
    const b: Row[] = [fila('c-nuevo', '573109876543', '2024-05-05T00:00:00Z'), fila('c-viejo', '310 987 6543', '2019-02-02T00:00:00Z')];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(b).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo');
  });

  it('B5.T4 · una sola consulta a customers: prefiltro imatch + eq(organization_id) + orden (created_at, id) + sin `in`', async () => {
    const t = fakeTable([fila('c-1', '+573109876543', '2021-01-01T00:00:00Z')]);
    const { sb } = makeSupabase({ customers: t.resolver });
    await expect(findCustomerIdByPhone(7, '573109876543', sb)).resolves.toBe('c-1');
    expect(t.selects).toHaveLength(1);
    const ops = t.selects[0];
    expect(ops.some((o) => o.method === 'eq' && o.args[0] === 'organization_id' && o.args[1] === 7)).toBe(true);
    expect(ops.some((o) => o.method === 'filter' && o.args[0] === 'phone' && o.args[1] === 'imatch')).toBe(true);
    expect(ops.filter((o) => o.method === 'order').map((o) => String(o.args[0]))).toEqual(['created_at', 'id']);
    expect(ops.some((o) => o.method === 'in')).toBe(false);
  });

  it('B4.N4 · el prefiltro encuentra teléfonos con separador DENTRO de los últimos 4 dígitos y con basura al final (18 reales)', async () => {
    await expect(findCustomerIdByPhone(7, '573109876543', clientes([fila('c-1', '+57 310 987 65 43', '2021-01-01T00:00:00Z')]).sb, { defaultCountry: '57' })).resolves.toBe('c-1');
    const { sb } = clientes([fila('c-1', '310 9876543<|', '2021-01-01T00:00:00Z'), fila('c-2', '+57 3209876543,', '2021-01-01T00:00:00Z')]);
    await expect(findCustomerIdByPhone(7, '573109876543', sb, { defaultCountry: '57' })).resolves.toBe('c-1');
    await expect(findCustomerIdByPhone(7, '573209876543', sb, { defaultCountry: '57' })).resolves.toBe('c-2');
  });

  it('B4.N4 · con created_at EMPATADO (importación masiva) el desempate es por id, por ambos caminos y en cualquier orden', async () => {
    const lento = (): Row[] => [fila('c-b', '+57 310-987-6543', '2024-05-05T00:00:00Z'), fila('c-a', '310 987 6543', '2024-05-05T00:00:00Z')];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(lento()).sb, { defaultCountry: '57' })).resolves.toBe('c-a');
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(lento().reverse()).sb, { defaultCountry: '57' })).resolves.toBe('c-a');
    const rapido: Row[] = [fila('c-b', '+573109876543', '2024-05-05T00:00:00Z'), fila('c-a', '573109876543', '2024-05-05T00:00:00Z')];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(rapido).sb)).resolves.toBe('c-a');
    await expect(findCustomerIdByPhone(7, '573109876543', clientes([...rapido].reverse()).sb)).resolves.toBe('c-a');
  });
});

// ─── F-4 · resolveRecipient no reescribe el identificador del proveedor (r4) ────

describe('resolveRecipient', () => {
  const conIdentidad = (identity: string) => makeSupabase({ customer_channel_identities: () => ({ data: { identity_value: identity } }), customers: () => ({ data: { phone: '+573001112233' } }) }).sb;
  const sinIdentidad = (phone: string, conAjustes = false) => makeSupabase({
    customer_channel_identities: () => ({ data: null }),
    customers: () => ({ data: { phone } }),
    ...(conAjustes ? { provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }) } : {}),
  }).sb;

  it('B4.F4 · un wa_id en E.164 se respeta; un wa_id malformado (10 dígitos pelados) NO se completa: null', async () => {
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', conIdentidad('+57 310 987 6543'), '57')).resolves.toBe('573109876543');
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', conIdentidad('3109876543'), '57')).resolves.toBeNull();
  });

  it('B4.F4 · el teléfono de `customers` (texto libre de la org) SÍ se completa con el indicativo', async () => {
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', sinIdentidad('310 987 6543'), '57')).resolves.toBe('573109876543');
  });

  it('B4.F4 · omitir el indicativo NO es «no completes»: se resuelve de los ajustes de la org; `null` explícito sí lo es', async () => {
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', sinIdentidad('310 987 6543', true))).resolves.toBe('573109876543');
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', sinIdentidad('310 987 6543', true), null)).resolves.toBeNull();
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', sinIdentidad('415 555 0100', true))).resolves.toBeNull();
  });
});
