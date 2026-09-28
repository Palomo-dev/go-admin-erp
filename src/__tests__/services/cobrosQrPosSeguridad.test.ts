/**
 * Cobros QR / link del POS y del folio (GO-sec, auditoría del POS 2026-09-24).
 *
 * Rutas `/api/integrations/{redeban,breb,bancolombia,bold}/…` y `qr/auto-match`:
 * sin sesión → 401; organización ajena en body o query → 403 y registro SIN
 * llamar al proveedor; permiso de cobro faltante → 403; la conexión se
 * resuelve en el servidor (la del body se ignora): ninguna → 412, varias sin
 * desempate → 409; sucursal o folio de otra organización → 404; importe,
 * moneda y referencia validados; caso feliz por ruta. Webhooks de Bre-B,
 * Redeban, Bancolombia y Bold: la sesión QR se busca por la conexión que
 * firmó, no solo por la referencia.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

// ─── Base de datos doble ─────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Resultado = { data: Row[]; error: null };

interface Consulta extends PromiseLike<Resultado> {
  select(cols?: string): Consulta;
  eq(col: string, val: unknown): Consulta;
  in(col: string, vals: unknown[]): Consulta;
  order(): Consulta;
  limit(): Consulta;
  insert(p: Row | Row[]): Consulta;
  update(p: Row): Consulta;
  maybeSingle(): Promise<{ data: Row | null; error: null }>;
  single(): Promise<{ data: Row | null; error: { message: string } | null }>;
}

function makeDb(tables: () => Record<string, Row[]>) {
  return {
    from(table: string): Consulta {
      const filtros: Array<(r: Row) => boolean> = [];
      let op: 'select' | 'insert' | 'update' = 'select';
      let payload: Row | Row[] | null = null;
      const run = (): Resultado => {
        const t = (tables()[table] ??= []);
        if (op === 'insert') {
          const lista = Array.isArray(payload) ? payload : [payload ?? {}];
          const filas = lista.map((p, i) => ({ id: `${table}-${t.length + i + 1}`, ...p }));
          t.push(...filas);
          return { data: filas, error: null };
        }
        const rs = t.filter((r) => filtros.every((f) => f(r)));
        if (op === 'update') rs.forEach((r) => Object.assign(r, payload));
        return { data: rs, error: null };
      };
      const b: Consulta = {
        select: () => b,
        eq: (c, v) => (filtros.push((r) => String(r[c]) === String(v)), b),
        in: (c, vs) => (filtros.push((r) => vs.map(String).includes(String(r[c]))), b),
        order: () => b,
        limit: () => b,
        insert: (p) => ((op = 'insert'), (payload = p), b),
        update: (p) => ((op = 'update'), (payload = p), b),
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        single: async () => {
          const fila = run().data[0] ?? null;
          return { data: fila, error: fila ? null : { message: 'no rows' } };
        },
        then: (ok, ko) => Promise.resolve(run()).then(ok, ko),
      };
      return b;
    },
  };
}

const ORG = 120;
const OTRA = 121;
const USER = '0f0f0f0f-1111-4222-8333-444444444444';
const SUCURSAL = 7;
const SUCURSAL_2 = 9;
const SUCURSAL_AJENA = 8;
const FOLIO = 'f0000000-0000-4000-8000-000000000120';
const FOLIO_AJENO = 'f0000000-0000-4000-8000-000000000121';
const RESERVA = 'e0000000-0000-4000-8000-000000000120';
const RESERVA_AJENA = 'e0000000-0000-4000-8000-000000000121';

const CONECTOR = {
  redeban_qr: 'c0000000-0000-4000-8000-000000000001',
  breb_mono: 'c0000000-0000-4000-8000-000000000002',
  bancolombia_qr: 'c0000000-0000-4000-8000-000000000003',
  wompi_co: 'c0000000-0000-4000-8000-000000000004',
  bold_link: 'c0000000-0000-4000-8000-000000000005',
  bold_pos: 'c0000000-0000-4000-8000-000000000006',
} as const;
/** Conexión general (sin sucursal) de ORG por conector. */
const CONEXION = {
  redeban_qr: 'a0000000-0000-4000-8000-000000000001',
  breb_mono: 'a0000000-0000-4000-8000-000000000002',
  bancolombia_qr: 'a0000000-0000-4000-8000-000000000003',
  wompi_co: 'a0000000-0000-4000-8000-000000000004',
  bold_link: 'a0000000-0000-4000-8000-000000000005',
  bold_pos: 'a0000000-0000-4000-8000-000000000006',
} as const;
const CONEXION_AJENA = 'b0000000-0000-4000-8000-000000000002';

