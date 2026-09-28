/**
 * Saldos a favor — route handlers (reglas duras 5 y 6).
 *
 * - La organización sale de la sesión: una organización ajena en el body o en
 *   la query es 403 sin tocar la base, y la RPC recibe la de la sesión.
 * - El permiso se resuelve en el servidor; sin él, 403 `sin_permiso` sin RPC.
 * - Los errores de la RPC salen con `codigo` estable y su estado HTTP.
 */

const ORG = 120;
const SALDO = '11111111-2222-4333-8444-555555555555';
const FACTURA = '22222222-3333-4444-8555-666666666666';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string; details?: string },
  datos: {} as Record<string, unknown>,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    if (nombre in guion.datos) return { data: guion.datos[nombre], error: null };
    return { data: null, error: { message: 'rpc inesperada' } };
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const ctx = { userId: 'u-1', organizationId: 120, roleId: 4, isSuperAdmin: false, supabase: null as unknown };
  return {
    OrgContextError,
    hasOrgAdminOrPermission: jest.fn(async (_c: unknown, code: string) => guion.permisos.has(code)),
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        try {
          return await handler({ ...ctx, supabase: supabaseFalso }, req, params);
        } catch (err) {
          if (err instanceof OrgContextError) {
            const e = err as { message: string; code: string; statusCode: number };
            return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
          }
          throw err;
        }
      },
  };
});

const contextoPagoFalso = jest.fn(async (_ctx: unknown, entrada: { branchId?: number | null }) => ({
  direccion: 'cobro',
  tercero: null,
  documentos: [],
  metodos: [{ code: 'cash', name: 'Efectivo', requires_reference: false }],
  cuentasBancarias: [],
  caja: { abierta: entrada.branchId === 7, id: entrada.branchId === 7 ? 3 : null },
  hoy: '2026-09-28',
  branch_id: entrada.branchId ?? null,
}));
jest.mock('@/lib/services/pagos/pagos.server', () => {
  class ErrorPagoServidor extends Error {}
  return { ErrorPagoServidor, contextoPago: (c: unknown, e: { branchId?: number | null }) => contextoPagoFalso(c, e) };
});

import { POST as aplicar } from '@/app/api/saldos-a-favor/[id]/aplicar/route';
import { POST as crear } from '@/app/api/saldos-a-favor/route';
import { GET as contexto } from '@/app/api/saldos-a-favor/contexto/route';
import { POST as anular } from '@/app/api/saldos-a-favor/[id]/anular/route';
import { POST as devolver } from '@/app/api/saldos-a-favor/[id]/devolver/route';

const peticion = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const params = { params: Promise.resolve({ id: SALDO }) };

