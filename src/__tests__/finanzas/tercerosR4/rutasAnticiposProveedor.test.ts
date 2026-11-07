/**
 * Anticipos a proveedores — route handlers (reglas duras 5 y 6) y estado
 * «pendiente de activar».
 *
 * - La organización sale de la sesión: una ajena en el body o en la query es 403
 *   sin tocar la base, y la RPC recibe la de la sesión.
 * - El permiso se resuelve en el servidor (crear y aplicar: finance.create;
 *   devolver y anular: finance.void); sin él, 403 sin RPC.
 * - Mientras la migración no esté aplicada (PGRST202/PGRST205/42P01), las
 *   escrituras responden 501 `pendiente_de_activar` y el listado `pendiente: true`,
 *   nunca un listado vacío que parezca cero.
 */

const ORG = 120;
const ANTICIPO = '11111111-2222-4333-8444-555555555555';
const CUENTA = '22222222-3333-4444-8555-666666666666';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string; code?: string; details?: string },
  errorTabla: null as null | { message: string; code?: string },
  datos: {} as Record<string, unknown>,
  filas: [] as unknown[],
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

/** Consulta encadenable de PostgREST: devuelve las filas del guion. */
function consulta() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'gt', 'not']) q[m] = () => q;
  q.then = (ok: (v: unknown) => unknown) =>
    ok(guion.errorTabla ? { data: null, error: guion.errorTabla } : { data: guion.filas, error: null });
  return q;
}

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    if (nombre in guion.datos) return { data: guion.datos[nombre], error: null };
    return { data: null, error: { message: 'rpc inesperada' } };
  },
  from: () => consulta(),
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

jest.mock('@/lib/services/pagos/pagos.server', () => {
  class ErrorPagoServidor extends Error {}
  return {
    ErrorPagoServidor,
    contextoPago: async () => ({
      direccion: 'cobro',
      tercero: null,
      documentos: [],
      metodos: [{ code: 'cash', name: 'Efectivo', requires_reference: false }],
      cuentasBancarias: [],
      caja: { abierta: true, id: 3 },
      hoy: '2026-11-07',
      branch_id: 7,
    }),
  };
});

import { GET as listar, POST as crear } from '@/app/api/anticipos-proveedor/route';
import { GET as contexto } from '@/app/api/anticipos-proveedor/contexto/route';
import { POST as aplicar } from '@/app/api/anticipos-proveedor/[id]/aplicar/route';
import { POST as devolver } from '@/app/api/anticipos-proveedor/[id]/devolver/route';
import { POST as anular } from '@/app/api/anticipos-proveedor/[id]/anular/route';

const peticion = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: ANTICIPO }) };

beforeEach(() => {
  guion.permisos = new Set(['finance.view', 'finance.create', 'finance.void']);
  guion.errorRpc = null;
  guion.errorTabla = null;
  guion.filas = [];
  guion.datos = {
    fn_anticipo_proveedor_crear: { anticipo_id: ANTICIPO, grupo_id: 'g1', recibo: 'CE-000004', repetida: false, caja_id: 3, monto: 500 },
    fn_anticipo_proveedor_aplicar: { aplicacion_id: 'a1', repetida: false, monto: 100 },
    fn_anticipo_proveedor_devolver: { payment_id: 'p1', repetida: false, monto: 50 },
    fn_anticipo_proveedor_anular: { anticipo_id: ANTICIPO },
    fn_cuenta_anticipo_proveedor: '1330',
  };
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/anticipos-proveedor', () => {
  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    proveedor_id: 45,
    sucursal_id: 7,
    monto: 500,
    metodo: 'transfer',
    referencia: 'TR-1',
    clave_idempotencia: 'anticipo:prueba-0001',
    ...extra,
  });

  test('registra con la organización de la sesión, el método de la organización y nunca una cuenta PUC', async () => {
    const r = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo()), { params: Promise.resolve({}) });
    expect(r.status).toBe(201);
    expect(rpcs).toEqual([
      {
        nombre: 'fn_anticipo_proveedor_crear',
        args: {
          p_supplier: 45,
          p_branch: 7,
          p_monto: 500,
          p_metodo: 'transfer',
          p_clave_idempotencia: 'anticipo:prueba-0001',
          p_organization_id: ORG,
          p_cuenta_bancaria: null,
          p_referencia: 'TR-1',
          p_notas: null,
        },
      },
    ]);
    // Una cuenta contable en el cuerpo no pasa la validación (zod estricto).
    const r2 = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo({ cuenta: '1330' })), { params: Promise.resolve({}) });
    expect(r2.status).toBe(400);
  });

  test('organización ajena en el body → 403 sin RPC', async () => {
    const r = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo({ organization_id: 999 })), { params: Promise.resolve({}) });
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('sin finance.create → 403 sin_permiso sin RPC', async () => {
    guion.permisos = new Set(['finance.view']);
    const r = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo()), { params: Promise.resolve({}) });
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
    expect(rpcs).toHaveLength(0);
  });

  test('migración sin aplicar → 501 pendiente_de_activar', async () => {
    guion.errorRpc = { code: 'PGRST202', message: 'Could not find the function public.fn_anticipo_proveedor_crear' };
    const r = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo()), { params: Promise.resolve({}) });
    expect(r.status).toBe(501);
    expect((await r.json()).codigo).toBe('pendiente_de_activar');
  });

  test('errores de la RPC con código estable', async () => {
    guion.errorRpc = { message: 'sin_caja_abierta' };
    const r = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo({ metodo: 'cash' })), { params: Promise.resolve({}) });
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('sin_caja_abierta');
  });
});

