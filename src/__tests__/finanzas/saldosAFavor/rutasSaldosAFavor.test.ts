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

import { POST as aplicar } from '@/app/api/saldos-a-favor/[id]/aplicar/route';

const peticion = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const params = { params: Promise.resolve({ id: SALDO }) };

beforeEach(() => {
  guion.permisos = new Set(['finance.view', 'finance.create', 'finance.void']);
  guion.errorRpc = null;
  guion.datos = {
    fn_apply_customer_credit: { aplicacion_id: 'a1', repetida: false, monto: 100, saldo_disponible: 900, saldo_factura: 0 },
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