beforeEach(() => {
  guion.permisos = new Set(['finance.view', 'finance.create', 'finance.void']);
  guion.errorRpc = null;
  guion.datos = {
    fn_apply_customer_credit: { aplicacion_id: 'a1', repetida: false, monto: 100, saldo_disponible: 900, saldo_factura: 0 },
    fn_saldo_favor_anular: { payment_id: 'p1', credito_id: SALDO, contra_asiento: 9 },
    fn_saldo_favor_devolver: { payment_id: 'p2', repetida: false, monto: 50, saldo_disponible: 450 },
    fn_saldo_favor_crear: { credito_id: 'c1', grupo_id: 'g1', recibo: 'RC-000009', repetida: false, caja_id: 3, monto: 500 },
  };
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/saldos-a-favor/[id]/aplicar', () => {
  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    factura_id: FACTURA,
    monto: 100,
    clave_idempotencia: 'aplicar:prueba-0001',
    ...extra,
  });
  const url = `http://x/api/saldos-a-favor/${SALDO}/aplicar`;

  test('aplica con la organización de la sesión; el autor lo pone la base', async () => {
    const r = await aplicar(peticion(url, cuerpo()), params);
    expect(r.status).toBe(201);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].nombre).toBe('fn_apply_customer_credit');
    expect(rpcs[0].args).toEqual({
      p_credit_id: SALDO,
      p_invoice_id: FACTURA,
      p_amount: 100,
      p_clave_idempotencia: 'aplicar:prueba-0001',
      p_organization_id: ORG,
    });
    expect(rpcs[0].args).not.toHaveProperty('p_created_by');
  });

  test('la misma clave devuelve 200 (repetida)', async () => {
    guion.datos.fn_apply_customer_credit = { aplicacion_id: 'a1', repetida: true, monto: 100, saldo_disponible: 900, saldo_factura: 0 };
    const r = await aplicar(peticion(url, cuerpo()), params);
    expect(r.status).toBe(200);
  });

  test('organización ajena en el body o en la query → 403 sin llamar a la RPC', async () => {
    const r1 = await aplicar(peticion(url, cuerpo({ organization_id: 999 })), params);
    expect(r1.status).toBe(403);
    const r2 = await aplicar(peticion(`${url}?organization_id=999`, cuerpo()), params);
    expect(r2.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('sin finance.create → 403 sin_permiso sin llamar a la RPC', async () => {
    guion.permisos = new Set(['finance.view']);
    const r = await aplicar(peticion(url, cuerpo()), params);
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
    expect(rpcs).toHaveLength(0);
  });

  test('cuerpo inválido o id inválido → 400 / 404', async () => {
    const r1 = await aplicar(peticion(url, cuerpo({ monto: -1 })), params);
    expect(r1.status).toBe(400);
    const r2 = await aplicar(peticion(url, cuerpo({ created_by: 'otro' })), params);
    expect(r2.status).toBe(400);
    const r3 = await aplicar(peticion(url, cuerpo()), { params: Promise.resolve({ id: 'x' }) });
    expect(r3.status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });

  test.each([
    ['saldo_vencido', 409],
    ['cliente_distinto', 422],
    ['sin_permiso', 403],
    ['saldo_no_encontrado', 404],
    ['monto_excede_saldo_a_favor', 422],
    ['documento_borrador', 409],
    ['asiento_no_creado', 500],
  ])('error %s de la RPC → %i con su código', async (codigo, estado) => {
    guion.errorRpc = { message: codigo };
    const r = await aplicar(peticion(url, cuerpo()), params);
    expect(r.status).toBe(estado);
    expect((await r.json()).codigo).toBe(codigo);
  });

  test('un mensaje desconocido sale como error_desconocido 500 (sin filtrar el texto)', async () => {
    guion.errorRpc = { message: 'relation "x" does not exist' };
    const r = await aplicar(peticion(url, cuerpo()), params);
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.codigo).toBe('error_desconocido');
    expect(JSON.stringify(j)).not.toMatch(/relation/);
  });
});

describe('POST /api/saldos-a-favor (anticipo)', () => {
  const CLIENTE = '33333333-4444-4555-8666-777777777777';
  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    cliente_id: CLIENTE,
    sucursal_id: 7,
    monto: 500,
    metodo: 'cash',
    clave_idempotencia: 'anticipo:prueba-0001',
    ...extra,
  });
  const url = 'http://x/api/saldos-a-favor';

  test('crea con la organización de la sesión, sin cuenta PUC ni autor del cliente', async () => {
    const r = await crear(peticion(url, cuerpo({ vence: '2026-10-28', notas: 'abono' })), params);
    expect(r.status).toBe(201);
    expect((await r.json()).resultado.recibo).toBe('RC-000009');
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].nombre).toBe('fn_saldo_favor_crear');
    expect(rpcs[0].args).toMatchObject({
      p_customer: CLIENTE,
      p_branch: 7,
      p_monto: 500,
      p_metodo: 'cash',
      p_organization_id: ORG,
      p_vence: '2026-10-28',
    });
    expect(rpcs[0].args).not.toHaveProperty('p_cash_account');
    expect(rpcs[0].args).not.toHaveProperty('p_created_by');
  });

  test('una cuenta PUC o un autor en el body → 400 (el esquema es estricto)', async () => {
    const r1 = await crear(peticion(url, cuerpo({ cash_account: '1105' })), params);
    expect(r1.status).toBe(400);
    const r2 = await crear(peticion(url, cuerpo({ created_by: 'u-2' })), params);
    expect(r2.status).toBe(400);
    expect(rpcs).toHaveLength(0);
  });

  test('organización ajena → 403; sin finance.create → 403 sin RPC', async () => {
    const r1 = await crear(peticion(url, cuerpo({ organizationId: 999 })), params);
    expect(r1.status).toBe(403);
    guion.permisos = new Set(['finance.view']);
    const r2 = await crear(peticion(url, cuerpo()), params);
    expect(r2.status).toBe(403);
    expect((await r2.json()).codigo).toBe('sin_permiso');
    expect(rpcs).toHaveLength(0);
  });

  test('efectivo sin caja abierta → 409 sin_caja_abierta', async () => {
    guion.errorRpc = { message: 'sin_caja_abierta' };
    const r = await crear(peticion(url, cuerpo()), params);
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('sin_caja_abierta');
  });

  test('Acceso denegado de la base (organización ajena) sale como sin_permiso 403', async () => {
    guion.errorRpc = { message: 'Acceso denegado a la organización' };
    const r = await crear(peticion(url, cuerpo()), params);
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
  });
});