let data: Record<string, Row[]>;
function freshData(): Record<string, Row[]> {
  return {
    integration_connectors: Object.entries(CONECTOR).map(([code, id]) => ({ id, code })),
    integration_connections: [
      ...Object.entries(CONEXION).map(([code, id]) => ({
        id,
        organization_id: ORG,
        branch_id: null,
        connector_id: CONECTOR[code as keyof typeof CONECTOR],
        environment: 'sandbox',
        status: 'connected',
        settings:
          code === 'breb_mono'
            ? { breb_key_value: '@tienda', breb_key_type: 'ALPHA' }
            : code === 'bold_pos'
              ? { terminals: [{ serial: 'SN-7', model: 'N86', branch_id: SUCURSAL }], user_email: 'caja@example.com' }
              : {},
      })),
      // Conexión Bre-B de OTRA organización: nunca debe usarse para ORG.
      { id: CONEXION_AJENA, organization_id: OTRA, branch_id: null, connector_id: CONECTOR.breb_mono, environment: 'sandbox', status: 'connected', settings: { breb_key_value: '@otra' } },
    ],
    organization_payment_methods: [],
    branches: [
      { id: SUCURSAL, organization_id: ORG },
      { id: SUCURSAL_2, organization_id: ORG },
      { id: SUCURSAL_AJENA, organization_id: OTRA },
    ],
    folios: [
      { id: FOLIO, reservation_id: RESERVA },
      { id: FOLIO_AJENO, reservation_id: RESERVA_AJENA },
    ],
    reservations: [
      { id: RESERVA, organization_id: ORG },
      { id: RESERVA_AJENA, organization_id: OTRA },
    ],
    payment_qr_sessions: [],
  };
}

// ─── Sesión doble ────────────────────────────────────────────────────────────

let session: { organizationId: number; userId: string; roleId: number; isSuperAdmin: boolean } | null;
let permisos: string[];

const db = makeDb(() => data);

function ctxDeSesion() {
  if (!session) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  return { ...session, organizationName: 'Org', roleName: 'x', memberId: 1, userEmail: 'cajero@example.com', supabase: db };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  hasOrgAdminOrPermission: async (_ctx: unknown, code: string) => permisos.includes(code) || permisos.includes('admin.full_access'),
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>, opts?: { admin?: boolean }) =>
    async (req: Request, rp: unknown) => {
      try {
        const ctx = ctxDeSesion();
        if (opts?.admin && !permisos.includes('admin.full_access')) {
          throw new OrgContextError('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
        }
        return await handler(ctx, req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) {
          return new Response(JSON.stringify({ error: err.message, code: err.code }), { status: err.statusCode });
        }
        throw err;
      }
    },
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => db }));
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));

// ─── Proveedores dobles ──────────────────────────────────────────────────────

const mono = {
  createCollection: jest.fn(async () => ({ id: 'col-1', qr: 'EMV-BREB', qr_image: null, expires_at: '2026-09-24T12:15:00Z' })),
  healthCheck: jest.fn(async () => ({ ok: true })),
};
const redeban = {
  createQr: jest.fn(async () => ({ id: 'rb-1', qr_string: 'EMV-RB', qr_image_base64: 'b64' })),
  healthCheck: jest.fn(async () => ({ ok: true })),
  getTransactionStatus: jest.fn(async () => null),
};
const bancolombia = {
  registerTransferIntention: jest.fn(async () => ({ transferCode: 'tc-1', redirectURL: 'https://bancolombia.test/qr' })),
  healthCheck: jest.fn(async () => ({ ok: true })),
  validateTransfer: jest.fn(async () => null),
};
const wompi = {
  getCredentials: jest.fn(async () => ({ integritySecret: 'secreto' })),
  getAcceptanceTokens: jest.fn(async () => ({ acceptanceToken: 'a', acceptPersonalAuth: 'b' })),
  generateIntegritySignature: jest.fn(() => 'firma'),
  createTransaction: jest.fn(async () => ({
    data: { id: 'w-1', status: 'PENDING', payment_method: { extra: { qr_image: 'PHN2Zz4=', qr_id: 'qr-1' } } },
  })),
};
const bold = {
  createPaymentLink: jest.fn(async () => ({ id: 'LNK-1', link_url: 'https://bold.test/l/1', expires_at: null })),
  createPosPayment: jest.fn(async () => ({ integration_id: 'int-1' })),
  healthCheck: jest.fn(async () => ({ ok: true })),
  getPaymentLinkStatus: jest.fn(async () => null),
};
const confirmQrPayment = jest.fn(async () => ({ success: true, paymentId: 'pay-1' }));

