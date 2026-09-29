/**
 * Recepción de órdenes de compra (inventario B8; reglas duras 5, 6 y 7).
 *
 * Ruta POST /api/inventario/ordenes-compra/[id]/recepcionar:
 * - sin sesión: 401 sin RPC;
 * - la organización sale de la sesión: una ajena en el cuerpo o la query es 403
 *   sin RPC; la RPC recibe p_org de la sesión;
 * - sin permiso `recibir` (fn_inventario_permisos, en el servidor): 403 sin
 *   llamar a fn_oc_recepcionar; si la RPC dice 42501 también es 403;
 * - los errores de la RPC salen con un código estable (nunca un «éxito» con
 *   errores escondidos).
 * Lógica pura de la pantalla (acumulado → lo que llega ahora) y contrato de la
 * migración (DEFINER, permiso, REVOKE anon, kardex solo por la primitiva).
 */
import fs from 'fs';
import path from 'path';
import {
  ERRORES_RECEPCION_OC,
  ErrorRecepcionOrdenCompra,
  codigoErrorRecepcionOC,
  construirLineasRecepcion,
  estadoHttpErrorRecepcionOC,
  lineasPendientes,
  recepcionarOrdenCompra,
  recepcionSchema,
} from '@/lib/services/inventario/recepcionOrdenCompra';

const ORG = 2;
const UUID = '5b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';

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
    throw new Error('la ruta de recepción no lee ni escribe tablas');
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

import { POST as recepcionar } from '@/app/api/inventario/ordenes-compra/[id]/recepcionar/route';

const URL_RUTA = `http://x/api/inventario/ordenes-compra/${UUID}/recepcionar`;
const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const CUERPO = {
  clave: 'oc-rec-12345678',
  lineas: [
    { po_item_id: 8, product_id: 16, qty: 4 },
    { po_item_id: 9, qty: 3, lotes: [{ lot_code: 'LT-1', expiry_date: '2027-01-31', qty: 2 }, { lot_id: 5, qty: 1 }] },
    { po_item_id: 10, qty: 2, seriales: ['S-1', 'S-2'] },
  ],
};

beforeEach(() => {
  guion.sinSesion = false;
  guion.errores = {};
  guion.datos = {
    fn_inventario_permisos: { ver: true, recibir: true },
    fn_oc_recepcionar: {
      recepcion_id: 1,
      codigo: 'REC-0001',
      ya_procesada: false,
      orden: { id: 7, uuid: UUID, codigo: 'OC-7', estado: 'partial', completa: false },
      lineas: [],
      pendientes: [],
      saltadas: [],
      factura: null,
    },
  };
  rpcs.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('ruta: sesión, organización y permiso', () => {
  it('sin sesión → 401 sin RPC', async () => {
    guion.sinSesion = true;
    const r = await recepcionar(post(URL_RUTA, CUERPO), params(UUID));
    expect(r.status).toBe(401);
    expect(rpcs).toEqual([]);
  });

  it('otra organización en el cuerpo → 403 sin RPC', async () => {
    const r = await recepcionar(post(URL_RUTA, { ...CUERPO, organization_id: 99 }), params(UUID));
    expect(r.status).toBe(403);
    expect(rpcs).toEqual([]);
  });

  it('otra organización en la query → 403 sin RPC', async () => {
    const r = await recepcionar(post(`${URL_RUTA}?organizationId=99`, CUERPO), params(UUID));
    expect(r.status).toBe(403);
    expect(rpcs).toEqual([]);
  });

  it('sin permiso `recibir` → 403 y no se llama a fn_oc_recepcionar', async () => {
    guion.datos.fn_inventario_permisos = { ver: true, recibir: false };
    const r = await recepcionar(post(URL_RUTA, CUERPO), params(UUID));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'sin_permiso' });
    expect(rpcs.map((c) => c.nombre)).toEqual(['fn_inventario_permisos']);
  });

  it('si los permisos no se pueden leer, se niega (nunca «todo permitido»)', async () => {
    guion.errores.fn_inventario_permisos = { message: 'boom' };
    const r = await recepcionar(post(URL_RUTA, CUERPO), params(UUID));
    expect(r.status).toBe(403);
    expect(rpcs.map((c) => c.nombre)).toEqual(['fn_inventario_permisos']);
  });

  it('la RPC con 42501 (otra organización o sin permiso) → 403', async () => {
    guion.errores.fn_oc_recepcionar = { message: 'sin_permiso', code: '42501' };
    const r = await recepcionar(post(URL_RUTA, CUERPO), params(UUID));
    expect(r.status).toBe(403);
  });

  it('una OC de otra organización es 404 (la RPC no la encuentra)', async () => {
    guion.errores.fn_oc_recepcionar = { message: 'orden_no_encontrada', code: 'P0002' };
    const r = await recepcionar(post(URL_RUTA, CUERPO), params(UUID));
    expect(r.status).toBe(404);
  });

  it('un id que no es uuid es 404 sin RPC', async () => {
    const r = await recepcionar(post('http://x/api/inventario/ordenes-compra/7/recepcionar', CUERPO), params('7'));
    expect(r.status).toBe(404);
    expect(rpcs).toEqual([]);
  });
});

