/// <reference types="jest" />
/**
 * `/api/website/v2/sites/**` con `orgContext` y `readOrgBody` REALES; solo se doblan sus
 * dependencias (`next/headers`, cliente de Supabase de la sesión, `svix`) y el servicio.
 *
 *  - sesión de la org 120 con `organization_id: 999` en el body o la query → 403
 *    `FOREIGN_ORGANIZATION` y el servicio NO se invoca;
 *  - la misma organización en el body → 200 (un cliente coherente sigue funcionando);
 *  - el servicio recibe la organización de la SESIÓN y su cliente, nunca valores del body;
 *  - sin sesión → 401; errores del servicio → `error.code/message/details` con su estado HTTP.
 * Organizaciones ficticias 120 y 999. No se toca la base.
 */

const cookieJar = new Map<string, string>([['goadmin_org_id', '120']]);
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
  headers: async () => ({ get: () => null }),
}));

class WebhookErrorStub extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';
}
jest.mock('@/lib/security/webhookSignatures', () => ({ verifyCronSecret: jest.fn(), WebhookError: WebhookErrorStub }));

let sessionUser: { id: string; email: string } | null = { id: 'u-120', email: 'admin@example.com' };
const memberships = [
  { id: 1, user_id: 'u-120', organization_id: 120, is_active: true, is_super_admin: false, role_id: 2, organizations: { name: 'Org de prueba' }, roles: { name: 'Admin' } },
];
function consulta(rows: Record<string, unknown>[]) {
  const filtros: [string, unknown][] = [];
  const api = {
    select: () => api,
    eq: (c: string, v: unknown) => (filtros.push([c, v]), api),
    order: () => api,
    limit: () => api,
    maybeSingle: async () => ({ data: rows.filter((r) => filtros.every(([c, v]) => r[c] === v))[0] ?? null, error: null }),
  };
  return api;
}
const clienteDeSesion = {
  marca: 'sesion',
  auth: { getUser: async () => ({ data: { user: sessionUser }, error: sessionUser ? null : new Error('sin sesión') }) },
  from: (tabla: string) => consulta(tabla === 'organization_members' ? memberships : []),
  rpc: async () => ({ data: null, error: null }),
};
jest.mock('@/lib/supabase/server-user', () => ({ getServerUserClient: async () => clienteDeSesion }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => ({ marca: 'service_role' }) }));

const servicio = {
  listarSitios: jest.fn(async () => []),
  crearSitio: jest.fn(async () => ({ sitio: { id: 's' }, creado: true, avisos: [] })),
  obtenerBorrador: jest.fn(async () => ({ version: 1 })),
  guardarBorrador: jest.fn(async () => ({ version: 2, actualizadoEn: 'x' })),
  publicar: jest.fn(async () => ({ revisionId: 'r', numero: 1, publicadaEn: 'x', idempotente: false })),
  listarRevisiones: jest.fn(async () => []),
  restaurar: jest.fn(async () => ({ version: 3, actualizadoEn: 'x' })),
  cambiarAdopcion: jest.fn(async () => ({ id: 's' })),
  llevarMenuAlBorrador: jest.fn(async () => ({ version: 2, actualizadoEn: 'x', menuId: 'm', copiado: true })),
};
jest.mock('@/lib/services/website/siteDocumentService', () => {
  const real = jest.requireActual('@/lib/services/website/siteDocumentService');
  return { ...real, ...servicio };
});

import { ErrorSitio } from '@/lib/services/website/siteDocumentService';
import * as rutaSitios from '../sites/route';
import * as rutaBorrador from '../sites/[siteId]/draft/route';
import * as rutaPublicaciones from '../sites/[siteId]/publications/route';
import * as rutaRevisiones from '../sites/[siteId]/revisions/route';
import * as rutaRestauraciones from '../sites/[siteId]/restorations/route';
import * as rutaAdopcion from '../sites/[siteId]/adoption/route';
import * as rutaMenus from '../sites/[siteId]/menus/route';