jest.mock('@/lib/services/integrations/breb', () => ({ monoService: mono }));
jest.mock('@/lib/services/integrations/redeban', () => ({ redebanService: redeban }));
jest.mock('@/lib/services/integrations/bancolombia', () => ({ bancolombiaService: bancolombia }));
jest.mock('@/lib/services/integrations/wompi', () => ({ wompiService: wompi }));
jest.mock('@/lib/services/integrations/bold', () => ({ boldService: bold }));
jest.mock('@/lib/services/integrations/qrShared/paymentConfirmation', () => ({ confirmQrPayment }));
jest.mock('@/lib/pos/display/payment', () => ({ normalizeQrImageSource: (s: string) => `data:image/svg+xml;base64,${s}` }));

import { POST as brebCreate } from '@/app/api/integrations/breb/create-qr/route';
import { POST as redebanCreate } from '@/app/api/integrations/redeban/create-qr/route';
import { POST as bancolombiaCreate } from '@/app/api/integrations/bancolombia/create-qr/route';
import { POST as wompiQrCreate } from '@/app/api/integrations/bancolombia/wompi/create-qr/route';
import { POST as boldLinkCreate } from '@/app/api/integrations/bold/create-link/route';
import { POST as boldPosCreate } from '@/app/api/integrations/bold/create-pos-payment/route';
import { GET as brebStatus } from '@/app/api/integrations/breb/status/route';
import { GET as boldStatus } from '@/app/api/integrations/bold/status/route';
import { POST as brebHealth } from '@/app/api/integrations/breb/health-check/route';
import { POST as boldHealth } from '@/app/api/integrations/bold/health-check/route';
import { POST as autoMatch } from '@/app/api/integrations/qr/auto-match/route';
import { monoService as monoReal } from '@/lib/services/integrations/breb/monoService';
import { redebanService as redebanReal } from '@/lib/services/integrations/redeban/redebanService';
import { bancolombiaService as bancolombiaReal } from '@/lib/services/integrations/bancolombia/bancolombiaService';
import { boldService as boldReal } from '@/lib/services/integrations/bold/boldService';
import type { BancolombiaWebhookPayload } from '@/lib/services/integrations/bancolombia/bancolombiaTypes';
import type { MonoWebhookPayload } from '@/lib/services/integrations/breb/monoTypes';
import type { RedebanWebhookPayload } from '@/lib/services/integrations/redeban/redebanTypes';
import type { BoldWebhookEvent } from '@/lib/services/integrations/bold/boldTypes';

jest.mock('@/lib/services/integrations/qrShared/autoReconciliation', () => ({
  autoMatchFromWebhook: jest.fn(async (_p: string, _t: number, org: number) => ({ success: true, message: `org ${org}` })),
}));

// ─── Utilidades ──────────────────────────────────────────────────────────────

