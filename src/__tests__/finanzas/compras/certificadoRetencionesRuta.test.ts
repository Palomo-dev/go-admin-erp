/**
 * POST /api/proveedores/[id]/certificado-retenciones (reglas duras 5 y 6):
 * - la organización sale de la sesión: `p_organization_id` = la de la sesión;
 *   una ajena en el body o en la query → 403 sin llamar a la RPC;
 * - `finance.view` resuelto en el servidor → 403 sin RPC;
 * - proveedor de otra organización o id inválido → 404 sin RPC;
 * - periodo mal formado o al revés → 400;
 * - los errores de la RPC salen con su estado (sin permiso 403, ajeno 404, periodo 400).
 */

const ORG = 120;

const guion = {
  permisos: new Set<string>(),
  deLaOrg: true,
  errorRpc: null as null | { code: string; message: string },
  respuesta: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', numero: 'CR-2026-0012', reexpedido: false } as Record<string, unknown>,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];
const lecturas: { tabla: string; filtros: Array<[string, unknown]> }[] = [];

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    return { data: guion.respuesta, error: null };
  },
  from: (tabla: string) => {
    const registro = { tabla, filtros: [] as Array<[string, unknown]> };
    lecturas.push(registro);
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        registro.filtros.push([col, v]);
        return q;
      },
      maybeSingle: async () => ({ data: guion.deLaOrg ? { id: 5 } : null, error: null }),
    };
    return q;
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  const ctx = { userId: 'u-1', organizationId: 120, roleId: 4, isSuperAdmin: false, supabase: null as unknown };
  return {
    OrgContextError,
    readOrgBody,
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

import { POST as expedir } from '@/app/api/proveedores/[id]/certificado-retenciones/route';

const URL_BASE = 'http://x/api/proveedores/5/certificado-retenciones';
const post = (body: unknown, url = URL_BASE) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const periodo = { desde: '2026-01-01', hasta: '2026-09-30' };

beforeEach(() => {
  guion.permisos = new Set(['finance.view']);
  guion.deLaOrg = true;
  guion.errorRpc = null;
  guion.respuesta = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', numero: 'CR-2026-0012', reexpedido: false };
  rpcs.length = 0;
  lecturas.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/proveedores/[id]/certificado-retenciones', () => {
  test('expide con la organización de la sesión y devuelve el número de la serie CR', async () => {
    const r = await expedir(post({ ...periodo, sucursalId: 3 }), params('5'));
    expect(r.status).toBe(201);
    expect((await r.json()).certificado).toEqual({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', numero: 'CR-2026-0012', reexpedido: false });
    expect(rpcs).toEqual([
      {
        nombre: 'fn_certificado_retenciones_expedir',
        args: { p_organization_id: ORG, p_supplier_id: 5, p_desde: '2026-01-01', p_hasta: '2026-09-30', p_branch_id: 3 },
      },
    ]);
    // El proveedor se comprueba con el filtro por la organización de la sesión.
    expect(lecturas[0]).toEqual({ tabla: 'suppliers', filtros: [['id', 5], ['organization_id', ORG]] });
  });

  test('reexpedido (mismo periodo y valores) → 200 con el mismo número', async () => {
    guion.respuesta = { ...guion.respuesta, reexpedido: true };
    const r = await expedir(post(periodo), params('5'));
    expect(r.status).toBe(200);
    expect(rpcs[0].args.p_branch_id).toBeNull();
  });

  test('organización ajena en el body o en la query → 403 sin RPC; la propia se acepta', async () => {
    expect((await expedir(post({ ...periodo, organization_id: 999 }), params('5'))).status).toBe(403);
    expect((await expedir(post({ ...periodo, organizationId: 999 }), params('5'))).status).toBe(403);
    expect((await expedir(post(periodo, `${URL_BASE}?organization_id=999`), params('5'))).status).toBe(403);
    expect(rpcs).toHaveLength(0);
    expect((await expedir(post({ ...periodo, organization_id: ORG }), params('5'))).status).toBe(201);
    expect(rpcs[0].args.p_organization_id).toBe(ORG);
  });

  test('sin finance.view → 403 sin RPC', async () => {
    guion.permisos.clear();
    const r = await expedir(post(periodo), params('5'));
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
    expect(rpcs).toHaveLength(0);
  });

  test('proveedor de otra organización o id inválido → 404 sin RPC', async () => {
    guion.deLaOrg = false;
    expect((await expedir(post(periodo), params('5'))).status).toBe(404);
    guion.deLaOrg = true;
    expect((await expedir(post(periodo), params('abc'))).status).toBe(404);
    expect((await expedir(post(periodo), params('5x'))).status).toBe(404);
    expect((await expedir(post(periodo), params('0'))).status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });

  test('periodo mal formado, al revés o campos de más → 400', async () => {
    expect((await expedir(post({ desde: '01/01/2026', hasta: '2026-09-30' }), params('5'))).status).toBe(400);
    expect((await expedir(post({ desde: '2026-09-30', hasta: '2026-01-01' }), params('5'))).status).toBe(400);
    expect((await expedir(post({ ...periodo, sucursalId: -1 }), params('5'))).status).toBe(400);
    expect((await expedir(post({ ...periodo, numero: 'CR-2026-0001' }), params('5'))).status).toBe(400);
    expect(rpcs).toHaveLength(0);
  });

  test('errores de la RPC con su estado: permiso 403, proveedor o sucursal ajenos 404, periodo 400', async () => {
    guion.errorRpc = { code: '42501', message: 'sin_permiso' };
    expect((await expedir(post(periodo), params('5'))).status).toBe(403);
    guion.errorRpc = { code: 'P0002', message: 'SUCURSAL_NO_ENCONTRADA' };
    expect((await expedir(post({ ...periodo, sucursalId: 77 }), params('5'))).status).toBe(404);
    guion.errorRpc = { code: '22023', message: 'PERIODO_INVALIDO' };
    expect((await expedir(post(periodo), params('5'))).status).toBe(400);
    guion.errorRpc = { code: 'XX000', message: 'algo' };
    expect((await expedir(post(periodo), params('5'))).status).toBe(500);
  });
});
