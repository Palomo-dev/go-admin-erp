/**
 * POST /api/sitio-web/editor/guardar — «Guardar y publicar» legacy del editor.
 *
 * - La organización es la de la sesión; una distinta en el body → 403 (puerta `withOrg`).
 * - Sin `website.sites.publish` → 403 aunque tenga el de editar (en legacy guardar es publicar).
 * - Columnas fuera de la lista blanca → 400 sin escribir nada.
 * - Con la RPC aplicada, un solo `rpc` con la organización de la sesión; sin ella (42883),
 *   respaldo con cada `where` por la organización de la sesión.
 *
 * Organización ficticia 120; sin datos reales.
 */
import { armarLoteLegacy } from '@/components/sitio-web/editor/loteLegacy';
import { esquemaLoteLegacy } from '@/lib/website/editorLegacy';

const permisos = { editar: true, publicar: true };
jest.mock('@/lib/services/website/paginasSitioService', () => ({ permisosSitio: async () => permisos }));

const rpc = jest.fn();
const filtros: string[] = [];
function consulta(resultado: unknown) {
  const q: Record<string, unknown> = {};
  const encadenar = () => q;
  for (const m of ['select', 'update', 'insert', 'neq', 'is', 'limit']) q[m] = jest.fn(encadenar);
  q.eq = jest.fn((col: string, val: unknown) => {
    filtros.push(`${col}=${String(val)}`);
    return q;
  });
  q.maybeSingle = jest.fn(async () => ({ data: resultado, error: null }));
  q.single = jest.fn(async () => ({ data: resultado, error: null }));
  q.then = (r: (v: unknown) => unknown) => r({ data: [{ id: 'x' }], error: null });
  return q;
}
const supabase = {
  rpc: (...a: unknown[]) => rpc(...a),
  from: jest.fn((tabla: string) => consulta(tabla === 'website_settings' ? { id: 'ajustes-1', primary_color: '#123456' } : { id: PAGINA, branch_id: null, slug: 'inicio' })),
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError: Err,
    ORG_BODY_KEYS: ['organization_id', 'organizationId'],
    withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>) => async (req: Request) => {
      try {
        return await handler({ organizationId: 120, userId: 'u-1', supabase }, req);
      } catch (e) {
        if (e instanceof Err) {
          const err = e as { code?: string; statusCode: number };
          return new Response(JSON.stringify({ code: err.code }), { status: err.statusCode });
        }
        throw e;
      }
    },
    readOrgBody: async (ctx: { organizationId: number }, req: Request) => {
      const body = await req.json();
      if (body.organization_id && Number(body.organization_id) !== ctx.organizationId) throw new Err('Organización distinta', 403);
      return body;
    },
  };
});

import { POST } from '../editor/guardar/route';

const PAGINA = '11111111-1111-4111-8111-111111111111';
const SECCION = '22222222-2222-4222-8222-222222222222';

function lote(extra: Record<string, unknown> = {}) {
  return {
    ...armarLoteLegacy({
      pagina: { id: PAGINA, sections: [{ id: SECCION, section_type: 'faq', content: { items: [{ q: 'a' }] } }] },
      sedeId: null,
      secciones: new Map([[SECCION, { content: { items: [{ q: 'a' }] }, sort_order: 9 }]]),
      paginaCambios: { meta_title: 'Inicio' },
      paginaAjustes: null,
      ajustes: { primary_color: '#123456', is_published: false },
      menus: new Map(),
    }),
    ...extra,
  };
}
const pedir = (body: unknown) =>
  POST(new Request('http://x/api/sitio-web/editor/guardar', { method: 'POST', body: JSON.stringify(body) }), undefined as never);

beforeEach(() => {
  permisos.editar = true;
  permisos.publicar = true;
  rpc.mockReset();
  filtros.length = 0;
});

test('armarLoteLegacy filtra columnas y sincroniza preguntas frecuentes con los ajustes', () => {
  const l = lote();
  expect(l.secciones[0].cambios).toEqual({ content: { items: [{ q: 'a' }] } });
  expect(l.ajustes).toEqual({ primary_color: '#123456', faq_items: [{ q: 'a' }] });
  expect(l.orden).toEqual([SECCION]);
  expect(esquemaLoteLegacy.safeParse(l).success).toBe(true);
});

test('sin el permiso de publicar responde 403 y no escribe', async () => {
  permisos.publicar = false;
  const r = await pedir(lote());
  expect(r.status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});

test('otra organización en el body → 403', async () => {
  const r = await pedir({ ...lote(), organization_id: 999 });
  expect(r.status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});

test('una columna fuera de la lista blanca → 400', async () => {
  const r = await pedir(lote({ ajustes: { custom_scripts: '<script>' } }));
  expect(r.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

test('con la RPC: un solo paso con la organización de la sesión', async () => {
  rpc.mockResolvedValue({ data: { ajustes: { id: 'a' } }, error: null });
  const r = await pedir(lote());
  expect(r.status).toBe(200);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][0]).toBe('fn_editor_guardar_legacy');
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_org: 120, p_page_id: PAGINA, p_branch: null });
  expect(await r.json()).toEqual({ ajustes: { id: 'a' } });
});

test('sin la RPC (pendiente): respaldo filtrado por la organización de la sesión', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'no existe' } });
  const r = await pedir(lote());
  expect(r.status).toBe(200);
  expect(filtros.filter((f) => f.startsWith('organization_id=')).every((f) => f === 'organization_id=120')).toBe(true);
  expect(filtros).toContain('organization_id=120');
});

test('error de la base sin la RPC traduce 42501 a 403', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_permiso' } });
  const r = await pedir(lote());
  expect(r.status).toBe(403);
});
