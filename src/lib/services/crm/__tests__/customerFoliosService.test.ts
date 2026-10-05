import { createClient } from '@supabase/supabase-js';
import { getCustomerFolios } from '../customerFoliosService';
import { readF12Money } from '../f12ReadService';

jest.mock('../f12ReadService', () => ({
  ...jest.requireActual('../f12ReadService'),
  readF12Money: jest.fn(),
}));
const money = { base: 'COP', timezone: 'America/Bogota', date: '2026-10-02', rates: [] };
beforeEach(() => jest.mocked(readF12Money).mockResolvedValue(money));

const customer = '11111111-1111-4111-8111-111111111111';
const otherCustomer = '22222222-2222-4222-8222-222222222222';
const folio = (id: string, org = 120, customerId = customer) => ({
  id,
  status: 'open',
  balance: '125.25',
  created_at: '2026-10-01T10:00:00Z',
  reservation_id: id,
  reservations: {
    organization_id: org,
    customer_id: customerId,
    metadata: { code: 'RES-REAL' },
    spaces: { label: 'Espacio A' },
  },
  folio_items: [
    { amount: '100.25', payment_status: 'pending' },
    { amount: '25.00', payment_status: 'paid' },
    { amount: '10.50', payment_status: 'void' },
  ],
});
const invoice = (id: string, org = 120, customerId = customer, balance = '15.50') => ({
  id,
  organization_id: org,
  customer_id: customerId,
  number: 'INV-1',
  total: '30.50',
  balance,
  issue_date: '2026-10-01T10:00:00Z',
  due_date: null,
  status: 'issued',
  currency: 'USD',
});
type Row = Record<string, unknown>;

// Catálogo verificado por MCP el 2026-10-02. Folios hereda el tenant de reservations.
const schema: Record<string, Set<string>> = {
  folios: new Set(['id', 'status', 'balance', 'created_at', 'reservation_id']),
  reservations: new Set(['metadata', 'organization_id', 'customer_id', 'space_id', 'id']),
  spaces: new Set(['label']),
  folio_items: new Set(['amount', 'payment_status']),
  invoice_sales: new Set([
    'id',
    'number',
    'issue_date',
    'due_date',
    'total',
    'balance',
    'status',
    'currency',
    'organization_id',
    'customer_id',
  ]),
};
function projectionFields(select: string): string[] {
  let depth = 0,
    start = 0;
  const fields: string[] = [];
  for (let i = 0; i <= select.length; i++) {
    if (select[i] === '(') depth++;
    if (select[i] === ')') depth--;
    if (i === select.length || (select[i] === ',' && depth === 0)) {
      fields.push(select.slice(start, i));
      start = i + 1;
    }
  }
  return fields;
}
function invalidColumn(table: string, select: string): string | null {
  for (const field of projectionFields(select)) {
    const embedded = field.match(/^(\w+)(?:!inner)?\((.*)\)$/);
    if (embedded) {
      const invalid = invalidColumn(embedded[1], embedded[2]);
      if (invalid) return invalid;
    } else if (!schema[table]?.has(field)) return `${table}.${field}`;
  }
  return null;
}
function database(tables: { folios?: Row[]; invoice_sales?: Row[] } = {}, failure?: string) {
  const urls: URL[] = [];
  const db = createClient('https://local-only.invalid', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: jest.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        urls.push(url);
        const table = url.pathname.split('/').pop() as keyof typeof tables;
        const missing = invalidColumn(table, url.searchParams.get('select') ?? '');
      if (missing || table === failure || `${table}@${url.searchParams.get('offset')}` === failure) {
          return new Response(
            JSON.stringify({ code: '42703', message: missing ?? 'fallo de lectura' }),
            { status: 400 },
          );
        }
        if (url.searchParams.get('reservation_id')?.includes('[object Object]')) {
          return new Response(
            JSON.stringify({ code: '22P02', message: 'invalid input syntax for type uuid' }),
            { status: 400 },
          );
        }
        let rows = tables[table] ?? [];
        if (url.searchParams.get('select')?.includes('reservations!inner')) {
          rows = rows.filter((row) => row.reservations != null);
        }
        for (const [key, expression] of url.searchParams) {
          if (['select', 'order', 'offset', 'limit'].includes(key)) continue;
          rows = rows.filter((row) => {
            let value: unknown = row;
            for (const part of key.split('.')) {
              if (Array.isArray(value)) value = value[0];
              value = value && typeof value === 'object' ? (value as Row)[part] : undefined;
            }
            if (expression.startsWith('eq.')) return String(value) === expression.slice(3);
            if (expression.startsWith('gt.')) return Number(value) > Number(expression.slice(3));
            return false;
          });
        }
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 1000);
        return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { status: 200 });
      }) as typeof fetch,
    },
  });
  return { db, urls };
}

