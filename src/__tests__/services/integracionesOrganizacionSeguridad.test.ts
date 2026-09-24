/**
 * Rutas de `/api/integrations/**` con credenciales de la ORGANIZACIÓN
 * (MercadoPago, PayU, PayPal, Stripe, Wompi, SendGrid, Meta, TikTok, Google
 * Ads, TripAdvisor, OAuth de WhatsApp) y sus webhooks — GO-sec, 2026-09-24.
 *
 * Por ruta de sesión: sin sesión → 401; organización ajena en body o query →
 * 403 y registro; sin el permiso de la acción → 403; conexión de otra
 * organización (o de otro proveedor) → 404 SIN llamar al proveedor; caso feliz
 * con las credenciales de la conexión leídas con el cliente de servidor.
 *
 * Webhooks: sin firma (o firma que no valida ninguna conexión) → 401 sin
 * escribir; el evento se registra en la conexión que firmó y su organización;
 * el webhook de Wompi confirma el QR del POS (`POS-<ts>-<org>`) buscando la
 * sesión por la conexión que firmó + referencia, con columnas reales.
 */

import crypto from 'crypto';

const { OrgContextError: MockOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

// ─── Base de datos doble ─────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function mockMakeDb(tables: () => Record<string, Row[]>) {
  const escrituras: Array<{ tabla: string; op: 'insert' | 'update' | 'delete'; payload: unknown; filtros: Array<[string, unknown]> }> = [];
  const db = {
    escrituras,
    from(table: string) {
      const filtros: Array<[string, string, unknown]> = [];
      let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
      let payload: unknown = null;
      let insertadas: Row[] = [];
      const filas = () =>
        (tables()[table] ?? []).filter((r) =>
          filtros.every(([o, c, v]) => (o === 'eq' ? String(r[c]) === String(v) : o === 'in' ? (v as unknown[]).map(String).includes(String(r[c])) : true)),
        );
      const resultado = () => {
        if (op === 'insert') return { data: insertadas, error: null };
        const rs = filas();
        if (op === 'update') {
          escrituras.push({ tabla: table, op, payload, filtros: filtros.map(([, c, v]) => [c, v]) });
          rs.forEach((r) => Object.assign(r, payload as Row));
        }
        if (op === 'delete') {
          escrituras.push({ tabla: table, op, payload: null, filtros: filtros.map(([, c, v]) => [c, v]) });
          tables()[table] = (tables()[table] ?? []).filter((r) => !rs.includes(r));
        }
        return { data: rs, error: null };
      };
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filtros.push(['eq', c, v]), b),
        in: (c: string, v: unknown) => (filtros.push(['in', c, v]), b),
        order: () => b,
        limit: () => b,
        insert: (p: unknown) => {
          op = 'insert';
          const lista = (Array.isArray(p) ? p : [p]) as Row[];
          insertadas = lista.map((f, i) => ({ id: `nuevo-${table}-${(tables()[table] ?? []).length + i}`, ...f }));
          (tables()[table] ??= []).push(...insertadas);
          escrituras.push({ tabla: table, op, payload: p, filtros: [] });
          return b;
        },
        update: (p: unknown) => ((op = 'update'), (payload = p), b),
        delete: () => ((op = 'delete'), b),
        maybeSingle: async () => ({ data: (resultado().data as Row[])[0] ?? null, error: null }),
        single: async () => {
          const fila = (resultado().data as Row[])[0] ?? null;
          return { data: fila, error: fila ? null : { message: 'no rows' } };
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko),
      };
      return b;
    },
    rpc: async () => ({ data: false, error: null }),
  };
  return db;
}

const ORG = 120;
const OTRA = 121;
const USER = '0f0f0f0f-1111-4222-8333-444444444444';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Conector → [conexión de ORG, conexión de OTRA]. */
const CONECTORES: Record<string, [string, string]> = {
  mp_checkout: [uuid(1), uuid(2)],
  payu_co: [uuid(3), uuid(4)],
  paypal_checkout: [uuid(5), uuid(6)],
  stripe_payments: [uuid(7), uuid(8)],
  wompi_co: [uuid(9), uuid(10)],
  sendgrid_email: [uuid(11), uuid(12)],
  meta_marketing: [uuid(13), uuid(14)],
  tiktok_marketing: [uuid(15), uuid(16)],
  google_ads: [uuid(17), uuid(18)],
};
const propia = (c: string) => CONECTORES[c][0];
const ajena = (c: string) => CONECTORES[c][1];

let mockData: Record<string, Row[]>;
function freshData(): Record<string, Row[]> {
  const conectores = Object.keys(CONECTORES).map((code) => ({ id: `k-${code}`, code }));
  const conexiones = Object.entries(CONECTORES).flatMap(([code, [a, b]]) => [
    { id: a, organization_id: ORG, connector_id: `k-${code}`, branch_id: null, environment: 'production', settings: {}, status: 'connected' },
    { id: b, organization_id: OTRA, connector_id: `k-${code}`, branch_id: null, environment: 'production', settings: {}, status: 'connected' },
  ]);
  return {
    integration_connectors: conectores,
    integration_connections: conexiones,
    integration_credentials: [],
    integration_events: [],
    payment_qr_sessions: [],
    payments: [],
    channels: [
      { id: 'canal-org', organization_id: ORG, type: 'whatsapp', integration_connection_id: null },
      { id: 'canal-otra', organization_id: OTRA, type: 'whatsapp', integration_connection_id: null },
    ],
    channel_credentials: [],
  };
}

// ─── Sesión doble ────────────────────────────────────────────────────────────

