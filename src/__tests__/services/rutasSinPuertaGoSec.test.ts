/**
 * Rutas de src/app/api que el middleware no cubría o que no miraban la
 * organización (GO-sec, auditoría 2026-09-24). Por ruta: sin sesión → 401;
 * organización ajena → 403 (y nada se escribe ni se llama a Stripe); sin
 * permiso de facturación → 403; caso feliz. Más los casos propios: Checkout
 * de otra organización, cliente de Stripe ajeno, método de pago ajeno,
 * membresía temporal ajena, secretos fail-closed.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

// ─── Base de datos doble ─────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let data: Record<string, Row[]>;
const escrituras: Array<{ tabla: string; op: string; payload?: unknown }> = [];

function makeDb() {
  return {
    from(tabla: string) {
      const filtros: Array<(r: Row) => boolean> = [];
      let op: 'select' | 'update' | 'insert' | 'delete' | 'upsert' = 'select';
      let payload: unknown = null;
      const filas = () => (data[tabla] ?? []).filter((r) => filtros.every((f) => f(r)));
      const ejecutar = () => {
        if (op === 'insert' || op === 'upsert') {
          escrituras.push({ tabla, op, payload });
          const fila = { id: `nuevo-${(data[tabla] ?? []).length + 1}`, ...(payload as Row) };
          (data[tabla] ??= []).push(fila);
          return { data: [fila], error: null };
        }
        const rs = filas();
        if (op === 'update') {
          escrituras.push({ tabla, op, payload });
          rs.forEach((r) => Object.assign(r, payload as Row));
        }
        if (op === 'delete') {
          escrituras.push({ tabla, op, payload: rs.map((r) => r.id) });
          data[tabla] = (data[tabla] ?? []).filter((r) => !rs.includes(r));
        }
        return { data: rs, error: null };
      };
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filtros.push((r) => String(r[c]) === String(v)), b),
        not: (c: string, _op: string, v: unknown) => (filtros.push((r) => (v === null ? r[c] != null : r[c] !== v)), b),
        in: (c: string, v: unknown[]) => (filtros.push((r) => v.includes(r[c])), b),
        order: () => b,
        limit: () => b,
        insert: (p: unknown) => ((op = 'insert'), (payload = p), b),
        upsert: (p: unknown) => ((op = 'upsert'), (payload = p), b),
        update: (p: unknown) => ((op = 'update'), (payload = p), b),
        delete: () => ((op = 'delete'), b),
        maybeSingle: async () => ({ data: (ejecutar().data as Row[])[0] ?? null, error: null }),
        single: async () => {
          const fila = (ejecutar().data as Row[])[0] ?? null;
          return { data: fila, error: fila ? null : { code: 'PGRST116', message: 'no rows' } };
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, ko),
      };
      return b;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}
const db = makeDb();

// ─── Sesión doble ────────────────────────────────────────────────────────────

const ORG = 120;
const OTRA = 121;
const USER = '0f0f0f0f-1111-4222-8333-444444444444';
const OTRO_USER = '0f0f0f0f-9999-4222-8333-444444444444';

let session: { userId: string; userEmail: string; organizationId: number; miembroDe: number[] } | null;
let permisos: string[];

function ctxPara(orgId: number) {
  if (!session) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  if (!session.miembroDe.includes(orgId)) throw new OrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN');
  return {
    userId: session.userId,
    userEmail: session.userEmail,
    organizationId: orgId,
    organizationName: 'Org',
    roleId: 3,
    roleName: 'x',
    isSuperAdmin: false,
    memberId: 1,
    supabase: db,
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  hasOrgAdminOrPermission: async (_ctx: unknown, code: string) => permisos.includes(code),
  getServerOrgContext: async () => ctxPara(session?.organizationId ?? 0),
  getServerOrgContextFor: async (orgId: number) => ctxPara(orgId),
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
    async (req: Request, rp: unknown) => {
      try {
        return await handler(ctxPara(session?.organizationId ?? 0), req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) return new Response(JSON.stringify({ code: err.code }), { status: err.statusCode });
        throw err;
      }
    },
}));
jest.mock('@/lib/security/platformAdmin', () => ({
  requireSessionUser: async () => {
    if (!session) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
    return { userId: session.userId, supabase: db };
  },
}));
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => db }));
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
jest.mock('@/lib/services/icalService', () => ({ parseICalFeed: jest.fn(() => []) }));

// ─── Stripe doble ────────────────────────────────────────────────────────────

const stripe = {
  checkout: { sessions: { retrieve: jest.fn() } },
  subscriptions: {
    retrieve: jest.fn(async () => ({ status: 'active', items: { data: [{ current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }] } })),
  },
  customers: { create: jest.fn(), retrieve: jest.fn(), update: jest.fn(async () => ({})), list: jest.fn() },
  setupIntents: { create: jest.fn(), retrieve: jest.fn() },
  paymentMethods: { retrieve: jest.fn() },
};
jest.mock('@/lib/stripe/server', () => ({ stripe, requireStripe: () => stripe }));

const svc = {
  createSubscription: jest.fn(async () => ({ success: true, subscriptionId: 'sub_1', customerId: 'cus_propio12345' })),
  createBillingPortalSession: jest.fn(async () => ({ success: true, url: 'https://billing.stripe.test/s' })),
  getCustomerPaymentMethods: jest.fn(async () => ({ success: true, paymentMethods: [{ id: 'pm_propio' }] })),
  deletePaymentMethod: jest.fn(async () => ({ success: true })),
  createSetupIntent: jest.fn(async () => ({ success: true, clientSecret: 'seti_secret' })),
  updateSubscriptionPaymentMethod: jest.fn(async () => ({ success: true })),
  cancelSubscription: jest.fn(async () => ({ success: true })),
  reactivateSubscription: jest.fn(async () => ({ success: true })),
  getCustomerInvoices: jest.fn(async () => ({ invoices: [] })),
};
jest.mock('@/lib/stripe/subscriptionService', () => svc);

// ─── Utilidades ──────────────────────────────────────────────────────────────

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://app.test${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const get = (url: string, headers: Record<string, string> = {}) => new Request(`https://app.test${url}`, { headers });
const rp = { params: Promise.resolve({}) };

function checkoutDe(orgId: number, extra: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_1234567890',
    mode: 'subscription',
    status: 'complete',
    payment_status: 'paid',
    subscription: 'sub_nuevo',
    customer: 'cus_org12345678',
    metadata: { organizationId: String(orgId), planCode: 'pro', billingPeriod: 'monthly' },
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  escrituras.length = 0;
  session = { userId: USER, userEmail: 'dueno@ejemplo.test', organizationId: ORG, miembroDe: [ORG] };
  permisos = ['billing_management'];
  data = {
    plans: [{ id: 7, code: 'pro', name: 'Pro' }],
    subscriptions: [
      { id: 's-120', organization_id: ORG, plan_id: 1, stripe_subscription_id: 'sub_viejo', stripe_customer_id: 'cus_org12345678' },
      { id: 's-121', organization_id: OTRA, plan_id: 1, stripe_subscription_id: 'sub_otra', stripe_customer_id: 'cus_otra12345678' },
    ],
    organizations: [{ id: ORG }, { id: OTRA }],
    modules: [{ code: 'organizations', is_core: true }],
    organization_modules: [],
    organization_members: [
      { id: 'm-1', user_id: USER, organization_id: 145, is_temporary: true },
      { id: 'm-2', user_id: OTRO_USER, organization_id: 145, is_temporary: true },
      { id: 'm-3', user_id: USER, organization_id: ORG, is_temporary: false },
    ],
  };
  jest.requireActual<typeof import('@/lib/security/rateLimit')>('@/lib/security/rateLimit')._resetRateLimits();
});

// ─── stripe/confirm-plan-change ──────────────────────────────────────────────

describe('POST /api/stripe/confirm-plan-change', () => {
  const llamar = async (body: unknown) => {
    const { POST } = await import('@/app/api/stripe/confirm-plan-change/route');
    return POST(post('/api/stripe/confirm-plan-change', body));
  };

  it('401 sin sesión, sin tocar Stripe', async () => {
    session = null;
    const res = await llamar({ sessionId: 'cs_test_1234567890' });
    expect(res.status).toBe(401);
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it('403 sin permiso de facturación', async () => {
    permisos = [];
    const res = await llamar({ sessionId: 'cs_test_1234567890' });
    expect(res.status).toBe(403);
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it('403 si el body trae otra organización (ya no manda sobre la metadata)', async () => {
    const res = await llamar({ sessionId: 'cs_test_1234567890', organizationId: OTRA });
    expect(res.status).toBe(403);
    expect(escrituras).toEqual([]);
  });

  it('403 si el Checkout pagado es de otra organización', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce(checkoutDe(OTRA));
    const res = await llamar({ sessionId: 'cs_test_1234567890' });
    expect(res.status).toBe(403);
    expect(escrituras).toEqual([]);
    expect(data.subscriptions.find((s) => s.organization_id === OTRA)?.plan_id).toBe(1);
  });

  it('409 si el Checkout no está completo', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce(checkoutDe(ORG, { status: 'open' }));
    const res = await llamar({ sessionId: 'cs_test_1234567890' });
    expect(res.status).toBe(409);
    expect(escrituras).toEqual([]);
  });

  it('caso feliz: aplica el plan de la metadata y es idempotente', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(checkoutDe(ORG));
    const res = await llamar({ sessionId: 'cs_test_1234567890' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, alreadyApplied: false, plan: { code: 'pro' } });
    const sub = data.subscriptions.find((s) => s.organization_id === ORG)!;
    expect(sub).toMatchObject({ plan_id: 7, stripe_subscription_id: 'sub_nuevo', status: 'active' });
    expect(data.organization_modules).toHaveLength(1);

    const antes = escrituras.length;
    const otra = await llamar({ sessionId: 'cs_test_1234567890' });
    expect(await otra.json()).toMatchObject({ success: true, alreadyApplied: true });
    expect(escrituras.length).toBe(antes);
  });
});

// ─── stripe/create-subscription ──────────────────────────────────────────────

describe('POST /api/stripe/create-subscription', () => {
  const base = { organizationId: ORG, planCode: 'pro', billingPeriod: 'monthly' };
  const llamar = async (body: unknown) => {
    const { POST } = await import('@/app/api/stripe/create-subscription/route');
    return POST(post('/api/stripe/create-subscription', body));
  };

  it('401 sin sesión', async () => {
    session = null;
    expect((await llamar(base)).status).toBe(401);
    expect(svc.createSubscription).not.toHaveBeenCalled();
  });

  it('403 para una organización de la que no es miembro', async () => {
    expect((await llamar({ ...base, organizationId: OTRA })).status).toBe(403);
    expect(svc.createSubscription).not.toHaveBeenCalled();
  });

  it('403 sin permiso de facturación', async () => {
    permisos = [];
    expect((await llamar(base)).status).toBe(403);
    expect(svc.createSubscription).not.toHaveBeenCalled();
  });

  it('403 con el cliente de Stripe de otra persona', async () => {
    stripe.customers.retrieve.mockResolvedValueOnce({ id: 'cus_ajeno1234567', email: 'otra@ejemplo.test', metadata: { source: 'signup_flow', status: 'pending_verification' } });
    expect((await llamar({ ...base, existingCustomerId: 'cus_ajeno1234567' })).status).toBe(403);
    stripe.customers.retrieve.mockResolvedValueOnce({ id: 'cus_activo123456', email: 'dueno@ejemplo.test', metadata: { organizationId: '99', status: 'active' } });
    expect((await llamar({ ...base, existingCustomerId: 'cus_activo123456' })).status).toBe(403);
    expect(svc.createSubscription).not.toHaveBeenCalled();
  });

  it('caso feliz: correo de la sesión, organización validada; userId/email del body ignorados', async () => {
    stripe.customers.retrieve.mockResolvedValueOnce({ id: 'cus_alta12345678', email: 'DUENO@ejemplo.test', metadata: { source: 'signup_flow', status: 'pending_verification' } });
    const res = await llamar({ ...base, existingCustomerId: 'cus_alta12345678', userId: OTRO_USER, email: 'victima@ejemplo.test' });
    expect(res.status).toBe(200);
    expect(svc.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, customerEmail: 'dueno@ejemplo.test', existingCustomerId: 'cus_alta12345678' }),
    );
  });
});

// ─── subscriptions/* ─────────────────────────────────────────────────────────

describe('/api/subscriptions: portal y métodos de pago', () => {
  it('billing-portal: 401 sin sesión, 403 ajena, 403 sin permiso, 200 propia', async () => {
    const { POST } = await import('@/app/api/subscriptions/billing-portal/route');
    session = null;
    expect((await POST(post('/x', { organizationId: ORG }))).status).toBe(401);
    session = { userId: USER, userEmail: 'dueno@ejemplo.test', organizationId: ORG, miembroDe: [ORG] };
    expect((await POST(post('/x', { organizationId: OTRA }))).status).toBe(403);
    permisos = [];
    expect((await POST(post('/x', { organizationId: ORG }))).status).toBe(403);
    expect(svc.createBillingPortalSession).not.toHaveBeenCalled();
    permisos = ['billing_management'];
    const ok = await POST(post('/x', { organizationId: ORG }));
    expect(ok.status).toBe(200);
    expect(svc.createBillingPortalSession).toHaveBeenCalledWith('cus_org12345678', expect.any(String));
  });

  it('payment-methods GET: 403 para otra organización (antes sin ninguna comprobación)', async () => {
    const { GET } = await import('@/app/api/subscriptions/payment-methods/route');
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect((await GET(get(`/x?organizationId=${OTRA}`))).status).toBe(403);
    expect(svc.getCustomerPaymentMethods).not.toHaveBeenCalled();
    const ok = await GET(get(`/x?organizationId=${ORG}`));
    expect(ok.status).toBe(200);
    expect(svc.getCustomerPaymentMethods).toHaveBeenCalledWith('cus_org12345678');
  });

  it('payment-methods POST delete: un método que no es del cliente de la organización → 404', async () => {
    const { POST } = await import('@/app/api/subscriptions/payment-methods/route');
    const res = await POST(post('/x', { organizationId: ORG, action: 'delete', paymentMethodId: 'pm_de_otro' }));
    expect(res.status).toBe(404);
    expect(svc.deletePaymentMethod).not.toHaveBeenCalled();
    const ok = await POST(post('/x', { organizationId: ORG, action: 'delete', paymentMethodId: 'pm_propio' }));
    expect(ok.status).toBe(200);
    expect(svc.deletePaymentMethod).toHaveBeenCalledWith('pm_propio');
  });
});

// ─── organization/enterprise y pms/ical/sync ─────────────────────────────────

describe('rutas que tomaban la organización del body', () => {
  it('organization/enterprise GET: 403 para otra organización', async () => {
    const { GET } = await import('@/app/api/organization/enterprise/route');
    expect((await GET(get(`/x?organizationId=${OTRA}`) as never)).status).toBe(403);
  });

  it('pms/ical/sync: 403 si el body trae otra organización', async () => {
    const { POST } = await import('@/app/api/pms/ical/sync/route');
    const res = await POST(post('/x', { organization_id: OTRA }), rp);
    expect(res.status).toBe(403);
    expect(escrituras).toEqual([]);
  });
});

// ─── super-admin-cleanup ─────────────────────────────────────────────────────

describe('POST /api/super-admin-cleanup', () => {
  const llamar = async (body: unknown) => {
    const { POST } = await import('@/app/api/super-admin-cleanup/route');
    return POST(post('/api/super-admin-cleanup', body));
  };

  it('401 sin sesión, sin borrar nada', async () => {
    session = null;
    expect((await llamar({ user_id: USER, org_id: 145 })).status).toBe(401);
    expect(data.organization_members).toHaveLength(3);
  });

  it('403 si el user_id del body no es el de la sesión', async () => {
    expect((await llamar({ user_id: OTRO_USER, org_id: 145 })).status).toBe(403);
    expect(data.organization_members).toHaveLength(3);
  });

  it('caso feliz: solo la membresía TEMPORAL del usuario de la sesión', async () => {
    const res = await llamar({ user_id: USER, org_id: 145 });
    expect(res.status).toBe(200);
    expect(data.organization_members.map((m) => m.id).sort()).toEqual(['m-2', 'm-3']);
  });
});

// ─── stripe/setup-intent (público por diseño) ────────────────────────────────

describe('/api/stripe/setup-intent', () => {
  it('POST crea SIEMPRE un cliente de alta nuevo; nunca busca clientes por correo ni acepta un id', async () => {
    stripe.customers.create.mockResolvedValueOnce({ id: 'cus_nuevo1234567' });
    stripe.setupIntents.create.mockResolvedValueOnce({ id: 'seti_123456789', client_secret: 'seti_secret' });
    const { POST } = await import('@/app/api/stripe/setup-intent/route');
    const res = await POST(post('/x', { email: 'victima@ejemplo.test', tempCustomerId: 'cus_ajeno1234567' }) as never);
    expect(res.status).toBe(200);
    expect(stripe.customers.list).not.toHaveBeenCalled();
    expect(stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: { source: 'signup_flow', status: 'pending_verification' } }));
    expect(stripe.setupIntents.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_nuevo1234567',
      usage: 'off_session',
      metadata: { source: 'signup_flow' },
    }));
  });

  it('GET no toca un SetupIntent que no es del alta ni un cliente ya reclamado', async () => {
    const { GET } = await import('@/app/api/stripe/setup-intent/route');
    const { NextRequest } = await import('next/server');
    stripe.setupIntents.retrieve.mockResolvedValueOnce({ id: 'seti_ajeno123456', status: 'succeeded', customer: 'cus_ajeno1234567', payment_method: 'pm_x', metadata: {} });
    expect((await GET(new NextRequest('https://app.test/x?setupIntentId=seti_ajeno123456'))).status).toBe(404);
    stripe.setupIntents.retrieve.mockResolvedValueOnce({ id: 'seti_alta1234567', status: 'succeeded', customer: 'cus_activo123456', payment_method: 'pm_x', metadata: { source: 'signup_flow' } });
    stripe.customers.retrieve.mockResolvedValueOnce({ id: 'cus_activo123456', metadata: { source: 'signup_flow', status: 'active' } });
    expect((await GET(new NextRequest('https://app.test/x?setupIntentId=seti_alta1234567'))).status).toBe(404);
    expect(stripe.customers.update).not.toHaveBeenCalled();
  });
});

// ─── Secretos fail-closed ────────────────────────────────────────────────────

describe('secretos compartidos: fail-closed', () => {
  const envOriginal = { ...process.env };
  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('push/web: sin PUSH_WEBHOOK_SECRET → 503; con secreto malo → 401', async () => {
    const { POST } = await import('@/app/api/push/web/route');
    delete process.env.PUSH_WEBHOOK_SECRET;
    expect((await POST(post('/x', { userId: OTRO_USER, title: 't', body: 'b' }) as never)).status).toBe(503);
    process.env.PUSH_WEBHOOK_SECRET = 'secreto-push-de-prueba-largo-1234';
    expect((await POST(post('/x', { userId: OTRO_USER, title: 't', body: 'b' }, { 'x-internal-secret': 'otro' }) as never)).status).toBe(401);
  });

  it('crons: sin CRON_SECRET o con el Bearer malo → 401', async () => {
    const { GET } = await import('@/app/api/cron/expire-old-notifications/route');
    delete process.env.CRON_SECRET;
    expect((await GET(get('/x', { authorization: 'Bearer undefined' }) as never)).status).toBe(401);
    process.env.CRON_SECRET = 'cron-secreto-de-prueba-largo-12345';
    expect((await GET(get('/x', { authorization: 'Bearer malo' }) as never)).status).toBe(401);
  });

  it('webhook de Facebook: sin app_secret del canal → 401 y no procesa', async () => {
    jest.resetModules();
    const procesar = jest.fn(async () => undefined);
    jest.doMock('@/lib/services/integrations/meta-messaging/metaMessagingService', () => ({
      metaMessagingService: {
        getChannelInfo: async () => ({ id: 'c1', credentials: {} }),
        verifySignature: () => true,
        processWebhookPayload: procesar,
      },
    }));
    const { POST } = await import('@/app/api/webhooks/facebook/[channelId]/route');
    const res = await POST(post('/x', { object: 'page', entry: [] }, { 'x-hub-signature-256': 'sha256=x' }) as never, { params: Promise.resolve({ channelId: 'c1' }) });
    expect(res.status).toBe(401);
    expect(procesar).not.toHaveBeenCalled();
  });
});
