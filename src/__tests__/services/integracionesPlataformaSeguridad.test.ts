/**
 * Open Finance, PayFac, Factus y webhooks de cobro: huecos de la auditoría de
 * integraciones (docs/design/AUDITORIA-INTEGRACIONES-OPENFINANCE-PAYFAC-FACTUS.md),
 * cerrados el 2026-09-23 (GO-sec).
 *
 * Por ruta: sin sesión → 401; organización ajena en body o query → 403 y
 * registro; recurso de otra organización → 404 SIN llamar al proveedor ni al
 * servicio; permiso faltante → 403; flujos que no pueden asegurarse → 501 sin
 * llamar al proveedor; cron sin secreto → 401; webhook sin firma o con firma
 * inválida → rechazado sin procesar.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

// ─── Base de datos doble ─────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeDb(tables: () => Record<string, Row[]>, rpcImpl: (name: string) => unknown = () => false) {
  return {
    from(table: string) {
      const filtros: Array<[string, string, unknown]> = [];
      let op: 'select' | 'update' | 'insert' = 'select';
      let conteo = false;
      let payload: unknown = null;
      const filas = () =>
        (tables()[table] ?? []).filter((r) =>
          filtros.every(([o, c, v]) => (o === 'eq' ? String(r[c]) === String(v) : o === 'in' ? (v as unknown[]).includes(r[c]) : true))
        );
      const resultado = () => {
        if (op === 'insert') {
          const fila = { id: 'nuevo-id', ...(payload as Row) };
          (tables()[table] ??= []).push(fila);
          return { data: [fila], error: null, count: null };
        }
        const rs = filas();
        if (op === 'update') rs.forEach((r) => Object.assign(r, payload as Row));
        return { data: conteo ? null : rs, error: null, count: rs.length };
      };
      const b = {
        select: (_c?: string, opts?: { count?: string }) => ((conteo = Boolean(opts?.count && (opts as { head?: boolean }).head)), b),
        eq: (c: string, v: unknown) => (filtros.push(['eq', c, v]), b),
        in: (c: string, v: unknown) => (filtros.push(['in', c, v]), b),
        order: () => b,
        range: () => b,
        limit: () => b,
        insert: (p: unknown) => ((op = 'insert'), (payload = p), b),
        update: (p: unknown) => ((op = 'update'), (payload = p), b),
        maybeSingle: async () => {
          const r = resultado();
          return { data: (r.data as Row[] | null)?.[0] ?? null, error: null };
        },
        single: async () => {
          const r = resultado();
          const fila = (r.data as Row[] | null)?.[0] ?? null;
          return { data: fila, error: fila ? null : { message: 'no rows' } };
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko),
      };
      return b;
    },
    rpc: async (name: string) => ({ data: rpcImpl(name), error: null }),
  };
}

const ORG = 120;
const OTRA = 121;
const USER = '0f0f0f0f-1111-4222-8333-444444444444';
const LINK = 'aaaaaaaa-0000-4000-8000-000000000120';
const LINK_AJENO = 'aaaaaaaa-0000-4000-8000-000000000121';
const FACTURA = 'bbbbbbbb-0000-4000-8000-000000000120';
const FACTURA_AJENA = 'bbbbbbbb-0000-4000-8000-000000000121';

let data: Record<string, Row[]>;
function freshData(): Record<string, Row[]> {
  return {
    support_documents: [
      { id: 'sd-1', organization_id: ORG, reference_code: 'DS-0001', is_validated: false },
      { id: 'sd-2', organization_id: OTRA, reference_code: 'DS-0002', is_validated: false },
      { id: 'sd-3', organization_id: ORG, reference_code: 'DS-0003', is_validated: false },
      { id: 'sd-4', organization_id: OTRA, reference_code: 'DS-0003', is_validated: false },
    ],
    electronic_invoicing_jobs: [
      { id: 'job-1', organization_id: ORG, status: 'failed' },
      { id: 'job-2', organization_id: OTRA, status: 'failed' },
      { id: 'job-3', organization_id: ORG, status: 'accepted' },
    ],
    electronic_invoicing_events: [],
    invoice_sales: [
      { id: FACTURA, organization_id: ORG, number: '1' },
      { id: FACTURA_AJENA, organization_id: OTRA, number: '1' },
    ],
    open_finance_links: [
      { id: LINK, organization_id: ORG, provider: 'prometeo', institution_code: 'x' },
      { id: LINK_AJENO, organization_id: OTRA, provider: 'prometeo', institution_code: 'x' },
    ],
    bank_accounts: [
      { id: 7, organization_id: ORG },
      { id: 8, organization_id: OTRA },
    ],
    organization_payout_accounts: [
      { id: 'pa-1', organization_id: ORG },
      { id: 'pa-2', organization_id: OTRA },
    ],
  };
}

// ─── Sesión doble ────────────────────────────────────────────────────────────

let session: { organizationId: number; userId: string; roleId: number; isSuperAdmin: boolean } | null;
let permisos: string[];
let esAdminPlataforma: boolean;

const sessionDb = makeDb(() => data, (name) => (name === 'fn_is_platform_admin' ? esAdminPlataforma : false));
const serviceDb = makeDb(() => data);

function ctxDeSesion() {
  if (!session) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  return { ...session, organizationName: 'Org', roleName: 'x', memberId: 1, userEmail: null, supabase: sessionDb };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  hasOrgAdminOrPermission: async (_ctx: unknown, code: string) => permisos.includes(code),
  getServerOrgContext: async () => ctxDeSesion(),
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
    async (req: Request, rp: unknown) => {
      try {
        return await handler(ctxDeSesion(), req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) {
          return new Response(JSON.stringify({ error: err.message, code: err.code }), { status: err.statusCode });
        }
        throw err;
      }
    },
  // Misma semántica que el `withCron` real: `verifyCronSecret` de webhookSignatures (real).
  withCron:
    (handler: (req: Request, rp: unknown) => Promise<Response>) =>
    async (req: Request, rp: unknown) => {
      const { verifyCronSecret, WebhookError } = jest.requireActual<typeof import('@/lib/security/webhookSignatures')>('@/lib/security/webhookSignatures');
      try {
        verifyCronSecret(req);
      } catch (err) {
        if (err instanceof WebhookError) return new Response(JSON.stringify({ code: err.code }), { status: err.statusCode });
        throw err;
      }
      return handler(req, rp);
    },
}));
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/supabase/server-user', () => ({
  getServerUserClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session ? { id: session.userId } : null }, error: null }) },
    rpc: sessionDb.rpc,
    from: sessionDb.from,
  }),
}));

// ─── Proveedores y servicios dobles ──────────────────────────────────────────

const factus = {
  getSupportDocumentByReference: jest.fn(async () => ({ data: { ok: true } })),
  deleteSupportDocument: jest.fn(async () => ({ status: 'OK' })),
  getInvoiceByReference: jest.fn(async (_e: string, _t: string, ref: string) => ({ data: { bill: { reference_code: ref, number: 'SETP990001' } } })),
  downloadPDF: jest.fn(async () => Buffer.from('%PDF')),
  downloadXML: jest.fn(async () => '<xml/>'),
  createSupportDocument: jest.fn(),
};
jest.mock('@/lib/services/factusService', () => ({
  __esModule: true,
  default: factus,
  mapUnitMeasure: () => '70',
  mapStandardCode: () => '1',
  mapTaxCode: () => '01',
}));
jest.mock('@/lib/services/factusTokenManager', () => ({
  getCredentials: () => ({ environment: 'sandbox' }),
  getValidToken: async () => 'token',
}));

const openFinance = {
  getLinks: jest.fn(async () => [{ id: LINK, organization_id: ORG, session_key: 'SECRETO-BANCARIO', status: 'active' }]),
  getAccounts: jest.fn(async () => []),
  initiateTransfer: jest.fn(),
  processWebhookEvent: jest.fn(async () => ({ success: true })),
};
jest.mock('@/lib/services/integrations/openFinance/openFinanceService', () => ({ openFinanceService: openFinance }));
const pagos = { paySupplier: jest.fn() };
jest.mock('@/lib/services/integrations/openFinance/paymentInitiationService', () => ({ paymentInitiationService: pagos }));

const payout = {
  listAccounts: jest.fn(async () => [{ id: 'pa-1', account_number: '1234567890', account_holder_id: '80123456', breb_key_value: null }]),
  createAccount: jest.fn(async () => ({ id: 'pa-nueva' })),
  deactivateAccount: jest.fn(async () => ({ success: true })),
  list: jest.fn(async () => []),
  create: jest.fn(async () => ({ success: true, payoutId: 'po-1' })),
  getById: jest.fn(async () => ({ id: 'po-9', organization_id: OTRA })),
};
jest.mock('@/lib/services/integrations/payfac', () => ({ payoutService: payout, commissionService: {} }));

const getSupabaseAdmin = () => serviceDb;
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));
const mono = { verifyWebhookSignature: jest.fn(() => false), processWebhook: jest.fn() };
jest.mock('@/lib/services/integrations/breb', () => ({ monoService: mono }));
const banco = { verifyJwtNotification: jest.fn(() => true), decodeJwtPayload: jest.fn(() => ({})), processWebhook: jest.fn() };
jest.mock('@/lib/services/integrations/bancolombia', () => ({ bancolombiaService: banco }));

import { NextRequest } from 'next/server';
import * as supportDocument from '@/app/api/factus/support-document/route';
import * as jobs from '@/app/api/factus/jobs/route';
import * as download from '@/app/api/factus/download/route';
import * as transfer from '@/app/api/integrations/open-finance/transfer/route';
import * as paySupplier from '@/app/api/integrations/open-finance/pay-supplier/route';
import * as links from '@/app/api/integrations/open-finance/links/route';
import * as accounts from '@/app/api/integrations/open-finance/accounts/route';
import * as cronDaily from '@/app/api/integrations/open-finance/cron/daily-sync/route';
import * as cronPagos from '@/app/api/integrations/open-finance/cron/scheduled-payments/route';
import * as webhookOF from '@/app/api/integrations/open-finance/webhook/route';
import * as payoutAccounts from '@/app/api/integrations/payfac/payout-accounts/route';
import * as payoutAccount from '@/app/api/integrations/payfac/payout-accounts/[id]/route';
import * as payouts from '@/app/api/integrations/payfac/payouts/route';
import * as payoutId from '@/app/api/integrations/payfac/payouts/[id]/route';
import * as brebWebhook from '@/app/api/integrations/breb/webhook/route';
import * as redebanWebhook from '@/app/api/integrations/redeban/webhook/route';
import * as bancolombiaWebhook from '@/app/api/integrations/bancolombia/webhook/route';
import * as wompiWebhook from '@/app/api/integrations/wompi/webhook/route';

type Handler = (req: NextRequest, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;
const rp = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}
async function call(h: unknown, r: NextRequest, params?: Record<string, string>) {
  const res = await (h as Handler)(r, rp(params));
  let json: Record<string, unknown> = {};
  try {
    json = (await res.clone().json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

const TODOS = ['finance.view', 'finance.create', 'finance.approve', 'finance.void'];

beforeEach(() => {
  data = freshData();
  session = { organizationId: ORG, userId: USER, roleId: 5, isSuperAdmin: false };
  permisos = [...TODOS];
  esAdminPlataforma = false;
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ─── Factus ─────────────────────────────────────────────────────────────────

describe('Factus support-document (antes GET ?ref= y DELETE sin autenticación)', () => {
  test('GET ?ref= sin sesión → 401 y Factus no se llama', async () => {
    session = null;
    const r = await call(supportDocument.GET, req('GET', '/api/factus/support-document?ref=DS-0001'));
    expect(r.status).toBe(401);
    expect(factus.getSupportDocumentByReference).not.toHaveBeenCalled();
  });

  test('DELETE sin sesión → 401 y Factus no borra nada', async () => {
    session = null;
    const r = await call(supportDocument.DELETE, req('DELETE', '/api/factus/support-document?ref=DS-0001'));
    expect(r.status).toBe(401);
    expect(factus.deleteSupportDocument).not.toHaveBeenCalled();
  });

  test('ref de otra organización → 404 sin llamar a Factus', async () => {
    const g = await call(supportDocument.GET, req('GET', '/api/factus/support-document?ref=DS-0002'));
    const d = await call(supportDocument.DELETE, req('DELETE', '/api/factus/support-document?ref=DS-0002'));
    expect([g.status, d.status]).toEqual([404, 404]);
    expect(factus.getSupportDocumentByReference).not.toHaveBeenCalled();
    expect(factus.deleteSupportDocument).not.toHaveBeenCalled();
  });

  test('ref repetido en otra organización (cuenta compartida) → 409 sin llamar a Factus', async () => {
    const r = await call(supportDocument.DELETE, req('DELETE', '/api/factus/support-document?ref=DS-0003'));
    expect(r.status).toBe(409);
    expect(factus.deleteSupportDocument).not.toHaveBeenCalled();
  });

  test('?organizationId= ajeno → 403 FOREIGN_ORGANIZATION', async () => {
    const r = await call(supportDocument.GET, req('GET', `/api/factus/support-document?organizationId=${OTRA}`));
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('FOREIGN_ORGANIZATION');
  });

  test('POST con organizationId ajeno en el body → 403', async () => {
    const r = await call(supportDocument.POST, req('POST', '/api/factus/support-document', { organizationId: OTRA, supportDocumentId: 'sd-2' }));
    expect(r.status).toBe(403);
  });

  test('DELETE sin finance.void → 403 PERMISSION_REQUIRED', async () => {
    permisos = ['finance.view'];
    const r = await call(supportDocument.DELETE, req('DELETE', '/api/factus/support-document?ref=DS-0001'));
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('PERMISSION_REQUIRED');
    expect(factus.deleteSupportDocument).not.toHaveBeenCalled();
  });

  test('caso feliz: documento propio y único → Factus con la cuenta de la plataforma', async () => {
    const r = await call(supportDocument.DELETE, req('DELETE', '/api/factus/support-document?ref=DS-0001'));
    expect(r.status).toBe(200);
    expect(factus.deleteSupportDocument).toHaveBeenCalledWith('sandbox', 'token', 'DS-0001');
    expect(data.support_documents.find((d) => d.id === 'sd-1')?.status).toBe('cancelled');
    expect(data.support_documents.find((d) => d.id === 'sd-2')?.status).toBeUndefined();
  });
});

describe('Factus jobs (antes organización de la query y cualquier jobId)', () => {
  test('?organizationId= ajeno → 403', async () => {
    const r = await call(jobs.GET, req('GET', `/api/factus/jobs?organizationId=${OTRA}`));
    expect(r.status).toBe(403);
  });
  test('reintentar el job de otra organización → 404 y no se toca', async () => {
    const r = await call(jobs.POST, req('POST', '/api/factus/jobs', { jobId: 'job-2', action: 'retry' }));
    expect(r.status).toBe(404);
    expect(data.electronic_invoicing_jobs.find((j) => j.id === 'job-2')?.status).toBe('failed');
  });
  test('un job accepted no se reintenta (409) ni se cancela (409)', async () => {
    const p = await call(jobs.POST, req('POST', '/api/factus/jobs', { jobId: 'job-3', action: 'retry' }));
    const d = await call(jobs.DELETE, req('DELETE', '/api/factus/jobs?jobId=job-3'));
    expect([p.status, d.status]).toEqual([409, 409]);
  });
});

describe('Factus download (antes: número compartido entre organizaciones)', () => {
  test('factura de otra organización → 404 sin preguntar a Factus', async () => {
    const r = await call(download.GET, req('GET', `/api/factus/download?type=pdf&invoiceId=${FACTURA_AJENA}`));
    expect(r.status).toBe(404);
    expect(factus.getInvoiceByReference).not.toHaveBeenCalled();
    expect(factus.downloadPDF).not.toHaveBeenCalled();
  });
  test('ya no acepta un número suelto (invoiceNumber) → 400', async () => {
    const r = await call(download.GET, req('GET', '/api/factus/download?type=pdf&invoiceNumber=1'));
    expect(r.status).toBe(400);
    expect(factus.downloadPDF).not.toHaveBeenCalled();
  });
  test('factura propia: el número sale de Factus por la referencia derivada en el servidor', async () => {
    const r = await (download.GET as unknown as Handler)(req('GET', `/api/factus/download?type=pdf&invoiceId=${FACTURA}`), rp());
    expect(r.status).toBe(200);
    expect(factus.getInvoiceByReference).toHaveBeenCalledWith('sandbox', 'token', 'INV-bbbbbbbb');
    expect(factus.downloadPDF).toHaveBeenCalledWith('sandbox', 'token', 'SETP990001');
  });
  test('sin sesión → 401', async () => {
    session = null;
    const r = await call(download.GET, req('GET', `/api/factus/download?type=pdf&invoiceId=${FACTURA}`));
    expect(r.status).toBe(401);
  });
});

// ─── Open Finance ───────────────────────────────────────────────────────────

describe('Open Finance transfer / pay-supplier (antes: llave de la plataforma para cualquiera)', () => {
  test.each([
    ['transfer', transfer.POST],
    ['pay-supplier', paySupplier.POST],
  ])('%s sin sesión → 401', async (_n, h) => {
    session = null;
    const r = await call(h, req('POST', '/x', { amount: 1 }));
    expect(r.status).toBe(401);
  });
  test.each([
    ['transfer', transfer.POST],
    ['pay-supplier', paySupplier.POST],
  ])('%s sin finance.approve → 403', async (_n, h) => {
    permisos = ['finance.view', 'finance.create'];
    const r = await call(h, req('POST', '/x', { amount: 1 }));
    expect(r.status).toBe(403);
  });
  test.each([
    ['transfer', transfer.POST],
    ['pay-supplier', paySupplier.POST],
  ])('%s con organización ajena → 403', async (_n, h) => {
    const r = await call(h, req('POST', '/x', { organizationId: OTRA }));
    expect(r.status).toBe(403);
  });
  test.each([
    ['transfer', transfer.POST],
    ['pay-supplier', paySupplier.POST],
  ])('%s autorizado → 501 fail-closed y el proveedor no se llama', async (_n, h) => {
    const r = await call(h, req('POST', '/x', { accountPayableId: 'x', bankAccountId: 7, amount: 1000 }));
    expect(r.status).toBe(501);
    expect(openFinance.initiateTransfer).not.toHaveBeenCalled();
    expect(pagos.paySupplier).not.toHaveBeenCalled();
  });
});

describe('Open Finance links y recursos por id', () => {
  test('GET links nunca devuelve session_key', async () => {
    const r = await call(links.GET, req('GET', '/api/integrations/open-finance/links'));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).not.toContain('SECRETO-BANCARIO');
    expect(openFinance.getLinks).toHaveBeenCalledWith(null, ORG);
  });
  test('GET links con ?organizationId= ajeno → 403', async () => {
    const r = await call(links.GET, req('GET', `/api/integrations/open-finance/links?organizationId=${OTRA}`));
    expect(r.status).toBe(403);
    expect(openFinance.getLinks).not.toHaveBeenCalled();
  });
  test('accounts con el link de otra organización → 404 sin llamar al proveedor', async () => {
    const r = await call(accounts.GET, req('GET', `/api/integrations/open-finance/accounts?linkId=${LINK_AJENO}`));
    expect(r.status).toBe(404);
    expect(openFinance.getAccounts).not.toHaveBeenCalled();
  });
  test('accounts sin finance.view → 403', async () => {
    permisos = [];
    const r = await call(accounts.GET, req('GET', `/api/integrations/open-finance/accounts?linkId=${LINK}`));
    expect(r.status).toBe(403);
  });
});

describe('Open Finance crons (Bearer CRON_SECRET, GET, no-op)', () => {
  const SECRETO = 'k9Qz7Lr2Vx8Tn4Wc6Hs1Jd5Fb3Mp0Ge';
  const anterior = process.env.CRON_SECRET;
  afterAll(() => {
    process.env.CRON_SECRET = anterior;
  });
  test('sin CRON_SECRET configurado → 401 (fail-closed)', async () => {
    delete process.env.CRON_SECRET;
    const r = await call(cronDaily.GET, req('GET', '/api/integrations/open-finance/cron/daily-sync', undefined, { authorization: `Bearer ${SECRETO}` }));
    expect(r.status).toBe(401);
  });
  test('sin Authorization → 401; con Bearer correcto → 200 deshabilitado (GET y POST)', async () => {
    process.env.CRON_SECRET = SECRETO;
    const sin = await call(cronPagos.GET, req('GET', '/api/integrations/open-finance/cron/scheduled-payments'));
    expect(sin.status).toBe(401);
    const get = await call(cronPagos.GET, req('GET', '/x', undefined, { authorization: `Bearer ${SECRETO}` }));
    const post = await call(cronDaily.POST, req('POST', '/x', {}, { authorization: `Bearer ${SECRETO}` }));
    expect([get.status, post.status]).toEqual([200, 200]);
    expect(get.json.disabled).toBe(true);
  });
});

describe('Open Finance webhook (antes: verificación sin await)', () => {
  const TOKEN = 'prometeo-token-de-prueba-0123456789';
  const anterior = process.env.PROMETEO_WEBHOOK_VERIFY_TOKEN;
  afterAll(() => {
    process.env.PROMETEO_WEBHOOK_VERIFY_TOKEN = anterior;
  });
  const cuerpo = { event: 'payin.settled', data: { id: 'x' } };

  test('sin token configurado → 401 aunque la petición traiga uno', async () => {
    delete process.env.PROMETEO_WEBHOOK_VERIFY_TOKEN;
    const r = await call(webhookOF.POST, req('POST', '/x', cuerpo, { 'x-verify-token': TOKEN }));
    expect(r.status).toBe(401);
    expect(openFinance.processWebhookEvent).not.toHaveBeenCalled();
  });
  test('token inválido o ausente → 401 sin procesar', async () => {
    process.env.PROMETEO_WEBHOOK_VERIFY_TOKEN = TOKEN;
    const malo = await call(webhookOF.POST, req('POST', '/x', cuerpo, { 'x-verify-token': `${TOKEN}x` }));
    const sin = await call(webhookOF.POST, req('POST', '/x', cuerpo));
    expect([malo.status, sin.status]).toEqual([401, 401]);
    expect(openFinance.processWebhookEvent).not.toHaveBeenCalled();
  });
  test('token válido → 200 y se procesa', async () => {
    process.env.PROMETEO_WEBHOOK_VERIFY_TOKEN = TOKEN;
    const r = await call(webhookOF.POST, req('POST', '/x', cuerpo, { 'x-verify-token': TOKEN }));
    expect(r.status).toBe(200);
    expect(openFinance.processWebhookEvent).toHaveBeenCalledWith(null, 'payin.settled', { id: 'x' });
  });
});

// ─── PayFac ─────────────────────────────────────────────────────────────────

describe('PayFac payout-accounts (antes: organización del body, sin permiso)', () => {
  const cuenta = {
    bankName: 'Banco', accountType: 'savings', accountNumber: '999', accountHolderName: 'X',
    accountHolderId: '1', accountHolderIdType: 'CC',
  };
  test('POST con organizationId ajeno → 403 y no se crea nada', async () => {
    const r = await call(payoutAccounts.POST, req('POST', '/x', { ...cuenta, organizationId: OTRA }));
    expect(r.status).toBe(403);
    expect(payout.createAccount).not.toHaveBeenCalled();
  });
  test('POST sin finance.approve → 403', async () => {
    permisos = ['finance.view', 'finance.create'];
    const r = await call(payoutAccounts.POST, req('POST', '/x', cuenta));
    expect(r.status).toBe(403);
    expect(payout.createAccount).not.toHaveBeenCalled();
  });
  test('POST con una cuenta contable de otra organización → 404', async () => {
    const r = await call(payoutAccounts.POST, req('POST', '/x', { ...cuenta, bankAccountId: 8 }));
    expect(r.status).toBe(404);
    expect(payout.createAccount).not.toHaveBeenCalled();
  });
  test('POST propio → 201 con la organización de la sesión', async () => {
    const r = await call(payoutAccounts.POST, req('POST', '/x', { ...cuenta, bankAccountId: 7 }));
    expect(r.status).toBe(201);
    expect(payout.createAccount).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bankAccountId: 7 }), ORG);
  });
  test('GET enmascara número de cuenta y documento del titular', async () => {
    const r = await call(payoutAccounts.GET, req('GET', '/x'));
    const fila = (r.json.data as Row[])[0];
    expect(fila.account_number).toBe('******7890');
    expect(fila.account_holder_id).toBe('****3456');
    expect(payout.listAccounts).toHaveBeenCalledWith(expect.anything(), ORG);
  });
  test('DELETE de la cuenta de otra organización → 404', async () => {
    const r = await call(payoutAccount.DELETE, req('DELETE', '/x'), { id: 'pa-2' });
    expect(r.status).toBe(404);
    expect(payout.deactivateAccount).not.toHaveBeenCalled();
  });
});

describe('PayFac payouts (antes: POST sin rol y lectura cruzada)', () => {
  test('POST sin sesión → 401', async () => {
    session = null;
    const r = await call(payouts.POST, req('POST', '/x', { organizationId: ORG, providerCode: 'breb', periodStart: 'a', periodEnd: 'b' }));
    expect(r.status).toBe(401);
  });
  test('POST de un usuario de organización (aun admin) sin ser admin de plataforma → 403', async () => {
    session = { organizationId: ORG, userId: USER, roleId: 2, isSuperAdmin: true };
    const r = await call(payouts.POST, req('POST', '/x', { organizationId: OTRA, providerCode: 'breb', periodStart: 'a', periodEnd: 'b' }));
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('PLATFORM_ADMIN_REQUIRED');
    expect(payout.create).not.toHaveBeenCalled();
  });
  test('POST de un admin de plataforma (fn_is_platform_admin) → 201', async () => {
    esAdminPlataforma = true;
    const r = await call(payouts.POST, req('POST', '/x', { organizationId: OTRA, providerCode: 'breb', periodStart: '2026-09-01', periodEnd: '2026-09-30' }));
    expect(r.status).toBe(201);
    expect(payout.create).toHaveBeenCalledWith(null, expect.objectContaining({ organizationId: OTRA }), USER);
  });
  test('GET de organización con ?organizationId= ajeno → 403', async () => {
    const r = await call(payouts.GET, req('GET', `/x?organizationId=${OTRA}`));
    expect(r.status).toBe(403);
    expect(payout.list).not.toHaveBeenCalled();
  });
  test('GET de organización filtra por la de la sesión', async () => {
    const r = await call(payouts.GET, req('GET', '/x'));
    expect(r.status).toBe(200);
    expect(payout.list).toHaveBeenCalledWith(null, expect.objectContaining({ organizationId: ORG }));
  });
  test('GET /payouts/[id] de otra organización → 404', async () => {
    const r = await call(payoutId.GET, req('GET', '/x'), { id: 'po-9' });
    expect(r.status).toBe(404);
  });
});

// ─── Webhooks de cobro ──────────────────────────────────────────────────────

describe('Webhooks de cobro: fail-closed', () => {
  test('Bre-B sin X-Signature → 401 sin procesar', async () => {
    const r = await call(brebWebhook.POST, req('POST', '/x?connectionId=c1', { event: 'collection.paid' }));
    expect(r.status).toBe(401);
    expect(mono.processWebhook).not.toHaveBeenCalled();
  });
  test('Bre-B con firma pero sin webhook_secret activo → 401 sin procesar', async () => {
    const r = await call(brebWebhook.POST, req('POST', '/x?connectionId=c1', { event: 'collection.paid' }, { 'X-Signature': 'abc' }));
    expect(r.status).toBe(401);
    expect(mono.processWebhook).not.toHaveBeenCalled();
  });
  test('Redeban → 401 (sin verificación implementada)', async () => {
    const r = await call(redebanWebhook.POST, req('POST', '/x', { status: 'approved', connectionId: 'c1' }));
    expect(r.status).toBe(401);
  });
  test('Bancolombia con JSON plano (sin firma) → 401 sin procesar', async () => {
    const r = await call(bancolombiaWebhook.POST, req('POST', '/x?connectionId=c1', { transferState: 'approved' }));
    expect(r.status).toBe(401);
    expect(banco.processWebhook).not.toHaveBeenCalled();
  });
  test('Bancolombia JWT sin secreto en la conexión → 401 (antes pasaba con clave vacía)', async () => {
    const r = await call(bancolombiaWebhook.POST, req('POST', '/x?connectionId=c1', 'aaa.bbb.ccc'));
    expect(r.status).toBe(401);
    expect(banco.verifyJwtNotification).not.toHaveBeenCalled();
    expect(banco.processWebhook).not.toHaveBeenCalled();
  });
  test('Wompi sin events_secret → 401 sin marcar pagos', async () => {
    data.integration_connections = [{ id: 'w1', organization_id: ORG, status: 'connected', connector: { code: 'wompi_co' } }];
    const evento = {
      event: 'transaction.updated',
      timestamp: 1,
      data: { transaction: { id: 't1', reference: `GO-${ORG}-1-x`, status: 'APPROVED' } },
      signature: { properties: ['transaction.id'], checksum: 'X' },
    };
    const r = await call(wompiWebhook.POST, req('POST', '/x', evento));
    expect(r.status).toBe(401);
    expect(data.integration_events ?? []).toHaveLength(0);
  });
});
