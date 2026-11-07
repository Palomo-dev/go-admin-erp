/**
 * Rutas que usa la bandeja de envíos y Configuración › Facturación
 * electrónica (Finanzas R3 · Frente D, 2026-11-07).
 *
 * Caracterización de lo que YA existía y no puede cambiar:
 *   - `GET /api/factus/jobs` sigue filtrando por la organización de la sesión,
 *     por `status` y con `limit`/`offset`, y sigue devolviendo `data` y `total`.
 *   - `POST /api/factus/config` `liberar` de UNO sigue llamando
 *     `liberarRetenido` + `procesarAhora` con la organización y el usuario de la
 *     sesión (también cubierto en rutasFacturacionElectronica.test.ts).
 *   - Reintentar y cancelar no se tocaron (colaSoloServidor.test.ts).
 * Y lo nuevo: filtros de la bandeja, `filas` sin JSON, KPIs, detalle (técnico
 * solo con finance.approve), liberar en lote y editar rangos.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

const ORG = 132;
const OTRA = 134;
const USER = 'u-1';

type Op = [string, ...unknown[]];
interface Consulta {
  tabla: string;
  ops: Op[];
}
type Respuesta = { data?: unknown; count?: number | null; error?: { code?: string; message: string } | null };

let permisos: string[];
let esAdmin: boolean;
let consultas: Consulta[];
let responder: (c: Consulta) => Respuesta;

/** Cliente de Supabase que registra la cadena de cada consulta y responde con `responder`. */
function crearDb() {
  return {
    from(tabla: string) {
      const c: Consulta = { tabla, ops: [] };
      consultas.push(c);
      const resolver = () => {
        const r = responder(c);
        return { data: r.data ?? null, count: r.count ?? null, error: r.error ?? null };
      };
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gt', 'gte', 'lt', 'or', 'order', 'range', 'limit', 'update', 'insert']) {
        b[m] = (...args: unknown[]) => {
          c.ops.push([m, ...args]);
          return b;
        };
      }
      b.maybeSingle = async () => {
        const r = resolver();
        return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error };
      };
      b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko);
      return b;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

const tiene = (c: Consulta, ...op: unknown[]) => c.ops.some((o) => JSON.stringify(o) === JSON.stringify(op));

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  hasOrgAdminOrPermission: async (_c: unknown, code: string) => esAdmin || permisos.includes(code),
  requireOrgAdminOrPermission: async (_c: unknown, code: string) => {
    if (!esAdmin && !permisos.includes(code)) throw new OrgContextError('Requiere permiso', 403, 'ADMIN_REQUIRED');
  },
  withOrg:
    (handler: (c: unknown, req: Request, rp: unknown) => Promise<Response>) =>
    async (req: Request, rp: unknown) => {
      const ctx = { organizationId: ORG, userId: USER, roleId: 5, isSuperAdmin: false, organizationName: 'Org', roleName: 'x', memberId: 1, userEmail: null, supabase: crearDb() };
      try {
        return await handler(ctx, req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) return new Response(JSON.stringify({ error: err.message, code: err.code }), { status: err.statusCode });
        throw err;
      }
    },
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => crearDb(), assertServerOnly: () => undefined }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));
const cola = {
  liberarRetenido: jest.fn<Promise<object>, [{ jobId: string; organizationId: number; actor: string }]>(async () => ({})),
  procesarAhora: jest.fn<Promise<null | { estado: string; mensaje?: string }>, [string]>(async () => null),
};
jest.mock('@/lib/services/einvoicing/colaFacturacion.server', () => cola);
jest.mock('@/lib/services/einvoicing/accesoFactus.server', () => ({
  verificarYActivar: jest.fn(),
  obtenerAccesoFactus: jest.fn(),
  FacturacionNoActivadaError: class extends Error {},
}));
jest.mock('@/lib/services/einvoicing/rangosFactus.server', () => ({ leerRangosFactus: async () => [], sincronizarRangos: async () => ({}) }));

import { NextRequest } from 'next/server';
import * as jobs from '@/app/api/factus/jobs/route';
import * as resumen from '@/app/api/factus/jobs/resumen/route';
import * as detalle from '@/app/api/factus/jobs/[id]/route';
import * as config from '@/app/api/factus/config/route';
import * as rangos from '@/app/api/factus/rangos/route';