describe('ruta: una sola RPC con la organización de la sesión', () => {
  it('manda líneas, lotes, seriales y clave tal cual, con p_org de la sesión', async () => {
    const r = await recepcionar(post(URL_RUTA, { ...CUERPO, organization_id: ORG }), params(UUID));
    expect(r.status).toBe(200);
    expect(rpcs.map((c) => c.nombre)).toEqual(['fn_inventario_permisos', 'fn_oc_recepcionar']);
    expect(rpcs[1].args).toEqual({
      p_org: ORG,
      p_po_uuid: UUID,
      p_lineas: CUERPO.lineas,
      p_clave_idempotencia: 'oc-rec-12345678',
      p_notas: null,
    });
    expect(await r.json()).toMatchObject({ codigo: 'REC-0001', orden: { estado: 'partial' } });
  });

  it('sin clave, con cantidad 0 o con campos inventados → 400 sin RPC', async () => {
    const sinClave = await recepcionar(post(URL_RUTA, { lineas: CUERPO.lineas }), params(UUID));
    const cero = await recepcionar(post(URL_RUTA, { ...CUERPO, lineas: [{ po_item_id: 8, qty: 0 }] }), params(UUID));
    const extra = await recepcionar(post(URL_RUTA, { ...CUERPO, lineas: [{ po_item_id: 8, qty: 1, unit_cost: 1 }] }), params(UUID));
    expect([sinClave.status, cero.status, extra.status]).toEqual([400, 400, 400]);
    expect(rpcs).toEqual([]);
  });

  it.each([
    ['sobre_recepcion', '23514', 409],
    ['serial_repetido', '23505', 409],
    ['lote_requerido', '22023', 422],
    ['orden_no_recibible', '22023', 409],
    ['SUCURSAL_NO_PERMITIDA', '42501', 403],
    ['algo raro', 'XX000', 500],
  ])('error %s de la RPC → %s → HTTP %s con código estable', async (message, code, estado) => {
    guion.errores.fn_oc_recepcionar = { message, code, details: '{"producto":"A","pendiente":6,"solicitado":7}' };
    const r = await recepcionar(post(URL_RUTA, CUERPO), params(UUID));
    expect(r.status).toBe(estado);
    const cuerpo = await r.json();
    expect(typeof cuerpo.codigo).toBe('string');
    if (message === 'sobre_recepcion') expect(cuerpo.detalle).toEqual({ producto: 'A', pendiente: 6, solicitado: 7 });
  });
});

describe('lógica de la pantalla', () => {
  const items = [
    { id: 8, product_id: 16, quantity: 10, received_quantity: 4, serials_received: null },
    { id: 9, product_id: 17, quantity: 5, received_quantity: 0 },
    { id: 10, product_id: 18, quantity: 4, received_quantity: 2, serials_received: ['S-1', 'S-2'] },
  ];

  it('del acumulado de la pantalla a lo que llega ahora (solo las líneas que suben y los seriales nuevos)', () => {
    const lineas = construirLineasRecepcion(
      items,
      { 8: 6.5, 9: 0, 10: 4 },
      { 10: ['S-1', 'S-2', 'S-3', ' S-4 '] },
      { 8: [{ lot_code: ' LT-9 ', expiry_date: '2027-02-01', qty: 2.5 }, { lot_id: 3, qty: 0 }] },
    );
    expect(lineas).toEqual([
      { po_item_id: 8, product_id: 16, qty: 2.5, lotes: [{ lot_code: 'LT-9', expiry_date: '2027-02-01', qty: 2.5 }] },
      { po_item_id: 10, product_id: 18, qty: 2, seriales: ['S-3', 'S-4'] },
    ]);
    expect(recepcionSchema.safeParse({ lineas, clave: 'oc-rec-12345678' }).success).toBe(true);
  });

  it('bajar lo ya recibido no es una recepción', () => {
    expect(construirLineasRecepcion(items, { 8: 1 })).toEqual([]);
  });

  it('«Marcar recibida» pide todo lo pendiente', () => {
    expect(lineasPendientes(items)).toEqual([
      { po_item_id: 8, product_id: 16, qty: 6 },
      { po_item_id: 9, product_id: 17, qty: 5 },
      { po_item_id: 10, product_id: 18, qty: 2 },
    ]);
  });

  it('códigos y estados HTTP', () => {
    expect(codigoErrorRecepcionOC({ message: 'lote_vencimiento_distinto', code: '22023' })).toBe('lote_vencimiento_distinto');
    expect(codigoErrorRecepcionOC({ message: 'Acceso denegado a la organización', code: '42501' })).toBe('sin_permiso');
    expect(codigoErrorRecepcionOC({ message: 'x', code: 'P0002' })).toBe('orden_no_encontrada');
    expect(estadoHttpErrorRecepcionOC('sin_sesion')).toBe(401);
    expect(estadoHttpErrorRecepcionOC('lotes_no_cuadran')).toBe(422);
  });

  it('el cliente lanza un error tipado (nunca devuelve un éxito con errores)', async () => {
    const fetcher = jest.fn(async () =>
      new Response(JSON.stringify({ codigo: 'serial_repetido', detalle: 'S-1' }), { status: 409 }),
    ) as unknown as typeof fetch;
    await expect(recepcionarOrdenCompra(UUID, { lineas: [{ po_item_id: 8, qty: 1 }], clave: 'oc-rec-12345678' }, fetcher)).rejects.toMatchObject({
      codigo: 'serial_repetido',
      detalle: 'S-1',
      estado: 409,
    });
    const sinSesion = jest.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    await expect(recepcionarOrdenCompra(UUID, { lineas: [{ po_item_id: 8, qty: 1 }], clave: 'oc-rec-12345678' }, sinSesion)).rejects.toBeInstanceOf(
      ErrorRecepcionOrdenCompra,
    );
  });
});

