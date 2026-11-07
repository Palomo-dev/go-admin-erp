/**
 * Saldos a favor — `GET /api/saldos-a-favor/listado` y `GET /api/saldos-a-favor/[id]`
 * (reglas duras 5 y 6).
 *
 * - Organización de la sesión: otra en la query → 403 sin tocar la base; la RPC
 *   y cada lectura van filtradas por la organización de la sesión.
 * - Permiso `finance.view` en el servidor; sin él, 403 sin RPC.
 * - La base decide permiso, sucursal y vencido (`fn_list_customer_credits`): un
 *   saldo que la RPC no devuelve es 404, aunque exista.
 * - El documento de origen y los movimientos se completan con lecturas de la
 *   sesión (sin cliente de servicio).
 */

const ORG = 120;
const SALDO = '11111111-2222-4333-8444-555555555555';
const SALDO_NC = '22222222-2222-4333-8444-555555555555';
const CLIENTE = '33333333-2222-4333-8444-555555555555';

const guion = {
  permisos: new Set<string>(['finance.view']),
  rpc: [] as unknown[],
  errorRpc: null as null | { message: string },
  tablas: {} as Record<string, unknown[]>,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];
const lecturas: { tabla: string; filtros: [string, string, unknown][] }[] = [];

/** Constructor de consultas mínimo: registra filtros y aplica `eq`/`in` sobre las filas del guion. */
function consulta(tabla: string) {
  const filtros: [string, string, unknown][] = [];
  lecturas.push({ tabla, filtros });
  const filas = () =>
    (guion.tablas[tabla] ?? []).filter((f) =>
      filtros.every(([op, col, v]) => {
        const valor = (f as Record<string, unknown>)[col];
        if (op === 'eq') return valor === undefined || valor === v;
        if (op === 'in') return (v as unknown[]).includes(valor);
        return true;
      }),
    );
  const q: Record<string, unknown> = {};
  for (const op of ['eq', 'in', 'gte', 'lt', 'gt']) {
    q[op] = (col: string, v: unknown) => {
      filtros.push([op, col, v]);
      return q;
    };
  }
  q.select = () => q;
  q.order = () => q;
  q.limit = () => q;
  q.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null });
  q.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: filas(), error: null }).then(ok);
  return q;
}

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    return { data: guion.rpc, error: null };
  },
  from: (tabla: string) => consulta(tabla),
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
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/services/pagos/pagos.server', () => ({ ErrorPagoServidor: class extends Error {}, contextoPago: jest.fn() }));

import { GET as listado } from '@/app/api/saldos-a-favor/listado/route';
import { GET as detalle } from '@/app/api/saldos-a-favor/[id]/route';

const conId = (id: string) => ({ params: Promise.resolve({ id }) });
const sinParams = { params: Promise.resolve({}) };

const filaRpc = (p: Record<string, unknown>) => ({
  id: SALDO,
  customer_id: CLIENTE,
  customer_name: 'Cliente Uno',
  amount: '500.00',
  balance: '120.00',
  used: '380.00',
  status: 'active',
  notes: null,
  expiry_date: null,
  created_at: '2026-09-12T15:00:00Z',
  branch_id: 7,
  origen: 'pago',
  anulable: false,
  ...p,
});

beforeEach(() => {
  guion.permisos = new Set(['finance.view']);
  guion.errorRpc = null;
  guion.rpc = [
    filaRpc({}),
    filaRpc({ id: SALDO_NC, amount: '1190.00', balance: '1190.00', used: '0', origen: 'nota_credito', created_at: '2026-09-20T15:00:00Z' }),
  ];
  guion.tablas = {
    payments: [
      { id: 'pago-1', source: 'customer_credit', source_id: SALDO, receipt_number: null, method: 'cash', amount: 500, reference: null, status: 'completed', created_at: '2026-09-12T15:00:00Z', void_reason: null, voided_at: null, payment_groups: { receipt_number: 'RC-000031' } },
      { id: 'dev-1', source: 'customer_credit_refund', source_id: SALDO, method: 'cash', amount: -50, reference: 'Devolución', status: 'completed', created_at: '2026-09-25T15:00:00Z' },
    ],
    credit_notes: [{ id: SALDO_NC, source_credit_note_id: 'nc-1' }],
    invoice_sales: [{ id: 'nc-1', number: 'NC-0005' }],
    returns: [],
    customers: [{ id: CLIENTE, identification_number: '43567890' }],
    credit_note_applications: [
      { id: 'apl-1', credit_note_id: SALDO, invoice_id: 'fv-1050', amount: 330, created_at: '2026-09-15T15:00:00Z', invoice: { number: 'FV-1050' } },
    ],
    branches: [{ id: 7, name: 'Sucursal Principal' }],
  };
  rpcs.length = 0;
  lecturas.length = 0;
});

