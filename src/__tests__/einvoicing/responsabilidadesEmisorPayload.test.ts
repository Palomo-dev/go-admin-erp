/**
 * Caracterización del payload de Factus frente a H2 (responsabilidades del RUT
 * por vigencia). El envío a Factus NO lleva las responsabilidades del emisor:
 * Factus las toma de la empresa registrada en la cuenta. Por eso H2 no cambia
 * el payload ni el flujo de la cola: con o sin perfil por vigencias, y con
 * cualquier valor en `organizations.fiscal_responsibilities`, el documento
 * enviado es idéntico y la cola no consulta el perfil. Si algún día el emisor
 * viaja en el payload, este test obliga a leerlo con
 * `responsabilidadesFiscalesEn` en la fecha del documento.
 */

import { crearDobleSupabase, type Tablas } from './dobleSupabase';

let db: ReturnType<typeof crearDobleSupabase>;

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => db,
  assertServerOnly: () => undefined,
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: async () => 'America/Bogota',
}));
jest.mock('@/lib/services/factusTokenManager', () => ({
  obtenerTokenPara: async () => 'token-org',
  invalidarTokenPara: () => undefined,
  getCredentials: () => null,
}));
const createInvoice = jest.fn();
jest.mock('@/lib/services/factusService', () => {
  const real = jest.requireActual('@/lib/services/factusService');
  return {
    ...real,
    __esModule: true,
    default: { ...real.default, createInvoice: (...a: unknown[]) => createInvoice(...a) },
  };
});

import { procesarJob, type JobCola } from '@/lib/services/einvoicing/colaFacturacion.server';

const ORG = 374;
const FACTURA = 'f0000000-0000-4000-8000-000000000374';
const MUNI = 'm-374';

function tablas(responsabilidades: string[] | null): Tablas {
  return {
    invoice_sales: [
      {
        id: FACTURA,
        organization_id: ORG,
        branch_id: 585,
        issue_date: '2027-01-01T15:00:00Z',
        total: 11900,
        payment_form: '1',
        payment_method_code: '10',
        reference_code: null,
        customer: null,
        branch: { name: 'Sede', address: 'Calle 1', phone: '3000000000', email: 'sede@example.com', municipality_id: MUNI },
      },
    ],
    invoice_items: [{ invoice_sales_id: FACTURA, qty: 1, unit_price: 11900, tax_rate: 19, tax_included: true, description: 'Producto' }],
    invoice_sequences: [
      { id: 11, organization_id: ORG, branch_id: 585, document_type: 'invoice', prefix: 'FE', is_active: true, factus_numbering_range_id: 55, valid_from: null, valid_until: null },
    ],
    organizations: [{ id: ORG, name: 'Empresa de prueba', municipality_id: MUNI, fiscal_responsibilities: responsabilidades }],
    municipalities: [{ id: MUNI, code: '11001' }],
    electronic_invoicing_jobs: [],
    electronic_invoicing_config: [],
    support_documents: [],
  };
}

function crearDb(responsabilidades: string[] | null, conPerfil: boolean) {
  return crearDobleSupabase(tablas(responsabilidades), {
    fn_factus_credenciales_leer: () => ({
      data: [{ environment: 'production', client_id: 'c', client_secret: 's', username: 'u', password: 'p', service_status: 'active', factus_company_nit: '900123456' }],
    }),
    fn_einvoicing_registrar_resultado: () => ({ data: {} }),
    ...(conPerfil ? { fn_responsabilidades_fiscales_en: () => ({ data: ['O-47'] }) } : {}),
  });
}

const job: JobCola = {
  id: 'job-374',
  organization_id: ORG,
  invoice_id: FACTURA,
  support_document_id: null,
  document_type: 'invoice',
  status: 'processing',
  attempt_count: 0,
  max_attempts: 5,
  reference_code: null,
  request_payload: null,
};

async function payloadCon(responsabilidades: string[] | null, conPerfil: boolean) {
  createInvoice.mockReset();
  createInvoice.mockResolvedValue({ data: { number: 'FE1', cufe: 'cufe-1', is_validated: true, links: { qr: 'https://qr' } } });
  db = crearDb(responsabilidades, conPerfil);
  await procesarJob(job, 'w1', db as never);
  expect(createInvoice).toHaveBeenCalledTimes(1);
  return { payload: createInvoice.mock.calls[0][2] as Record<string, unknown>, rpcs: db.llamadas.map((l) => l.nombre) };
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('payload de Factus y responsabilidades del emisor (H2)', () => {
  it('sin perfil: mismo payload con cualquier valor en la ficha de la organización', async () => {
    const sinNada = await payloadCon(null, false);
    const conFicha = await payloadCon(['O-13'], false);
    expect(conFicha.payload).toEqual(sinNada.payload);
  });

  it('con perfil por vigencias: el payload es el mismo y la cola no consulta el perfil', async () => {
    const antes = await payloadCon(['O-13'], false);
    const despues = await payloadCon(['O-13'], true);
    expect(despues.payload).toEqual(antes.payload);
    expect(despues.rpcs).not.toContain('fn_responsabilidades_fiscales_en');
  });

  it('el payload no lleva responsabilidades del emisor (solo las del adquiriente)', async () => {
    const { payload } = await payloadCon(['O-13', 'O-48'], true);
    const texto = JSON.stringify(payload);
    expect(texto).not.toContain('O-13');
    expect(texto).not.toContain('O-48');
    expect(texto).not.toContain('O-47');
    // Consumidor final: la única responsabilidad del documento es la del adquiriente.
    expect((payload.customer as Record<string, unknown>).responsibilities).toEqual(['R-99-PN']);
  });
});