let mockSession: { organizationId: number; userId: string; roleId: number; isSuperAdmin: boolean } | null;
let mockPermisos: string[];
const mockServiceDb = mockMakeDb(() => mockData);

function mockCtx() {
  if (!mockSession) throw new MockOrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  return { ...mockSession, organizationName: 'Org', roleName: 'x', memberId: 1, userEmail: 'cajero@example.com', supabase: mockServiceDb };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: MockOrgContextError,
  hasOrgAdminOrPermission: async (_ctx: unknown, code: string) => mockPermisos.includes('admin.full_access') || mockPermisos.includes(code),
  getServerOrgContext: async () => mockCtx(),
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>, opts?: { admin?: boolean }) =>
    async (req: Request, rp: unknown) => {
      try {
        const ctx = mockCtx();
        if (opts?.admin && !mockPermisos.includes('admin.full_access')) {
          throw new MockOrgContextError('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
        }
        return await handler(ctx, req, rp);
      } catch (err) {
        if (err instanceof MockOrgContextError) {
          return new Response(JSON.stringify({ error: err.message, code: err.code }), { status: err.statusCode });
        }
        throw err;
      }
    },
}));
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => mockServiceDb }));
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => mockServiceDb }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => { throw new Error('cliente de navegador en el servidor'); } } }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));

// ─── Proveedores dobles ──────────────────────────────────────────────────────

const mockMp = {
  getCredentials: jest.fn(async () => ({ accessToken: 'tok-mp', webhookSecret: 'sec-mp' })),
  createPayment: jest.fn(async () => ({ id: 1 })),
  getPaymentMethods: jest.fn(async () => []),
  healthCheck: jest.fn(async () => ({ valid: true, message: 'ok' })),
  parseWebhookNotification: (b: { id?: unknown; type?: string; data?: { id?: string } }) => (b?.id && b.type && b.data?.id ? b : null),
  verifyWebhook: jest.fn(() => true),
};
jest.mock('@/lib/services/integrations/mercadopago', () => ({ mercadopagoService: mockMp, MERCADOPAGO_API_BASE: 'https://mp.test' }));

const mockPayu = {
  getCredentials: jest.fn(async () => ({ apiKey: 'k', apiLogin: 'l', merchantId: 'M-1', accountId: '1' })),
  createPayment: jest.fn(async () => ({})),
  getPSEBanks: jest.fn(async () => ({})),
  getPaymentMethods: jest.fn(async () => ({})),
  healthCheck: jest.fn(async () => ({ valid: true })),
};
jest.mock('@/lib/services/integrations/payu', () => ({ payuService: mockPayu }));
jest.mock('@/lib/services/integrations/payu/payuConfig', () => ({ detectEnvironment: () => 'production' }));

const mockPaypal = {
  getCredentials: jest.fn(async () => ({ clientId: 'c', clientSecret: 's', webhookId: 'w' })),
  createOrder: jest.fn(async () => ({ id: 'O-1' })),
  captureOrder: jest.fn(async () => ({})),
  healthCheck: jest.fn(async () => ({ valid: true })),
};
jest.mock('@/lib/services/integrations/paypal', () => ({ paypalService: mockPaypal }));

const mockStripe = {
  getCredentials: jest.fn(async () => ({ secretKey: 'sk_test_x', webhookSecret: 'whsec' })),
  createPaymentIntent: jest.fn(async () => ({ id: 'pi_1' })),
  createCheckoutSession: jest.fn(async () => ({ id: 'cs_1' })),
  healthCheck: jest.fn(async () => ({ valid: true })),
};
jest.mock('@/lib/services/integrations/stripe', () => ({ stripeClientService: mockStripe }));

const mockWompi = {
  getCredentials: jest.fn(async () => ({ publicKey: 'pub', privateKey: 'prv', eventsSecret: 'ev', integritySecret: 'int', environment: 'production' })),
  getAcceptanceTokens: jest.fn(async () => ({ acceptanceToken: 'a', acceptPersonalAuth: 'p' })),
  generateIntegritySignature: jest.fn(() => 'firma'),
  generateReference: jest.fn((org: number) => `GO-${org}-X-Y`),
  createTransaction: jest.fn(async () => ({ data: { id: 't-1' } })),
  getPSEInstitutions: jest.fn(async () => ({ data: [] })),
  healthCheck: jest.fn(async () => ({ ok: true, message: 'ok' })),
};
jest.mock('@/lib/services/integrations/wompi/wompiService', () => ({ wompiService: mockWompi, default: mockWompi }));

const mockSendgrid = {
  getCredentials: jest.fn(async () => ({ apiKey: 'SG.x' })),
  getCredentialsByOrganization: jest.fn(async () => ({ credentials: { apiKey: 'SG.x' }, connectionId: uuid(11) })),
  getBounces: jest.fn(async () => []),
  getStats: jest.fn(async () => []),
  getTemplates: jest.fn(async () => []),
  healthCheck: jest.fn(async () => ({ ok: true, message: 'ok', scopes: [] })),
  verifyApiKey: jest.fn(async () => ({ valid: true, scopes: [], hasMailSend: true })),
};
jest.mock('@/lib/services/integrations/sendgrid', () => ({ sendgridService: mockSendgrid }));
jest.mock('@/lib/services/integrations/sendgrid/sendgridService', () => ({ sendgridService: mockSendgrid }));