const SITIO = '11111111-1111-4111-8111-111111111111';
const REV = '44444444-4444-4444-8444-444444444444';
const MENU = '55555555-5555-4555-8555-555555555555';
const params = (siteId = SITIO) => ({ params: Promise.resolve({ siteId }) });
const sinParams = { params: Promise.resolve({}) };

function peticion(url: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const documento = { schemaVersion: 1 };

/** Cada ruta de escritura con un body válido (para comprobar el 403 con org ajena). */
const escrituras: [string, (r: Request) => Promise<Response>, string, Record<string, unknown>, keyof typeof servicio][] = [
  ['POST sites', (r) => rutaSitios.POST(r, sinParams), '/api/website/v2/sites', { branchId: null }, 'crearSitio'],
  ['PUT draft', (r) => rutaBorrador.PUT(r, params()), `/api/website/v2/sites/${SITIO}/draft`, { documento, version: 1 }, 'guardarBorrador'],
  ['POST publications', (r) => rutaPublicaciones.POST(r, params()), `/api/website/v2/sites/${SITIO}/publications`, { version: 1, nota: 'n' }, 'publicar'],
  ['POST restorations', (r) => rutaRestauraciones.POST(r, params()), `/api/website/v2/sites/${SITIO}/restorations`, { revisionId: REV, version: 1 }, 'restaurar'],
  ['POST adoption', (r) => rutaAdopcion.POST(r, params()), `/api/website/v2/sites/${SITIO}/adoption`, { adoptado: true }, 'cambiarAdopcion'],
  ['POST menus', (r) => rutaMenus.POST(r, params()), `/api/website/v2/sites/${SITIO}/menus`, { menuId: MENU, version: 1 }, 'llevarMenuAlBorrador'],
];

beforeEach(() => {
  sessionUser = { id: 'u-120', email: 'admin@example.com' };
  Object.values(servicio).forEach((f) => f.mockClear());
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('organización ajena en el body o la query → 403 y el servicio no se llama', () => {
  test.each(escrituras)('%s con organization_id 999 en el body', async (_n, handler, url, body, metodo) => {
    const res = await handler(peticion(url, 'POST', { ...body, organization_id: 999 }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(servicio[metodo]).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  test.each(escrituras)('%s con organizationId 999 en la query', async (_n, handler, url, body, metodo) => {
    const res = await handler(peticion(`${url}?organizationId=999`, 'POST', body));
    expect(res.status).toBe(403);
    expect(servicio[metodo]).not.toHaveBeenCalled();
  });

  test('GET draft y GET revisions con organization_id ajeno en la query', async () => {
    const r1 = await rutaBorrador.GET(peticion(`/api/website/v2/sites/${SITIO}/draft?organization_id=999`), params());
    const r2 = await rutaRevisiones.GET(peticion(`/api/website/v2/sites/${SITIO}/revisions?org_id=999`), params());
    expect([r1.status, r2.status]).toEqual([403, 403]);
    expect(servicio.obtenerBorrador).not.toHaveBeenCalled();
    expect(servicio.listarRevisiones).not.toHaveBeenCalled();
  });
});

describe('caminos válidos', () => {
  test('la misma organización en el body pasa; el servicio recibe la org y el cliente de la sesión', async () => {
    const res = await rutaBorrador.PUT(
      peticion(`/api/website/v2/sites/${SITIO}/draft`, 'PUT', { documento, version: 4, organization_id: 120 }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(servicio.guardarBorrador).toHaveBeenCalledWith(clienteDeSesion, 120, SITIO, documento, 4);
  });

  test('crear sede → 201 con el branchId del body; organización siempre de la sesión', async () => {
    const res = await rutaSitios.POST(peticion('/api/website/v2/sites', 'POST', { branchId: 7 }), sinParams);
    expect(res.status).toBe(201);
    expect(servicio.crearSitio).toHaveBeenCalledWith(clienteDeSesion, 120, 7);
  });

  test('publicar recorta la nota y la vacía pasa a null', async () => {
    await rutaPublicaciones.POST(peticion(`/api/website/v2/sites/${SITIO}/publications`, 'POST', { version: 2, nota: '  ' }), params());
    expect(servicio.publicar).toHaveBeenCalledWith(clienteDeSesion, 120, SITIO, 2, null);
  });

  test('GET sites y GET revisions', async () => {
    expect((await rutaSitios.GET(peticion('/api/website/v2/sites'), sinParams)).status).toBe(200);
    expect((await rutaRevisiones.GET(peticion(`/api/website/v2/sites/${SITIO}/revisions?limite=5`), params())).status).toBe(200);
    expect(servicio.listarRevisiones).toHaveBeenCalledWith(clienteDeSesion, 120, SITIO, 5);
  });
});

describe('validación y errores', () => {
  test('sin sesión → 401 y sin servicio', async () => {
    sessionUser = null;
    const res = await rutaSitios.GET(peticion('/api/website/v2/sites'), sinParams);
    expect(res.status).toBe(401);
    expect(servicio.listarSitios).not.toHaveBeenCalled();
  });

  test('siteId que no es uuid → 404 sin consultar', async () => {
    const res = await rutaBorrador.GET(peticion('/api/website/v2/sites/abc/draft'), params('abc'));
    expect(res.status).toBe(404);
    expect(servicio.obtenerBorrador).not.toHaveBeenCalled();
  });

  test.each([
    ['PUT draft sin versión', () => rutaBorrador.PUT(peticion(`/api/website/v2/sites/${SITIO}/draft`, 'PUT', { documento }), params())],
    ['POST adoption no booleano', () => rutaAdopcion.POST(peticion(`/api/website/v2/sites/${SITIO}/adoption`, 'POST', { adoptado: 'si' }), params())],
    ['POST sites branchId inválido', () => rutaSitios.POST(peticion('/api/website/v2/sites', 'POST', { branchId: 'x' }), sinParams)],
    ['POST restorations sin uuid', () => rutaRestauraciones.POST(peticion(`/api/website/v2/sites/${SITIO}/restorations`, 'POST', { revisionId: '1', version: 1 }), params())],
  ])('%s → 400 peticion_invalida', async (_n, llamar) => {
    const res = await llamar();
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('peticion_invalida');
  });

  test('activar V2 sin el lector público desplegado → 400 y no se llama al servicio; desactivar sí pasa', async () => {
    const url = `/api/website/v2/sites/${SITIO}/adoption`;
    const activar = await rutaAdopcion.POST(peticion(url, 'POST', { adoptado: true }), params());
    expect(activar.status).toBe(400);
    expect(servicio.cambiarAdopcion).not.toHaveBeenCalled();
    const desactivar = await rutaAdopcion.POST(peticion(url, 'POST', { adoptado: false }), params());
    expect(desactivar.status).toBe(200);
    expect(servicio.cambiarAdopcion).toHaveBeenCalledWith(clienteDeSesion, 120, SITIO, false);
  });

  test.each([
    ['conflicto_version', 409],
    ['documento_invalido', 422],
    ['sin_permiso', 403],
    ['sitio_no_encontrado', 404],
  ] as const)('ErrorSitio %s → %i con error.code', async (codigo, estado) => {
    servicio.guardarBorrador.mockRejectedValueOnce(new ErrorSitio(codigo, 'mensaje', { actual: 5 }));
    const res = await rutaBorrador.PUT(peticion(`/api/website/v2/sites/${SITIO}/draft`, 'PUT', { documento, version: 4 }), params());
    expect(res.status).toBe(estado);
    expect(await res.json()).toEqual({ error: { code: codigo, message: 'mensaje', details: { actual: 5 } } });
  });

  test('error inesperado → 500 error_interno sin detalles internos', async () => {
    servicio.listarSitios.mockRejectedValueOnce(new Error('detalle interno de la base'));
    const res = await rutaSitios.GET(peticion('/api/website/v2/sites'), sinParams);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('detalle interno');
  });
});