describe('GET /api/anticipos-proveedor', () => {
  test('sin la tabla responde pendiente (nunca un listado vacío)', async () => {
    guion.errorTabla = { code: 'PGRST205', message: "Could not find the table 'public.supplier_advances' in the schema cache" };
    const r = await listar(new Request('http://x/api/anticipos-proveedor'), undefined as never);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ pendiente: true, filas: [], cuenta: null });
  });

  test('con datos: saldo, aplicado y devuelto por anticipo, y la cuenta resuelta en la base', async () => {
    guion.filas = [
      { id: ANTICIPO, supplier_id: 45, amount: '1000', balance: '600', status: 'active', created_at: '2026-11-02T10:00:00Z', branch_id: 7, notes: null, account_code: '1330', suppliers: { name: 'Proveedor uno', nit: '900' }, payment_groups: { receipt_number: 'CE-1' } },
    ];
    // La segunda lectura (aplicaciones) devuelve las mismas filas falsas: se ignoran las que no traen advance_id.
    const r = await listar(new Request('http://x/api/anticipos-proveedor'), undefined as never);
    const cuerpo = await r.json();
    expect(cuerpo.pendiente).toBe(false);
    expect(cuerpo.cuenta).toBe('1330');
    expect(cuerpo.filas[0]).toMatchObject({ id: ANTICIPO, proveedor: 'Proveedor uno', valor: 1000, saldo: 600, estado: 'disponible', recibo: 'CE-1' });
  });

  test('sin finance.view → 403', async () => {
    guion.permisos = new Set();
    const r = await listar(new Request('http://x/api/anticipos-proveedor'), undefined as never);
    expect(r.status).toBe(403);
  });
});

describe('aplicar, devolver y anular', () => {
  const url = (accion: string) => `http://x/api/anticipos-proveedor/${ANTICIPO}/${accion}`;

  test('aplicar va a fn_anticipo_proveedor_aplicar con la cuenta por pagar y la organización de la sesión', async () => {
    const r = await aplicar(peticion(url('aplicar'), { cuenta_id: CUENTA, monto: 100, clave_idempotencia: 'aplicar:prueba-01' }), params);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_anticipo_proveedor_aplicar',
      args: { p_anticipo: ANTICIPO, p_cuenta_por_pagar: CUENTA, p_monto: 100, p_clave_idempotencia: 'aplicar:prueba-01', p_organization_id: ORG },
    });
  });

  test('devolver y anular exigen finance.void', async () => {
    guion.permisos = new Set(['finance.view', 'finance.create']);
    const r1 = await devolver(peticion(url('devolver'), { monto: 50, metodo: 'cash', motivo: 'Devuelve', clave_idempotencia: 'devolver:prueba1' }), params);
    expect(r1.status).toBe(403);
    const r2 = await anular(peticion(url('anular'), { motivo: 'Error de registro' }), params);
    expect(r2.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('anular con aplicaciones → 409 anticipo_usado', async () => {
    guion.errorRpc = { message: 'anticipo_usado' };
    const r = await anular(peticion(url('anular'), { motivo: 'Error de registro' }), params);
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('anticipo_usado');
  });

  test('id inválido → 404 sin RPC', async () => {
    const r = await aplicar(peticion(url('aplicar'), { cuenta_id: CUENTA, monto: 1, clave_idempotencia: 'aplicar:prueba-01' }), { params: Promise.resolve({ id: 'x' }) });
    expect(r.status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });
});

describe('GET /api/anticipos-proveedor/contexto', () => {
  test('métodos y caja de la lectura compartida; con proveedor, sus cuentas por pagar abiertas sin borradores', async () => {
    guion.filas = [
      { id: CUENTA, amount: 800, balance: 500, status: 'pending', created_at: '2026-11-01', invoice_id: 'f1', invoice_purchase: { number_ext: 'FC-10', status: 'received', issue_date: '2026-11-01', total: 800 } },
      { id: 'b', amount: 100, balance: 100, status: 'pending', created_at: '2026-11-01', invoice_id: 'f2', invoice_purchase: { number_ext: 'FC-11', status: 'draft', issue_date: null, total: 100 } },
    ];
    const r = await contexto(new Request('http://x/api/anticipos-proveedor/contexto?sucursal=7&proveedor=45'), undefined as never);
    const c = await r.json();
    expect(c.metodos).toEqual([{ code: 'cash', name: 'Efectivo', requires_reference: false }]);
    expect(c.facturas).toEqual([{ id: CUENTA, number: 'FC-10', total: 800, balance: 500, issue_date: '2026-11-01' }]);
  });

  test('proveedor no numérico → 400', async () => {
    const r = await contexto(new Request('http://x/api/anticipos-proveedor/contexto?proveedor=abc'), undefined as never);
    expect(r.status).toBe(400);
  });
});
