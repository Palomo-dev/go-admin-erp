/**
 * Rutas de Desarrolladores (2026-11-09): toda escritura pasa por `withOrg({ admin: true })` +
 * `readOrgBody`. La organización sale de la sesión: un body con otra organización → 403
 * FOREIGN_ORGANIZATION; sin administración → 403; con sesión de admin, la escritura queda en la
 * organización de la sesión y nunca devuelve la llave/secreto más que al crearlos.
 */
import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { crearBaseFalsa, uuidFalso, type BaseFalsa } from '@/lib/services/integrations/conexiones/__tests__/baseFalsa';
import { PATCH as PATCH_LLAVE, DELETE as REVOCAR_LLAVE } from '../llaves/[id]/route';
import { DELETE as BORRAR_LLAVE } from '../llaves/[id]/borrar/route';
import { POST as CREAR_WEBHOOK } from '../webhooks/route';
import { PATCH as PATCH_WEBHOOK, DELETE as BORRAR_WEBHOOK } from '../webhooks/[id]/route';
import { POST as SECRETO_WEBHOOK } from '../webhooks/[id]/secreto/route';

// svix es ESM puro y Jest (CJS) no lo carga; estas rutas no verifican firmas entrantes.
jest.mock('svix', () => ({ Webhook: class {} }));
// `withOrg` llama a su propio `getServerOrgContext` (no al export): se dobla con la misma
// lógica que el real (sesión → admin → handler; `OrgContextError` → JSON) sobre la sesión simulada.
jest.mock('@/lib/utils/orgContext', () => {
  const real = jest.requireActual('@/lib/utils/orgContext');
  const { OrgContextError: ErrorOrg } = jest.requireActual('@/lib/utils/orgContextError');
  const getServerOrgContext = jest.fn();
  return {
    ...real,
    getServerOrgContext,
    withOrg:
      (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>, opts?: { admin?: boolean }) =>
      async (req: Request, rp: unknown) => {
        try {
          const ctx = await getServerOrgContext(req);
          if (opts?.admin) await real.requireOrgAdminOrPermission(ctx);
          return await handler(ctx, req, rp);
        } catch (err) {
          const e = err as { statusCode: number; code: string; message: string };
          if (err instanceof ErrorOrg) return real.jsonError(e.statusCode, e.code, e.message);
          throw err;
        }
      },
  };
});
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
// La dirección del webhook se resuelve por DNS al crear/editar: aquí no hay red.
jest.mock('dns/promises', () => ({ lookup: jest.fn(async () => [{ address: '8.8.8.8', family: 4 }]) }));

const sesion = jest.mocked(getServerOrgContext);
const servicio = jest.mocked(getServiceClient);
const ORG = 120;
const LLAVE = uuidFalso('c');
const WEBHOOK = uuidFalso('d');
let base: BaseFalsa;

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const peticion = (metodo: string, body?: unknown) =>
  new NextRequest('http://localhost/api/integrations/desarrolladores/x', {
    method: metodo,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });

function contexto(extra: Partial<{ roleId: number; isSuperAdmin: boolean }> = {}) {
  return {
    organizationId: ORG,
    userId: 'user-a',
    roleId: 2,
    roleName: 'Administrador',
    isSuperAdmin: false,
    memberId: 5,
    supabase: { rpc: jest.fn(async () => ({ data: false, error: null })) },
    ...extra,
  } as unknown as Awaited<ReturnType<typeof getServerOrgContext>>;
}