type Handler = (req: NextRequest, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;
function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function call(h: unknown, r: NextRequest, params: Record<string, string> = {}) {
  const res = await (h as Handler)(r, { params: Promise.resolve(params) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const JOB_CRUDO = {
  id: 'job-1',
  organization_id: ORG,
  document_type: 'invoice',
  invoice_id: 'fv-1',
  status: 'rejected',
  attempt_count: 1,
  max_attempts: 5,
  error_code: 'factus_http_422',
  error_message: 'Factus rechazó',
  request_payload: { factus: { secreto: true } },
  response_payload: { data: { errors: ['El NIT del cliente no es válido'] } },
  created_at: '2026-11-01T15:00:00Z',
  updated_at: '2026-11-01T15:05:00Z',
  invoice: { id: 'fv-1', number: 'FV-1043', total: 1190000, customer: { company_name: 'Cliente Ejemplo' } },
};

beforeEach(() => {
  permisos = ['finance.view', 'finance.create', 'finance.void'];
  esAdmin = false;
  consultas = [];
  responder = () => ({ data: [], count: 0 });
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/factus/jobs (caracterización + filtros de la bandeja)', () => {
  test('como antes: organización de la sesión, status, limit/offset, data y total', async () => {
    responder = (c) => (c.tabla === 'electronic_invoicing_jobs' ? { data: [JOB_CRUDO], count: 1 } : { data: [] });
    const r = await call(jobs.GET, req('GET', '/api/factus/jobs?status=rejected&limit=20&offset=40'));
    expect(r.status).toBe(200);
    const q = consultas.find((c) => c.tabla === 'electronic_invoicing_jobs')!;
    expect(tiene(q, 'eq', 'organization_id', ORG)).toBe(true);
    expect(tiene(q, 'eq', 'status', 'rejected')).toBe(true);
    expect(tiene(q, 'range', 40, 59)).toBe(true);
    expect(r.json).toMatchObject({ success: true, total: 1, limit: 20, offset: 40 });
    expect((r.json.data as unknown[]).length).toBe(1);
  });

  test('`filas` normalizadas, sin JSON del proveedor', async () => {
    responder = (c) => (c.tabla === 'electronic_invoicing_jobs' ? { data: [JOB_CRUDO], count: 1 } : { data: [] });
    const r = await call(jobs.GET, req('GET', '/api/factus/jobs?vista=atender&pagina=1&tamano=25'));
    const filas = r.json.filas as Array<Record<string, unknown>>;
    expect(filas[0]).toMatchObject({ numero: 'FV-1043', tercero: 'Cliente Ejemplo', estadoCola: 'rejected', mensajesDian: ['El NIT del cliente no es válido'] });
    expect(JSON.stringify(filas)).not.toMatch(/secreto|request_payload|response_payload/);
    const q = consultas.find((c) => c.tabla === 'electronic_invoicing_jobs')!;
    expect(tiene(q, 'or', 'and(status.eq.pending,hold_reason.not.is.null),status.in.(rejected,failed)')).toBe(true);
  });

  test('estado retenido, tipo y periodo en el día de la organización', async () => {
    await call(jobs.GET, req('GET', '/api/factus/jobs?estado=retenido&tipo=credit_note&desde=2026-11-01&hasta=2026-11-07'));
    const q = consultas.find((c) => c.tabla === 'electronic_invoicing_jobs')!;
    expect(tiene(q, 'eq', 'status', 'pending')).toBe(true);
    expect(tiene(q, 'not', 'hold_reason', 'is', null)).toBe(true);
    expect(tiene(q, 'eq', 'document_type', 'credit_note')).toBe(true);
    // Bogotá UTC−5: el día 1 empieza a las 05:00 UTC; el 7 termina a las 05:00 UTC del 8.
    expect(tiene(q, 'gte', 'created_at', '2026-11-01T05:00:00.000Z')).toBe(true);
    expect(tiene(q, 'lt', 'created_at', '2026-11-08T05:00:00.000Z')).toBe(true);
  });

  test('búsqueda y sucursal se resuelven a documentos de la organización; sin coincidencias, vacío sin consultar la cola', async () => {
    const r = await call(jobs.GET, req('GET', '/api/factus/jobs?q=FV-1043&sucursal=7'));
    expect(r.json).toMatchObject({ total: 0, filas: [] });
    const facturas = consultas.find((c) => c.tabla === 'invoice_sales')!;
    expect(tiene(facturas, 'eq', 'organization_id', ORG)).toBe(true);
    expect(tiene(facturas, 'eq', 'branch_id', 7)).toBe(true);
    expect(consultas.some((c) => c.tabla === 'electronic_invoicing_jobs')).toBe(false);
  });

  test('organización ajena en la query → 403; sin finance.view → 403', async () => {
    expect((await call(jobs.GET, req('GET', `/api/factus/jobs?organizationId=${OTRA}`))).status).toBe(403);
    permisos = [];
    expect((await call(jobs.GET, req('GET', '/api/factus/jobs'))).status).toBe(403);
  });
});

describe('GET /api/factus/jobs/resumen', () => {
  test('KPIs contados en la base y estado del servicio sin credenciales', async () => {
    responder = (c) => {
      if (c.tabla === 'electronic_invoicing_config') return { data: [{ service_status: 'active', activated_at: '2026-10-12T00:00:00Z', credentials_secret_id: 'x' }] };
      if (tiene(c, 'not', 'hold_reason', 'is', null) && tiene(c, 'eq', 'status', 'pending')) return { count: 3 };
      if (tiene(c, 'eq', 'status', 'accepted')) return { count: 10 };
      return { count: 0 };
    };
    const r = await call(resumen.GET, req('GET', '/api/factus/jobs/resumen'));
    expect(r.status).toBe(200);
    expect(r.json.servicio).toEqual({ estado: 'active', activoDesde: '2026-10-12T00:00:00Z' });
    expect(r.json.conteos).toMatchObject({ retenidos: 3, aceptadosMes: 10, aceptados: 10 });
    expect(JSON.stringify(r.json)).not.toMatch(/credentials|secret/);
    const conteos = consultas.filter((c) => c.tabla === 'electronic_invoicing_jobs');
    expect(conteos.length).toBeGreaterThan(0);
    expect(conteos.every((c) => tiene(c, 'eq', 'organization_id', ORG))).toBe(true);
  });

  test('sin finance.view → 403', async () => {
    permisos = [];
    expect((await call(resumen.GET, req('GET', '/api/factus/jobs/resumen'))).status).toBe(403);
  });
});

describe('GET /api/factus/jobs/[id]', () => {
  const ID = '0f0f0f0f-1111-4222-8333-444444444444';

  test('envío de otra organización (o inexistente) → 404', async () => {
    responder = () => ({ data: null });
    const r = await call(detalle.GET, req('GET', `/api/factus/jobs/${ID}`), { id: ID });
    expect(r.status).toBe(404);
    const q = consultas.find((c) => c.tabla === 'electronic_invoicing_jobs')!;
    expect(tiene(q, 'eq', 'organization_id', ORG)).toBe(true);
  });

  test('detalles técnicos solo con finance.approve; nunca el JSON', async () => {
    responder = (c) => (c.tabla === 'electronic_invoicing_jobs' ? { data: [{ ...JOB_CRUDO, id: ID }] } : { data: [] });
    const sin = await call(detalle.GET, req('GET', `/api/factus/jobs/${ID}`), { id: ID });
    expect(sin.status).toBe(200);
    expect(sin.json.tecnico).toBeNull();
    permisos = [...permisos, 'finance.approve'];
    const con = await call(detalle.GET, req('GET', `/api/factus/jobs/${ID}`), { id: ID });
    expect(con.json.tecnico).toEqual({ codigo: 'factus_http_422', mensaje: 'proveedor rechazó' });
    expect(JSON.stringify(con.json)).not.toMatch(/secreto|request_payload|response_payload/);
    expect((con.json.pasos as Array<{ tipo: string }>).map((p) => p.tipo)).toEqual(['creado', 'rechazado']);
  });

  test('id que no es uuid → 404 sin consultar', async () => {
    expect((await call(detalle.GET, req('GET', '/api/factus/jobs/x'), { id: 'x' })).status).toBe(404);
    expect(consultas.some((c) => c.tabla === 'electronic_invoicing_jobs')).toBe(false);
  });
});

describe('POST /api/factus/config liberar', () => {
  beforeEach(() => {
    permisos = ['finance.approve'];
  });

  test('uno (caracterización): misma llamada y misma respuesta que antes', async () => {
    cola.procesarAhora.mockResolvedValueOnce({ estado: 'accepted', mensaje: 'ok' });
    const r = await call(config.POST, req('POST', '/api/factus/config', { action: 'liberar', jobId: 'job-9' }));
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, jobId: 'job-9', status: 'accepted', message: 'ok' });
    expect(cola.liberarRetenido).toHaveBeenCalledWith({ jobId: 'job-9', organizationId: ORG, actor: USER });
  });

  test('lote: uno por uno con la organización de la sesión; un fallo no frena los demás', async () => {
    cola.liberarRetenido.mockImplementation(async (p: { jobId: string }) => {
      if (p.jobId === 'b') throw Object.assign(new Error('no'), { code: '55000' });
      return {};
    });
    const r = await call(config.POST, req('POST', '/api/factus/config', { action: 'liberar', jobIds: ['a', 'b', 'c', 'a'] }));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ liberados: 2, fallidos: 1 });
    expect(cola.liberarRetenido.mock.calls.map((c) => c[0])).toEqual([
      { jobId: 'a', organizationId: ORG, actor: USER },
      { jobId: 'b', organizationId: ORG, actor: USER },
      { jobId: 'c', organizationId: ORG, actor: USER },
    ]);
    expect(cola.procesarAhora).toHaveBeenCalledTimes(2);
  });

  test('lote vacío o de más de 50 → 400 sin liberar', async () => {
    expect((await call(config.POST, req('POST', '/api/factus/config', { action: 'liberar', jobIds: [] }))).status).toBe(400);
    const muchos = Array.from({ length: 51 }, (_, i) => `j${i}`);
    expect((await call(config.POST, req('POST', '/api/factus/config', { action: 'liberar', jobIds: muchos }))).status).toBe(400);
    expect(cola.liberarRetenido).not.toHaveBeenCalled();
  });

  test('sin finance.approve ni administrador → 403', async () => {
    permisos = ['finance.view'];
    expect((await call(config.POST, req('POST', '/api/factus/config', { action: 'liberar', jobIds: ['a'] }))).status).toBe(403);
    expect(cola.liberarRetenido).not.toHaveBeenCalled();
  });
});