test('reproduce el 42703 antiguo y carga el esquema real mediante el SDK PostgREST', async () => {
  const { db } = database({ folios: [folio('local')] });
  const old = await db.from('folios').select('id,reservations(code,spaces(label))');
  expect(old.error?.code).toBe('42703');
  const result = await getCustomerFolios(db, 120, customer);
  expect(result.folios[0]).toMatchObject({
    id: 'local',
    reservation_code: 'RES-REAL',
    space_label: 'Espacio A',
  });
});

test('reproduce el UUID inválido de la falsa subconsulta; el servicio usa filtros escalares válidos', async () => {
  const { db } = database({ folios: [folio('local')] });
  const old = await db.from('folios').select('id')
    .eq('reservation_id', db.from('reservations').select('id').eq('customer_id', customer));
  expect(old.error?.code).toBe('22P02');
  await expect(getCustomerFolios(db, 120, customer)).resolves.toMatchObject({ folios: [{ id: 'local' }] });
});

test('filtra folios y facturas de otras organizaciones, otros clientes y reservas ausentes', async () => {
  const { db, urls } = database({
    folios: [
      folio('local'),
      folio('foreign-org', 121),
      folio('foreign-customer', 120, otherCustomer),
      { ...folio('no-reservation'), reservations: null },
    ],
    invoice_sales: [
      invoice('local'),
      invoice('foreign-org', 121),
      invoice('foreign-customer', 120, otherCustomer),
      invoice('settled', 120, customer, '0'),
    ],
  });
  const result = await getCustomerFolios(db, 120, customer);
  expect(result.folios.map((row) => row.id)).toEqual(['local']);
  expect(result.invoices.map((row) => row.id)).toEqual(['local']);
  expect(urls).toHaveLength(2);
  expect(urls.every((url) => !url.toString().includes('object%20Object'))).toBe(true);
});

test('mantiene importes, estados de cargo y moneda de la factura sin lecturas N+1', async () => {
  const { db, urls } = database({
    folios: [folio('local'), folio('second')],
    invoice_sales: [invoice('invoice')],
  });
  const result = await getCustomerFolios(db, 120, customer);
  expect(result.folios[0]).toMatchObject({
    balance: 125.25,
    pending_total: 100.25,
    paid_total: 25,
    items_count: 3,
  });
  expect(result.invoices[0]).toMatchObject({ total: 30.5, balance: 15.5, currency: 'USD' });
  expect(urls).toHaveLength(2);
});

test('normaliza embeds objeto/arreglo y no inventa códigos cuando falta metadata.code', async () => {
  const withArray = folio('array');
  const rows: Row[] = [
    {
      ...withArray,
      reservations: [{ ...withArray.reservations, spaces: [{ label: 'Espacio B' }] }],
    },
    {
      ...folio('null'),
      reservations: { ...folio('null').reservations, metadata: null, spaces: null },
    },
    {
      ...folio('numeric'),
      reservations: { ...folio('numeric').reservations, metadata: { code: 123 } },
    },
  ];
  const result = await getCustomerFolios(database({ folios: rows }).db, 120, customer);
  expect(result.folios[0]).toMatchObject({
    reservation_code: 'RES-REAL',
    space_label: 'Espacio B',
  });
  expect(result.folios[1].reservation_code).toBeUndefined();
  expect(result.folios[2].reservation_code).toBeUndefined();
});

test.each(['folios', 'invoice_sales'])(
  'un error de %s no se convierte en listas/cifras vacías',
  async (table) => {
    const { db } = database(
      { folios: [folio('local')], invoice_sales: [invoice('invoice')] },
      table,
    );
    await expect(getCustomerFolios(db, 120, customer)).rejects.toMatchObject({ code: '42703' });
  },
);