describe('contrato de la migración', () => {
  const RAIZ = path.join(__dirname, '..', '..', '..', '..');
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  const esquema = leer('supabase/migrations/20260929170000_inv_b8_1_recepciones_esquema.sql');
  const rpc = leer('supabase/migrations/20260929170100_inv_b8_2_recepcionar.sql');
  const cuerpoRpc = rpc.slice(rpc.indexOf('create or replace function public.fn_oc_recepcionar('));

  it('las dos migraciones tienen su rollback', () => {
    for (const f of ['20260929170000_inv_b8_1_recepciones_esquema', '20260929170100_inv_b8_2_recepcionar']) {
      expect(fs.existsSync(path.join(RAIZ, 'supabase/rollbacks', `${f}_rollback.sql`))).toBe(true);
    }
  });

  it('tablas nuevas con RLS de solo lectura y sin escritura para authenticated ni anon', () => {
    for (const t of ['purchase_receipts', 'purchase_receipt_items']) {
      expect(esquema).toContain(`alter table public.${t} enable row level security`);
      expect(esquema).toContain(`revoke all on table public.${t} from anon`);
      expect(esquema).toContain(`revoke insert, update, delete, truncate on table public.${t} from authenticated`);
    }
    expect(esquema).toMatch(/purchase_receipts_org_clave_key\s+on public\.purchase_receipts \(organization_id, idempotency_key\)/);
  });

  it('fn_oc_recepcionar: DEFINER, permiso `recibir`, organización en la búsqueda de la OC y REVOKE anon', () => {
    expect(cuerpoRpc).toMatch(/security definer\s+set search_path to 'public', 'pg_temp'/);
    expect(cuerpoRpc).toContain("perform public.fn_inventario_exigir_permiso(p_org, array['recibir'])");
    expect(cuerpoRpc).toMatch(/where po\.uuid = p_po_uuid and po\.organization_id = p_org\s+for update/);
    expect(rpc).toContain('revoke all on function public.fn_oc_recepcionar(integer, uuid, jsonb, text, text) from public, anon;');
    expect(rpc).toContain('revoke all on function public.fn_fc_int_desde_oc(uuid) from public, anon, authenticated;');
  });

  it('el kardex solo por el núcleo: sin escrituras directas de stock', () => {
    expect(cuerpoRpc).toContain('public.fn_kardex_entrada_compra_int(');
    expect(cuerpoRpc).not.toMatch(/(insert\s+into|update)\s+public\.(stock_levels|stock_movements)\b/i);
    expect(rpc).toMatch(/jsonb_build_object\(''seriales'', v_linea->''serial_ids''\)/);
  });

  it('los seriales se crean solo con el plazo de garantía (la garantía arranca al vender, B4)', () => {
    const insert = cuerpoRpc.slice(cuerpoRpc.indexOf('insert into public.serial_numbers'), cuerpoRpc.indexOf('returning id, serial'));
    expect(insert).toContain('warranty_months');
    expect(insert).not.toMatch(/warranty_start|warranty_end/);
    expect(insert).toContain("'in_transit'");
  });
});

describe('textos en es/en/fr/pt (namespace inventarioRecepcionOC)', () => {
  const RAIZ = path.join(__dirname, '..', '..', '..', '..');
  const claves = (o: unknown, pre = ''): string[] =>
    o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => claves(v, pre ? `${pre}.${k}` : k))
      : [pre];
  const ns = (lang: string) =>
    (JSON.parse(fs.readFileSync(path.join(RAIZ, 'messages', `${lang}.json`), 'utf8')) as Record<string, unknown>).inventarioRecepcionOC;

  it('los cuatro idiomas tienen las mismas claves', () => {
    const es = claves(ns('es')).sort();
    expect(es.length).toBeGreaterThan(40);
    for (const lang of ['en', 'fr', 'pt']) expect(claves(ns(lang)).sort()).toEqual(es);
  });

  it('cada código de error tiene su texto', () => {
    const errores = (ns('es') as { errores: Record<string, string> }).errores;
    for (const codigo of ERRORES_RECEPCION_OC) expect({ codigo, texto: typeof errores[codigo] }).toEqual({ codigo, texto: 'string' });
  });
});