describe('GET /api/saldos-a-favor/contexto', () => {
  test('métodos y caja de la sucursal pedida, con finance.view', async () => {
    const r = await contexto(new Request('http://x/api/saldos-a-favor/contexto?sucursal=7'), params);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.caja).toEqual({ abierta: true, id: 3 });
    expect(j.metodos[0].code).toBe('cash');
    expect(contextoPagoFalso).toHaveBeenLastCalledWith(expect.anything(), { direccion: 'cobro', branchId: 7 });
  });

  test('sin finance.view → 403; sucursal mal formada → 400', async () => {
    const r1 = await contexto(new Request('http://x/api/saldos-a-favor/contexto?sucursal=x'), params);
    expect(r1.status).toBe(400);
    guion.permisos = new Set();
    const r2 = await contexto(new Request('http://x/api/saldos-a-favor/contexto?sucursal=7'), params);
    expect(r2.status).toBe(403);
  });
});

describe('POST /api/saldos-a-favor/[id]/anular', () => {
  const url = `http://x/api/saldos-a-favor/${SALDO}/anular`;

  test('anula con la organización de la sesión y finance.void', async () => {
    const r = await anular(peticion(url, { motivo: 'cliente desistió' }), params);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_saldo_favor_anular',
      args: { p_credit_id: SALDO, p_motivo: 'cliente desistió', p_organization_id: ORG },
    });
  });

  test('sin motivo → motivo_obligatorio; sin finance.void → 403; organización ajena → 403', async () => {
    const r1 = await anular(peticion(url, { motivo: 'x' }), params);
    expect((await r1.json()).codigo).toBe('motivo_obligatorio');
    guion.permisos = new Set(['finance.create']);
    const r2 = await anular(peticion(url, { motivo: 'cliente desistió' }), params);
    expect(r2.status).toBe(403);
    guion.permisos = new Set(['finance.void']);
    const r3 = await anular(peticion(url, { motivo: 'cliente desistió', org_id: 999 }), params);
    expect(r3.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('saldo usado → 409 saldo_usado; sin pago de origen → 409 saldo_no_anulable', async () => {
    guion.errorRpc = { message: 'saldo_usado' };
    const r1 = await anular(peticion(url, { motivo: 'cliente desistió' }), params);
    expect(r1.status).toBe(409);
    expect((await r1.json()).codigo).toBe('saldo_usado');
    guion.errorRpc = { message: 'saldo_no_anulable' };
    const r2 = await anular(peticion(url, { motivo: 'cliente desistió' }), params);
    expect(r2.status).toBe(409);
  });
});

describe('POST /api/saldos-a-favor/[id]/devolver', () => {
  const url = `http://x/api/saldos-a-favor/${SALDO}/devolver`;
  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    monto: 50,
    metodo: 'cash',
    motivo: 'devolución al cliente',
    clave_idempotencia: 'devolver:prueba-0001',
    ...extra,
  });

  test('devuelve con la organización de la sesión y finance.void', async () => {
    const r = await devolver(peticion(url, cuerpo()), params);
    expect(r.status).toBe(201);
    expect(rpcs[0].nombre).toBe('fn_saldo_favor_devolver');
    expect(rpcs[0].args).toMatchObject({ p_credit_id: SALDO, p_monto: 50, p_metodo: 'cash', p_organization_id: ORG });
  });

  test('sin finance.void → 403 sin RPC; efectivo sin caja → 409', async () => {
    guion.permisos = new Set(['finance.create']);
    const r1 = await devolver(peticion(url, cuerpo()), params);
    expect(r1.status).toBe(403);
    expect(rpcs).toHaveLength(0);
    guion.permisos = new Set(['finance.void']);
    guion.errorRpc = { message: 'sin_caja_abierta' };
    const r2 = await devolver(peticion(url, cuerpo()), params);
    expect(r2.status).toBe(409);
  });
});
