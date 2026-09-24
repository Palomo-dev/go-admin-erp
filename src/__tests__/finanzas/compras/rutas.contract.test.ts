/**
 * Rutas de facturas de compra y CxP (plan F2; reglas duras 5 y 6).
 *
 * - La organización sale de la sesión: una ajena en el body o la query es 403
 *   sin llamar a ninguna RPC; guardar pasa `p_org` = la de la sesión.
 * - Cada acción exige su permiso en el servidor (finance.create, + inventory.create
 *   para recepcionar, finance.void para anular, finance.approve para decidir).
 * - Un recurso que no es de la organización es 404 (no se distingue de «no existe»).
 * - Los errores de la RPC salen con `codigo` estable y su estado HTTP.
 */

const ORG = 120;
const FACTURA = '11111111-2222-4333-8444-555555555555';
const CUENTA = '22222222-3333-4444-8555-666666666666';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string },
  deLaOrg: true,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    if (nombre === 'fn_factura_compra_guardar') return { data: { id: FACTURA, number_ext: 'FE-1', status: 'draft' }, error: null };
    if (nombre === 'fn_factura_compra_confirmar') return { data: { invoice_id: FACTURA, accounts_payable_id: CUENTA }, error: null };
    if (nombre === 'fn_aprobar_pago_programado') return { data: { payment_id: 'p1', recibo: 'RC-000001', aviso: null }, error: null };
    return { data: null, error: null };
  },
  from: () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: guion.deLaOrg ? { id: FACTURA } : null, error: null }),
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

import { POST as guardar } from '@/app/api/facturas-compra/route';
import { POST as confirmar } from '@/app/api/facturas-compra/[id]/confirmar/route';
import { POST as recepcionar } from '@/app/api/facturas-compra/[id]/recepcionar/route';
import { POST as anular } from '@/app/api/facturas-compra/[id]/anular/route';
import { DELETE as eliminar } from '@/app/api/facturas-compra/[id]/route';
import { POST as programar } from '@/app/api/cuentas-por-pagar/[id]/programaciones/route';
import { POST as aprobar } from '@/app/api/programaciones-pago/[id]/aprobar/route';
import { POST as rechazar } from '@/app/api/programaciones-pago/[id]/rechazar/route';
import { GET as estadoCuenta } from '@/app/api/proveedores/[id]/estado-cuenta/route';

const factura = (extra: Record<string, unknown> = {}) => ({
  branch_id: 2,
  supplier_id: 3,
  number_ext: 'FE-1',
  issue_date: '2026-09-24',
  lines: [{ product_id: 9, qty: 2, unit_price: 50000, tax_rate: 19 }],
  withholdings: [{ concept: 'Retefuente', base: 100000, rate: 2.5 }],
  ...extra,
});