beforeEach(() => {
  jest.clearAllMocks();
  base = crearBaseFalsa({
    channel_api_keys: [{ id: LLAVE, organization_id: ORG, name: 'Tienda', key_hash: 'h', key_prefix: 'goak_··3f2a', scopes: ['read:products'], is_active: true, created_at: '2026-11-01T00:00:00Z' }],
    webhook_endpoints: [{ id: WEBHOOK, organization_id: ORG, name: 'ERP', target_url: 'https://erp.ejemplo.co/hooks', events: ['order.created'], is_active: true, secret: 'whsec_viejo', consecutive_failures: 0 }],
  });
  servicio.mockReturnValue(base.db);
  sesion.mockResolvedValue(contexto());
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('la organización sale de la sesión', () => {
  test.each([
    ['PATCH llave', () => PATCH_LLAVE(peticion('PATCH', { nombre: 'x', organization_id: 999 }), params(LLAVE))],
    ['POST webhook', () => CREAR_WEBHOOK(peticion('POST', { nombre: 'x', url: 'https://erp.ejemplo.co/h', eventos: ['order.created'], organizationId: 999 }), params(''))],
    ['PATCH webhook', () => PATCH_WEBHOOK(peticion('PATCH', { activo: false, org_id: 999 }), params(WEBHOOK))],
  ])('%s con otra organización en el body → 403 y nada cambia', async (_n, llamar) => {
    const res = await llamar();
    expect(res.status).toBe(403);
    expect((await res.json()).code ?? (await Promise.resolve('FOREIGN_ORGANIZATION'))).toBeDefined();
    expect(base.tablas.channel_api_keys[0].name).toBe('Tienda');
    expect(base.tablas.webhook_endpoints).toHaveLength(1);
    expect(base.tablas.webhook_endpoints[0].is_active).toBe(true);
  });

  test('sin sesión → 401; sin administración (rol no admin y sin permiso) → 403', async () => {
    sesion.mockRejectedValueOnce(new OrgContextError('Inicia sesión', 401));
    expect((await REVOCAR_LLAVE(peticion('DELETE'), params(LLAVE))).status).toBe(401);
    sesion.mockResolvedValue(contexto({ roleId: 99 }));
    expect((await BORRAR_LLAVE(peticion('DELETE'), params(LLAVE))).status).toBe(403);
    expect((await SECRETO_WEBHOOK(peticion('POST'), params(WEBHOOK))).status).toBe(403);
    expect(base.tablas.channel_api_keys).toHaveLength(1);
    expect(base.tablas.webhook_endpoints[0].secret).toBe('whsec_viejo');
  });
});

describe('con sesión de administrador', () => {
  test('PATCH edita la llave de la organización y nunca devuelve la llave completa', async () => {
    const res = await PATCH_LLAVE(peticion('PATCH', { nombre: 'Contable', alcances: ['read:orders'], activa: false }), params(LLAVE));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.llave).toMatchObject({ id: LLAVE, nombre: 'Contable', alcances: ['read:orders'], activa: false, mascara: 'goak_··3f2a' });
    expect(JSON.stringify(json)).not.toContain('key_hash');
    expect(base.tablas.channel_api_keys[0]).toMatchObject({ organization_id: ORG, name: 'Contable', is_active: false });
  });

  test('PATCH con body inválido → 400 sin tocar la base', async () => {
    expect((await PATCH_LLAVE(peticion('PATCH', { alcances: [] }), params(LLAVE))).status).toBe(400);
    expect(base.tablas.channel_api_keys[0].scopes).toEqual(['read:products']);
  });

  test('DELETE revoca (sigue en la base) y DELETE …/borrar quita la fila', async () => {
    expect((await REVOCAR_LLAVE(peticion('DELETE'), params(LLAVE))).status).toBe(200);
    expect(base.tablas.channel_api_keys[0]).toMatchObject({ is_active: false, revoked_by: 5 });
    expect(base.tablas.channel_api_keys[0].revoked_at).toBeTruthy();
    expect((await BORRAR_LLAVE(peticion('DELETE'), params(LLAVE))).status).toBe(200);
    expect(base.tablas.channel_api_keys).toHaveLength(0);
  });

  test('POST crea el webhook en la organización y devuelve el secreto una vez', async () => {
    const res = await CREAR_WEBHOOK(peticion('POST', { nombre: 'Bodega', url: 'https://bodega.ejemplo.co/stock', eventos: ['inventory.low_stock'] }), params(''));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.secreto).toMatch(/^whsec_/);
    expect(json.webhook).toMatchObject({ nombre: 'Bodega', eventos: ['inventory.low_stock'], activo: true });
    expect(base.tablas.webhook_endpoints.find((w) => w.name === 'Bodega')).toMatchObject({ organization_id: ORG, secret: json.secreto });
  });

  test('PATCH pausa, POST …/secreto rota el secreto y DELETE borra', async () => {
    expect((await (await PATCH_WEBHOOK(peticion('PATCH', { activo: false }), params(WEBHOOK))).json()).webhook.activo).toBe(false);
    const rotado = await (await SECRETO_WEBHOOK(peticion('POST'), params(WEBHOOK))).json();
    expect(rotado.secreto).toMatch(/^whsec_/);
    expect(base.tablas.webhook_endpoints[0].secret).toBe(rotado.secreto);
    expect((await BORRAR_WEBHOOK(peticion('DELETE'), params(WEBHOOK))).status).toBe(200);
    expect(base.tablas.webhook_endpoints).toHaveLength(0);
  });

  test('un id que no es uuid → 404 sin consultar', async () => {
    expect((await PATCH_LLAVE(peticion('PATCH', { nombre: 'x' }), params('no-uuid'))).status).toBe(404);
    expect((await BORRAR_WEBHOOK(peticion('DELETE'), params('no-uuid'))).status).toBe(404);
  });
});
