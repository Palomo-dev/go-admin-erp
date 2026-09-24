/**
 * Rutas de facturación electrónica: sesión obligatoria, organización de la
 * sesión (una ajena en el body → 403), documento de otra organización → 404
 * sin encolar, configuración sin credenciales, permisos en el servidor, y el
 * cron fail-closed con CRON_SECRET.
 */

import { crearDobleSupabase, type Tablas } from './dobleSupabase';

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

const ORG = 132;
const OTRA = 134;
const FACTURA = 'f0000000-0000-4000-8000-000000000001';
const FACTURA_AJENA = 'f0000000-0000-4000-8000-000000000002';

let tablas: Tablas;
let sesion: { organizationId: number; userId: string } | null;
let esAdmin: boolean;

function tablasBase(): Tablas {
  return {
    invoice_sales: [
      { id: FACTURA, organization_id: ORG, document_type: null },
      { id: FACTURA_AJENA, organization_id: OTRA, document_type: null },
      { id: 'nc-1', organization_id: ORG, document_type: 'credit_note', related_invoice_id: FACTURA },
    ],
    electronic_invoicing_config: [
      {
        organization_id: ORG,
        provider: 'factus',
        service_status: 'pending_activation',
        environment: 'production',
        credentials_secret_id: 'secreto-vault',
        client_secret: null,
        password: null,
        last_check_at: null,
      },
    ],
    electronic_invoicing_jobs: [],
    invoice_sequences: [],
    branches: [{ id: 107, organization_id: ORG }],
  };
}

const dbSesion = () => crearDobleSupabase(tablas);
const dbServicio = () => crearDobleSupabase(tablas);

function ctx() {
  if (!sesion) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  return { ...sesion, roleId: 5, isSuperAdmin: false, organizationName: 'Org', roleName: 'x', memberId: 1, userEmail: null, supabase: dbSesion() };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  getServerOrgContext: async () => ctx(),
  requireOrgAdminOrPermission: async () => {
    if (!esAdmin) throw new OrgContextError('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
  },
  withOrg:
    (handler: (c: unknown, req: Request, rp: unknown) => Promise<Response>) =>
    async (req: Request, rp: unknown) => {
      try {
        return await handler(ctx(), req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) {
          return new Response(JSON.stringify({ error: err.message, code: err.code }), { status: err.statusCode });
        }
        throw err;
      }
    },
}));
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => dbServicio(), assertServerOnly: () => undefined }));

const cola = {
  encolarDocumento: jest.fn(async (p: { organizationId: number }) => ({
    job: { id: 'job-1', status: 'pending', organization_id: p.organizationId },
    creado: true,
    servicioActivo: false,
  })),
  procesarAhora: jest.fn(),
  procesarPendientes: jest.fn(async () => ({ verificadas: [], resultados: [] })),
  liberarRetenido: jest.fn(async () => ({})),
};
jest.mock('@/lib/services/einvoicing/colaFacturacion.server', () => cola);
const acceso = {
  verificarYActivar: jest.fn(async () => ({ ok: true, activado: true, mensaje: 'ok', nitFactus: '900123456', empresaFactus: 'E' })),
  obtenerAccesoFactus: jest.fn(async () => ({ environment: 'sandbox', accessToken: 't', origen: 'organizacion' })),
  FacturacionNoActivadaError: class extends Error {},
};
jest.mock('@/lib/services/einvoicing/accesoFactus.server', () => acceso);
jest.mock('@/lib/services/einvoicing/rangosFactus.server', () => ({
  leerRangosFactus: async () => [],
  sincronizarRangos: async () => ({ importados: 0, desactivados: 0, omitidos: [] }),
}));

import { NextRequest } from 'next/server';
import * as invoice from '@/app/api/factus/invoice/route';
import * as creditNote from '@/app/api/factus/credit-note/route';
import * as debitNote from '@/app/api/factus/debit-note/route';
import * as config from '@/app/api/factus/config/route';
import * as processPending from '@/app/api/factus/process-pending/route';