describe('GET /api/saldos-a-favor/listado', () => {
  test('pagina en el servidor, completa el origen y calcula KPI con la organización de la sesión', async () => {
    const r = await listado(new Request('http://x/api/saldos-a-favor/listado?sucursal=7&kpi_desde=2026-09-01&kpi_hasta=2026-09-30&tamano=1'), sinParams);
    expect(r.status).toBe(200);
    expect(rpcs).toEqual([{ nombre: 'fn_list_customer_credits', args: { p_org: ORG, p_branch: 7 } }]);
    const j = await r.json();
    expect(j.total).toBe(2);
    expect(j.filas).toHaveLength(1);
    // Fecha descendente: primero el saldo de la nota crédito, con su número.
    expect(j.filas[0]).toMatchObject({ id: SALDO_NC, origen: 'nota_credito', origenNumero: 'NC-0005', origenId: 'nc-1', disponible: 1190, estado: 'disponible' });
    expect(j.kpis).toMatchObject({ disponible: 1310, clientesConSaldo: 1, aplicado: 330, facturasAplicadas: 1, devuelto: 50, devoluciones: 1, devolucionesEfectivo: 1 });
    // Toda lectura filtra por la organización de la sesión.
    for (const l of lecturas) expect(l.filtros).toContainEqual(['eq', 'organization_id', ORG]);
  });

  test('busca por el número del recibo y filtra por origen', async () => {
    const r = await listado(new Request('http://x/api/saldos-a-favor/listado?q=rc-000031'), sinParams);
    const j = await r.json();
    expect(j.filas.map((f: { id: string }) => f.id)).toEqual([SALDO]);
    expect(j.filas[0]).toMatchObject({ origenNumero: 'RC-000031', origenId: 'pago-1', clienteDoc: '43567890' });
    const r2 = await listado(new Request('http://x/api/saldos-a-favor/listado?origen=nota_credito'), sinParams);
    expect((await r2.json()).total).toBe(1);
  });

  test('sin finance.view → 403 sin RPC; organización ajena → 403; consulta inválida → 400', async () => {
    guion.permisos = new Set();
    const r1 = await listado(new Request('http://x/api/saldos-a-favor/listado'), sinParams);
    expect(r1.status).toBe(403);
    expect(rpcs).toHaveLength(0);
    guion.permisos = new Set(['finance.view']);
    const r2 = await listado(new Request('http://x/api/saldos-a-favor/listado?organization_id=999'), sinParams);
    expect(r2.status).toBe(403);
    const r3 = await listado(new Request('http://x/api/saldos-a-favor/listado?cliente=no-es-uuid'), sinParams);
    expect(r3.status).toBe(400);
    expect((await r3.json()).codigo).toBe('datos_invalidos');
    expect(rpcs).toHaveLength(0);
  });

  test('error de la base → su código y estado (no un listado vacío)', async () => {
    guion.errorRpc = { message: 'sin_permiso' };
    const r = await listado(new Request('http://x/api/saldos-a-favor/listado'), sinParams);
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
  });
});

describe('GET /api/saldos-a-favor/[id]', () => {
  test('detalle con origen, aplicaciones y devoluciones en orden', async () => {
    const r = await detalle(new Request(`http://x/api/saldos-a-favor/${SALDO}`), conId(SALDO));
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_list_customer_credits', args: { p_org: ORG, p_branch: null } });
    const j = await r.json();
    expect(j.sucursal).toBe('Sucursal Principal');
    expect(j.saldo).toMatchObject({ id: SALDO, origenNumero: 'RC-000031', disponible: 120, usado: 380 });
    expect(j.movimientos.map((m: { tipo: string }) => m.tipo)).toEqual(['origen', 'aplicacion', 'devolucion']);
    expect(j.movimientos[1]).toMatchObject({ numero: 'FV-1050', documentoId: 'fv-1050', monto: 330 });
    expect(j.movimientos[2]).toMatchObject({ monto: 50, metodo: 'cash' });
    for (const l of lecturas) expect(l.filtros).toContainEqual(['eq', 'organization_id', ORG]);
  });

  test('un saldo que la RPC no devuelve (otra sucursal u organización) → 404', async () => {
    const otro = '99999999-2222-4333-8444-555555555555';
    const r = await detalle(new Request(`http://x/api/saldos-a-favor/${otro}`), conId(otro));
    expect(r.status).toBe(404);
    expect((await r.json()).codigo).toBe('saldo_no_encontrado');
  });

  test('id inválido → 404 sin RPC; sin permiso → 403 sin RPC', async () => {
    const r1 = await detalle(new Request('http://x/api/saldos-a-favor/abc'), conId('abc'));
    expect(r1.status).toBe(404);
    guion.permisos = new Set();
    const r2 = await detalle(new Request(`http://x/api/saldos-a-favor/${SALDO}`), conId(SALDO));
    expect(r2.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });
});