const mockMeta = {
  getCredentials: jest.fn(async () => ({ accessToken: 'tok', appSecret: 'app', pixelId: 'px' })),
  healthCheck: jest.fn(async () => ({ valid: true })),
  sendEvent: jest.fn(async () => ({})),
  verifyWebhookSignature: jest.fn(() => false),
};
jest.mock('@/lib/services/integrations/meta', () => ({ metaMarketingService: mockMeta }));

const mockTiktok = {
  getCredentials: jest.fn(async () => ({ accessToken: 'tok', advertiserId: 'adv', pixelCode: 'px' })),
  healthCheck: jest.fn(async () => ({ valid: true })),
  sendEvent: jest.fn(async () => ({})),
};
jest.mock('@/lib/services/integrations/tiktok', () => ({ tiktokMarketingService: mockTiktok }));

const mockGads = {
  getCampaignMetrics: jest.fn(async () => []),
  healthCheck: jest.fn(async () => ({ valid: true })),
  uploadAudience: jest.fn(async () => ({ success: true, userListResourceName: 'x' })),
  uploadSingleConversion: jest.fn(async () => ({})),
};
jest.mock('@/lib/services/integrations/google-ads', () => ({ googleAdsService: mockGads }));

const mockTripadvisor = {
  healthCheck: jest.fn(async () => ({ valid: true })),
  getLocationDetails: jest.fn(async () => ({ success: true, data: {} })),
};
jest.mock('@/lib/services/integrations/tripadvisor', () => ({ tripadvisorContentService: mockTripadvisor }));

const mockConfirmar = jest.fn(async () => ({ success: true, paymentId: 'pago-1' }));
jest.mock('@/lib/services/integrations/qrShared/paymentConfirmation', () => ({ confirmQrPayment: (...a: unknown[]) => mockConfirmar(...(a as [])) }));

const mockQrService = { processInboundCallback: jest.fn(async () => undefined) };
jest.mock('@/lib/services/integrations/whatsapp/whatsappQrService', () => ({ whatsappQrService: mockQrService }));

import { NextRequest } from 'next/server';
import * as mpCreate from '@/app/api/integrations/mercadopago/create-payment/route';
import * as mpMethods from '@/app/api/integrations/mercadopago/payment-methods/route';
import * as mpHealth from '@/app/api/integrations/mercadopago/health-check/route';
import * as mpWebhook from '@/app/api/integrations/mercadopago/webhook/route';
import * as payuCreate from '@/app/api/integrations/payu/create-payment/route';
import * as payuBanks from '@/app/api/integrations/payu/banks/route';
import * as payuMethods from '@/app/api/integrations/payu/payment-methods/route';
import * as payuHealth from '@/app/api/integrations/payu/health-check/route';
import * as ppCreate from '@/app/api/integrations/paypal/create-order/route';
import * as ppCapture from '@/app/api/integrations/paypal/capture-order/route';
import * as ppHealth from '@/app/api/integrations/paypal/health-check/route';
import * as stCreate from '@/app/api/integrations/stripe/create-payment/route';
import * as stCheckout from '@/app/api/integrations/stripe/checkout-session/route';
import * as stHealth from '@/app/api/integrations/stripe/health-check/route';
import * as wCreate from '@/app/api/integrations/wompi/create-transaction/route';
import * as wInst from '@/app/api/integrations/wompi/institutions/route';
import * as wHealth from '@/app/api/integrations/wompi/health-check/route';
import * as wWebhook from '@/app/api/integrations/wompi/webhook/route';
import * as sgBounces from '@/app/api/integrations/sendgrid/bounces/route';
import * as sgStats from '@/app/api/integrations/sendgrid/stats/route';
import * as sgTemplates from '@/app/api/integrations/sendgrid/templates/route';
import * as sgHealth from '@/app/api/integrations/sendgrid/health-check/route';
import * as metaHealth from '@/app/api/integrations/meta/health-check/route';
import * as metaEvent from '@/app/api/integrations/meta/send-event/route';
import * as metaWebhook from '@/app/api/integrations/meta/webhook/route';
import * as ttHealth from '@/app/api/integrations/tiktok/health-check/route';
import * as ttEvent from '@/app/api/integrations/tiktok/send-event/route';
import * as ttWebhook from '@/app/api/integrations/tiktok/webhook/route';
import * as gaCampaigns from '@/app/api/integrations/google-ads/campaigns/route';
import * as gaHealth from '@/app/api/integrations/google-ads/health-check/route';
import * as gaAudience from '@/app/api/integrations/google-ads/upload-audience/route';
import * as gaConversion from '@/app/api/integrations/google-ads/upload-conversion/route';
import * as taDetails from '@/app/api/integrations/tripadvisor/details/route';
import * as taHealth from '@/app/api/integrations/tripadvisor/health-check/route';
import * as webhookHealth from '@/app/api/integrations/webhook-health/route';
import * as rotation from '@/app/api/integrations/credential-rotation/route';
import * as waOauth from '@/app/api/integrations/whatsapp/oauth/callback/route';
import * as waInbound from '@/app/api/integrations/whatsapp/qr/inbound/route';

type Handler = (req: NextRequest, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;
const rp = { params: Promise.resolve({}) };

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}
const call = (h: unknown, r: NextRequest) => (h as Handler)(r, rp);