type Handler = (req: Request, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;
const RP = { params: Promise.resolve({}) };

function post(handler: Handler, body: Row, query = ''): Promise<Response> {
  return handler(
    new Request(`http://localhost/api/x${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    RP,
  );
}

function get(handler: Handler, query: string): Promise<Response> {
  return handler(new Request(`http://localhost/api/x${query}`, { method: 'GET' }), RP);
}

let seq = 0;
function cobro(extra: Row = {}): Row {
  seq += 1;
  return {
    connectionId: '',
    amount: 25000,
    currency: 'COP',
    reference: `POS-17000000${seq}-${ORG}`,
    description: 'POS - Venta',
    source: 'pos',
    sourceId: 'cart-1',
    branchId: SUCURSAL,
    organizationId: ORG,
    ...extra,
  };
}

const RUTAS_COBRO: Array<{ nombre: string; handler: Handler; proveedor: jest.Mock; conexion: string; extra?: Row }> = [
  { nombre: 'redeban/create-qr', handler: redebanCreate as Handler, proveedor: redeban.createQr, conexion: CONEXION.redeban_qr },
  { nombre: 'breb/create-qr', handler: brebCreate as Handler, proveedor: mono.createCollection, conexion: CONEXION.breb_mono },
  { nombre: 'bancolombia/create-qr', handler: bancolombiaCreate as Handler, proveedor: bancolombia.registerTransferIntention, conexion: CONEXION.bancolombia_qr },
  { nombre: 'bancolombia/wompi/create-qr', handler: wompiQrCreate as Handler, proveedor: wompi.getCredentials, conexion: CONEXION.wompi_co },
  { nombre: 'bold/create-link', handler: boldLinkCreate as Handler, proveedor: bold.createPaymentLink, conexion: CONEXION.bold_link },
  { nombre: 'bold/create-pos-payment', handler: boldPosCreate as Handler, proveedor: bold.createPosPayment, conexion: CONEXION.bold_pos, extra: { payment_method: 'PAY_BY_QR_BOLD' } },
];

let warn: jest.SpyInstance;
let error: jest.SpyInstance;
beforeEach(() => {
  data = freshData();
  session = { organizationId: ORG, userId: USER, roleId: 4, isSuperAdmin: false };
  permisos = ['pos.create'];
  jest.clearAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

// ─── Rutas de cobro ──────────────────────────────────────────────────────────

describe.each(RUTAS_COBRO)('$nombre', ({ handler, proveedor, conexion, extra }) => {
  test('sin sesión → 401 sin llamar al proveedor', async () => {
    session = null;
    const res = await post(handler, cobro(extra));
    expect(res.status).toBe(401);
    expect(proveedor).not.toHaveBeenCalled();
  });

  test('organización ajena en el body → 403 y registro, sin llamar al proveedor', async () => {
    const res = await post(handler, cobro({ ...extra, organizationId: OTRA }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(proveedor).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ajeno'), expect.objectContaining({ session: ORG }));
    expect(data.payment_qr_sessions).toHaveLength(0);
  });

  test('organización ajena en la query → 403', async () => {
    const res = await post(handler, cobro(extra), `?organization_id=${OTRA}`);
    expect(res.status).toBe(403);
    expect(proveedor).not.toHaveBeenCalled();
  });

  test('sin permiso de cobro (pos.create) → 403 y registro', async () => {
    permisos = [];
    const res = await post(handler, cobro(extra));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PERMISO_REQUERIDO');
    expect(proveedor).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sin permiso'), expect.objectContaining({ permiso: 'pos.create' }));
  });

  test('sin conexión activa de la organización → 412 con mensaje claro', async () => {
    data.integration_connections = data.integration_connections.filter((c) => c.id !== conexion);
    const res = await post(handler, cobro(extra));
    expect(res.status).toBe(412);
    const json = await res.json();
    expect(json.code).toBe('CONEXION_NO_CONFIGURADA');
    expect(json.error).toMatch(/Integraciones/);
    expect(proveedor).not.toHaveBeenCalled();
  });

  test('conexión en pausa no cuenta → 412', async () => {
    data.integration_connections.find((c) => c.id === conexion)!.status = 'paused';
    const res = await post(handler, cobro(extra));
    expect(res.status).toBe(412);
    expect(proveedor).not.toHaveBeenCalled();
  });

  test('caso feliz: conexión resuelta en el servidor (la del body se ignora) y sesión QR de la organización', async () => {
    const body = cobro({ ...extra, connectionId: CONEXION_AJENA });
    const res = await post(handler, body);
    expect(res.status).toBe(200);
    expect(proveedor).toHaveBeenCalledTimes(1);
    expect((proveedor.mock.calls[0] as unknown[])[0]).toBe(conexion);
    expect(data.payment_qr_sessions).toHaveLength(1);
    expect(data.payment_qr_sessions[0]).toMatchObject({
      organization_id: ORG,
      branch_id: SUCURSAL,
      integration_connection_id: conexion,
      reference: body.reference,
      amount: 25000,
      created_by: USER,
      status: 'pending',
    });
  });

  test('sucursal de otra organización → 404', async () => {
    const res = await post(handler, cobro({ ...extra, branchId: SUCURSAL_AJENA }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('SUCURSAL_NO_ENCONTRADA');
    expect(proveedor).not.toHaveBeenCalled();
  });

  test('importe inválido, moneda ajena al riel y referencia repetida', async () => {
    for (const amount of [0, -5, 'abc', 10.555]) {
      const res = await post(handler, cobro({ ...extra, amount }));
      expect(res.status).toBe(400);
    }
    expect((await post(handler, cobro({ ...extra, currency: 'USD' }))).status).toBe(400);
    const repetida = cobro(extra);
    expect((await post(handler, repetida)).status).toBe(200);
    const res = await post(handler, repetida);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('REFERENCIA_DUPLICADA');
    expect(proveedor).toHaveBeenCalledTimes(1);
  });
});

describe('resolución de la conexión', () => {
  test('la conexión de la sucursal gana a la general; la de OTRA sucursal no sirve', async () => {
    const DE_SUCURSAL = 'a0000000-0000-4000-8000-0000000000a7';
    const DE_OTRA_SUCURSAL = 'a0000000-0000-4000-8000-0000000000a9';
    data.integration_connections.push(
      { id: DE_SUCURSAL, organization_id: ORG, branch_id: SUCURSAL, connector_id: CONECTOR.redeban_qr, environment: 'sandbox', status: 'connected', settings: {} },
      { id: DE_OTRA_SUCURSAL, organization_id: ORG, branch_id: SUCURSAL_2, connector_id: CONECTOR.redeban_qr, environment: 'sandbox', status: 'connected', settings: {} },
    );
    expect((await post(redebanCreate as Handler, cobro())).status).toBe(200);
    expect((redeban.createQr.mock.calls[0] as unknown[])[0]).toBe(DE_SUCURSAL);
  });

  test('varias generales: gana la vinculada al método de pago; sin vínculo → 409', async () => {
    const SEGUNDA = 'a0000000-0000-4000-8000-0000000000b1';
    data.integration_connections.push({ id: SEGUNDA, organization_id: ORG, branch_id: null, connector_id: CONECTOR.redeban_qr, environment: 'sandbox', status: 'connected', settings: {} });

    const ambigua = await post(redebanCreate as Handler, cobro());
    expect(ambigua.status).toBe(409);
    expect((await ambigua.json()).code).toBe('CONEXION_AMBIGUA');
    expect(redeban.createQr).not.toHaveBeenCalled();

    data.organization_payment_methods.push({ organization_id: ORG, payment_method_code: 'redeban_qr', is_active: true, integration_connection_id: SEGUNDA });
    expect((await post(redebanCreate as Handler, cobro())).status).toBe(200);
    expect((redeban.createQr.mock.calls[0] as unknown[])[0]).toBe(SEGUNDA);
  });

  test('solo existe la conexión de otra organización → 412, nunca se usa', async () => {
    data.integration_connections = data.integration_connections.filter((c) => c.id !== CONEXION.breb_mono);
    const res = await post(brebCreate as Handler, cobro());
    expect(res.status).toBe(412);
    expect(mono.createCollection).not.toHaveBeenCalled();
  });
});

describe('datos del riel que salen de la conexión', () => {
  test('Bre-B: la llave sale de la conexión aunque el body mande otra; sin llave → 412', async () => {
    expect((await post(brebCreate as Handler, cobro({ keyValue: '@atacante', keyType: 'PHONE' }))).status).toBe(200);
    expect((mono.createCollection.mock.calls[0] as unknown[])[1]).toMatchObject({ key_value: '@tienda', key_type: 'ALPHA' });

    data.integration_connections.find((c) => c.id === CONEXION.breb_mono)!.settings = {};
    const res = await post(brebCreate as Handler, cobro());
    expect(res.status).toBe(412);
    expect((await res.json()).code).toBe('LLAVE_BREB_NO_CONFIGURADA');
  });

  test('Bold datáfono: serial de la sucursal desde la conexión; sin datáfono para la sucursal → 412', async () => {
    const ok = await post(boldPosCreate as Handler, cobro({ payment_method: 'PAY_BY_QR_BOLD', terminal_serial: 'SN-ATACANTE' }));
    expect(ok.status).toBe(200);
    expect((bold.createPosPayment.mock.calls[0] as unknown[])[1]).toMatchObject({ terminal_serial: 'SN-7', terminal_model: 'N86', user_email: 'caja@example.com' });

    const res = await post(boldPosCreate as Handler, cobro({ payment_method: 'PAY_BY_QR_BOLD', branchId: SUCURSAL_2 }));
    expect(res.status).toBe(412);
    expect((await res.json()).code).toBe('DATAFONO_NO_CONFIGURADO');
  });
});

describe('cobro desde el folio del PMS', () => {
  test('exige pms.checkout y un folio de la organización', async () => {
    const folio = (extra: Row = {}) => cobro({ source: 'folio', sourceId: FOLIO, reference: `PMS-17000${++seq}-${ORG}`, ...extra });

    expect((await post(brebCreate as Handler, folio())).status).toBe(403);

    permisos = ['pms.checkout'];
    expect((await post(brebCreate as Handler, folio())).status).toBe(200);

    const ajeno = await post(brebCreate as Handler, folio({ sourceId: FOLIO_AJENO }));
    expect(ajeno.status).toBe(404);
    expect((await ajeno.json()).code).toBe('FOLIO_NO_ENCONTRADO');

    // Sin folio todavía: el PMS manda el id de la reserva.
    expect((await post(brebCreate as Handler, folio({ sourceId: RESERVA }))).status).toBe(200);
    expect((await post(brebCreate as Handler, folio({ sourceId: RESERVA_AJENA }))).status).toBe(404);
    expect(mono.createCollection).toHaveBeenCalledTimes(2);
  });

  test('una fuente desconocida → 400', async () => {
    expect((await post(brebCreate as Handler, cobro({ source: 'web' }))).status).toBe(400);
  });
});

// ─── Consulta de estado, health-check y auto-match ───────────────────────────

describe('status, health-check y auto-match', () => {
  beforeEach(() => {
    data.payment_qr_sessions.push(
      { id: 's-1', organization_id: ORG, reference: 'POS-1-120', status: 'pending', amount: 1000, integration_connection_id: null, external_qr_id: null, paid_at: null },
      { id: 's-2', organization_id: OTRA, reference: 'POS-2-121', status: 'paid', amount: 9000, integration_connection_id: null, external_qr_id: null, paid_at: null },
    );
  });

  test('status: sin sesión 401, organización ajena en la query 403, sesión QR ajena 404, la propia 200', async () => {
    session = null;
    expect((await get(brebStatus as Handler, '?reference=POS-1-120')).status).toBe(401);
    session = { organizationId: ORG, userId: USER, roleId: 4, isSuperAdmin: false };
    expect((await get(brebStatus as Handler, `?reference=POS-2-121&organizationId=${OTRA}`)).status).toBe(403);
    expect((await get(boldStatus as Handler, '?reference=POS-2-121')).status).toBe(404);
    const propia = await get(brebStatus as Handler, '?reference=POS-1-120');
    expect(propia.status).toBe(200);
    expect(await propia.json()).toMatchObject({ status: 'pending', amount: 1000 });
  });

  test('health-check: exige administración y una conexión propia del proveedor (404 sin llamar al proveedor)', async () => {
    expect((await post(brebHealth as Handler, { connectionId: CONEXION.breb_mono })).status).toBe(403);
    permisos = ['admin.full_access'];
    expect((await post(brebHealth as Handler, { connectionId: CONEXION_AJENA })).status).toBe(404);
    expect((await post(brebHealth as Handler, { connectionId: CONEXION.redeban_qr })).status).toBe(404);
    expect((await post(boldHealth as Handler, { connectionId: CONEXION.breb_mono })).status).toBe(404);
    expect(mono.healthCheck).not.toHaveBeenCalled();
    expect((await post(brebHealth as Handler, { connectionId: CONEXION.breb_mono })).status).toBe(200);
    expect(mono.healthCheck).toHaveBeenCalledWith(CONEXION.breb_mono);
    expect((await post(brebHealth as Handler, { connectionId: CONEXION.breb_mono, organizationId: OTRA })).status).toBe(403);
  });

  test('auto-match: la organización es la de la sesión; una ajena en el body → 403', async () => {
    const ok = await post(autoMatch as Handler, { paymentId: 'pay-1', bankTransactionId: 5 });
    expect(ok.status).toBe(200);
    expect((await ok.json()).message).toBe(`org ${ORG}`);
    expect((await post(autoMatch as Handler, { paymentId: 'pay-1', bankTransactionId: 5, organizationId: OTRA })).status).toBe(403);
    session = null;
    expect((await post(autoMatch as Handler, { paymentId: 'pay-1', bankTransactionId: 5 })).status).toBe(401);
  });
});

// ─── Webhooks: la sesión QR es la de la conexión que firmó ───────────────────

describe('webhooks de cobro QR: sesión por conexión, no solo por referencia', () => {
  const REF = 'POS-1700000000000-120';
  const CONEXION_B = 'b0000000-0000-4000-8000-0000000000bb';

  beforeEach(() => {
    data.integration_connections.push({ id: CONEXION_B, organization_id: OTRA, branch_id: null, connector_id: CONECTOR.breb_mono, environment: 'sandbox', status: 'connected', settings: {} });
  });

  function sesion(org: number, conexion: string, id: string): Row {
    return { id, organization_id: org, reference: REF, integration_connection_id: conexion, status: 'pending', amount: 1000 };
  }

  test('Bre-B: una firma válida de OTRA organización no toca la sesión de ORG con la misma referencia', async () => {
    data.payment_qr_sessions.push(sesion(ORG, CONEXION.breb_mono, 's-org'));
    const payload = { event: 'collection.paid', data: { id: 'col-9', metadata: { reference: REF } } } as unknown as MonoWebhookPayload;

    const ajena = await monoReal.processWebhook(CONEXION_B, payload);
    expect(ajena.success).toBe(false);
    expect(confirmQrPayment).not.toHaveBeenCalled();

    // Misma referencia en las dos organizaciones: cada conexión ve SOLO la suya.
    data.payment_qr_sessions.push(sesion(OTRA, CONEXION_B, 's-otra'));
    expect((await monoReal.processWebhook(CONEXION.breb_mono, payload)).success).toBe(true);
    expect(confirmQrPayment).toHaveBeenLastCalledWith(expect.objectContaining({ qrSessionId: 's-org', organizationId: ORG }));
  });

  test('Bancolombia: aprobado solo sobre la sesión de la conexión que firmó', async () => {
    data.payment_qr_sessions.push(sesion(ORG, CONEXION.bancolombia_qr, 's-org'));
    const payload = { transferReference: REF, transferState: 'approved', transferCode: 'tc' } as unknown as BancolombiaWebhookPayload;
    expect((await bancolombiaReal.processWebhook(CONEXION_B, payload)).success).toBe(false);
    expect(confirmQrPayment).not.toHaveBeenCalled();
    expect((await bancolombiaReal.processWebhook(CONEXION.bancolombia_qr, payload)).success).toBe(true);
    expect(confirmQrPayment).toHaveBeenCalledWith(expect.objectContaining({ qrSessionId: 's-org', organizationId: ORG }));
  });

  test('Redeban: rechazo de otra conexión no cambia la sesión', async () => {
    data.payment_qr_sessions.push(sesion(ORG, CONEXION.redeban_qr, 's-org'));
    const payload = { reference: REF, status: 'rejected', transaction_id: 't' } as unknown as RedebanWebhookPayload;
    expect((await redebanReal.processWebhook(CONEXION_B, payload)).success).toBe(false);
    expect(data.payment_qr_sessions[0].status).toBe('pending');
    expect((await redebanReal.processWebhook(CONEXION.redeban_qr, payload)).success).toBe(true);
    expect(data.payment_qr_sessions[0].status).toBe('rejected');
  });

  test('Bold: la sesión debe ser de la conexión que firmó, no solo de su organización', async () => {
    const OTRA_BOLD_DE_ORG = 'a0000000-0000-4000-8000-0000000000c1';
    data.integration_connections.push({ id: OTRA_BOLD_DE_ORG, organization_id: ORG, branch_id: null, connector_id: CONECTOR.bold_link, environment: 'sandbox', status: 'connected', settings: {} });
    data.payment_qr_sessions.push(sesion(ORG, CONEXION.bold_link, 's-org'));
    const evento = { type: 'SALE_APPROVED', data: { payment_id: 'p', metadata: { reference: REF } } } as unknown as BoldWebhookEvent;
    expect((await boldReal.processWebhook(evento, OTRA_BOLD_DE_ORG)).success).toBe(false);
    expect(confirmQrPayment).not.toHaveBeenCalled();
    expect((await boldReal.processWebhook(evento, CONEXION.bold_link)).success).toBe(true);
  });
});