test('GET /api/factus/config: datos del emisor que faltan, sin credenciales', async () => {
  responder = (c) => {
    if (c.tabla === 'organizations') return { data: [{ nit: '901456789', dv: 3, legal_name: 'Mi empresa', fiscal_responsibilities: [], municipality_id: null, email: 'fe@x.co' }] };
    if (c.tabla === 'electronic_invoicing_config') return { data: [{ service_status: 'pending_activation', environment: 'production', credentials_secret_id: 'secreto-vault' }] };
    return { data: [] };
  };
  const r = await call(config.GET, req('GET', '/api/factus/config'));
  expect(r.status).toBe(200);
  expect(r.json.emisor).toMatchObject({ faltan: ['responsabilidades', 'municipio'], nit: '901456789' });
  expect(JSON.stringify(r.json)).not.toMatch(/secreto-vault/);
});

describe('/api/factus/rangos', () => {
  const CUERPO = {
    id: 5,
    documentType: 'invoice',
    prefix: 'fv',
    rangeStart: 1,
    rangeEnd: 5000,
    currentNumber: 10,
    resolutionNumber: '18764',
    resolutionDate: '',
    validFrom: '2026-01-01',
    validUntil: '2028-01-01',
    testSetId: '',
    factusNumberingRangeId: null,
    isActive: true,
    alertThreshold: 100,
  };

  test('GET no envía la clave técnica', async () => {
    responder = (c) => (c.tabla === 'invoice_sequences' ? { data: [{ id: 5, technical_key: 'clave-secreta', prefix: 'FV' }] } : { data: [] });
    const r = await call(rangos.GET, req('GET', '/api/factus/rangos'));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).not.toMatch(/clave-secreta|technical_key/);
    expect((r.json.rangos as Array<Record<string, unknown>>)[0].tieneClaveTecnica).toBe(true);
  });

  test('POST sin finance.approve → 403 y no escribe', async () => {
    const r = await call(rangos.POST, req('POST', '/api/factus/rangos', CUERPO));
    expect(r.status).toBe(403);
    expect(consultas.some((c) => c.ops.some((o) => o[0] === 'update'))).toBe(false);
  });

  test('POST de un rango de otra organización → 404', async () => {
    permisos = ['finance.approve'];
    responder = () => ({ data: null });
    expect((await call(rangos.POST, req('POST', '/api/factus/rangos', CUERPO))).status).toBe(404);
  });

  test('POST edita solo en la organización, no mueve la sucursal ni toca la clave técnica si no se envían', async () => {
    permisos = ['finance.approve'];
    responder = (c) => (c.tabla === 'invoice_sequences' ? { data: [{ id: 5, prefix: 'FV' }] } : { data: [] });
    const r = await call(rangos.POST, req('POST', '/api/factus/rangos', CUERPO));
    expect(r.status).toBe(200);
    const upd = consultas.find((c) => c.ops.some((o) => o[0] === 'update'))!;
    const cambios = upd.ops.find((o) => o[0] === 'update')![1] as Record<string, unknown>;
    expect(cambios).toMatchObject({ prefix: 'fv', range_end: 5000, current_number: 10, resolution_date: null });
    expect(cambios).not.toHaveProperty('branch_id');
    expect(cambios).not.toHaveProperty('technical_key');
    expect(tiene(upd, 'eq', 'organization_id', ORG)).toBe(true);
  });

  test('POST con datos fuera de rango → 400', async () => {
    permisos = ['finance.approve'];
    responder = (c) => (c.tabla === 'invoice_sequences' ? { data: [{ id: 5 }] } : { data: [] });
    expect((await call(rangos.POST, req('POST', '/api/factus/rangos', { ...CUERPO, currentNumber: 9000 }))).status).toBe(400);
  });
});