test('un importe inválido no se convierte en una deuda cero', async () => {
  const { db } = database({ invoice_sales: [{ ...invoice('invoice'), total: null }] });
  await expect(getCustomerFolios(db, 120, customer)).rejects.toThrow('Importe financiero inválido');
});

test('datos vacíos válidos conservan el estado vacío', async () => {
  await expect(getCustomerFolios(database().db, 120, customer)).resolves.toMatchObject({
    folios: [],
    invoices: [],
    summary: { total: { total: 0, sinTasa: [] } },
  });
});

test('no consulta sin organización válida', async () => {
  const { db, urls } = database();
  await expect(getCustomerFolios(db, 0, customer)).rejects.toThrow('organización');
  expect(urls).toHaveLength(0);
});

test('usa la conversión canónica con tasas de la organización y fecha contable, nunca suma USD como COP', async () => {
  jest.mocked(readF12Money).mockResolvedValue({
    ...money,
    rates: [
      { base_currency: 'USD', target_currency: 'COP', rate: 4000, effective_date: '2026-10-01' },
      { base_currency: 'USD', target_currency: 'COP', rate: 5000, effective_date: '2026-10-03' },
    ],
  });
  const { db } = database({ folios: [folio('local')], invoice_sales: [invoice('invoice')] });
  const { summary } = await getCustomerFolios(db, 120, customer);
  expect(summary.total?.total).toBe(62100.25);
  expect(summary.invoices?.total).toBe(62000);
  expect(summary.total?.sinTasa).toEqual([]);
  expect(readF12Money).toHaveBeenCalledWith(120, db, expect.any(Date));
});

test('falta de tasa conserva sinTasa; moneda del documento/base ausente produce resumen desconocido', async () => {
  const { summary } = await getCustomerFolios(
    database({ invoice_sales: [invoice('invoice')] }).db,
    120,
    customer,
  );
  expect(summary.invoices?.sinTasa.map((group) => group.moneda)).toEqual(['USD']);
  const absent = await getCustomerFolios(
    database({ invoice_sales: [{ ...invoice('invoice'), currency: null }] }).db,
    120,
    customer,
  );
  expect(absent.summary.total).toBeNull();
  expect(absent.summary.invoices).toBeNull();
  jest.mocked(readF12Money).mockResolvedValue({ ...money, base: null });
  const noBase = await getCustomerFolios(database({ folios: [folio('local')] }).db, 120, customer);
  expect(noBase.summary.total).toBeNull();
  expect(noBase.summary.base).toBeNull();
});

test('un fallo del contexto monetario canónico tampoco se disfraza de total vacío', async () => {
  jest.mocked(readF12Money).mockRejectedValue(new Error('FX query failed'));
  await expect(getCustomerFolios(database().db, 120, customer)).rejects.toThrow('FX query failed');
});

test('pagina más de mil folios/facturas sin ocultar importes ni repetir filas', async () => {
  const invoices = Array.from({ length: 1107 }, (_, index) => ({
    ...invoice(`invoice-${index}`),
    currency: 'COP',
  }));
  const folios = Array.from({ length: 1003 }, (_, index) => folio(`folio-${index}`));
  const { db, urls } = database({ folios, invoice_sales: invoices });
  const result = await getCustomerFolios(db, 120, customer);
  expect(new Set(result.folios.map((row) => row.id)).size).toBe(1003);
  expect(new Set(result.invoices.map((row) => row.id)).size).toBe(1107);
  expect(result.summary.total?.total).toBeCloseTo(1003 * 100.25 + 1107 * 15.5);
  expect(urls).toHaveLength(6);
  expect(urls.every((url) => url.searchParams.get('order')?.includes('id.desc'))).toBe(true);
});

test('un fallo en una página posterior rechaza el agregado completo', async () => {
  const invoices = Array.from({ length: 501 }, (_, index) => invoice(`invoice-${index}`));
  const { db } = database({ invoice_sales: invoices }, 'invoice_sales@500');
  await expect(getCustomerFolios(db, 120, customer)).rejects.toMatchObject({ code: '42703' });
});
