/// <reference types="jest" />
/**
 * F-76 + parte pendiente de F-77 — `/api/modules`, `/api/modules/pages` y
 * `/api/modules/audit` con `orgContext` y `platformAdmin` REALES y solo sus
 * dependencias dobladas (`next/headers`, clientes de Supabase, `svix`).
 *
 * Cada caso falla con el código anterior a la corrección (la organización salía
 * del body / del query string y el cliente era `service_role`, sin comprobar
 * sesión, pertenencia ni permiso) y pasa con el actual:
 *
 *  - sesión de la organización A pidiendo módulos de B (query o body) → 403
 *    `FOREIGN_ORGANIZATION`, registro y el servicio NO se invoca;
 *  - sesión sin rol de administrador activando un módulo de su PROPIA
 *    organización → 403 `ADMIN_REQUIRED`, sin escritura;
 *  - administrador de su propia organización → 200 y el módulo cambia;
 *  - el caso de la pantalla real (`/app/organizacion/modulos`): la MISMA
 *    organización en el body y en la sesión → 200;
 *  - el cliente que recibe el servicio es el de la SESIÓN, no `service_role`.
 *
 * Organizaciones y usuarios ficticios (ids 120 y 999). No se toca la base.
 */

const cookieJar = new Map<string, string>();
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
  headers: async () => ({ get: () => null }),
}));

// `webhookSignatures` arrastra svix (ESM puro) y rompe Jest; `orgContext` solo
// lo usa para `withCron`, que estas rutas no utilizan.
class WebhookErrorStub extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';
}
jest.mock('@/lib/security/webhookSignatures', () => ({
  verifyCronSecret: jest.fn(),
  WebhookError: WebhookErrorStub,
}));

// ── Cliente de Supabase de la sesión (fake) ─────────────────────────────────
type Row = Record<string, unknown>;
const memberships: Row[] = [];
let sessionUser: { id: string; email: string } | null = null;
let permisoConcedido = false;
let esAdminDePlataforma = false;
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

function query(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  let limitN: number | null = null;
  const api = {
    select: () => api,
    eq: (col: string, v: unknown) => { filters.push([col, v]); return api; },
    order: () => api,
    limit: (n: number) => { limitN = n; return api; },
    maybeSingle: async () => ({ data: rows.filter((r) => filters.every(([c, v]) => r[c] === v))[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => void) => {
      let r = rows.filter((row) => filters.every(([c, v]) => row[c] === v));
      if (limitN !== null) r = r.slice(0, limitN);
      resolve({ data: r, error: null });
    },
  };
  return api;
}

/** El cliente de la SESIÓN: es el que las rutas deben pasar al servicio. */
const clienteDeSesion = {
  marca: 'sesion' as const,
  auth: { getUser: async () => ({ data: { user: sessionUser }, error: sessionUser ? null : new Error('sin sesión') }) },
  from: (table: string) => (table === 'organization_members' ? query(memberships) : query([])),
  rpc: async (fn: string, args?: unknown) => {
    rpcCalls.push({ fn, args });
    if (fn === 'check_user_permission') return { data: permisoConcedido, error: null };
    if (fn === 'fn_is_platform_admin') return { data: esAdminDePlataforma, error: null };
    return { data: null, error: null };
  },
};
jest.mock('@/lib/supabase/server-user', () => ({ getServerUserClient: async () => clienteDeSesion }));

/** El cliente `service_role`: NINGUNA de las dos rutas de organización debe usarlo. */
const clienteServiceRole = { marca: 'service_role' as const };
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => clienteServiceRole }));

// ── Servicio de módulos doblado, con estado en memoria ──────────────────────
/** `${org}:${modulo}` de los módulos activos; los cambios se verifican aquí. */
const modulosActivos = new Set<string>();
const llamadas: Array<{ metodo: string; org: number; extra?: unknown; cliente: unknown }> = [];

