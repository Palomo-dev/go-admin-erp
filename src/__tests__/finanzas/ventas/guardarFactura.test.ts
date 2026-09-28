/**
 * Guardar el borrador de una factura de venta en una transacción (plan §2 L11,
 * L12, L19; P1.4, P8).
 *
 * - Ruta: la organización sale de la sesión (la RPC recibe `p_org` de ahí),
 *   permiso `finance.create` en el servidor, organización ajena en el cuerpo
 *   → 403, número repetido → 409.
 * - Formulario: ya no escribe `sales`, `sale_items`, `invoice_sales`,
 *   `invoice_items`, `invoice_applied_taxes` ni `commissions` desde el navegador.
 * - SQL 20260924104430: la venta ligada y sus líneas solo en el alta; la edición
 *   no rehace sale_items ni comisión (ya contabilizados); ningún saldo a mano;
 *   los seriales se venden al emitir con la función compartida.
 */
import * as fs from 'fs';
import * as path from 'path';

const FACTURA = '11111111-2222-4333-8444-555555555555';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string },
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    return { data: { id: FACTURA, numero: 'FACT-0100', sale_id: 's-1', total: 2880, faltantes: [] }, error: null };
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const ctx = { userId: 'u-1', organizationId: 120, roleId: 4, isSuperAdmin: false };
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

import { POST } from '@/app/api/facturas-venta/route';
import { PUT } from '@/app/api/facturas-venta/[id]/route';
import { guardarFacturaSchema } from '@/lib/finanzas/ventas/contratoFacturas';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const datos = {
  branch_id: 7,
  number: 'FACT-0100',
  tax_included: false,
  items: [{ product_id: 3, description: 'Producto', qty: 2, unit_price: 1000, tax_rate: 19, total_line: 2380, serial_ids: [5] }],
};
const peticion = (metodo: string, url: string, body: unknown) =>
  new Request(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  guion.permisos = new Set(['finance.create']);
  guion.errorRpc = null;
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('esquema del borrador', () => {
  test('exige sucursal y al menos una línea; descarta totales enviados por el navegador', () => {
    expect(guardarFacturaSchema.safeParse(datos).success).toBe(true);
    expect(guardarFacturaSchema.safeParse({ ...datos, items: [] }).success).toBe(false);
    expect(guardarFacturaSchema.safeParse({ ...datos, branch_id: undefined }).success).toBe(false);
    const r = guardarFacturaSchema.parse({ ...datos, total: 1, balance: 0 });
    expect('total' in r || 'balance' in r).toBe(false);
  });
});

describe('POST /api/facturas-venta y PUT /api/facturas-venta/[id]', () => {
  test('alta: la RPC recibe la organización de la sesión, sin id', async () => {
    const r = await POST(peticion('POST', 'http://x/api/facturas-venta', datos), { params: Promise.resolve({}) });
    expect(r.status).toBe(201);
    expect(rpcs[0].nombre).toBe('fn_factura_venta_guardar');
    expect(rpcs[0].args).toMatchObject({ p_org: 120, p_invoice_id: null });
    expect((await r.json()).resultado).toMatchObject({ id: FACTURA, saleId: 's-1', total: 2880 });
  });

  test('edición: mismo contrato con el id de la ruta', async () => {
    const r = await PUT(peticion('PUT', `http://x/api/facturas-venta/${FACTURA}`, datos), { params: Promise.resolve({ id: FACTURA }) });
    expect(r.status).toBe(200);
    expect(rpcs[0].args).toMatchObject({ p_org: 120, p_invoice_id: FACTURA });
  });

  test('sin permiso → 403; organización ajena en el cuerpo → 403; número repetido → 409', async () => {
    guion.permisos = new Set(['finance.view']);
    expect((await POST(peticion('POST', 'http://x/api/facturas-venta', datos), { params: Promise.resolve({}) })).status).toBe(403);
    guion.permisos = new Set(['finance.create']);
    expect((await POST(peticion('POST', 'http://x/api/facturas-venta', { ...datos, organization_id: 9 }), { params: Promise.resolve({}) })).status).toBe(403);
    expect(rpcs).toHaveLength(0);
    guion.errorRpc = { message: 'numero_duplicado' };
    expect((await POST(peticion('POST', 'http://x/api/facturas-venta', datos), { params: Promise.resolve({}) })).status).toBe(409);
  });
});

describe('el formulario ya no escribe desde el navegador (L12)', () => {
  const archivos = [
    'src/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx',
    'src/components/finanzas/facturas-venta/editar/EditarFacturaVenta.tsx',
  ];
  test.each(archivos)('%s', (rel) => {
    const codigo = leer(rel).replace(/\s+/g, ' ');
    for (const tabla of ['sales', 'sale_items', 'invoice_sales', 'invoice_items', 'invoice_applied_taxes', 'commissions']) {
      expect(codigo).not.toMatch(new RegExp(`from\\('${tabla}'\\) ?\\.(insert|update|upsert|delete)\\(`));
    }
    expect(codigo).toMatch(/guardarFacturaVenta\(/);
  });
});

describe('SQL 20260924104430', () => {
  const sql = leer('supabase/migrations/20260924104430_factura_venta_guardar_y_seriales_al_emitir.sql');
  const guardar = sql.slice(sql.indexOf('create or replace function public.fn_factura_venta_guardar'), sql.indexOf('create or replace function public.fn_factura_venta_emitir'));

  test('permiso y organización; sin saldos a mano; número único', () => {
    expect(guardar).toMatch(/fn_finanzas_exigir_permiso\(p_org, array\['finance\.create'\]\)/);
    expect(guardar).not.toMatch(/update public\.invoice_sales set[^;]*balance/i);
    expect(guardar).not.toMatch(/accounts_receivable/);
    expect(guardar).toMatch(/numero_duplicado/);
  });

  test('sale_items y comisión solo en el alta', () => {
    expect(guardar).toMatch(/if p_invoice_id is null then\s+insert into public\.sale_items/);
    expect(guardar).toMatch(/if p_invoice_id is null and v_tipo_com <> 'none'/);
    expect(guardar).not.toMatch(/delete from public\.(sale_items|commissions)/);
  });

  test('los seriales se venden al emitir con la función compartida', () => {
    const emitir = sql.slice(sql.indexOf('create or replace function public.fn_factura_venta_emitir'));
    expect(emitir).toMatch(/public\.fn_seriales_vender\(/);
    expect(sql).toMatch(/revoke all on function public\.fn_seriales_vender\([^)]*\) from public, anon, authenticated;/);
  });
});
