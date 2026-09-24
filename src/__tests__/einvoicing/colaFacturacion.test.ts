/**
 * Cola de facturación electrónica: un envío por job reclamado, reintentos con
 * espera, rechazos, organizaciones sin servicio activo (no se envía nada),
 * idempotencia al encolar y documentos retenidos.
 */

import { crearDobleSupabase, type Tablas, type Fila } from './dobleSupabase';

let db: ReturnType<typeof crearDobleSupabase>;

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => db,
  assertServerOnly: () => undefined,
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: async () => 'UTC',
}));
const invalidarTokenPara = jest.fn();
jest.mock('@/lib/services/factusTokenManager', () => ({
  obtenerTokenPara: async () => 'token-org',
  invalidarTokenPara: (...a: unknown[]) => invalidarTokenPara(...a),
  getCredentials: () => null,
}));
const createInvoice = jest.fn();
const createCreditNote = jest.fn();
const createSupportDocument = jest.fn();
jest.mock('@/lib/services/factusService', () => {
  const real = jest.requireActual('@/lib/services/factusService');
  return {
    ...real,
    __esModule: true,
    default: {
      ...real.default,
      createInvoice: (...a: unknown[]) => createInvoice(...a),
      createCreditNote: (...a: unknown[]) => createCreditNote(...a),
      createSupportDocument: (...a: unknown[]) => createSupportDocument(...a),
    },
  };
});

import { FactusApiError } from '@/lib/services/factusService';
import {
  procesarJob,
  procesarAhora,
  encolarDocumento,
  type JobCola,
} from '@/lib/services/einvoicing/colaFacturacion.server';

const ORG = 132;
const FACTURA = 'f0000000-0000-4000-8000-000000000001';
const MUNI = 'm-1';

let credencialesActivas: boolean;
let registros: Array<Record<string, unknown>>;