const activateModule = jest.fn(async (org: number, code: string, cliente: unknown, pages?: unknown) => {
  llamadas.push({ metodo: 'activateModule', org, extra: { code, pages }, cliente });
  modulosActivos.add(`${org}:${code}`);
  return { success: true, message: 'Módulo activado', data: { module: { code } } };
});
const deactivateModule = jest.fn(async (org: number, code: string, cliente: unknown) => {
  llamadas.push({ metodo: 'deactivateModule', org, extra: { code }, cliente });
  modulosActivos.delete(`${org}:${code}`);
  return { success: true, message: 'Módulo desactivado', data: { module: { code } } };
});
const getOrganizationModuleStatus = jest.fn(async (org: number, cliente: unknown) => {
  llamadas.push({ metodo: 'getOrganizationModuleStatus', org, cliente });
  return { organization_id: org, active_modules: [...modulosActivos].filter((k) => k.startsWith(`${org}:`)).map((k) => k.split(':')[1]) };
});
const getActiveModulePages = jest.fn(async (org: number, cliente: unknown) => {
  llamadas.push({ metodo: 'getActiveModulePages', org, cliente });
  return { crm: ['/app/crm/leads'] };
});
const paginasApagadas = new Set<string>();
const toggleModulePage = jest.fn(async (org: number, code: string, href: string, _name: string, isActive: boolean, cliente: unknown) => {
  llamadas.push({ metodo: 'toggleModulePage', org, extra: { code, href, isActive }, cliente });
  if (isActive) paginasApagadas.delete(`${org}:${href}`); else paginasApagadas.add(`${org}:${href}`);
  return { success: true, message: 'ok' };
});
const auditOrganizationModules = jest.fn(async (cliente: unknown) => {
  llamadas.push({ metodo: 'auditOrganizationModules', org: 0, cliente });
  return { organizationsWithoutSubscriptions: [], organizationsExceedingLimits: [] };
});
const fixInconsistencies = jest.fn(async (org: number, cliente: unknown) => {
  llamadas.push({ metodo: 'fixInconsistencies', org, cliente });
  return { success: true, message: 'ok' };
});

jest.mock('@/lib/services/moduleManagementService', () => ({
  moduleManagementService: {
    activateModule: (...a: unknown[]) => activateModule(...(a as [number, string, unknown, unknown])),
    deactivateModule: (...a: unknown[]) => deactivateModule(...(a as [number, string, unknown])),
    getOrganizationModuleStatus: (...a: unknown[]) => getOrganizationModuleStatus(...(a as [number, unknown])),
    getActiveModulePages: (...a: unknown[]) => getActiveModulePages(...(a as [number, unknown])),
    toggleModulePage: (...a: unknown[]) => toggleModulePage(...(a as [number, string, string, string, boolean, unknown])),
    auditOrganizationModules: (...a: unknown[]) => auditOrganizationModules(...(a as [unknown])),
    fixInconsistencies: (...a: unknown[]) => fixInconsistencies(...(a as [number, unknown])),
  },
}));

const createPipelineFromTemplate = jest.fn(async () => 'pipeline-1');
jest.mock('@/lib/services/crm/pipelineTemplates', () => ({
  createPipelineFromTemplate: (...a: unknown[]) => createPipelineFromTemplate(...(a as [])),
}));

import { NextRequest } from 'next/server';
import { GET as modulesGet, POST as modulesPost } from '../route';
import { GET as pagesGet, POST as pagesPost } from '../pages/route';
import { GET as auditGet, POST as auditPost } from '../audit/route';

const ORG_SESION = 120;
const ORG_AJENA = 999;

/** Miembro activo de `org` con el rol dado (4 = un rol cualquiera sin admin). */
function miembro(org: number, roleId = 2): Row {
  return {
    id: org * 10,
    organization_id: org,
    is_super_admin: false,
    role_id: roleId,
    is_active: true,
    user_id: 'u-1',
    organizations: { name: `Org ${org}` },
    roles: { name: 'Rol' },
  };
}

