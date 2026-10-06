/**
 * GET/PATCH /api/sitio-web/onboarding — avance del asistente (A/03) en
 * `website_site_states.onboarding`.
 *
 * - La organización es la de la sesión; un body con `organization_id` → 400
 *   (el esquema es estricto) y uno con otra organización → 403 (`readOrgBody`).
 * - Escribir exige `website.sites.edit` resuelto en el servidor.
 * - Si el sitio no existe se crea (idempotente) antes de guardar.
 * - El parche se valida y se funde con lo guardado; 0 filas → 403 (RLS).
 *
 * Organización ficticia 120; sin datos reales.
 */
type Sesion = { organizationId: number; userId: string };
const sesion: Sesion = { organizationId: 120, userId: 'u-1' };
let permisos = { editar: true, publicar: false };
let estadoFila: { id: string; onboarding: unknown; primary_domain_id: string | null } | null = null;
let filaActualizada: { id: string } | null = { id: 's-1' };
const updates: Array<{ valores: unknown; filtros: Array<[string, unknown]> }> = [];
const crearSitio = jest.fn(async () => {
  estadoFila = { id: 's-1', onboarding: {}, primary_domain_id: null };
});

/** Constructor encadenable mínimo de PostgREST para las tablas que lee la ruta. */
function tabla(nombre: string) {
  const filtros: Array<[string, unknown]> = [];
  let valores: unknown = null;
  const datos = (): unknown => {
    switch (nombre) {
      case 'website_site_states':
        return valores ? filaActualizada : estadoFila;
      case 'organizations':
        return { name: 'Mi empresa S.A.S.', logo_url: null, type_id: 1, subdomain: 'tu-marca' };
      case 'branches':
        return { name: 'Sede Centro', address: 'Calle 00 # 00-00', city: 'Bogotá', phone: null, opening_hours: null };
      case 'website_settings':
        return { social_links: { whatsapp: '+57 300 000 0000' } };
      default:
        return [];
    }
  };
  const q = {
    select: () => q,
    update: (v: unknown) => {
      valores = v;
      return q;
    },
    eq: (c: string, v: unknown) => {
      filtros.push([c, v]);
      return q;
    },
    is: () => q,
    limit: () => q,
    maybeSingle: async () => {
      if (valores) updates.push({ valores, filtros: [...filtros] });
      return { data: datos(), error: null };
    },
    then: (r: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: datos(), error: null }).then(r),
  };
  return q;
}
const supabase = { from: (t: string) => tabla(t) };

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError: Err } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
  return {
    OrgContextError: Err,
    withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>) => async (req: Request) => {
      try {
        return await handler({ ...sesion, supabase }, req);
      } catch (e) {
        if (e instanceof Err) return new Response(JSON.stringify({ code: e.code }), { status: e.statusCode });
        throw e;
      }
    },
    readOrgBody: async (ctx: Sesion, req: Request) => {
      const body = req.method === 'GET' ? {} : await req.json();
      const otra = (body as { organization_id?: number }).organization_id;
      if (otra !== undefined && otra !== ctx.organizationId) throw new Err('Organización distinta', 403);
      return body;
    },
  };
});
jest.mock('@/lib/services/website/paginasSitioService', () => ({ permisosSitio: async () => permisos }));
jest.mock('@/lib/services/website/siteDocumentService', () => {
  class ErrorSitio extends Error {
    constructor(public code: string, message: string, public details?: unknown) {
      super(message);
    }
  }
  return { crearSitio: (...a: unknown[]) => (crearSitio as (...x: unknown[]) => unknown)(...a), ErrorSitio, errorDesdePostgrest: (e: { message: string }) => new Error(e.message) };
});

import { GET, PATCH } from '../onboarding/route';

type Handler = (r: Request) => Promise<Response>;
const patch = (body: unknown) =>
  (PATCH as unknown as Handler)(new Request('http://localhost/api/sitio-web/onboarding', { method: 'PATCH', body: JSON.stringify(body) }));

beforeEach(() => {
  permisos = { editar: true, publicar: false };
  estadoFila = { id: 's-1', onboarding: { giro: 'restaurante', pasos: { plantilla: 'a' } }, primary_domain_id: null };
  filaActualizada = { id: 's-1' };
  updates.length = 0;
  crearSitio.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

test('GET: avance guardado y contexto del ERP (dirección real, sede, WhatsApp, permisos)', async () => {
  const r = await (GET as unknown as Handler)(new Request('http://localhost/api/sitio-web/onboarding'));
  expect(r.status).toBe(200);
  const json = await r.json();
  expect(json.onboarding).toEqual({ giro: 'restaurante', pasos: { plantilla: 'a' } });
  expect(json.contexto).toMatchObject({
    organizacion: { giro: 'restaurante', subdominio: 'tu-marca' },
    sede: { nombre: 'Sede Centro', direccion: 'Calle 00 # 00-00, Bogotá' },
    whatsapp: '+57 300 000 0000',
    direccion: { host: 'tu-marca.goadmin.io', hostEsPropio: false },
    pasarela: false,
    permisos: { editar: true, publicar: false },
  });
});

test('PATCH funde el parche con lo guardado y filtra por la organización de la sesión', async () => {
  const r = await patch({ pasos: { estilo: 'b' }, pasoActual: 4 });
  expect(r.status).toBe(200);
  expect((await r.json()).onboarding).toEqual({ giro: 'restaurante', pasoActual: 4, pasos: { plantilla: 'a', estilo: 'b' } });
  expect(updates[0].filtros).toEqual([
    ['id', 's-1'],
    ['organization_id', 120],
  ]);
});

test('PATCH sin website.sites.edit: 403 y no escribe', async () => {
  permisos = { editar: false, publicar: true };
  expect((await patch({ pasoActual: 2 })).status).toBe(403);
  expect(updates).toHaveLength(0);
});

test('PATCH con otra organización en el body: 403; con la misma: 400 (el esquema no la admite)', async () => {
  expect((await patch({ organization_id: 999, pasoActual: 2 })).status).toBe(403);
  expect((await patch({ organization_id: 120, pasoActual: 2 })).status).toBe(400);
  expect(updates).toHaveLength(0);
});

test('PATCH inválido: 400', async () => {
  expect((await patch({ pasoActual: 9 })).status).toBe(400);
  expect((await patch({ giro: 'casino' })).status).toBe(400);
});

test('PATCH sin sitio: lo crea antes de guardar', async () => {
  estadoFila = null;
  const r = await patch({ giro: 'tienda' });
  expect(r.status).toBe(200);
  expect(crearSitio).toHaveBeenCalledWith(supabase, 120, null);
});

test('PATCH que la RLS deja en 0 filas: 403 (falla cerrado)', async () => {
  filaActualizada = null;
  expect((await patch({ pasoActual: 3 })).status).toBe(403);
});