const post = (url: string, body: unknown, method = 'POST') =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  guion.permisos = new Set(['finance.view', 'finance.create', 'finance.void', 'finance.approve', 'inventory.create']);
  guion.errorRpc = null;
  guion.deLaOrg = true;
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/facturas-compra', () => {
  test('guarda con la organización de la sesión', async () => {
    const r = await guardar(post('http://x/api/facturas-compra', factura()), params(''));
    expect(r.status).toBe(201);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].nombre).toBe('fn_factura_compra_guardar');
    expect(rpcs[0].args.p_org).toBe(ORG);
    expect((rpcs[0].args.p_payload as { withholdings: unknown[] }).withholdings).toHaveLength(1);
  });

  test('organización ajena en el body o la query → 403 sin RPC', async () => {
    expect((await guardar(post('http://x/api/facturas-compra', factura({ organization_id: 999 })), params(''))).status).toBe(403);
    expect((await guardar(post('http://x/api/facturas-compra?organization_id=999', factura()), params(''))).status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('sin finance.create → 403', async () => {
    guion.permisos.delete('finance.create');
    const r = await guardar(post('http://x/api/facturas-compra', factura()), params(''));
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('datos inválidos → 400 con los campos', async () => {
    const r = await guardar(post('http://x/api/facturas-compra', factura({ lines: [] })), params(''));
    expect(r.status).toBe(400);
    expect((await r.json()).campos).toContain('lines');
  });

  test('número repetido → 409 numero_duplicado', async () => {
    guion.errorRpc = { message: 'DUPLICATE_INVOICE:FE-1' };
    const r = await guardar(post('http://x/api/facturas-compra', factura()), params(''));
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('numero_duplicado');
  });

  test('editar una factura de otra organización → 404', async () => {
    guion.deLaOrg = false;
    const r = await guardar(post('http://x/api/facturas-compra', factura({ id: FACTURA })), params(''));
    expect(r.status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });
});

describe('acciones de la factura', () => {
  test('confirmar recepcionando exige también inventory.create', async () => {
    guion.permisos.delete('inventory.create');
    const r1 = await confirmar(post('http://x', { recepcionar: true }), params(FACTURA));
    expect(r1.status).toBe(403);
    const r2 = await confirmar(post('http://x', { recepcionar: false }), params(FACTURA));
    expect(r2.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_factura_compra_confirmar', args: { p_id: FACTURA, p_recepcionar: false, p_generar_ds: false } });
  });

  test('recepcionar exige finance.create e inventory.create', async () => {
    guion.permisos.delete('finance.create');
    expect((await recepcionar(post('http://x', {}), params(FACTURA))).status).toBe(403);
  });

  test('anular exige finance.void y motivo; con pagos → 409 tiene_pagos', async () => {
    expect((await anular(post('http://x', { motivo: '' }), params(FACTURA))).status).toBe(400);
    guion.errorRpc = { message: 'No se puede anular: la factura tiene pagos registrados' };
    const r = await anular(post('http://x', { motivo: 'Devolución total' }), params(FACTURA));
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('tiene_pagos');
    guion.permisos.delete('finance.void');
    expect((await anular(post('http://x', { motivo: 'Devolución total' }), params(FACTURA))).status).toBe(403);
  });

  test('id mal formado → 404', async () => {
    expect((await eliminar(post('http://x', {}, 'DELETE'), params('no-es-uuid'))).status).toBe(404);
  });
});

describe('CxP: programar y decidir', () => {
  test('programar con finance.create; aprobar exige finance.approve', async () => {
    const r = await programar(post('http://x', { amount: 1000, scheduled_date: '2026-10-01', reference: 'TR-9' }), params(CUENTA));
    expect(r.status).toBe(201);
    expect(rpcs[0].nombre).toBe('fn_programar_pago');
    expect(rpcs[0].args.p_reference).toBe('TR-9');
    guion.permisos.delete('finance.approve');
    expect((await aprobar(post('http://x', { comentario: 'ok' }), params(CUENTA))).status).toBe(403);
  });

  test('quien programó no aprueba → 403 segregacion_funciones', async () => {
    guion.errorRpc = { message: 'SEGREGACION_FUNCIONES' };
    const r = await aprobar(post('http://x', { comentario: 'ok' }), params(CUENTA));
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('segregacion_funciones');
  });

  test('rechazar pide motivo', async () => {
    expect((await rechazar(post('http://x', { comentario: '' }), params(CUENTA))).status).toBe(400);
  });
});

describe('estado de cuenta del proveedor', () => {
  test('finance.view y proveedor de la organización', async () => {
    const r = await estadoCuenta(new Request('http://x/api/proveedores/3/estado-cuenta?desde=2026-01-01'), params('3'));
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_estado_cuenta_proveedor', args: { p_org: ORG, p_supplier: 3, p_desde: '2026-01-01', p_hasta: null } });
    guion.deLaOrg = false;
    expect((await estadoCuenta(new Request('http://x/api/proveedores/3/estado-cuenta'), params('3'))).status).toBe(404);
    expect((await estadoCuenta(new Request('http://x/api/proveedores/3x/estado-cuenta'), params('3x'))).status).toBe(404);
  });
});