function peticion(url: string, method: 'GET' | 'POST', body?: unknown): NextRequest {
  const headers: Record<string, string> = { 'x-organization-id': String(ORG_SESION) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** El segundo argumento que Next pasa a un handler sin segmentos dinámicos. */
const SIN_PARAMS = { params: Promise.resolve({}) };

let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  cookieJar.clear();
  memberships.length = 0;
  memberships.push(miembro(ORG_SESION, 2));
  sessionUser = { id: 'u-1', email: 'u1@ejemplo.test' };
  permisoConcedido = false;
  esAdminDePlataforma = false;
  rpcCalls.length = 0;
  llamadas.length = 0;
  modulosActivos.clear();
  paginasApagadas.clear();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

/**
 * El registro estructurado del punto único. `body` llega como número desde un
 * JSON y como cadena desde la query string (`?organizationId=999`), así que se
 * comparan los dos con el mismo helper.
 */
function seRegistroOrgAjena(donde: 'body' | 'query' = 'body'): void {
  expect(warn).toHaveBeenCalledWith(
    expect.stringMatching(/ajeno en la petición/),
    expect.objectContaining({
      session: ORG_SESION,
      body: donde === 'query' ? String(ORG_AJENA) : ORG_AJENA,
      where: donde,
      userId: 'u-1',
    })
  );
}

describe('GET /api/modules — leer módulos de otra organización', () => {
  test('la organización ajena en el query string → 403 FOREIGN_ORGANIZATION, registro y el servicio NO se llama', async () => {
    const res = await modulesGet(peticion(`/api/modules?organizationId=${ORG_AJENA}`, 'GET'), SIN_PARAMS);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    seRegistroOrgAjena('query');
    expect(getOrganizationModuleStatus).not.toHaveBeenCalled();
  });

  test('sin organización en el query → 200 con la de la SESIÓN y el cliente de la sesión', async () => {
    const res = await modulesGet(peticion('/api/modules', 'GET'), SIN_PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { organization_id: ORG_SESION } });
    expect(getOrganizationModuleStatus).toHaveBeenCalledWith(ORG_SESION, clienteDeSesion);
  });

  test('basta pertenencia: un miembro sin rol de administrador puede leer', async () => {
    memberships.length = 0;
    memberships.push(miembro(ORG_SESION, 4));
    const res = await modulesGet(peticion('/api/modules', 'GET'), SIN_PARAMS);
    expect(res.status).toBe(200);
    // No hace falta consultar el permiso para leer.
    expect(rpcCalls.filter((c) => c.fn === 'check_user_permission')).toHaveLength(0);
  });

  test('sin sesión → 401 y el servicio NO se llama', async () => {
    sessionUser = null;
    const res = await modulesGet(peticion('/api/modules', 'GET'), SIN_PARAMS);
    expect(res.status).toBe(401);
    expect(getOrganizationModuleStatus).not.toHaveBeenCalled();
  });

  test('la organización del header no es una de las suyas → 403 ORG_FORBIDDEN', async () => {
    memberships.length = 0;
    memberships.push(miembro(ORG_AJENA, 2)); // miembro de OTRA, no de la del header
    const res = await modulesGet(peticion('/api/modules', 'GET'), SIN_PARAMS);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ORG_FORBIDDEN' });
    expect(getOrganizationModuleStatus).not.toHaveBeenCalled();
  });
});

describe('POST /api/modules — activar y desactivar módulos', () => {
  test('la organización ajena en el body → 403, registro y NINGUNA escritura', async () => {
    const res = await modulesPost(
      peticion('/api/modules', 'POST', { organizationId: ORG_AJENA, moduleCode: 'pos', action: 'deactivate' }),
      SIN_PARAMS
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    seRegistroOrgAjena();
    expect(deactivateModule).not.toHaveBeenCalled();
    expect(activateModule).not.toHaveBeenCalled();
  });

  test('la organización ajena bajo cualquier otra clave (`organization_id`) también → 403', async () => {
    const res = await modulesPost(
      peticion('/api/modules', 'POST', { organization_id: ORG_AJENA, moduleCode: 'pos', action: 'activate' }),
      SIN_PARAMS
    );
    expect(res.status).toBe(403);
    expect(activateModule).not.toHaveBeenCalled();
  });

  test('la organización ajena en el query, con la propia en el body → 403', async () => {
    const res = await modulesPost(
      peticion(`/api/modules?organizationId=${ORG_AJENA}`, 'POST', { organizationId: ORG_SESION, moduleCode: 'pos', action: 'activate' }),
      SIN_PARAMS
    );
    expect(res.status).toBe(403);
    expect(activateModule).not.toHaveBeenCalled();
  });

  test('sesión SIN rol de administrador activando un módulo de su PROPIA organización → 403 ADMIN_REQUIRED y ninguna escritura', async () => {
    memberships.length = 0;
    memberships.push(miembro(ORG_SESION, 4));
    permisoConcedido = false;
    const res = await modulesPost(
      peticion('/api/modules', 'POST', { organizationId: ORG_SESION, moduleCode: 'crm', action: 'activate' }),
      SIN_PARAMS
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
    expect(activateModule).not.toHaveBeenCalled();
    expect(modulosActivos.has(`${ORG_SESION}:crm`)).toBe(false);
    // El permiso se resolvió en el servidor, con el usuario y la organización de la sesión.
    expect(rpcCalls).toEqual(
      expect.arrayContaining([
        { fn: 'check_user_permission', args: { p_user_id: 'u-1', p_organization_id: ORG_SESION, p_permission_code: 'admin.full_access' } },
      ])
    );
  });

  test('un cargo con `admin.full_access` (rol no 1/2) sí puede: el permiso no depende del NOMBRE del rol', async () => {
    memberships.length = 0;
    memberships.push(miembro(ORG_SESION, 4));
    permisoConcedido = true;
    const res = await modulesPost(
      peticion('/api/modules', 'POST', { organizationId: ORG_SESION, moduleCode: 'crm', action: 'activate' }),
      SIN_PARAMS
    );
    expect(res.status).toBe(200);
    expect(modulosActivos.has(`${ORG_SESION}:crm`)).toBe(true);
  });

  test('administrador de su propia organización (el caso de la pantalla real: misma org en body y sesión) → 200 y el módulo cambia', async () => {
    const res = await modulesPost(
      peticion('/api/modules', 'POST', {
        organizationId: ORG_SESION,
        moduleCode: 'crm',
        action: 'activate',
        modulePages: [{ name: 'Leads', href: '/app/crm/leads' }],
      }),
      SIN_PARAMS
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    expect(modulosActivos.has(`${ORG_SESION}:crm`)).toBe(true);
    // Con la organización de la SESIÓN y el cliente de la SESIÓN (no service role).
    expect(activateModule).toHaveBeenCalledWith(
      ORG_SESION,
      'crm',
      clienteDeSesion,
      [{ name: 'Leads', href: '/app/crm/leads' }]
    );
    // Los embudos de onboarding y renovación, también con el cliente de la sesión.
    expect(createPipelineFromTemplate).toHaveBeenCalledWith(clienteDeSesion, ORG_SESION, 'onboarding');
    expect(createPipelineFromTemplate).toHaveBeenCalledWith(clienteDeSesion, ORG_SESION, 'renewal');
  });

  test('desactivar: administrador, 200 y el módulo deja de estar activo', async () => {
    modulosActivos.add(`${ORG_SESION}:pos`);
    const res = await modulesPost(
      peticion('/api/modules', 'POST', { organizationId: ORG_SESION, moduleCode: 'pos', action: 'deactivate' }),
      SIN_PARAMS
    );
    expect(res.status).toBe(200);
    expect(modulosActivos.has(`${ORG_SESION}:pos`)).toBe(false);
    expect(deactivateModule).toHaveBeenCalledWith(ORG_SESION, 'pos', clienteDeSesion);
  });

  test('acción desconocida → 400 y ninguna escritura', async () => {
    const res = await modulesPost(
      peticion('/api/modules', 'POST', { organizationId: ORG_SESION, moduleCode: 'pos', action: 'borrar' }),
      SIN_PARAMS
    );
    expect(res.status).toBe(400);
    expect(activateModule).not.toHaveBeenCalled();
    expect(deactivateModule).not.toHaveBeenCalled();
  });

  test('ningún cliente `service_role` llega al servicio', async () => {
    await modulesPost(peticion('/api/modules', 'POST', { organizationId: ORG_SESION, moduleCode: 'crm', action: 'activate' }), SIN_PARAMS);
    await modulesGet(peticion('/api/modules', 'GET'), SIN_PARAMS);
    expect(llamadas.length).toBeGreaterThan(0);
    for (const l of llamadas) expect(l.cliente).toBe(clienteDeSesion);
  });
});

describe('/api/modules/pages — páginas de módulo de otra organización', () => {
  test('GET con la organización ajena en el query → 403, registro y el servicio NO se llama', async () => {
    const res = await pagesGet(peticion(`/api/modules/pages?organizationId=${ORG_AJENA}`, 'GET'), SIN_PARAMS);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    seRegistroOrgAjena('query');
    expect(getActiveModulePages).not.toHaveBeenCalled();
  });

  test('GET de la propia: basta pertenencia, con la organización y el cliente de la sesión', async () => {
    memberships.length = 0;
    memberships.push(miembro(ORG_SESION, 4));
    const res = await pagesGet(peticion('/api/modules/pages', 'GET'), SIN_PARAMS);
    expect(res.status).toBe(200);
    expect(getActiveModulePages).toHaveBeenCalledWith(ORG_SESION, clienteDeSesion);
  });

  test('POST con la organización ajena en el body → 403 y NINGUNA escritura', async () => {
    const res = await pagesPost(
      peticion('/api/modules/pages', 'POST', {
        organizationId: ORG_AJENA, moduleCode: 'crm', pageHref: '/app/crm/leads', pageName: 'Leads', isActive: false,
      }),
      SIN_PARAMS
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    seRegistroOrgAjena();
    expect(toggleModulePage).not.toHaveBeenCalled();
    expect(paginasApagadas.size).toBe(0);
  });

  test('POST sin rol de administrador sobre la PROPIA organización → 403 ADMIN_REQUIRED', async () => {
    memberships.length = 0;
    memberships.push(miembro(ORG_SESION, 4));
    const res = await pagesPost(
      peticion('/api/modules/pages', 'POST', {
        organizationId: ORG_SESION, moduleCode: 'crm', pageHref: '/app/crm/leads', pageName: 'Leads', isActive: false,
      }),
      SIN_PARAMS
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
    expect(toggleModulePage).not.toHaveBeenCalled();
  });

  test('POST de un administrador de su propia organización (el caso de la pantalla real) → 200 y la página se apaga', async () => {
    const res = await pagesPost(
      peticion('/api/modules/pages', 'POST', {
        organizationId: ORG_SESION, moduleCode: 'crm', pageHref: '/app/crm/leads', pageName: 'Leads', isActive: false,
      }),
      SIN_PARAMS
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    expect(paginasApagadas.has(`${ORG_SESION}:/app/crm/leads`)).toBe(true);
    expect(toggleModulePage).toHaveBeenCalledWith(ORG_SESION, 'crm', '/app/crm/leads', 'Leads', false, clienteDeSesion);
  });

  test('POST sin `moduleCode` → 400 y ninguna escritura', async () => {
    const res = await pagesPost(
      peticion('/api/modules/pages', 'POST', { organizationId: ORG_SESION, pageHref: '/x', pageName: 'X', isActive: true }),
      SIN_PARAMS
    );
    expect(res.status).toBe(400);
    expect(toggleModulePage).not.toHaveBeenCalled();
  });
});

describe('/api/modules/audit — herramienta de plataforma', () => {
  test('sesión de organización, sin admin de plataforma → 403 y no audita', async () => {
    esAdminDePlataforma = false;
    const res = await auditGet(peticion('/api/modules/audit', 'GET'), SIN_PARAMS);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(auditOrganizationModules).not.toHaveBeenCalled();
  });

  test('sin sesión → 401', async () => {
    sessionUser = null;
    const res = await auditGet(peticion('/api/modules/audit', 'GET'), SIN_PARAMS);
    expect(res.status).toBe(401);
    expect(auditOrganizationModules).not.toHaveBeenCalled();
  });

  test('admin de plataforma → 200, y la auditoría cruzada sí va con service role (justificado)', async () => {
    esAdminDePlataforma = true;
    const res = await auditGet(peticion('/api/modules/audit', 'GET'), SIN_PARAMS);
    expect(res.status).toBe(200);
    expect(auditOrganizationModules).toHaveBeenCalledWith(clienteServiceRole);
  });

  test('POST sin admin de plataforma → 403 y no corrige nada', async () => {
    esAdminDePlataforma = false;
    const res = await auditPost(peticion('/api/modules/audit', 'POST', { organizationId: ORG_AJENA }), SIN_PARAMS);
    expect(res.status).toBe(403);
    expect(fixInconsistencies).not.toHaveBeenCalled();
  });

  test('POST de un admin de plataforma corrige la organización pedida', async () => {
    esAdminDePlataforma = true;
    const res = await auditPost(peticion('/api/modules/audit', 'POST', { organizationId: ORG_AJENA }), SIN_PARAMS);
    expect(res.status).toBe(200);
    expect(fixInconsistencies).toHaveBeenCalledWith(ORG_AJENA, clienteServiceRole);
  });

  test('POST de un admin de plataforma sin organización → 400', async () => {
    esAdminDePlataforma = true;
    const res = await auditPost(peticion('/api/modules/audit', 'POST', {}), SIN_PARAMS);
    expect(res.status).toBe(400);
    expect(fixInconsistencies).not.toHaveBeenCalled();
  });
});
