/**
 * Anticipos a proveedores — route handlers (reglas duras 5 y 6) y estado
 * «pendiente de activar».
 *
 * - La organización sale de la sesión: una ajena en el body o en la query es 403
 *   sin tocar la base, y la RPC recibe la de la sesión.
 * - El permiso se resuelve en el servidor (crear y aplicar: finance.create;
 *   devolver y anular: finance.void); sin él, 403 sin RPC.
 * - Correcciones del Contador (20261108170000): crear exige la naturaleza (P1) y
 *   va a fn_anticipo_proveedor_registrar; la vista previa de retenciones no
 *   escribe; anular exige declarar que el desembolso no ocurrió, con soporte (P7);
 *   devolver exige soporte; la conciliación es de solo lectura (P6).
 * - Ronda 2: aplicar con retención repetida solo con corrección documentada (motivo
 *   y soporte → fn_anticipo_proveedor_aplicar_corrigiendo); devolver con las
 *   retenciones identificadas por impuesto (la de ICA con su norma) o null; vincular a
 *   una factura en borrador; resolver pendientes y aprobar la equivalencia de la cuenta
 *   exigen finance.approve.
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
  q.maybeSingle = async () => (guion.errorTabla ? { data: null, error: guion.errorTabla } : { data: guion.filas[0] ?? null, error: null });
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
import { POST as retenciones } from '@/app/api/anticipos-proveedor/retenciones/route';
import { GET as conciliacion } from '@/app/api/anticipos-proveedor/conciliacion/route';
import { GET as vinculables, POST as vincular } from '@/app/api/anticipos-proveedor/[id]/vincular/route';
import { POST as resolver } from '@/app/api/anticipos-proveedor/pendientes/[pendienteId]/resolver/route';
import { POST as equivalencia } from '@/app/api/anticipos-proveedor/cuenta/equivalencia/route';
import { POST as exceso } from '@/app/api/anticipos-proveedor/[id]/retencion-exceso/route';

const peticion = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: ANTICIPO }) };

beforeEach(() => {
  guion.permisos = new Set(['finance.view', 'finance.create', 'finance.void']);
  guion.errorRpc = null;
  guion.errorTabla = null;
  guion.filas = [];
  guion.datos = {
    fn_anticipo_proveedor_registrar: { anticipo_id: ANTICIPO, grupo_id: 'g1', recibo: 'CE-000004', repetida: false, caja_id: 3, monto: 500, girado: 500, retencion: 0 },
    fn_anticipo_proveedor_evaluar_retenciones: {
      naturaleza: 'pago_anticipado_precio', monto: 1190000, base: 1000000, iva: 190000, total: 40000, neto: 1150000, pendiente: true,
      clases: [
        { clase: 'retefuente', estado: 'practicar', motivo: null, concepto: 'Retención 4%', tarifa: 4, base: 1000000, valor: 40000, cuenta: '23652501' },
        { clase: 'reteiva', estado: 'no_aplica', motivo: 'organizacion_no_agente_reteiva', valor: 99 },
        { clase: 'reteica', estado: 'pendiente', motivo: 'norma_municipal_sin_confirmar' },
      ],
      opciones: { retefuente: [{ id: 'r4', nombre: 'Retención 4%', tarifa: 4 }], reteica: [] },
    },
    fn_anticipos_proveedor_conciliacion: {
      anticipos: [{ anticipo_id: ANTICIPO, proveedor: 'Proveedor uno', nit: '900', cuenta: '13300501', valor: 1000, aplicado: 400, devuelto: 0, anulado: 0, saldo: 600, saldo_libros: 600, cuadra: true }],
      proveedores: [{ proveedor: 'Proveedor uno', nit: '900', anticipos: 1, saldo: 600, saldo_libros: 600, auxiliar_nit: 600 }],
    },
    fn_anticipo_proveedor_aplicar: { aplicacion_id: 'a1', repetida: false, monto: 100 },
    fn_anticipo_proveedor_aplicar_corrigiendo: { aplicacion_id: 'a2', repetida: false, monto: 100, retencion_descontada: 4 },
    fn_anticipo_proveedor_devolver: { payment_id: 'p1', repetida: false, monto: 50 },
    fn_anticipo_proveedor_vincular_factura: { vinculo_id: 'v1', monto: 100, retencion: [] },
    fn_anticipo_pendiente_resolver: { id: CUENTA, estado: 'resuelto' },
    fn_anticipo_cuenta_equivalencia_aprobar: { id: 'e1', cuenta: '13309501' },
    fn_anticipo_proveedor_anular_por_error: { anticipo_id: ANTICIPO },
    fn_cuenta_anticipo_proveedor_estado: { estado: 'ok', cuenta: '13300501', configurada: '13300501', sugerida: '13300501' },
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
    naturaleza: 'financiacion',
    ...extra,
  });

  test('registra con la organización de la sesión, el método de la organización y nunca una cuenta PUC', async () => {
    const r = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo()), { params: Promise.resolve({}) });
    expect(r.status).toBe(201);
    expect(rpcs).toEqual([
      {
        nombre: 'fn_anticipo_proveedor_registrar',
        args: {
          p_supplier: 45,
          p_branch: 7,
          p_monto: 500,
          p_metodo: 'transfer',
          p_naturaleza: 'financiacion',
          p_clave_idempotencia: 'anticipo:prueba-0001',
          p_organization_id: ORG,
          p_tarifa_iva: null,
          p_retefuente: null,
          p_reteica: null,
          p_cuenta_bancaria: null,
          p_referencia: 'TR-1',
          p_notas: null,
          p_componentes: null,
          p_ica_territorial: null,
        },
      },
    ]);
    // Una cuenta contable en el cuerpo no pasa la validación (zod estricto).
    const r2 = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo({ cuenta: '1330' })), { params: Promise.resolve({}) });
    expect(r2.status).toBe(400);
  });

  test('P1: sin naturaleza (no hay valor por defecto) → 422 sin RPC; pago anticipado sin tarifa de IVA → 422', async () => {
    const sin = cuerpo();
    delete (sin as Record<string, unknown>).naturaleza;
    const r = await crear(peticion('http://x/api/anticipos-proveedor', sin), { params: Promise.resolve({}) });
    expect(r.status).toBe(422);
    expect((await r.json()).codigo).toBe('naturaleza_obligatoria');
    const r2 = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo({ naturaleza: 'pago_anticipado_precio' })), { params: Promise.resolve({}) });
    expect(r2.status).toBe(422);
    expect((await r2.json()).codigo).toBe('tarifa_iva_obligatoria');
    const r3 = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo({ naturaleza: 'otra' })), { params: Promise.resolve({}) });
    expect(r3.status).toBe(422);
    expect(rpcs).toHaveLength(0);
  });

  test('P1: pago anticipado con tarifa y conceptos llega a la RPC; P6: sin cuenta de detalle → 409 pendiente contable', async () => {
    const r = await crear(
      peticion('http://x/api/anticipos-proveedor', cuerpo({ naturaleza: 'pago_anticipado_precio', tarifa_iva: 19, retefuente_id: CUENTA, reteica_id: null })),
      { params: Promise.resolve({}) },
    );
    expect(r.status).toBe(201);
    expect(rpcs[0].args).toMatchObject({ p_naturaleza: 'pago_anticipado_precio', p_tarifa_iva: 19, p_retefuente: CUENTA, p_reteica: null });
    guion.errorRpc = { message: 'cuenta_anticipos_no_configurada', details: '{"estado":"sin_configurar","sugerida":null}' };
    const r2 = await crear(peticion('http://x/api/anticipos-proveedor', cuerpo({ clave_idempotencia: 'anticipo:prueba-0002' })), { params: Promise.resolve({}) });
    expect(r2.status).toBe(409);
    expect((await r2.json()).codigo).toBe('cuenta_anticipos_no_configurada');
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
    guion.errorRpc = { code: 'PGRST202', message: 'Could not find the function public.fn_anticipo_proveedor_registrar' };
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
    expect(await r.json()).toEqual({ pendiente: true, filas: [], cuenta: null, estadoCuenta: null });
  });

  test('con datos: saldo, aplicado y devuelto por anticipo, y la cuenta resuelta en la base', async () => {
    guion.filas = [
      { id: ANTICIPO, supplier_id: 45, amount: '1000', balance: '600', status: 'active', created_at: '2026-11-02T10:00:00Z', branch_id: 7, notes: null, account_code: '1330', suppliers: { name: 'Proveedor uno', nit: '900' }, payment_groups: { receipt_number: 'CE-1' } },
    ];
    // La segunda lectura (aplicaciones) devuelve las mismas filas falsas: se ignoran las que no traen advance_id.
    const r = await listar(new Request('http://x/api/anticipos-proveedor'), undefined as never);
    const cuerpo = await r.json();
    expect(cuerpo.pendiente).toBe(false);
    // P6: la cuenta de detalle configurada, nunca 1330 de respaldo.
    expect(cuerpo.cuenta).toBe('13300501');
    expect(cuerpo.estadoCuenta).toEqual({ estado: 'ok', cuenta: '13300501', configurada: '13300501', sugerida: '13300501', equivalencia: null });
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
    const r1 = await devolver(
      peticion(url('devolver'), { monto: 50, metodo: 'cash', motivo: 'Devuelve', referencia: 'Recibo 12', clave_idempotencia: 'devolver:prueba1' }),
      params,
    );
    expect(r1.status).toBe(403);
    const r2 = await anular(peticion(url('anular'), { declaracion: 'desembolso_no_ocurrio', motivo: 'Error de registro', soporte: 'Extracto 11' }), params);
    expect(r2.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('P7: devolver sin soporte → 422 sin RPC', async () => {
    const r = await devolver(peticion(url('devolver'), { monto: 50, metodo: 'cash', motivo: 'Devuelve', clave_idempotencia: 'devolver:prueba1' }), params);
    expect(r.status).toBe(422);
    expect((await r.json()).codigo).toBe('soporte_obligatorio');
    expect(rpcs).toHaveLength(0);
  });

  test('P7: anular sin declarar que el desembolso no ocurrió, o sin soporte → 409/422 sin RPC', async () => {
    const r = await anular(peticion(url('anular'), { motivo: 'Error de registro' }), params);
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('anulacion_requiere_declaracion');
    const r2 = await anular(peticion(url('anular'), { declaracion: 'desembolso_no_ocurrio', motivo: 'Error de registro' }), params);
    expect(r2.status).toBe(422);
    expect((await r2.json()).codigo).toBe('soporte_obligatorio');
    expect(rpcs).toHaveLength(0);
  });

  test('P7: anular por error va a fn_anticipo_proveedor_anular_por_error con soporte y fecha del ajuste', async () => {
    const r = await anular(
      peticion(url('anular'), { declaracion: 'desembolso_no_ocurrio', motivo: 'Transferencia rechazada', soporte: 'Extracto con el rechazo', fecha_ajuste: '2026-11-05' }),
      params,
    );
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_anticipo_proveedor_anular_por_error',
      args: { p_anticipo: ANTICIPO, p_motivo: 'Transferencia rechazada', p_soporte: 'Extracto con el rechazo', p_fecha_ajuste: '2026-11-05', p_organization_id: ORG },
    });
  });

  test('anular con aplicaciones → 409 anticipo_usado', async () => {
    guion.errorRpc = { message: 'anticipo_usado' };
    const r = await anular(peticion(url('anular'), { declaracion: 'desembolso_no_ocurrio', motivo: 'Error de registro', soporte: 'Extracto 11' }), params);
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

describe('retenciones (P1) y conciliación (P6)', () => {
  test('la vista previa usa la organización de la sesión y devuelve las clases tipadas (pendiente visible, no_aplica en cero)', async () => {
    const r = await retenciones(
      peticion('http://x/api/anticipos-proveedor/retenciones', { proveedor_id: 45, monto: 1190000, naturaleza: 'pago_anticipado_precio', tarifa_iva: 19, retefuente_id: CUENTA }),
      { params: Promise.resolve({}) },
    );
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_anticipo_proveedor_evaluar_retenciones',
      args: {
        p_org: ORG,
        p_supplier: 45,
        p_naturaleza: 'pago_anticipado_precio',
        p_monto: 1190000,
        p_tarifa_iva: 19,
        p_retefuente: CUENTA,
        p_reteica: null,
        p_componentes: null,
        p_ica_territorial: null,
      },
    });
    const { resultado } = await r.json();
    expect(resultado.pendiente).toBe(true);
    expect(resultado.clases.map((c: { estado: string; valor: number }) => [c.estado, c.valor])).toEqual([['practicar', 40000], ['no_aplica', 0], ['pendiente', 0]]);
  });

  test('la vista previa exige finance.create y la naturaleza; organización ajena → 403', async () => {
    guion.permisos = new Set(['finance.view']);
    const r = await retenciones(peticion('http://x/api/anticipos-proveedor/retenciones', { proveedor_id: 45, monto: 10, naturaleza: 'financiacion' }), { params: Promise.resolve({}) });
    expect(r.status).toBe(403);
    guion.permisos = new Set(['finance.view', 'finance.create']);
    const r2 = await retenciones(peticion('http://x/api/anticipos-proveedor/retenciones', { proveedor_id: 45, monto: 10 }), { params: Promise.resolve({}) });
    expect((await r2.json()).codigo).toBe('naturaleza_obligatoria');
    const r3 = await retenciones(
      peticion('http://x/api/anticipos-proveedor/retenciones', { proveedor_id: 45, monto: 10, naturaleza: 'financiacion', organization_id: 999 }),
      { params: Promise.resolve({}) },
    );
    expect(r3.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('conciliación por anticipo y por proveedor con finance.view', async () => {
    const r = await conciliacion(new Request('http://x/api/anticipos-proveedor/conciliacion'), undefined as never);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_anticipos_proveedor_conciliacion', args: { p_org: ORG, p_supplier: null } });
    const c = await r.json();
    expect(c.anticipos[0]).toMatchObject({ anticipoId: ANTICIPO, saldo: 600, saldoLibros: 600, cuadra: true });
    expect(c.proveedores[0]).toMatchObject({ saldo: 600, auxiliarNit: 600 });
    guion.permisos = new Set();
    const r2 = await conciliacion(new Request('http://x/api/anticipos-proveedor/conciliacion'), undefined as never);
    expect(r2.status).toBe(403);
  });
});

describe('ronda 2 del Contador', () => {
  const url = (accion: string) => `http://x/api/anticipos-proveedor/${ANTICIPO}/${accion}`;
  const devolucion = (extra: Record<string, unknown> = {}) => ({
    monto: 55592,
    metodo: 'transfer',
    motivo: 'Devuelve la mitad',
    referencia: 'Consignación 42',
    clave_idempotencia: 'devolver:prueba1',
    ...extra,
  });

  test('ítem 5: retención repetida → 409; con corrección (motivo y soporte) va a aplicar_corrigiendo', async () => {
    guion.errorRpc = { message: 'retencion_duplicada' };
    const r = await aplicar(peticion(url('aplicar'), { cuenta_id: CUENTA, monto: 100, clave_idempotencia: 'aplicar:prueba-01' }), params);
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('retencion_duplicada');
    guion.errorRpc = null;
    rpcs.length = 0;
    const r2 = await aplicar(
      peticion(url('aplicar'), { cuenta_id: CUENTA, monto: 100, clave_idempotencia: 'aplicar:prueba-01', correccion: { motivo: 'Factura retuvo todo', soporte: 'Nota 77' } }),
      params,
    );
    expect(r2.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_anticipo_proveedor_aplicar_corrigiendo',
      args: { p_anticipo: ANTICIPO, p_cuenta_por_pagar: CUENTA, p_monto: 100, p_clave_idempotencia: 'aplicar:prueba-01', p_organization_id: ORG, p_motivo: 'Factura retuvo todo', p_soporte: 'Nota 77' },
    });
  });

  test('ítem 5: la corrección sin soporte → 422 sin RPC', async () => {
    const r = await aplicar(
      peticion(url('aplicar'), { cuenta_id: CUENTA, monto: 100, clave_idempotencia: 'aplicar:prueba-01', correccion: { motivo: 'Factura retuvo todo', soporte: '' } }),
      params,
    );
    expect(r.status).toBe(422);
    expect((await r.json()).codigo).toBe('soporte_obligatorio');
    expect(rpcs).toHaveLength(0);
  });

  test('ronda 3: devolver con procedimiento y causa; sin procedimiento, null (pendiente en la base)', async () => {
    const procedimiento = {
      causa: 'devolucion_parcial',
      soportes: { documento: 'Acuerdo con el proveedor', calculo: 'Cálculo', certificado: 'Certificado corregido', norma_ica: 'Acuerdo municipal' },
      base_devuelta: 50000,
      iva_devuelto: 9500,
      periodo_descuento: '2026-11',
      requiere_correccion: false,
    };
    const r = await devolver(peticion(url('devolver'), devolucion({ procedimiento })), params);
    expect(r.status).toBe(200);
    expect(rpcs[0].args).toMatchObject({ p_monto: 55592, p_procedimiento: procedimiento, p_organization_id: ORG });
    rpcs.length = 0;
    await devolver(peticion(url('devolver'), devolucion({ clave_idempotencia: 'devolver:prueba2' })), params);
    expect(rpcs[0].args.p_procedimiento).toBeNull();
  });

  test('ronda 3: procedimiento sin documento o sin cálculo → 422 sin RPC', async () => {
    const r = await devolver(peticion(url('devolver'), devolucion({ procedimiento: { causa: 'operacion_anulada', soportes: { documento: '' } } })), params);
    expect(r.status).toBe(422);
    expect((await r.json()).codigo).toBe('soporte_procedimiento_obligatorio');
    const r2 = await devolver(peticion(url('devolver'), devolucion({ procedimiento: { causa: 'devolucion_parcial', soportes: { documento: 'Acuerdo 1' } } })), params);
    expect(r2.status).toBe(422);
    expect((await r2.json()).codigo).toBe('calculo_obligatorio');
    expect(rpcs).toHaveLength(0);
  });

  test('ronda 3: retención excesiva va a fn_anticipo_retencion_exceso_reintegrar con finance.void', async () => {
    const cuerpo = {
      clase: 'retefuente', base_correcta: 100000, tarifa_correcta: 2.5, metodo: 'transfer', motivo: 'Tarifa errada',
      soportes: { calculo: 'Cálculo', certificado: 'Certificado corregido' }, periodo_descuento: '2026-11', requiere_correccion: true,
      clave_idempotencia: 'exceso:prueba1',
    };
    guion.datos.fn_anticipo_retencion_exceso_reintegrar = { payment_id: 'p9', reintegro: 1500 };
    const r = await exceso(peticion(url('retencion-exceso'), cuerpo), params);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toMatchObject({ nombre: 'fn_anticipo_retencion_exceso_reintegrar', args: { p_anticipo: ANTICIPO, p_clase: 'retefuente', p_organization_id: ORG } });
    rpcs.length = 0;
    const r2 = await exceso(peticion(url('retencion-exceso'), { ...cuerpo, soportes: { calculo: 'Cálculo', certificado: '' } }), params);
    expect((await r2.json()).codigo).toBe('soporte_procedimiento_obligatorio');
    guion.permisos = new Set(['finance.view', 'finance.create']);
    const r3 = await exceso(peticion(url('retencion-exceso'), cuerpo), params);
    expect(r3.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  test('ítem 5: vincular a una factura en borrador (finance.create) y listar las vinculables (finance.view)', async () => {
    const r = await vincular(peticion(url('vincular'), { factura_id: CUENTA, monto: 100 }), params);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_anticipo_proveedor_vincular_factura',
      args: { p_anticipo: ANTICIPO, p_factura: CUENTA, p_monto: 100, p_organization_id: ORG },
    });
    guion.errorRpc = { message: 'factura_no_borrador' };
    const r2 = await vincular(peticion(url('vincular'), { factura_id: CUENTA, monto: 100 }), params);
    expect(r2.status).toBe(409);
    guion.errorRpc = null;
    guion.permisos = new Set(['finance.view']);
    rpcs.length = 0;
    const r3 = await vincular(peticion(url('vincular'), { factura_id: CUENTA, monto: 100 }), params);
    expect(r3.status).toBe(403);
    expect(rpcs).toHaveLength(0);
    guion.filas = [{ supplier_id: 45, id: CUENTA, number_ext: 'FC-20', issue_date: '2026-11-01', total: 595000 }];
    const r4 = await vinculables(new Request(url('vincular')), params);
    expect(r4.status).toBe(200);
    expect((await r4.json()).facturas[0]).toMatchObject({ id: CUENTA, numero: 'FC-20', total: 595000 });
  });

  test('ítem 9: resolver un pendiente exige finance.approve, resolución y soporte', async () => {
    const pendiente = { params: Promise.resolve({ pendienteId: CUENTA }) };
    const ok = { resolucion: 'Se verificó el RUT: no correspondía retener', soporte: 'RUT del proveedor' };
    const r = await resolver(peticion('http://x/api/anticipos-proveedor/pendientes/x/resolver', ok), pendiente);
    expect(r.status).toBe(403);
    guion.permisos.add('finance.approve');
    const r2 = await resolver(peticion('http://x/api/anticipos-proveedor/pendientes/x/resolver', { ...ok, resolucion: 'corta' }), pendiente);
    expect(r2.status).toBe(422);
    expect((await r2.json()).codigo).toBe('resolucion_obligatoria');
    expect(rpcs).toHaveLength(0);
    const r3 = await resolver(peticion('http://x/api/anticipos-proveedor/pendientes/x/resolver', ok), pendiente);
    expect(r3.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_anticipo_pendiente_resolver',
      args: { p_id: CUENTA, p_resolucion: ok.resolucion, p_soporte: ok.soporte, p_organization_id: ORG },
    });
  });

  test('ítem 10: la equivalencia de una cuenta fuera de 133005xx exige finance.approve y nota', async () => {
    const cuerpo = { cuenta: '13309501', nota: 'Plan propio: 133095 cumple la función de 133005' };
    const r = await equivalencia(peticion('http://x/api/anticipos-proveedor/cuenta/equivalencia', cuerpo), { params: Promise.resolve({}) });
    expect(r.status).toBe(403);
    guion.permisos.add('finance.approve');
    const r2 = await equivalencia(peticion('http://x/api/anticipos-proveedor/cuenta/equivalencia', { ...cuerpo, nota: 'corta' }), { params: Promise.resolve({}) });
    expect((await r2.json()).codigo).toBe('nota_obligatoria');
    const r3 = await equivalencia(peticion('http://x/api/anticipos-proveedor/cuenta/equivalencia', { ...cuerpo, organization_id: 999 }), { params: Promise.resolve({}) });
    expect(r3.status).toBe(403);
    expect(rpcs).toHaveLength(0);
    const r4 = await equivalencia(peticion('http://x/api/anticipos-proveedor/cuenta/equivalencia', cuerpo), { params: Promise.resolve({}) });
    expect(r4.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_anticipo_cuenta_equivalencia_aprobar', args: { p_organization_id: ORG, p_cuenta: '13309501', p_nota: cuerpo.nota } });
  });
});