type Handler = (req: NextRequest, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function call(h: unknown, r: NextRequest) {
  const res = await (h as Handler)(r, { params: Promise.resolve({}) });
  const json = (await res.clone().json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const ENV = { ...process.env };
beforeEach(() => {
  tablas = tablasBase();
  sesion = { organizationId: ORG, userId: 'u-1' };
  esAdmin = true;
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env = { ...ENV };
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  process.env = ENV;
});

describe('POST /api/factus/invoice', () => {
  test('sin sesión → 401 y no encola', async () => {
    sesion = null;
    const r = await call(invoice.POST, req('POST', '/api/factus/invoice', { invoiceId: FACTURA }));
    expect(r.status).toBe(401);
    expect(cola.encolarDocumento).not.toHaveBeenCalled();
  });

  test('organización ajena en el body → 403 y no encola', async () => {
    const r = await call(invoice.POST, req('POST', '/api/factus/invoice', { invoiceId: FACTURA, organizationId: OTRA }));
    expect(r.status).toBe(403);
    expect(cola.encolarDocumento).not.toHaveBeenCalled();
  });

  test('factura de otra organización → 404 y no encola', async () => {
    const r = await call(invoice.POST, req('POST', '/api/factus/invoice', { invoiceId: FACTURA_AJENA }));
    expect(r.status).toBe(404);
    expect(cola.encolarDocumento).not.toHaveBeenCalled();
  });

  test('servicio sin activar → 202 «pendiente de activación» y no intenta enviar', async () => {
    const r = await call(invoice.POST, req('POST', '/api/factus/invoice', { invoiceId: FACTURA }));
    expect(r.status).toBe(202);
    expect(r.json).toMatchObject({ queued: true, status: 'pending_activation' });
    expect(cola.encolarDocumento).toHaveBeenCalledWith({ organizationId: ORG, documentType: 'invoice', invoiceId: FACTURA });
    expect(cola.procesarAhora).not.toHaveBeenCalled();
  });

  test('servicio activo → encola y envía por el mismo camino del cron', async () => {
    cola.encolarDocumento.mockResolvedValueOnce({ job: { id: 'job-1', status: 'pending', organization_id: ORG }, creado: true, servicioActivo: true });
    cola.procesarAhora.mockResolvedValueOnce({ jobId: 'job-1', estado: 'accepted', numero: 'FE1', cufe: 'c' });
    const r = await call(invoice.POST, req('POST', '/api/factus/invoice', { invoiceId: FACTURA }));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, status: 'accepted', data: { number: 'FE1', cufe: 'c' } });
    expect(cola.procesarAhora).toHaveBeenCalledWith('job-1');
  });
});

describe('POST /api/factus/credit-note', () => {
  test('concepto inválido → 400', async () => {
    const r = await call(creditNote.POST, req('POST', '/api/factus/credit-note', { invoiceId: 'nc-1', reason: 'x', correctionConceptCode: '9' }));
    expect(r.status).toBe(400);
  });

  test('una factura (no nota) → 404', async () => {
    const r = await call(creditNote.POST, req('POST', '/api/factus/credit-note', { invoiceId: FACTURA, reason: 'x' }));
    expect(r.status).toBe(404);
  });

  test('encola con el motivo; los items del body se ignoran', async () => {
    await call(creditNote.POST, req('POST', '/api/factus/credit-note', { invoiceId: 'nc-1', reason: 'Devolución', items: [{ price: 1 }] }));
    expect(cola.encolarDocumento).toHaveBeenCalledWith({
      organizationId: ORG,
      documentType: 'credit_note',
      invoiceId: 'nc-1',
      opciones: { observacion: 'Devolución' },
    });
  });
});

test('POST /api/factus/debit-note → 501 sin tocar a Factus', async () => {
  const r = await call(debitNote.POST, req('POST', '/api/factus/debit-note', { invoiceId: FACTURA, reason: 'x' }));
  expect(r.status).toBe(501);
});

describe('/api/factus/config', () => {
  test('GET no devuelve credenciales ni el id del secreto', async () => {
    const r = await call(config.GET, req('GET', '/api/factus/config'));
    expect(r.status).toBe(200);
    expect(r.json.service).toMatchObject({ status: 'pending_activation', hasCredentials: true, environment: 'production' });
    const texto = JSON.stringify(r.json);
    expect(texto).not.toMatch(/secreto-vault|client_secret|password|credentials_secret_id/);
  });

  test('GET sin sesión → 401', async () => {
    sesion = null;
    expect((await call(config.GET, req('GET', '/api/factus/config'))).status).toBe(401);
  });

  test('POST sin permiso de administración → 403 y no verifica', async () => {
    esAdmin = false;
    const r = await call(config.POST, req('POST', '/api/factus/config', { action: 'verificar' }));
    expect(r.status).toBe(403);
    expect(acceso.verificarYActivar).not.toHaveBeenCalled();
  });

  test('POST verificar usa la organización y el usuario de la sesión', async () => {
    await call(config.POST, req('POST', '/api/factus/config', { action: 'verificar' }));
    expect(acceso.verificarYActivar).toHaveBeenCalledWith(ORG, 'u-1');
  });

  test('POST con organización ajena en el body → 403', async () => {
    const r = await call(config.POST, req('POST', '/api/factus/config', { action: 'verificar', organizationId: OTRA }));
    expect(r.status).toBe(403);
    expect(acceso.verificarYActivar).not.toHaveBeenCalled();
  });

  test('POST sincronizar con sucursal de otra organización → 404', async () => {
    const r = await call(config.POST, req('POST', '/api/factus/config', { action: 'sincronizar_rangos', branchId: 999 }));
    expect(r.status).toBe(404);
  });

  test('POST liberar un retenido: lo libera con la organización de la sesión y lo intenta enviar', async () => {
    cola.procesarAhora.mockResolvedValueOnce(null);
    const r = await call(config.POST, req('POST', '/api/factus/config', { action: 'liberar', jobId: 'job-9' }));
    expect(r.status).toBe(200);
    expect(cola.liberarRetenido).toHaveBeenCalledWith({ jobId: 'job-9', organizationId: ORG, actor: 'u-1' });
    expect(cola.procesarAhora).toHaveBeenCalledWith('job-9');
  });
});

describe('cron /api/factus/process-pending (fail-closed)', () => {
  test('sin CRON_SECRET configurado → 401 siempre', async () => {
    delete process.env.CRON_SECRET;
    delete process.env.FACTUS_CRON_API_KEY;
    const r = await call(processPending.GET, req('GET', '/api/factus/process-pending', undefined, { authorization: 'Bearer cualquier-cosa' }));
    expect(r.status).toBe(401);
    expect(cola.procesarPendientes).not.toHaveBeenCalled();
  });

  test('secreto equivocado → 401', async () => {
    process.env.CRON_SECRET = 'secreto-de-cron-suficientemente-largo';
    const r = await call(processPending.POST, req('POST', '/api/factus/process-pending', undefined, { authorization: 'Bearer otro' }));
    expect(r.status).toBe(401);
    expect(cola.procesarPendientes).not.toHaveBeenCalled();
  });

  test('GET de Vercel Cron con el secreto → procesa', async () => {
    process.env.CRON_SECRET = 'secreto-de-cron-suficientemente-largo';
    const r = await call(processPending.GET, req('GET', '/api/factus/process-pending', undefined, { authorization: 'Bearer secreto-de-cron-suficientemente-largo' }));
    expect(r.status).toBe(200);
    expect(cola.procesarPendientes).toHaveBeenCalledWith(10);
  });
});