function tablasBase(): Tablas {
  return {
    invoice_sales: [
      {
        id: FACTURA,
        organization_id: ORG,
        branch_id: 107,
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
      { id: 11, organization_id: ORG, branch_id: 107, document_type: 'invoice', prefix: 'FE', is_active: true, factus_numbering_range_id: 55, valid_from: null, valid_until: null },
    ],
    organizations: [{ id: ORG, name: 'Organización de prueba', municipality_id: MUNI }],
    municipalities: [{ id: MUNI, code: '11001' }],
    electronic_invoicing_jobs: [],
    electronic_invoicing_config: [],
    support_documents: [],
  };
}

function job(extra: Partial<JobCola> = {}): JobCola {
  return {
    id: 'job-1',
    organization_id: ORG,
    invoice_id: FACTURA,
    support_document_id: null,
    document_type: 'invoice',
    status: 'processing',
    attempt_count: 0,
    max_attempts: 5,
    reference_code: null,
    request_payload: null,
    ...extra,
  };
}

function crearDb(tablas: Tablas = tablasBase(), extra: { reclamar?: Fila[]; errorInsert?: boolean } = {}) {
  return crearDobleSupabase(
    tablas,
    {
      fn_factus_credenciales_leer: () => ({
        data: credencialesActivas
          ? [{ environment: 'production', client_id: 'c', client_secret: 's', username: 'u', password: 'p', service_status: 'active', factus_company_nit: '900123456' }]
          : [],
      }),
      fn_einvoicing_registrar_resultado: (args) => {
        registros.push(args);
        return { data: {} };
      },
      fn_einvoicing_reclamar_jobs: () => ({ data: extra.reclamar ?? [] }),
    },
    { errorInsert: extra.errorInsert ? () => ({ code: '23505', message: 'duplicate key' }) : undefined },
  );
}

beforeEach(() => {
  credencialesActivas = true;
  registros = [];
  jest.clearAllMocks();
  db = crearDb();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('procesarJob', () => {
  test('aceptado: envía con la cuenta de la organización y registra CUFE, número y QR', async () => {
    createInvoice.mockResolvedValue({
      data: { number: 'FE990001', cufe: 'cufe-1', is_validated: true, links: { qr: 'https://qr' } },
    });
    const r = await procesarJob(job(), 'w1', db as never);

    expect(r).toMatchObject({ estado: 'accepted', numero: 'FE990001', cufe: 'cufe-1' });
    const [ambiente, token, payload] = createInvoice.mock.calls[0];
    expect(ambiente).toBe('production');
    expect(token).toBe('token-org');
    expect(payload).toMatchObject({ numbering_range_id: 55, payment_details: [{ amount: '11900.00' }], establishment: { municipality_code: '11001' } });
    expect(registros[0]).toMatchObject({
      p_job_id: 'job-1',
      p_worker: 'w1',
      p_estado: 'accepted',
      p_contar_intento: true,
      p_cufe: 'cufe-1',
      p_numero: 'FE990001',
      p_qr: 'https://qr',
    });
    // La referencia es estable: se guarda en la factura para los reintentos.
    expect(registros[0].p_reference_code).toBe(`INV-${FACTURA.replace(/-/g, '')}`);
  });

  test('Factus no responde (503): vuelve a la cola en 2 minutos', async () => {
    createInvoice.mockRejectedValue(new FactusApiError('Service Unavailable', 503));
    const antes = Date.now();
    const r = await procesarJob(job(), 'w1', db as never);

    expect(r.estado).toBe('pending');
    expect(registros[0]).toMatchObject({ p_estado: 'pending', p_contar_intento: true, p_error_code: 'factus_http_503' });
    const espera = (new Date(String(registros[0].p_next_retry_at)).getTime() - antes) / 60000;
    expect(espera).toBeGreaterThan(1.9);
    expect(espera).toBeLessThan(2.1);
  });

  test('cuarto fallo: espera 16 minutos; quinto: failed', async () => {
    createInvoice.mockRejectedValue(new FactusApiError('Bad Gateway', 502));
    const antes = Date.now();
    await procesarJob(job({ attempt_count: 3 }), 'w1', db as never);
    const espera = (new Date(String(registros[0].p_next_retry_at)).getTime() - antes) / 60000;
    expect(Math.round(espera)).toBe(16);

    await procesarJob(job({ attempt_count: 4 }), 'w1', db as never);
    expect(registros[1]).toMatchObject({ p_estado: 'failed', p_next_retry_at: null });
  });

  test('rechazo de validación (422): rejected, sin reintento', async () => {
    createInvoice.mockRejectedValue(new FactusApiError('Error de validación: {"customer":["..."]}', 422, { data: {} }));
    const r = await procesarJob(job(), 'w1', db as never);
    expect(r.estado).toBe('rejected');
    expect(registros[0]).toMatchObject({ p_estado: 'rejected', p_next_retry_at: null, p_error_code: 'factus_http_422' });
  });

  test('401: olvida el token y reintenta', async () => {
    createInvoice.mockRejectedValue(new FactusApiError('Unauthenticated', 401));
    await procesarJob(job(), 'w1', db as never);
    expect(invalidarTokenPara).toHaveBeenCalled();
    expect(registros[0].p_estado).toBe('pending');
  });

  test('organización sin servicio activo: no se envía nada y no se gasta intento', async () => {
    credencialesActivas = false;
    const r = await procesarJob(job(), 'w1', db as never);
    expect(createInvoice).not.toHaveBeenCalled();
    expect(r.estado).toBe('pending');
    expect(registros[0]).toMatchObject({ p_estado: 'pending', p_contar_intento: false, p_error_code: 'servicio_no_activo' });
  });

  test('sin rango de numeración: failed por datos incompletos, sin llamar a Factus', async () => {
    const tablas = tablasBase();
    tablas.invoice_sequences = [];
    db = crearDb(tablas);
    const r = await procesarJob(job(), 'w1', db as never);
    expect(createInvoice).not.toHaveBeenCalled();
    expect(r.estado).toBe('failed');
    expect(registros[0]).toMatchObject({ p_error_code: 'datos_incompletos' });
  });

  test('nota crédito cuya factura sigue en cola: espera sin gastar intento', async () => {
    const tablas = tablasBase();
    tablas.invoice_sales.push({ id: 'nc-1', organization_id: ORG, document_type: 'credit_note', related_invoice_id: FACTURA, total: -11900 });
    tablas.electronic_invoicing_jobs.push({ id: 'job-f', invoice_id: FACTURA, document_type: 'invoice', status: 'pending', organization_id: ORG });
    db = crearDb(tablas);
    const r = await procesarJob(job({ id: 'job-nc', invoice_id: 'nc-1', document_type: 'credit_note' }), 'w1', db as never);
    expect(createCreditNote).not.toHaveBeenCalled();
    expect(r.estado).toBe('pending');
    expect(registros[0]).toMatchObject({ p_contar_intento: false, p_error_code: 'esperando_factura' });
  });

  test('nota crédito con factura aceptada: payload v2 con el número DIAN de la factura', async () => {
    const tablas = tablasBase();
    Object.assign(tablas.invoice_sales[0], { einvoice_status: 'accepted', einvoice_number: 'FE990001' });
    tablas.invoice_sales.push({ id: 'nc-1', organization_id: ORG, document_type: 'credit_note', related_invoice_id: FACTURA, total: -11900, branch_id: 107 });
    tablas.invoice_items.push({ invoice_sales_id: 'nc-1', qty: -1, unit_price: 11900, tax_rate: 19, tax_included: true, product_id: 5 });
    db = crearDb(tablas);
    createCreditNote.mockResolvedValue({ data: { number: 'NC1', cude: 'cude-1', is_validated: true, correction_concept: { code: '2' } } });

    const r = await procesarJob(
      job({ id: 'job-nc', invoice_id: 'nc-1', document_type: 'credit_note', request_payload: { opciones: { observacion: 'Devolución' } } }),
      'w1',
      db as never,
    );
    expect(r.estado).toBe('accepted');
    const payload = createCreditNote.mock.calls[0][2];
    expect(payload).toMatchObject({ bill_number: 'FE990001', customization_id: '20', correction_concept_code: '2', observation: 'Devolución' });
    expect(registros[0]).toMatchObject({ p_cufe: 'cude-1', p_numero: 'NC1' });
  });

  test('documento soporte: el job va por support_document_id y se envía como documento soporte', async () => {
    const tablas = tablasBase();
    tablas.support_documents.push({ id: 'sd-1', organization_id: ORG, reference_code: 'DS-0001', total: 1000, provider: { identification: '123', names: 'Proveedor' }, numbering_range_id: 2058, branch: null });
    tablas.invoice_items.push({ support_document_id: 'sd-1', qty: 1, unit_price: 1000, tax_rate: 0 });
    db = crearDb(tablas);
    createSupportDocument.mockResolvedValue({ data: { number: 'DS1', cuds: 'cuds-1', is_validated: true } });
    const r = await procesarJob(job({ id: 'job-sd', invoice_id: null, support_document_id: 'sd-1', document_type: 'support_document' }), 'w1', db as never);
    expect(r.estado).toBe('accepted');
    expect(createSupportDocument.mock.calls[0][2]).toMatchObject({ reference_code: 'DS-0001', numbering_range_id: 2058 });
    expect(registros[0]).toMatchObject({ p_cufe: 'cuds-1' });
  });

  test('si no se puede registrar el resultado, lanza (el bloqueo lo recupera la cola a los 10 min)', async () => {
    createInvoice.mockResolvedValue({ data: { number: 'X', cufe: 'c', is_validated: true } });
    db = crearDobleSupabase(tablasBase(), {
      fn_factus_credenciales_leer: () => ({ data: [{ environment: 'sandbox', client_id: 'c', client_secret: 's', username: 'u', password: 'p', service_status: 'active' }] }),
      fn_einvoicing_registrar_resultado: () => ({ error: { code: 'P0001', message: 'no reclamado' } }),
    });
    await expect(procesarJob(job(), 'w-viejo', db as never)).rejects.toThrow(/registrar/);
  });
});

describe('procesarAhora', () => {
  test('si el job no se puede reclamar (retenido, en vuelo o sin servicio) no envía nada', async () => {
    db = crearDb(tablasBase(), { reclamar: [] });
    expect(await procesarAhora('job-1')).toBeNull();
    expect(createInvoice).not.toHaveBeenCalled();
    expect(db.llamadas.find((l) => l.nombre === 'fn_einvoicing_reclamar_jobs')?.args).toMatchObject({ p_job_id: 'job-1', p_limite: 1 });
  });
});

describe('encolarDocumento: un job vivo por documento', () => {
  test('servicio no activo: el job nuevo queda retenido', async () => {
    const tablas = tablasBase();
    db = crearDb(tablas);
    const r = await encolarDocumento({ organizationId: ORG, documentType: 'invoice', invoiceId: FACTURA });
    expect(r.creado).toBe(true);
    expect(r.servicioActivo).toBe(false);
    expect(tablas.electronic_invoicing_jobs[0]).toMatchObject({ status: 'pending', hold_reason: expect.stringContaining('fecha') });
    expect(tablas.invoice_sales[0].einvoice_status).toBe('pending');
  });

  test('servicio activo: sin retención', async () => {
    const tablas = tablasBase();
    tablas.electronic_invoicing_config.push({ organization_id: ORG, provider: 'factus', service_status: 'active', is_active: true, credentials_secret_id: 's' });
    db = crearDb(tablas);
    const r = await encolarDocumento({ organizationId: ORG, documentType: 'invoice', invoiceId: FACTURA });
    expect(r.servicioActivo).toBe(true);
    expect(tablas.electronic_invoicing_jobs[0].hold_reason).toBeNull();
  });

  test('segunda llamada devuelve el mismo job (no duplica)', async () => {
    const tablas = tablasBase();
    tablas.electronic_invoicing_jobs.push({ id: 'job-vivo', organization_id: ORG, invoice_id: FACTURA, document_type: 'invoice', status: 'processing' });
    db = crearDb(tablas);
    const r = await encolarDocumento({ organizationId: ORG, documentType: 'invoice', invoiceId: FACTURA });
    expect(r).toMatchObject({ creado: false, job: { id: 'job-vivo' } });
    expect(tablas.electronic_invoicing_jobs).toHaveLength(1);
  });

  test('job rechazado: se vuelve a poner en cola desde cero (reenvío tras corregir)', async () => {
    const tablas = tablasBase();
    tablas.electronic_invoicing_config.push({ organization_id: ORG, provider: 'factus', service_status: 'active', is_active: true, credentials_secret_id: 's' });
    tablas.electronic_invoicing_jobs.push({ id: 'job-r', organization_id: ORG, invoice_id: FACTURA, document_type: 'invoice', status: 'rejected', attempt_count: 1, error_message: 'x' });
    db = crearDb(tablas);
    await encolarDocumento({ organizationId: ORG, documentType: 'invoice', invoiceId: FACTURA });
    expect(tablas.electronic_invoicing_jobs[0]).toMatchObject({ status: 'pending', attempt_count: 0, error_message: null });
  });

  test('carrera con otra petición (índice único): devuelve el job que ganó', async () => {
    const tablas = tablasBase();
    db = crearDb(tablas, { errorInsert: true });
    // El índice único rechaza el insert; la otra petición ya dejó su job.
    const ganador = { id: 'job-ganador', organization_id: ORG, invoice_id: FACTURA, document_type: 'invoice', status: 'pending' };
    const buscarOriginal = db.from;
    let llamadasBuscar = 0;
    db.from = (t: string) => {
      if (t === 'electronic_invoicing_jobs' && ++llamadasBuscar === 2) tablas.electronic_invoicing_jobs.push(ganador);
      return buscarOriginal(t);
    };
    const r = await encolarDocumento({ organizationId: ORG, documentType: 'invoice', invoiceId: FACTURA });
    expect(r).toMatchObject({ creado: false, job: { id: 'job-ganador' } });
  });
});
