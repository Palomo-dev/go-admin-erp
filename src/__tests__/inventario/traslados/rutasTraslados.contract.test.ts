/**
 * Rutas de traslados y distribución (inventario B3; reglas duras 5 y 6).
 *
 * - Sin sesión: 401 antes de tocar nada.
 * - La organización sale de la sesión: una ajena en el body o en la query es
 *   403 sin llamar a ninguna RPC; toda RPC recibe `p_org` = la de la sesión
 *   (antes Distribución la tomaba de localStorage).
 * - Los permisos los exige la RPC (DEFINER + fn_inventario_exigir_permiso):
 *   su 42501 sale como 403 con `codigo` estable.
 * - «Crear y despachar»: si el despacho falla, el traslado queda creado y la
 *   respuesta lo dice (207 + código); nunca se pierde el error.
 * - Ninguna ruta escribe tablas: todo es RPC.
 */
import fs from 'fs';
import path from 'path';

const ORG = 2;

const guion = {
  sinSesion: false,
  errores: {} as Record<string, { message: string; code?: string; details?: string }>,
  datos: {} as Record<string, unknown>,
};
const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];

const supabaseFalso = {
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    const error = guion.errores[nombre];
    if (error) return { data: null, error };
    return { data: guion.datos[nombre] ?? {}, error: null };
  },
  from: () => {
    throw new Error('las rutas de traslados no leen ni escriben tablas');
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const ctx = { userId: 'u-1', organizationId: 2, roleId: 4, isSuperAdmin: false, supabase: null as unknown };
  return {
    OrgContextError,
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

import { GET as listar, POST as crear } from '@/app/api/inventario/transferencias/route';
import { GET as detalle, PUT as editar } from '@/app/api/inventario/transferencias/[id]/route';
import { POST as despachar } from '@/app/api/inventario/transferencias/[id]/despachar/route';
import { POST as recibir } from '@/app/api/inventario/transferencias/[id]/recibir/route';
import { POST as cancelar } from '@/app/api/inventario/transferencias/[id]/cancelar/route';
import { POST as devolver } from '@/app/api/inventario/transferencias/[id]/devolver/route';
import { GET as productos } from '@/app/api/inventario/transferencias/productos/route';
import { POST as distribuir } from '@/app/api/inventario/distribucion/route';
import { GET as ordenes } from '@/app/api/inventario/distribucion/ordenes/route';

const get = (url: string) => new Request(url, { method: 'GET' });
const conCuerpo = (metodo: string, url: string, body: unknown) =>
  new Request(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const post = (url: string, body: unknown) => conCuerpo('POST', url, body);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const sinParams = params('');

const NUEVO = { origen: 2, destino: 3, items: [{ product_id: 16, quantity: 4 }], clave: 'traslado-12345678' };
const LINEAS = { lineas: [{ item_id: 10, recibido: 8, decision: 'faltante', motivo: 'caja rota' }], clave: 'recibir-12345678' };
const DISTRIBUCION = { origen: 2, despachar: true, envios: [{ destino: 3, items: [{ product_id: 16, quantity: 2 }] }], clave: 'dist-12345678' };

beforeEach(() => {
  guion.sinSesion = false;
  guion.errores = {};
  guion.datos = {
    fn_traslados_listado: { filas: [], total: 0, kpis: { total: 0 }, atascados: [], hoy: '2026-09-29' },
    fn_inventario_permisos: { ver: true, trasladar: true, recibir: true, costos: false, ajustar: false },
    fn_traslado_guardar: { id: 9, code: 'TR-0006', status: 'pending', repetido: false },
    fn_traslado_despachar: { id: 9, code: 'TR-0006', status: 'in_transit', ya_despachado: false, unidades: 4 },
    fn_traslado_detalle: { traslado: { id: 9 }, items: [{ id: 10 }, { id: 11 }], eventos: [], movimientos: [], ver_costos: false },
    fn_distribucion_crear: { traslados: [{ id: 9, code: 'TR-0006', status: 'in_transit', destino: 3 }], repetido: false },
  };
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('sin sesión → 401 en todas las rutas, sin RPC', () => {
  const casos: [string, () => Promise<Response>][] = [
    ['GET lista', () => listar(get('http://x/api/inventario/transferencias'), sinParams)],
    ['POST crear', () => crear(post('http://x/api/inventario/transferencias', NUEVO), sinParams)],
    ['GET detalle', () => detalle(get('http://x/api/inventario/transferencias/9'), params('9'))],
    ['PUT editar', () => editar(conCuerpo('PUT', 'http://x/api/inventario/transferencias/9', NUEVO), params('9'))],
    ['POST despachar', () => despachar(post('http://x/api/inventario/transferencias/9/despachar', {}), params('9'))],
    ['POST recibir', () => recibir(post('http://x/api/inventario/transferencias/9/recibir', LINEAS), params('9'))],
    ['POST cancelar', () => cancelar(post('http://x/api/inventario/transferencias/9/cancelar', {}), params('9'))],
    ['POST devolver', () => devolver(post('http://x/api/inventario/transferencias/9/devolver', { motivo: 'no salió' }), params('9'))],
    ['GET productos', () => productos(get('http://x/api/inventario/transferencias/productos?origen=2'), sinParams)],
    ['POST distribución', () => distribuir(post('http://x/api/inventario/distribucion', DISTRIBUCION), sinParams)],
    ['GET órdenes', () => ordenes(get('http://x/api/inventario/distribucion/ordenes?origen=2'), sinParams)],
  ];
  it.each(casos)('%s', async (_n, llamar) => {
    guion.sinSesion = true;
    const r = await llamar();
    expect(r.status).toBe(401);
    expect(rpcs).toEqual([]);
  });
});

describe('la organización sale de la sesión (regla 5)', () => {
  it('una organización ajena en el cuerpo es 403 y no llama a ninguna RPC', async () => {
    const r = await crear(post('http://x/api/inventario/transferencias', { ...NUEVO, organization_id: 99 }), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toEqual([]);
    const d = await distribuir(post('http://x/api/inventario/distribucion', { ...DISTRIBUCION, organizationId: 99 }), sinParams);
    expect(d.status).toBe(403);
    expect(rpcs).toEqual([]);
  });

  it('una organización ajena en la query es 403', async () => {
    const r = await listar(get('http://x/api/inventario/transferencias?org_id=99'), sinParams);
    expect(r.status).toBe(403);
    expect(rpcs).toEqual([]);
  });

  it('toda RPC recibe p_org de la sesión, aunque el cuerpo repita la misma organización', async () => {
    await crear(post('http://x/api/inventario/transferencias', { ...NUEVO, organization_id: ORG }), sinParams);
    await listar(get('http://x/api/inventario/transferencias?estados=pending,in_transit&sucursal=2'), sinParams);
    await recibir(post('http://x/api/inventario/transferencias/9/recibir', LINEAS), params('9'));
    await distribuir(post('http://x/api/inventario/distribucion', DISTRIBUCION), sinParams);
    const conOrg = rpcs.filter((c) => c.nombre !== 'fn_inventario_permisos');
    expect(conOrg.length).toBeGreaterThan(0);
    for (const c of rpcs) expect(c.args.p_org).toBe(ORG);
    const listado = rpcs.find((c) => c.nombre === 'fn_traslados_listado')!;
    expect(listado.args.p_filtros).toMatchObject({ estados: ['pending', 'in_transit'], sucursal: 2 });
  });
});

describe('escrituras por RPC transaccional', () => {
  it('crear sin despachar: solo fn_traslado_guardar con la clave de idempotencia', async () => {
    const r = await crear(post('http://x/api/inventario/transferencias', NUEVO), sinParams);
    expect(r.status).toBe(201);
    expect(rpcs.map((c) => c.nombre)).toEqual(['fn_traslado_guardar']);
    expect(rpcs[0].args).toMatchObject({ p_clave: 'traslado-12345678', p_traslado: { origen: 2, destino: 3, items: [{ product_id: 16, quantity: 4 }] } });
  });

  it('crear y despachar: guardar y despachar; los seriales por posición se pasan por id de renglón', async () => {
    const r = await crear(post('http://x/api/inventario/transferencias', { ...NUEVO, despachar: true, seriales: { '1': [44] } }), sinParams);
    expect(r.status).toBe(201);
    expect(rpcs.map((c) => c.nombre)).toEqual(['fn_traslado_guardar', 'fn_traslado_detalle', 'fn_traslado_despachar']);
    expect(rpcs[2].args).toMatchObject({ p_id: 9, p_seriales: { '11': [44] } });
  });

  it('si el despacho falla por existencias (P5), el traslado queda creado y se informa', async () => {
    guion.errores.fn_traslado_despachar = { message: 'stock_insuficiente', code: '23514', details: '{"disponible":3,"solicitado":4}' };
    const r = await crear(post('http://x/api/inventario/transferencias', { ...NUEVO, despachar: true }), sinParams);
    expect(r.status).toBe(207);
    const cuerpo = await r.json();
    expect(cuerpo).toMatchObject({ id: 9, code: 'TR-0006', creado: true, codigo: 'stock_insuficiente', detalle: { disponible: 3, solicitado: 4 } });
  });

  it('recibir manda las líneas y la clave tal cual (P7)', async () => {
    const r = await recibir(post('http://x/api/inventario/transferencias/9/recibir', LINEAS), params('9'));
    expect(r.status).toBe(200);
    expect(rpcs[0]).toEqual({
      nombre: 'fn_traslado_recibir',
      args: { p_org: ORG, p_id: 9, p_lineas: LINEAS.lineas, p_clave: 'recibir-12345678' },
    });
  });

  it('recibir sin clave de idempotencia o con una decisión inventada es 400 sin RPC', async () => {
    const sinClave = await recibir(post('http://x/api/inventario/transferencias/9/recibir', { lineas: LINEAS.lineas }), params('9'));
    expect(sinClave.status).toBe(400);
    const inventada = await recibir(
      post('http://x/api/inventario/transferencias/9/recibir', { ...LINEAS, lineas: [{ item_id: 10, recibido: 1, decision: 'regalar' }] }),
      params('9'),
    );
    expect(inventada.status).toBe(400);
    expect(rpcs).toEqual([]);
  });

  it('despachar, cancelar y devolver llaman a su RPC con el id de la ruta', async () => {
    await despachar(post('http://x/api/inventario/transferencias/9/despachar', { seriales: { '10': [44, 45] }, clave: 'despachar-1234' }), params('9'));
    await cancelar(post('http://x/api/inventario/transferencias/9/cancelar', {}), params('9'));
    await devolver(post('http://x/api/inventario/transferencias/9/devolver', { motivo: 'no salió', clave: 'devolver-1234' }), params('9'));
    expect(rpcs.map((c) => [c.nombre, c.args.p_id])).toEqual([
      ['fn_traslado_despachar', 9],
      ['fn_traslado_cancelar', 9],
      ['fn_traslado_devolver', 9],
    ]);
    expect(rpcs[0].args.p_seriales).toEqual({ '10': [44, 45] });
  });

  it('distribución: una sola RPC con todos los envíos', async () => {
    const r = await distribuir(post('http://x/api/inventario/distribucion', DISTRIBUCION), sinParams);
    expect(r.status).toBe(201);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({ nombre: 'fn_distribucion_crear', args: { p_clave: 'dist-12345678', p_datos: { origen: 2, despachar: true } } });
  });
});

describe('errores de la RPC con código estable', () => {
  it.each([
    ['fn_traslado_despachar', { message: 'sin_permiso', code: '42501' }, 403, 'sin_permiso'],
    ['fn_traslado_despachar', { message: 'estado_invalido', code: '22023' }, 409, 'estado_invalido'],
    ['fn_traslado_despachar', { message: 'traslado_no_encontrado', code: 'P0002' }, 404, 'traslado_no_encontrado'],
    ['fn_traslado_despachar', { message: 'seriales_requeridos', code: '22023', details: '{"producto":"Audífonos"}' }, 422, 'seriales_requeridos'],
    ['fn_traslado_despachar', { message: 'sucursal_sin_acceso', code: '42501' }, 403, 'sucursal_sin_acceso'],
  ])('%s: %j → %i %s', async (rpc, error, estado, codigo) => {
    guion.errores[rpc] = error;
    const r = await despachar(post('http://x/api/inventario/transferencias/9/despachar', {}), params('9'));
    expect(r.status).toBe(estado);
    expect(await r.json()).toMatchObject({ codigo });
  });

  it('un id que no es número es 404 sin RPC', async () => {
    const r = await detalle(get('http://x/api/inventario/transferencias/abc'), params('abc'));
    expect(r.status).toBe(404);
    expect(rpcs).toEqual([]);
  });

  it('la lista devuelve los permisos resueltos en el servidor', async () => {
    const r = await listar(get('http://x/api/inventario/transferencias'), sinParams);
    expect((await r.json()).permisos).toEqual({ ver: true, trasladar: true, recibir: true, costos: false });
  });
});

describe('fuente', () => {
  const RAIZ = path.join(__dirname, '..', '..', '..');
  const archivos = [
    'app/api/inventario/transferencias/route.ts',
    'app/api/inventario/transferencias/[id]/route.ts',
    'app/api/inventario/transferencias/[id]/despachar/route.ts',
    'app/api/inventario/transferencias/[id]/recibir/route.ts',
    'app/api/inventario/transferencias/[id]/cancelar/route.ts',
    'app/api/inventario/transferencias/[id]/devolver/route.ts',
    'app/api/inventario/transferencias/productos/route.ts',
    'app/api/inventario/distribucion/route.ts',
    'app/api/inventario/distribucion/ordenes/route.ts',
    'lib/inventario/transferencias/cliente.ts',
    'lib/inventario/transferencias/rutas.server.ts',
    'components/inventario/distribucion/DistribucionPage.tsx',
    'components/inventario/distribucion/AsistenteDistribucion.tsx',
  ];
  it.each(archivos)('%s no toca tablas ni lee la organización de localStorage', (rel) => {
    const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    expect(src).not.toMatch(/\.from\(\s*['"]/);
    expect(src).not.toMatch(/localStorage\.getItem\(\s*['"]currentOrgId/);
    expect(src).not.toMatch(/update_stock_level/);
  });
});
