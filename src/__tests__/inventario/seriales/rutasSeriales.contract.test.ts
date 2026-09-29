/**
 * Rutas de seriales, garantías y trazabilidad (inventario B4; reglas duras 5 y 6).
 *
 * - Sin sesión: 401 antes de tocar nada.
 * - La organización sale de la sesión: una ajena en el body o en la query es
 *   403 sin llamar a ninguna RPC; toda RPC recibe `p_org` = la de la sesión.
 * - Cada acción exige su permiso en el servidor (ver: inventory.view…;
 *   gestionar: inventory.edit / inventory.adjust / inventory_management /
 *   product_management). La RPC lo vuelve a exigir (DEFINER).
 * - Un serial o reclamo de otra organización es 404 (la RPC no lo encuentra).
 * - Los errores de la RPC salen con `codigo` estable y su estado HTTP.
 */

const ORG = 133;
const RECLAMO = '11111111-2222-4333-8444-555555555555';

const guion = {
  sinSesion: false,
  permisos: new Set<string>(),
  errorRpc: null as null | { message: string; code?: string },
  datos: {} as Record<string, unknown>,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (guion.errorRpc) return { data: null, error: guion.errorRpc };
    return { data: guion.datos[nombre] ?? {}, error: null };
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  const ctx = { userId: 'u-1', organizationId: 133, roleId: 4, isSuperAdmin: false, supabase: null as unknown };
  return {
    OrgContextError,
    readOrgBody,
    hasOrgAdminOrPermission: jest.fn(async (_c: unknown, code: string) => guion.permisos.has(code)),
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        try {
          if (guion.sinSesion) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
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

import { GET as listarSeriales } from '@/app/api/inventario/seriales/route';
import { GET as detalleSerial } from '@/app/api/inventario/seriales/[id]/route';
import { POST as estadoSeriales } from '@/app/api/inventario/seriales/estado/route';
import { GET as listarGarantias, POST as crearReclamo } from '@/app/api/inventario/garantias/route';
import { GET as evaluarSerial } from '@/app/api/inventario/garantias/serial/route';
import { GET as detalleReclamo } from '@/app/api/inventario/garantias/[id]/route';
import { POST as estadoReclamo } from '@/app/api/inventario/garantias/[id]/estado/route';
import { POST as enviarRma } from '@/app/api/inventario/garantias/[id]/rma/route';
import { POST as resolverReclamo } from '@/app/api/inventario/garantias/[id]/resolver/route';
import { GET as reemplazos } from '@/app/api/inventario/garantias/[id]/reemplazos/route';
import { GET as trazabilidad } from '@/app/api/inventario/trazabilidad/route';

const get = (url: string) => new Request(url, { method: 'GET' });
const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const sinParams = params('');

const VER = ['inventory.view'];
const GESTIONAR = ['inventory.view', 'inventory.edit'];

beforeEach(() => {
  guion.sinSesion = false;
  guion.permisos = new Set(GESTIONAR);
  guion.errorRpc = null;
  guion.datos = {
    fn_seriales_listado: { filas: [], total: 0, kpis: { total: 0 }, hoy: '2026-09-28' },
    fn_seriales_permisos: { ver: true, gestionar: true, costos: false },
    fn_garantia_crear: { id: RECLAMO, codigo: 'GAR-0001' },
  };
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('sin sesión → 401 en todas las rutas, sin RPC', () => {
  const casos: [string, () => Promise<Response>][] = [
    ['GET seriales', () => listarSeriales(get('http://x/api/inventario/seriales'), sinParams)],
    ['GET serial', () => detalleSerial(get('http://x/api/inventario/seriales/5'), params('5'))],
    ['POST estado', () => estadoSeriales(post('http://x/api/inventario/seriales/estado', { ids: [1], estado: 'damaged' }), sinParams)],
    ['GET garantías', () => listarGarantias(get('http://x/api/inventario/garantias'), sinParams)],
    ['POST garantía', () => crearReclamo(post('http://x/api/inventario/garantias', { serial_id: 1, motivo: 'No enciende' }), sinParams)],
    ['GET garantía', () => detalleReclamo(get(`http://x/api/inventario/garantias/${RECLAMO}`), params(RECLAMO))],
    ['POST resolver', () => resolverReclamo(post('http://x/r', { tipo: 'repair' }), params(RECLAMO))],
    ['GET trazabilidad', () => trazabilidad(get('http://x/api/inventario/trazabilidad?codigo=OC-1'), sinParams)],
  ];
  it.each(casos)('%s', async (_n, llamar) => {
    guion.sinSesion = true;
    const r = await llamar();
    expect(r.status).toBe(401);
    expect(rpcs).toHaveLength(0);
  });
});

describe('GET /api/inventario/seriales', () => {
  it('lista con la organización de la sesión y los filtros de la URL', async () => {
    const r = await listarSeriales(get('http://x/api/inventario/seriales?busqueda=AX2&estados=sold,rma&sucursal=108&desde=20&limite=20'), sinParams);
    expect(r.status).toBe(200);
    const listado = rpcs.find((x) => x.nombre === 'fn_seriales_listado');
    expect(listado?.args.p_org).toBe(ORG);
    expect(listado?.args.p_filtros).toEqual({ busqueda: 'AX2', estados: ['sold', 'rma'], sucursal: 108, desde: 20, limite: 20 });
    const cuerpo = await r.json();
    expect(cuerpo.permisos).toEqual({ ver: true, gestionar: true, costos: false });
  });

  it('otra organización en la query → 403 sin RPC', async () => {
    const r = await listarSeriales(get('http://x/api/inventario/seriales?organization_id=2'), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  it('sin permiso de ver inventario → 403 sin RPC', async () => {
    guion.permisos = new Set();
    const r = await listarSeriales(get('http://x/api/inventario/seriales'), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  it('un estado que no existe es 400', async () => {
    const r = await listarSeriales(get('http://x/api/inventario/seriales?estados=robado'), sinParams);
    expect(r.status).toBe(400);
    expect(rpcs).toHaveLength(0);
  });

  it('sucursal sin acceso (42501 de la RPC) → 403', async () => {
    guion.errorRpc = { message: 'SUCURSAL_NO_PERMITIDA', code: '42501' };
    const r = await listarSeriales(get('http://x/api/inventario/seriales?sucursal=999'), sinParams);
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sucursal_no_permitida');
  });
});

describe('GET /api/inventario/seriales/[id]', () => {
  it('id que no es un entero → 404 sin RPC', async () => {
    const r = await detalleSerial(get('http://x/api/inventario/seriales/abc'), params('abc'));
    expect(r.status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });

  it('serial de otra organización (la RPC no lo encuentra) → 404', async () => {
    guion.errorRpc = { message: 'serial_no_encontrado', code: 'P0002' };
    const r = await detalleSerial(get('http://x/api/inventario/seriales/77'), params('77'));
    expect(r.status).toBe(404);
    expect(rpcs[0]).toEqual({ nombre: 'fn_serial_detalle', args: { p_org: ORG, p_id: 77 } });
  });
});

describe('POST /api/inventario/seriales/estado', () => {
  it('marca dañado con la organización de la sesión', async () => {
    const r = await estadoSeriales(post('http://x/api/inventario/seriales/estado', { ids: [1, 2], estado: 'damaged', nota: 'Golpe' }), sinParams);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_producto_serial_cambiar_estado',
      args: { p_organization_id: ORG, p_serial_ids: [1, 2], p_estado: 'damaged', p_nota: 'Golpe' },
    });
  });

  it('otra organización en el body → 403 sin RPC', async () => {
    const r = await estadoSeriales(post('http://x/api/inventario/seriales/estado', { ids: [1], estado: 'damaged', organization_id: 2 }), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  it('solo con permiso de ver → 403', async () => {
    guion.permisos = new Set(VER);
    const r = await estadoSeriales(post('http://x/api/inventario/seriales/estado', { ids: [1], estado: 'damaged' }), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });
});

describe('garantías', () => {
  it('crea el reclamo con la organización de la sesión → 201', async () => {
    const r = await crearReclamo(post('http://x/api/inventario/garantias', { serial_id: 14, motivo: 'No enciende', descripcion: 'desde ayer' }), sinParams);
    expect(r.status).toBe(201);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_garantia_crear',
      args: { p_org: ORG, p_serial_id: 14, p_motivo: 'No enciende', p_descripcion: 'desde ayer' },
    });
    expect((await r.json()).resultado.codigo).toBe('GAR-0001');
  });

  it('crear sin permiso de gestionar → 403 sin RPC', async () => {
    guion.permisos = new Set(VER);
    const r = await crearReclamo(post('http://x/api/inventario/garantias', { serial_id: 14, motivo: 'No enciende' }), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  it('crear con otra organización en el body → 403', async () => {
    const r = await crearReclamo(post('http://x/api/inventario/garantias', { serial_id: 14, motivo: 'x', orgId: 2 }), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  it.each([
    ['reclamo_abierto', 409],
    ['garantia_vencida', 409],
    ['serial_no_vendido', 409],
    ['serial_no_encontrado', 404],
  ])('la RPC dice %s → %s con el código', async (codigo, estado) => {
    guion.errorRpc = { message: codigo, code: 'P0001' };
    const r = await crearReclamo(post('http://x/api/inventario/garantias', { serial_id: 14, motivo: 'No enciende' }), sinParams);
    expect(r.status).toBe(estado);
    expect((await r.json()).codigo).toBe(codigo);
  });

  it('crear sin motivo → 400 con el campo', async () => {
    const r = await crearReclamo(post('http://x/api/inventario/garantias', { serial_id: 14, motivo: ' ' }), sinParams);
    expect(r.status).toBe(400);
    expect((await r.json()).campos).toContain('motivo');
  });

  it('evaluar un serial exige id o código', async () => {
    const r = await evaluarSerial(get('http://x/api/inventario/garantias/serial'), sinParams);
    expect(r.status).toBe(400);
    const ok = await evaluarSerial(get('http://x/api/inventario/garantias/serial?codigo=AX2-00932'), sinParams);
    expect(ok.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_garantia_serial_para_reclamo', args: { p_org: ORG, p_serial_id: null, p_codigo: 'AX2-00932' } });
  });

  it('detalle con un id que no es uuid → 404 sin RPC; de otra organización → 404', async () => {
    expect((await detalleReclamo(get('http://x/api/inventario/garantias/7'), params('7'))).status).toBe(404);
    expect(rpcs).toHaveLength(0);
    guion.errorRpc = { message: 'reclamo_no_encontrado', code: 'P0002' };
    const r = await detalleReclamo(get(`http://x/api/inventario/garantias/${RECLAMO}`), params(RECLAMO));
    expect(r.status).toBe(404);
    expect(rpcs[0].args).toEqual({ p_org: ORG, p_id: RECLAMO });
  });

  it('rechazar exige motivo; aprobar no', async () => {
    const sinMotivo = await estadoReclamo(post('http://x/e', { accion: 'rechazar' }), params(RECLAMO));
    expect(sinMotivo.status).toBe(400);
    const aprobar = await estadoReclamo(post('http://x/e', { accion: 'aprobar' }), params(RECLAMO));
    expect(aprobar.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_garantia_cambiar_estado', args: { p_org: ORG, p_id: RECLAMO, p_accion: 'aprobar', p_motivo: null } });
  });

  it('una transición que ya no aplica → 409', async () => {
    guion.errorRpc = { message: 'transicion_invalida', code: 'P0001' };
    const r = await estadoReclamo(post('http://x/e', { accion: 'aprobar' }), params(RECLAMO));
    expect(r.status).toBe(409);
  });

  it('RMA: sin número → 400; con número pasa los datos a la RPC', async () => {
    expect((await enviarRma(post('http://x/rma', { rma: '' }), params(RECLAMO))).status).toBe(400);
    const r = await enviarRma(post('http://x/rma', { rma: 'RMA-1', proveedor: 3, guia: '123' }), params(RECLAMO));
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_garantia_enviar_rma', args: { p_org: ORG, p_id: RECLAMO, p_datos: { rma: 'RMA-1', proveedor: 3, guia: '123' } } });
  });

  it('resolver: reemplazo sin serial o reembolso sin monto → 400', async () => {
    expect((await resolverReclamo(post('http://x/r', { tipo: 'replacement' }), params(RECLAMO))).status).toBe(400);
    expect((await resolverReclamo(post('http://x/r', { tipo: 'refund' }), params(RECLAMO))).status).toBe(400);
    expect(rpcs).toHaveLength(0);
    const r = await resolverReclamo(post('http://x/r', { tipo: 'replacement', serial_reemplazo: 15 }), params(RECLAMO));
    expect(r.status).toBe(200);
    expect(rpcs[0].args).toEqual({ p_org: ORG, p_id: RECLAMO, p_datos: { tipo: 'replacement', serial_reemplazo: 15 } });
  });

  it('resolver sin permiso de gestionar → 403', async () => {
    guion.permisos = new Set(VER);
    const r = await resolverReclamo(post('http://x/r', { tipo: 'repair' }), params(RECLAMO));
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });

  it('reemplazos con permiso de ver', async () => {
    guion.permisos = new Set(VER);
    guion.datos.fn_garantia_reemplazos = [{ id: 15, serial: 'X', sucursal: null }];
    const r = await reemplazos(get(`http://x/api/inventario/garantias/${RECLAMO}/reemplazos`), params(RECLAMO));
    expect(r.status).toBe(200);
    expect((await r.json()).seriales).toHaveLength(1);
  });

  it('listado con estados de reclamo válidos', async () => {
    guion.datos.fn_garantias_listado = { filas: [], total: 0, kpis: {}, hoy: '2026-09-28', permisos: {} };
    const r = await listarGarantias(get('http://x/api/inventario/garantias?estados=pending&estados=in_process'), sinParams);
    expect(r.status).toBe(200);
    expect(rpcs[0].args).toEqual({ p_org: ORG, p_filtros: { estados: ['pending', 'in_process'] } });
  });
});

describe('GET /api/inventario/trazabilidad', () => {
  it('sin código → 400', async () => {
    expect((await trazabilidad(get('http://x/api/inventario/trazabilidad'), sinParams)).status).toBe(400);
    expect(rpcs).toHaveLength(0);
  });

  it('busca con la organización de la sesión y la sucursal del selector', async () => {
    guion.datos.fn_trazabilidad = { tipo: 'ninguno', codigo: 'L-1' };
    const r = await trazabilidad(get('http://x/api/inventario/trazabilidad?codigo=L-1&sucursal=108&desde=5&limite=5'), sinParams);
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({ nombre: 'fn_trazabilidad', args: { p_org: ORG, p_codigo: 'L-1', p_sucursal: 108, p_desde: 5, p_limite: 5 } });
  });

  it('otra organización en la query → 403', async () => {
    const r = await trazabilidad(get('http://x/api/inventario/trazabilidad?codigo=L-1&org_id=2'), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toHaveLength(0);
  });
});