let avisos: jest.SpyInstance;
beforeEach(() => {
  mockData = freshData();
  mockServiceDb.escrituras.length = 0;
  mockSession = { organizationId: ORG, userId: USER, roleId: 3, isSuperAdmin: false };
  mockPermisos = [];
  jest.clearAllMocks();
  avisos = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ─── Rutas de sesión ─────────────────────────────────────────────────────────

type Permiso = 'pos.create' | 'integrations.edit' | 'integrations.view' | 'admin.full_access';
interface Caso {
  nombre: string;
  handler: unknown;
  metodo: 'GET' | 'POST';
  conector: string;
  permiso: Permiso;
  /** Petición con la conexión `id`. */
  peticion: (id: string, extra?: Row) => NextRequest;
  /** El proveedor que NO debe llamarse con una conexión ajena y SÍ en el caso feliz. */
  proveedor: jest.Mock;
}

const post = (url: string, cuerpo: (id: string) => Row) => (id: string, extra: Row = {}) => req('POST', url, { ...cuerpo(id), ...extra });
const get = (url: string, clave: string) => (id: string, extra: Row = {}) => {
  const q = new URLSearchParams({ [clave]: id, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) });
  return req('GET', `${url}?${q.toString()}`);
};

const CASOS: Caso[] = [
  { nombre: 'mercadopago/create-payment', handler: mpCreate.POST, metodo: 'POST', conector: 'mp_checkout', permiso: 'pos.create', peticion: post('/api/integrations/mercadopago/create-payment', (id) => ({ connection_id: id, payment_data: { transaction_amount: 10 } })), proveedor: mockMp.createPayment },
  { nombre: 'mercadopago/payment-methods', handler: mpMethods.GET, metodo: 'GET', conector: 'mp_checkout', permiso: 'pos.create', peticion: get('/api/integrations/mercadopago/payment-methods', 'connection_id'), proveedor: mockMp.getPaymentMethods },
  { nombre: 'mercadopago/health-check', handler: mpHealth.POST, metodo: 'POST', conector: 'mp_checkout', permiso: 'admin.full_access', peticion: post('/api/integrations/mercadopago/health-check', (id) => ({ connection_id: id })), proveedor: mockMp.healthCheck },
  { nombre: 'payu/create-payment', handler: payuCreate.POST, metodo: 'POST', conector: 'payu_co', permiso: 'pos.create', peticion: post('/api/integrations/payu/create-payment', (id) => ({ connection_id: id, transaction: { order: {} } })), proveedor: mockPayu.createPayment },
  { nombre: 'payu/banks', handler: payuBanks.GET, metodo: 'GET', conector: 'payu_co', permiso: 'pos.create', peticion: get('/api/integrations/payu/banks', 'connection_id'), proveedor: mockPayu.getPSEBanks },
  { nombre: 'payu/payment-methods', handler: payuMethods.GET, metodo: 'GET', conector: 'payu_co', permiso: 'pos.create', peticion: get('/api/integrations/payu/payment-methods', 'connection_id'), proveedor: mockPayu.getPaymentMethods },
  { nombre: 'payu/health-check', handler: payuHealth.POST, metodo: 'POST', conector: 'payu_co', permiso: 'admin.full_access', peticion: post('/api/integrations/payu/health-check', (id) => ({ connection_id: id })), proveedor: mockPayu.healthCheck },
  { nombre: 'paypal/create-order', handler: ppCreate.POST, metodo: 'POST', conector: 'paypal_checkout', permiso: 'pos.create', peticion: post('/api/integrations/paypal/create-order', (id) => ({ connection_id: id, purchaseUnits: [{ amount: { value: '1' } }] })), proveedor: mockPaypal.createOrder },
  { nombre: 'paypal/capture-order', handler: ppCapture.POST, metodo: 'POST', conector: 'paypal_checkout', permiso: 'pos.create', peticion: post('/api/integrations/paypal/capture-order', (id) => ({ connection_id: id, order_id: 'ORDER-123' })), proveedor: mockPaypal.captureOrder },
  { nombre: 'paypal/health-check', handler: ppHealth.POST, metodo: 'POST', conector: 'paypal_checkout', permiso: 'admin.full_access', peticion: post('/api/integrations/paypal/health-check', (id) => ({ connection_id: id })), proveedor: mockPaypal.healthCheck },
  { nombre: 'stripe/create-payment', handler: stCreate.POST, metodo: 'POST', conector: 'stripe_payments', permiso: 'pos.create', peticion: post('/api/integrations/stripe/create-payment', (id) => ({ connection_id: id, amount: 1000, currency: 'usd' })), proveedor: mockStripe.createPaymentIntent },
  { nombre: 'stripe/checkout-session', handler: stCheckout.POST, metodo: 'POST', conector: 'stripe_payments', permiso: 'pos.create', peticion: post('/api/integrations/stripe/checkout-session', (id) => ({ connection_id: id, lineItems: [{}], mode: 'payment', successUrl: 'https://a.test/ok', cancelUrl: 'https://a.test/no' })), proveedor: mockStripe.createCheckoutSession },
  { nombre: 'stripe/health-check', handler: stHealth.POST, metodo: 'POST', conector: 'stripe_payments', permiso: 'admin.full_access', peticion: post('/api/integrations/stripe/health-check', (id) => ({ connection_id: id })), proveedor: mockStripe.healthCheck },
  { nombre: 'wompi/create-transaction', handler: wCreate.POST, metodo: 'POST', conector: 'wompi_co', permiso: 'pos.create', peticion: post('/api/integrations/wompi/create-transaction', (id) => ({ connectionId: id, amountInCents: 10000, customerEmail: 'pagador@example.com', paymentMethod: { type: 'NEQUI' } })), proveedor: mockWompi.createTransaction },
  { nombre: 'wompi/institutions', handler: wInst.GET, metodo: 'GET', conector: 'wompi_co', permiso: 'pos.create', peticion: get('/api/integrations/wompi/institutions', 'connectionId'), proveedor: mockWompi.getPSEInstitutions },
  { nombre: 'wompi/health-check', handler: wHealth.POST, metodo: 'POST', conector: 'wompi_co', permiso: 'admin.full_access', peticion: post('/api/integrations/wompi/health-check', (id) => ({ connectionId: id })), proveedor: mockWompi.healthCheck },
  { nombre: 'sendgrid/bounces', handler: sgBounces.GET, metodo: 'GET', conector: 'sendgrid_email', permiso: 'integrations.view', peticion: get('/api/integrations/sendgrid/bounces', 'connectionId'), proveedor: mockSendgrid.getBounces },
  { nombre: 'sendgrid/stats', handler: sgStats.GET, metodo: 'GET', conector: 'sendgrid_email', permiso: 'integrations.view', peticion: get('/api/integrations/sendgrid/stats', 'connectionId'), proveedor: mockSendgrid.getStats },
  { nombre: 'sendgrid/templates', handler: sgTemplates.GET, metodo: 'GET', conector: 'sendgrid_email', permiso: 'integrations.view', peticion: get('/api/integrations/sendgrid/templates', 'connection_id'), proveedor: mockSendgrid.getTemplates },
  { nombre: 'sendgrid/health-check', handler: sgHealth.POST, metodo: 'POST', conector: 'sendgrid_email', permiso: 'admin.full_access', peticion: post('/api/integrations/sendgrid/health-check', (id) => ({ connectionId: id })), proveedor: mockSendgrid.healthCheck },
  { nombre: 'meta/health-check', handler: metaHealth.POST, metodo: 'POST', conector: 'meta_marketing', permiso: 'admin.full_access', peticion: post('/api/integrations/meta/health-check', (id) => ({ connection_id: id })), proveedor: mockMeta.healthCheck },
  { nombre: 'meta/send-event', handler: metaEvent.POST, metodo: 'POST', conector: 'meta_marketing', permiso: 'integrations.edit', peticion: post('/api/integrations/meta/send-event', (id) => ({ connection_id: id, events: [{ event_name: 'Purchase' }] })), proveedor: mockMeta.sendEvent },
  { nombre: 'tiktok/health-check', handler: ttHealth.POST, metodo: 'POST', conector: 'tiktok_marketing', permiso: 'admin.full_access', peticion: post('/api/integrations/tiktok/health-check', (id) => ({ connection_id: id })), proveedor: mockTiktok.healthCheck },
  { nombre: 'tiktok/send-event', handler: ttEvent.POST, metodo: 'POST', conector: 'tiktok_marketing', permiso: 'integrations.edit', peticion: post('/api/integrations/tiktok/send-event', (id) => ({ connection_id: id, events: [{ event: 'CompletePayment' }] })), proveedor: mockTiktok.sendEvent },
  { nombre: 'google-ads/campaigns', handler: gaCampaigns.GET, metodo: 'GET', conector: 'google_ads', permiso: 'integrations.view', peticion: get('/api/integrations/google-ads/campaigns', 'connection_id'), proveedor: mockGads.getCampaignMetrics },
  { nombre: 'google-ads/health-check', handler: gaHealth.POST, metodo: 'POST', conector: 'google_ads', permiso: 'admin.full_access', peticion: post('/api/integrations/google-ads/health-check', (id) => ({ connection_id: id })), proveedor: mockGads.healthCheck },
  { nombre: 'google-ads/upload-audience', handler: gaAudience.POST, metodo: 'POST', conector: 'google_ads', permiso: 'integrations.edit', peticion: post('/api/integrations/google-ads/upload-audience', (id) => ({ connection_id: id, list_name: 'Clientes', members: [{ hashedEmail: 'abc' }] })), proveedor: mockGads.uploadAudience },
  { nombre: 'google-ads/upload-conversion', handler: gaConversion.POST, metodo: 'POST', conector: 'google_ads', permiso: 'integrations.edit', peticion: post('/api/integrations/google-ads/upload-conversion', (id) => ({ connection_id: id, conversion: { conversionDateTime: '2026-09-24 10:00:00-05:00', conversionValue: 1, currencyCode: 'USD', gclid: 'g' } })), proveedor: mockGads.uploadSingleConversion },
];

describe.each(CASOS)('$nombre', (caso) => {
  const ajenaEn = (id: string) => (caso.metodo === 'POST' ? caso.peticion(id, { organization_id: OTRA }) : caso.peticion(id, { organizationId: OTRA }));

  test('sin sesión → 401 sin llamar al proveedor', async () => {
    mockSession = null;
    const r = await call(caso.handler, caso.peticion(propia(caso.conector)));
    expect(r.status).toBe(401);
    expect(caso.proveedor).not.toHaveBeenCalled();
  });

  test(`organización ajena en ${caso.metodo === 'POST' ? 'el body' : 'la query'} → 403 y registro`, async () => {
    mockPermisos = [caso.permiso];
    const r = await call(caso.handler, ajenaEn(propia(caso.conector)));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(avisos).toHaveBeenCalledWith(expect.stringContaining('ajeno en la petición'), expect.objectContaining({ session: ORG }));
    expect(caso.proveedor).not.toHaveBeenCalled();
  });

  test(`sin el permiso (${caso.permiso}) → 403 sin llamar al proveedor`, async () => {
    mockPermisos = [];
    const r = await call(caso.handler, caso.peticion(propia(caso.conector)));
    expect(r.status).toBe(403);
    expect(caso.proveedor).not.toHaveBeenCalled();
  });

  test('conexión de otra organización → 404 sin llamar al proveedor', async () => {
    mockPermisos = [caso.permiso];
    const r = await call(caso.handler, caso.peticion(ajena(caso.conector)));
    expect(r.status).toBe(404);
    expect(caso.proveedor).not.toHaveBeenCalled();
  });

  test('conexión propia de OTRO proveedor → 404', async () => {
    mockPermisos = [caso.permiso];
    const otro = caso.conector === 'wompi_co' ? 'stripe_payments' : 'wompi_co';
    const r = await call(caso.handler, caso.peticion(propia(otro)));
    expect(r.status).toBe(404);
    expect(caso.proveedor).not.toHaveBeenCalled();
  });

  test('caso feliz: conexión propia → 200 y el proveedor se llama', async () => {
    mockPermisos = [caso.permiso];
    const r = await call(caso.handler, caso.peticion(propia(caso.conector)));
    expect(r.status).toBe(200);
    expect(caso.proveedor).toHaveBeenCalledTimes(1);
  });
});

describe('credenciales de la conexión, nunca del cliente', () => {
  test('las credenciales se leen con el cliente de servidor y de la conexión propia', async () => {
    mockPermisos = ['pos.create'];
    await call(stCreate.POST, req('POST', '/x', { connection_id: propia('stripe_payments'), amount: 1000, currency: 'usd' }));
    expect(mockStripe.getCredentials).toHaveBeenCalledWith(propia('stripe_payments'), mockServiceDb);
    expect(mockStripe.createPaymentIntent).toHaveBeenCalledWith('sk_test_x', { amount: 1000, currency: 'usd' });
  });

  test('PayPal: el ambiente sale de la conexión aunque el body diga sandbox', async () => {
    mockPermisos = ['pos.create'];
    await call(ppCapture.POST, req('POST', '/x', { connection_id: propia('paypal_checkout'), order_id: 'ORDER-123', is_sandbox: true }));
    expect(mockPaypal.captureOrder).toHaveBeenCalledWith(expect.anything(), 'ORDER-123', false);
  });

  test('Wompi: la referencia se genera con la organización de la sesión', async () => {
    mockPermisos = ['pos.create'];
    const r = await call(wCreate.POST, req('POST', '/x', { connectionId: propia('wompi_co'), amountInCents: 10000, customerEmail: 'pagador@example.com', paymentMethod: { type: 'NEQUI' } }));
    expect(r.status).toBe(200);
    expect(mockWompi.generateReference).toHaveBeenCalledWith(ORG);
  });

  test('SendGrid sin conexión usa la de la organización de la sesión', async () => {
    mockPermisos = ['integrations.view'];
    const r = await call(sgTemplates.GET, req('GET', '/x'));
    expect(r.status).toBe(200);
    expect(mockSendgrid.getCredentialsByOrganization).toHaveBeenCalledWith(ORG, mockServiceDb);
  });

  test('health-check con credenciales SIN guardar (asistente) solo con administración', async () => {
    mockPermisos = [];
    expect((await call(stHealth.POST, req('POST', '/x', { secret_key: 'sk_test_nueva' }))).status).toBe(403);
    expect(mockStripe.healthCheck).not.toHaveBeenCalled();
    mockPermisos = ['admin.full_access'];
    expect((await call(stHealth.POST, req('POST', '/x', { secret_key: 'sk_test_nueva' }))).status).toBe(200);
    expect(mockStripe.healthCheck).toHaveBeenCalledWith('sk_test_nueva');
    expect(mockStripe.getCredentials).not.toHaveBeenCalled();
  });
});

// ─── Rutas de sesión sin conexión ────────────────────────────────────────────

describe('TripAdvisor, webhook-health y credential-rotation', () => {
  test('TripAdvisor sin sesión → 401 (antes el handler no comprobaba nada)', async () => {
    mockSession = null;
    const r = await call(taDetails.GET, req('GET', '/x?locationId=123'));
    expect(r.status).toBe(401);
    expect(mockTripadvisor.getLocationDetails).not.toHaveBeenCalled();
  });
  test('TripAdvisor con sesión → 200; locationId que no es numérico → 400', async () => {
    expect((await call(taDetails.GET, req('GET', '/x?locationId=123'))).status).toBe(200);
    expect((await call(taDetails.GET, req('GET', '/x?locationId=..%2F..%2Fx'))).status).toBe(400);
  });
  test('TripAdvisor health-check sin administración → 403', async () => {
    expect((await call(taHealth.POST, req('POST', '/x', {}))).status).toBe(403);
    expect(mockTripadvisor.healthCheck).not.toHaveBeenCalled();
  });
  test('webhook-health solo cuenta conexiones de la organización de la sesión', async () => {
    mockPermisos = ['admin.full_access'];
    const r = await call(webhookHealth.GET, req('GET', '/x'));
    expect(r.status).toBe(200);
    const wompi = (await r.json()).providers.find((p: { provider: string }) => p.provider === 'wompi');
    expect(wompi.activeConnectionsCount).toBe(1); // hay una en ORG y otra en OTRA
  });
  test('credential-rotation con ?organizationId= ajeno → 403', async () => {
    mockPermisos = ['admin.full_access'];
    const r = await call(rotation.GET, req('GET', `/x?organizationId=${OTRA}`));
    expect(r.status).toBe(403);
  });
});

describe('OAuth de WhatsApp (Embedded Signup)', () => {
  const cuerpo = { code: 'c', phone_number_id: '1234567890', waba_id: '9876543210' };
  let fetchSpy: jest.Mock;
  beforeEach(() => {
    fetchSpy = jest.fn(async (url: string) => ({
      json: async () => (String(url).includes('/oauth/access_token') ? { access_token: 'tok' } : { display_phone_number: '+57', verified_name: 'Tienda' }),
    }));
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  test('sin sesión → 401 sin hablar con Meta', async () => {
    mockSession = null;
    expect((await call(waOauth.POST, req('POST', '/x', { ...cuerpo, organization_id: ORG }))).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test('organización ajena en el body → 403', async () => {
    mockPermisos = ['admin.full_access'];
    expect((await call(waOauth.POST, req('POST', '/x', { ...cuerpo, organization_id: OTRA }))).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test('sin administración → 403', async () => {
    expect((await call(waOauth.POST, req('POST', '/x', cuerpo))).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test('canal de otra organización → 404 sin hablar con Meta ni escribir', async () => {
    mockPermisos = ['admin.full_access'];
    const r = await call(waOauth.POST, req('POST', '/x', { ...cuerpo, channel_id: 'canal-otra' }));
    expect(r.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockServiceDb.escrituras).toEqual([]);
  });
  test('caso feliz: todo se escribe en la organización de la sesión', async () => {
    mockPermisos = ['admin.full_access'];
    const r = await call(waOauth.POST, req('POST', '/x', { ...cuerpo, organization_id: ORG, channel_id: 'canal-org' }));
    expect(r.status).toBe(200);
    const conexion = mockData.integration_connections.find((c) => c.connector_id === '9ba81290-1272-4cf1-9dc5-a06feb762d21');
    expect(conexion?.organization_id).toBe(ORG);
    for (const w of mockServiceDb.escrituras.filter((e) => e.op === 'update' && (e.tabla === 'channels' || e.tabla === 'integration_connections'))) {
      expect(w.filtros).toContainEqual(['organization_id', ORG]);
    }
  });
});

// ─── Webhooks ────────────────────────────────────────────────────────────────

describe('Webhooks de proveedores: fail-closed y registro en la conexión que firmó', () => {
  test('MercadoPago sin x-signature → 401 sin consultar el pago ni escribir', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const r = await call(mpWebhook.POST, req('POST', '/x', { id: 1, type: 'payment', action: 'payment.updated', data: { id: '55' } }));
    expect(r.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockData.integration_events).toHaveLength(0);
  });

  test('MercadoPago firmado: consulta con el token de la conexión que firmó y registra en su organización', async () => {
    mockData.integration_connections = [
      { id: 'mp-otra', organization_id: OTRA, status: 'connected', integration_connectors: { provider_id: 1, integration_providers: { code: 'mercadopago' } } },
      { id: 'mp-org', organization_id: ORG, status: 'connected', integration_connectors: { provider_id: 1, integration_providers: { code: 'mercadopago' } } },
    ];
    mockMp.getCredentials.mockImplementation((async (id: string) => ({ accessToken: `tok-${id}`, webhookSecret: `sec-${id}` })) as never);
    mockMp.verifyWebhook.mockImplementation(((_s: string, _r: string, _d: string, secret: string) => secret === 'sec-mp-org') as never);
    const fetchSpy = jest.fn(async () => ({ ok: true, json: async () => ({ status: 'approved', transaction_amount: 10 }) }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const r = await call(mpWebhook.POST, req('POST', '/x', { id: 1, type: 'payment', action: 'payment.updated', data: { id: '55' } }, { 'x-signature': 'ts=1,v1=a', 'x-request-id': 'r1' }));
    expect(r.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/v1/payments/55'), { headers: { Authorization: 'Bearer tok-mp-org' } });
    expect(mockData.integration_events).toEqual([
      expect.objectContaining({ connection_id: 'mp-org', organization_id: ORG, source: 'webhook', direction: 'inbound', external_event_id: '55' }),
    ]);
  });

  test('Meta sin firma válida → 401; GET de suscripción sin token de entorno → 403', async () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    const r = await call(metaWebhook.POST, req('POST', '/x', { object: 'page', entry: [] }, { 'x-hub-signature-256': 'sha256=x' }));
    expect(r.status).toBe(401);
    const g = await call(metaWebhook.GET, req('GET', '/x?hub.mode=subscribe&hub.verify_token=go_admin_meta_verify&hub.challenge=123'));
    expect(g.status).toBe(403); // el token por defecto que había en el código ya no sirve
  });

  test('GET de suscripción con el token correcto devuelve el challenge; con otro, 403', async () => {
    process.env.TIKTOK_WEBHOOK_VERIFY_TOKEN = 'token-real';
    const ok = await call(ttWebhook.GET, req('GET', '/x?verify_token=token-real&challenge=abc'));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('abc');
    expect((await call(ttWebhook.GET, req('GET', '/x?verify_token=otro&challenge=abc'))).status).toBe(403);
    delete process.env.TIKTOK_WEBHOOK_VERIFY_TOKEN;
  });

  test('TikTok POST → 401 (cerrado hasta implementar la firma)', async () => {
    const r = await (ttWebhook.POST as () => Promise<Response>)();
    expect(r.status).toBe(401);
  });

  test('WhatsApp QR inbound sin EVOLUTION_API_KEY → 401 aunque traiga apikey; con la correcta procesa', async () => {
    delete process.env.EVOLUTION_API_KEY;
    const cuerpo = { event: 'messages.upsert', instance: 'x', data: {} };
    expect((await call(waInbound.POST, req('POST', '/x', cuerpo, { apikey: 'cualquiera' }))).status).toBe(401);
    process.env.EVOLUTION_API_KEY = 'clave-evolution';
    expect((await call(waInbound.POST, req('POST', '/x', cuerpo, { apikey: 'otra' }))).status).toBe(401);
    expect((await call(waInbound.POST, req('POST', '/x', cuerpo, { apikey: 'clave-evolution' }))).status).toBe(200);
    delete process.env.EVOLUTION_API_KEY;
  });
});

// ─── Webhook de Wompi: QR Bancolombia del POS ────────────────────────────────

describe('Webhook de Wompi: confirma el QR del POS por la conexión que firmó', () => {
  const CONN_A = propia('wompi_co'); // ORG
  const CONN_B = ajena('wompi_co'); // OTRA
  const REF = `POS-1727200000000-${ORG}`;

  function evento(secreto: string, tx: Partial<{ id: string; reference: string; status: string; amount_in_cents: number; currency: string }> = {}) {
    const transaction = { id: 'wtx-1', reference: REF, status: 'APPROVED', amount_in_cents: 5_000_000, currency: 'COP', payment_method_type: 'BANCOLOMBIA_QR', customer_email: 'x@example.com', ...tx };
    const timestamp = 1727200000;
    const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
    const valores = [transaction.id, transaction.status, transaction.amount_in_cents].join('');
    const checksum = crypto.createHash('sha256').update(valores + timestamp + secreto).digest('hex').toUpperCase();
    return { event: 'transaction.updated', data: { transaction }, environment: 'prod', signature: { properties, checksum }, timestamp, sent_at: '' };
  }

  beforeEach(() => {
    mockData.integration_credentials = [
      { connection_id: CONN_A, purpose: 'events_secret', status: 'active', secret_ref: 'secreto-A' },
      { connection_id: CONN_B, purpose: 'events_secret', status: 'active', secret_ref: 'secreto-B' },
    ];
    mockData.payment_qr_sessions = [
      { id: 'qr-A', organization_id: ORG, integration_connection_id: CONN_A, reference: REF, status: 'pending', amount: 50000, currency: 'COP' },
      // Misma referencia en otra organización y otra conexión: no se toca.
      { id: 'qr-B', organization_id: OTRA, integration_connection_id: CONN_B, reference: REF, status: 'pending', amount: 50000, currency: 'COP' },
    ];
  });

  test('sin checksum válido de ninguna conexión → 401 sin escribir', async () => {
    const r = await call(wWebhook.POST, req('POST', '/x', evento('secreto-falso')));
    expect(r.status).toBe(401);
    expect(mockData.integration_events).toHaveLength(0);
    expect(mockConfirmar).not.toHaveBeenCalled();
  });

  test('APPROVED firmado por la conexión A confirma la sesión QR de A (referencia POS-<ts>-<org>)', async () => {
    const r = await call(wWebhook.POST, req('POST', '/x', evento('secreto-A')));
    expect(r.status).toBe(200);
    expect(mockConfirmar).toHaveBeenCalledTimes(1);
    expect(mockConfirmar).toHaveBeenCalledWith(expect.objectContaining({ qrSessionId: 'qr-A', organizationId: ORG, status: 'paid' }));
    // Sin la columna inexistente `external_payment_id`.
    expect(JSON.stringify(mockServiceDb.escrituras)).not.toMatch(/external_payment_id/);
    expect(mockData.integration_events).toEqual([expect.objectContaining({ connection_id: CONN_A, organization_id: ORG, source: 'webhook', direction: 'inbound', status: 'processed' })]);
  });

  test('firmado por B solo toca la sesión de B', async () => {
    await call(wWebhook.POST, req('POST', '/x', evento('secreto-B')));
    expect(mockConfirmar).toHaveBeenCalledWith(expect.objectContaining({ qrSessionId: 'qr-B', organizationId: OTRA }));
  });

  test('importe distinto al de la sesión → no confirma, 200 y evento en error', async () => {
    const r = await call(wWebhook.POST, req('POST', '/x', evento('secreto-A', { amount_in_cents: 100 })));
    expect(r.status).toBe(200);
    expect(mockConfirmar).not.toHaveBeenCalled();
    expect(mockData.integration_events[0]).toEqual(expect.objectContaining({ status: 'error' }));
  });

  test('DECLINED rechaza la sesión QR pendiente', async () => {
    await call(wWebhook.POST, req('POST', '/x', evento('secreto-A', { status: 'DECLINED' })));
    expect(mockConfirmar).toHaveBeenCalledWith(expect.objectContaining({ qrSessionId: 'qr-A', status: 'rejected' }));
  });

  test('sin sesión QR: actualiza el pago PENDIENTE de la organización que firmó con columnas reales', async () => {
    mockData.payment_qr_sessions = [];
    mockData.payments = [
      { id: 'p-A', organization_id: ORG, reference: 'GO-120-ABC-1', status: 'pending' },
      { id: 'p-B', organization_id: OTRA, reference: 'GO-120-ABC-1', status: 'pending' },
    ];
    const r = await call(wWebhook.POST, req('POST', '/x', evento('secreto-A', { reference: 'GO-120-ABC-1' })));
    expect(r.status).toBe(200);
    expect(mockData.payments[0]).toEqual(expect.objectContaining({ status: 'completed', processor_response: expect.objectContaining({ wompi_transaction_id: 'wtx-1' }) }));
    expect(mockData.payments[0]).not.toHaveProperty('external_id');
    expect(mockData.payments[0]).not.toHaveProperty('metadata');
    expect(mockData.payments[1].status).toBe('pending');
  });
});
