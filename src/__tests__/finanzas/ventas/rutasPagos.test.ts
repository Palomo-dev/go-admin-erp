/**
 * Pago único — route handlers (plan §2 L19, reglas duras 5 y 6).
 *
 * - La organización sale de la sesión: una organización ajena en el body o en
 *   la query es 403 sin tocar la base, y la RPC recibe la de la sesión.
 * - El permiso se resuelve en el servidor según el origen (`finance.create`, o
 *   `pos.create` en la cartera del POS); sin él, 403 `sin_permiso`.
 * - Los errores de la RPC salen con `codigo` estable y su estado HTTP.
 */

const ORG = 120;
const PAGO = '11111111-2222-4333-8444-555555555555';
const CUENTA = '22222222-3333-4444-8555-666666666666';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string; details?: string },
  pagoDeLaOrg: true,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    if (nombre === 'fn_registrar_pago') {
      return { data: { grupo_id: 'g1', recibo: 'RC-000001', repetida: false, total_aplicado: 100, anticipo: 0, cambio: 0, credito_id: null, caja_id: null, pagos: [] }, error: null };
    }
    if (nombre === 'fn_anular_pago') return { data: { payment_id: PAGO, saldo_nuevo: 100 }, error: null };
    return { data: null, error: { message: 'rpc inesperada' } };
  },
  from: () => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: guion.pagoDeLaOrg ? { id: PAGO } : null, error: null }),
    };
    return q;
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

import { POST as registrar } from '@/app/api/pagos/route';
import { POST as anular } from '@/app/api/pagos/[id]/anular/route';

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  direccion: 'cobro',
  origen: 'cxc',
  aplicaciones: [{ documento: 'account_receivable', id: CUENTA, monto: 100 }],
  metodo: 'transfer',
  moneda: 'COP',
  fecha: '2026-09-24',
  referencia: 'TR-1',
  clave_idempotencia: 'pago:prueba-0001',
  ...extra,
});

const peticion = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const params = { params: Promise.resolve({ id: PAGO }) };

beforeEach(() => {
  guion.permisos = new Set(['finance.create', 'finance.void']);
  guion.errorRpc = null;
  guion.pagoDeLaOrg = true;
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/pagos', () => {
  test('registra con la organización de la sesión y devuelve el recibo', async () => {
    const r = await registrar(peticion('http://x/api/pagos', cuerpo()), params);
    expect(r.status).toBe(201);
    expect((await r.json()).resultado.recibo).toBe('RC-000001');
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].nombre).toBe('fn_registrar_pago');
    expect(rpcs[0].args.p_organization_id).toBe(ORG);
    expect(rpcs[0].args.p_origen).toBe('cxc');
  });

  test('organización ajena en el body o en la query → 403 sin llamar a la RPC', async () => {
    const r1 = await registrar(peticion('http://x/api/pagos', cuerpo({ organization_id: 999 })), params);
    expect(r1.status).toBe(403);
    const r2 = await registrar(peticion('http://x/api/pagos?organization_id=999', cuerpo()), params);
    expect(r2.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('la misma organización en el body no molesta', async () => {
    const r = await registrar(peticion('http://x/api/pagos', cuerpo({ organization_id: ORG })), params);
    expect(r.status).toBe(201);
  });

  test('cuerpo inválido → 400 datos_invalidos', async () => {
    const r = await registrar(peticion('http://x/api/pagos', cuerpo({ aplicaciones: [] })), params);
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe('datos_invalidos');
    const r2 = await registrar(peticion('http://x/api/pagos', cuerpo({ direccion: 'pago' })), params);
    expect(r2.status).toBe(400);
    expect(rpcs).toHaveLength(0);
  });

  test('sin permiso → 403 sin_permiso; en el POS basta pos.create', async () => {
    guion.permisos = new Set(['pos.create']);
    const r = await registrar(peticion('http://x/api/pagos', cuerpo()), params);
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
    const r2 = await registrar(peticion('http://x/api/pagos', cuerpo({ origen: 'pos_cxc' })), params);
    expect(r2.status).toBe(201);
  });

  test('errores de la RPC con código y estado', async () => {
    guion.errorRpc = { message: 'sin_caja_abierta' };
    const r = await registrar(peticion('http://x/api/pagos', cuerpo({ metodo: 'cash' })), params);
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('sin_caja_abierta');

    guion.errorRpc = { message: 'monto_excede_saldo', details: '{"saldo":50}' };
    const r2 = await registrar(peticion('http://x/api/pagos', cuerpo()), params);
    expect(r2.status).toBe(422);
    expect(await r2.json()).toMatchObject({ codigo: 'monto_excede_saldo', detalle: { saldo: 50 } });

    guion.errorRpc = { message: 'relation "x" does not exist' };
    const r3 = await registrar(peticion('http://x/api/pagos', cuerpo()), params);
    expect(r3.status).toBe(500);
    expect((await r3.json()).codigo).toBe('error_desconocido');
  });
});

describe('POST /api/pagos/[id]/anular', () => {
  test('anula con motivo y permiso', async () => {
    const r = await anular(peticion(`http://x/api/pagos/${PAGO}/anular`, { motivo: 'Cheque devuelto' }), params);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_anular_pago', args: { p_payment_id: PAGO, p_motivo: 'Cheque devuelto' } });
  });

  test('sin motivo → 400; sin permiso → 403; de otra organización → 404', async () => {
    expect((await anular(peticion(`http://x/api/pagos/${PAGO}/anular`, {}), params)).status).toBe(400);
    guion.permisos = new Set();
    expect((await anular(peticion(`http://x/api/pagos/${PAGO}/anular`, { motivo: 'error de digitación' }), params)).status).toBe(403);
    guion.permisos = new Set(['finance.void']);
    guion.pagoDeLaOrg = false;
    expect((await anular(peticion(`http://x/api/pagos/${PAGO}/anular`, { motivo: 'error de digitación' }), params)).status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });

  test('pago en caja cerrada → 409', async () => {
    guion.errorRpc = { message: 'pago_en_caja_cerrada' };
    const r = await anular(peticion(`http://x/api/pagos/${PAGO}/anular`, { motivo: 'error de digitación' }), params);
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('pago_en_caja_cerrada');
  });
});
