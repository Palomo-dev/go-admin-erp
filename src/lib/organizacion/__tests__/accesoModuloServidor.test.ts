/**
 * Resolutor del servidor y aviso (docs/design/MODULO-NO-HABILITADO.md §3, §5.3
 * y §5.6):
 * - matriz causa × rol: qué causa, quién resuelve y qué datos ve cada uno;
 * - el miembro no recibe planes ni precios;
 * - el aviso va a quien resuelve, en su idioma, uno por persona, módulo y día;
 * - la organización del body no manda (403) y una ruta sin bloqueo no avisa.
 */
import { fakeTablas } from '@/lib/services/reportes/__tests__/fakeTablas';

const ORG = 120;
const YO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DUENO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GESTOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CARGO = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const guion = { roleId: 4, permisos: new Set<string>() };
let sesion = fakeTablas({});
let servicio = fakeTablas({});

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => servicio }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  const { readOrgBody, ORG_BODY_KEYS } = jest.requireActual('@/lib/security/organizationBody');
  return {
    OrgContextError: Err,
    readOrgBody,
    ORG_BODY_KEYS,
    hasOrgAdminOrPermission: jest.fn(
      async (s: { roleId: number }, code = 'admin.full_access') => s.roleId === 1 || s.roleId === 2 || guion.permisos.has(code),
    ),
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        const ctx = {
          userId: YO,
          organizationId: ORG,
          organizationName: 'Org de prueba',
          roleId: guion.roleId,
          isSuperAdmin: false,
          memberId: 55,
          supabase: sesion,
        };
        try {
          return await handler(ctx, req, params);
        } catch (err) {
          if (err instanceof Err) {
            const e = err as { message: string; code: string; statusCode: number };
            return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
          }
          throw err;
        }
      },
  };
});

import { GET as acceso } from '@/app/api/modules/acceso/route';
import { POST as avisar } from '@/app/api/modules/acceso/avisar/route';
import { GET as noUsados } from '@/app/api/modules/no-usados/route';
import { TIPO_AVISO } from '../accesoModulo';
import { rutaValida } from '../accesoModulo.server';

const modulo = (code: string, is_core = false) => ({ code, name: code, description: null, is_core, is_active: true, rank: 0 });
const MODULOS = [modulo('organizations', true), modulo('clientes', true), modulo('pos'), modulo('crm'), modulo('finance'), modulo('parking')];
const PLANES = [
  { code: 'basico', name: 'Básico', max_modules: 4, price_cop_month: 100, is_active: true, is_custom_enterprise: false, module_config: {} },
  { code: 'pro', name: 'Pro', max_modules: 9, price_cop_month: 200, is_active: true, is_custom_enterprise: false, module_config: {} },
  { code: 'ultimate', name: 'Ultimate', max_modules: null, price_cop_month: 300, is_active: true, is_custom_enterprise: false, module_config: {} },
  { code: 'medida', name: 'A medida', max_modules: null, price_cop_month: 0, is_active: true, is_custom_enterprise: true, module_config: {} },
];

function preparar({ plan = 'pro', cargo = null as string | null, accesoCargo = [] as { module_code: string; can_access: boolean; can_view: boolean }[] } = {}) {
  const activos = ['pos', 'finance'].map((c) => ({ organization_id: ORG, module_code: c, is_active: true, modules: modulo(c) }));
  sesion = fakeTablas(
    {
      modules: MODULOS.map((m) => ({ ...m })),
      organization_modules: activos,
      organization_module_pages: [{ organization_id: ORG, module_code: 'pos', page_href: '/app/pos/devoluciones', page_name: 'Devoluciones', is_active: false }],
      organization_members: [{ id: 55, organization_id: ORG, user_id: YO, is_super_admin: false, job_position_id: cargo, is_active: true }],
      employments: [],
      job_position_module_access: accesoCargo.map((f) => ({ ...f, job_position_id: CARGO })),
      job_positions: [{ id: CARGO, organization_id: ORG, name: 'Cajero' }],
      plans: PLANES.map((p) => ({ ...p })),
    },
    {
      fn_create_org_notification: () => 'n-1',
      check_user_permission: (a) => a.p_user_id === GESTOR && a.p_permission_code === 'hr.positions.edit',
    },
  );
  const planFila = PLANES.find((p) => p.code === plan);
  servicio = fakeTablas({
    subscriptions: planFila ? [{ organization_id: ORG, created_at: '2026-01-01', plans: planFila }] : [],
    organization_members: [
      { organization_id: ORG, user_id: YO, role_id: 4, is_super_admin: false, is_active: true },
      { organization_id: ORG, user_id: ADMIN, role_id: 2, is_super_admin: false, is_active: true },
      { organization_id: ORG, user_id: DUENO, role_id: 7, is_super_admin: true, is_active: true },
      { organization_id: ORG, user_id: GESTOR, role_id: 5, is_super_admin: false, is_active: true },
    ],
    profiles: [
      { id: YO, first_name: 'Laura', last_name: 'Pérez', email: null, preferred_language: 'es' },
      { id: ADMIN, first_name: 'Julián', last_name: 'Torres', email: null, preferred_language: 'en' },
      { id: DUENO, first_name: 'Ana', last_name: 'Gómez', email: null, preferred_language: null },
      { id: GESTOR, first_name: 'Rosa', last_name: 'Díaz', email: null, preferred_language: 'pt' },
    ],
    notifications: [],
  });
}

const consultar = async (ruta: string) => {
  const r = await acceso(new Request(`http://x/api/modules/acceso?ruta=${encodeURIComponent(ruta)}`), undefined as never);
  return { status: r.status, body: (await r.json()) as { acceso: Record<string, unknown> & { causa: string | null } } };
};
const pedirAviso = (body: unknown) =>
  avisar(
    new Request('http://x/api/modules/acceso/avisar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    undefined as never,
  );
const notificaciones = () => sesion.llamadas.filter((l) => l.nombre === 'fn_create_org_notification');

beforeEach(() => {
  guion.roleId = 4;
  guion.permisos = new Set();
  preparar();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('rutaValida', () => {
  it.each([
    ['/app/pos', '/app/pos'],
    ['/app/pos/ventas?x=1', '/app/pos/ventas'],
    ['/app/pos/', '/app/pos'],
  ])('%s → %s', (a, b) => expect(rutaValida(a)).toBe(b));
  it.each(['https://otro.com/app/pos', '/api/modules', '/app/../api', '/app//pos', '', null, 'x'.repeat(400)])('rechaza %p', (r) =>
    expect(rutaValida(r)).toBeNull(),
  );
});

describe('GET /api/modules/acceso — matriz causa × rol', () => {
  it('A · apagado con cupo · administrador: puede encender, ve el cupo, no avisa', async () => {
    guion.roleId = 2;
    const { body } = await consultar('/app/crm/leads');
    expect(body.acceso).toMatchObject({ causa: 'apagado', modulo: 'crm', puedeResolver: true, puedeAvisar: false });
    // Pro: 9 − 2 básicos = 7 opcionales; encendidos: pos y finance.
    expect(body.acceso.plan).toEqual({ nombre: 'Pro', cupo: 7, usados: 2 });
    expect(body.acceso.paginas).toEqual(expect.arrayContaining(['/app/crm/leads']));
  });

  it('A · apagado con cupo · miembro: avisa, ve quién resuelve (nombre y papel) y nada del plan', async () => {
    const { body } = await consultar('/app/crm');
    expect(body.acceso).toMatchObject({ causa: 'apagado', puedeResolver: false, puedeAvisar: true, yaAvisado: false, plan: null, persona: 'Laura Pérez' });
    expect(body.acceso.personas).toEqual(
      expect.arrayContaining([
        { nombre: 'Julián Torres', papel: 'administrador' },
        { nombre: 'Ana Gómez', papel: 'dueno' },
      ]),
    );
    expect(JSON.stringify(body.acceso.personas)).not.toMatch(/Rosa|Laura/);
  });

  it('B · sin cupo · administrador: planes donde cabe (sin el actual ni el a medida) y opcionales encendidos', async () => {
    preparar({ plan: 'basico' });
    guion.roleId = 1;
    const { body } = await consultar('/app/crm');
    expect(body.acceso.causa).toBe('limite');
    expect(body.acceso.plan).toEqual({ nombre: 'Básico', cupo: 2, usados: 2 });
    expect((body.acceso.planesConCupo as { codigo: string }[]).map((p) => p.codigo)).toEqual(['pro', 'ultimate']);
    expect(body.acceso.opcionalesEncendidos).toEqual(['pos', 'finance']);
  });

  it('B · sin cupo · miembro: sin precios ni nombres de plan', async () => {
    preparar({ plan: 'basico' });
    const { body } = await consultar('/app/crm');
    expect(body.acceso).toMatchObject({ causa: 'limite', puedeAvisar: true, plan: null, planesConCupo: [], opcionalesEncendidos: [] });
    expect(JSON.stringify(body.acceso)).not.toMatch(/Básico|Ultimate|"Pro"/);
  });

  it('sin plan → otroPlan', async () => {
    preparar({ plan: 'ninguno' });
    guion.roleId = 2;
    expect((await consultar('/app/crm')).body.acceso.causa).toBe('otroPlan');
  });

  it('C · página oculta · administrador: mostrarla, y la lista de visibles no la incluye', async () => {
    guion.roleId = 2;
    const { body } = await consultar('/app/pos/devoluciones/9');
    expect(body.acceso).toMatchObject({ causa: 'paginaOculta', pagina: '/app/pos/devoluciones', puedeResolver: true, puedeAvisar: false });
    expect(body.acceso.paginas).not.toContain('/app/pos/devoluciones');
    expect(body.acceso.paginas).toContain('/app/pos/ventas');
  });

  it('C · página oculta · miembro: puede avisar', async () => {
    const { body } = await consultar('/app/pos/devoluciones');
    expect(body.acceso).toMatchObject({ causa: 'paginaOculta', puedeResolver: false, puedeAvisar: true });
  });

  it('D · cargo sin acceso: pide acceso; ve el cargo y lo que sí incluye; quien edita cargos aparece', async () => {
    preparar({ cargo: CARGO, accesoCargo: [{ module_code: 'pos', can_access: true, can_view: true }] });
    const { body } = await consultar('/app/finanzas');
    expect(body.acceso).toMatchObject({ causa: 'cargo', puedeResolver: false, puedeAvisar: true });
    expect(body.acceso.cargo).toEqual({ id: CARGO, nombre: 'Cajero', modulos: ['pos'] });
    expect(body.acceso.personas).toEqual(expect.arrayContaining([{ nombre: 'Rosa Díaz', papel: 'gestionaCargos' }]));
  });

  it('D · quien tiene hr.positions.edit puede resolverlo (editar el cargo)', async () => {
    preparar({ cargo: CARGO, accesoCargo: [{ module_code: 'pos', can_access: true, can_view: true }] });
    guion.permisos = new Set(['hr.positions.edit']);
    const { body } = await consultar('/app/finanzas');
    expect(body.acceso).toMatchObject({ causa: 'cargo', puedeResolver: true, puedeAvisar: false });
  });

  it('una ruta que sí puede usar no tiene causa', async () => {
    expect((await consultar('/app/pos/ventas')).body.acceso.causa).toBeNull();
    expect((await consultar('/app/inicio')).body.acceso.causa).toBeNull();
  });

  it('ruta inválida → 400', async () => {
    expect((await consultar('/api/modules')).status).toBe(400);
  });
});

describe('POST /api/modules/acceso/avisar', () => {
  it('avisa a los administradores en su idioma, con el tipo y los datos de deduplicación', async () => {
    const r = await pedirAviso({ ruta: '/app/crm' });
    expect(r.status).toBe(200);
    expect((await r.json()).resultado).toEqual({ notificados: 2, repetida: false });
    const llamadas = notificaciones();
    expect(llamadas.map((l) => l.args.p_recipient_user_id).sort()).toEqual([ADMIN, DUENO].sort());
    for (const l of llamadas) {
      expect(l.args.p_organization_id).toBe(ORG);
      expect(l.args.p_type).toBe(TIPO_AVISO.apagado);
      expect(l.args.p_metadata).toMatchObject({ solicitante: YO, objeto: 'crm', causa: 'apagado', link: '/app/organizacion/modulos?resaltar=crm' });
      expect((l.args.p_metadata as { dia: string }).dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const ingles = llamadas.find((l) => l.args.p_recipient_user_id === ADMIN)!;
    const espanol = llamadas.find((l) => l.args.p_recipient_user_id === DUENO)!;
    expect(ingles.args.p_title).toBe('Laura Pérez asks to turn on CRM');
    expect(espanol.args.p_title).toBe('Laura Pérez pide encender CRM');
  });

  it('uno por persona, módulo y día: el segundo no notifica', async () => {
    await pedirAviso({ ruta: '/app/crm' });
    const primera = notificaciones()[0].args.p_metadata as Record<string, unknown>;
    servicio.tablas.notifications.push({ id: 'n-1', organization_id: ORG, payload: { type: TIPO_AVISO.apagado, ...primera } });
    sesion.llamadas.length = 0;
    const r = await pedirAviso({ ruta: '/app/crm/leads' });
    expect((await r.json()).resultado).toEqual({ notificados: 0, repetida: true });
    expect(notificaciones()).toHaveLength(0);
    // Y la pantalla ya lo sabe: el botón dice «Ya avisaste…».
    expect((await consultar('/app/crm')).body.acceso.yaAvisado).toBe(true);
  });

  it('otro módulo el mismo día sí avisa', async () => {
    servicio.tablas.notifications.push({ id: 'n-1', organization_id: ORG, payload: { type: TIPO_AVISO.apagado, solicitante: YO, objeto: 'parking', dia: '2099-01-01' } });
    const r = await pedirAviso({ ruta: '/app/crm' });
    expect((await r.json()).resultado.repetida).toBe(false);
  });

  it('una organización ajena en el body es 403 y no notifica', async () => {
    const r = await pedirAviso({ ruta: '/app/crm', organization_id: 999 });
    expect(r.status).toBe(403);
    expect(notificaciones()).toHaveLength(0);
  });

  it('quien puede resolverlo no se avisa: 409', async () => {
    guion.roleId = 2;
    const r = await pedirAviso({ ruta: '/app/crm' });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe('puede_resolver');
  });

  it('una ruta sin bloqueo no avisa: 409', async () => {
    const r = await pedirAviso({ ruta: '/app/pos/ventas' });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe('sin_bloqueo');
    expect(notificaciones()).toHaveLength(0);
  });

  it('cargo: avisa a los administradores y a quien edita cargos, con enlace al cargo', async () => {
    preparar({ cargo: CARGO, accesoCargo: [{ module_code: 'pos', can_access: true, can_view: true }] });
    const r = await pedirAviso({ ruta: '/app/finanzas' });
    expect((await r.json()).resultado.notificados).toBe(3);
    const llamadas = notificaciones();
    expect(llamadas.map((l) => l.args.p_recipient_user_id).sort()).toEqual([ADMIN, DUENO, GESTOR].sort());
    expect(llamadas[0].args.p_type).toBe(TIPO_AVISO.cargo);
    expect(llamadas[0].args.p_metadata).toMatchObject({ link: `/app/hrm/cargos/${CARGO}` });
  });

  it('página oculta: deduplica por página, no por módulo', async () => {
    await pedirAviso({ ruta: '/app/pos/devoluciones' });
    expect(notificaciones()[0].args.p_metadata).toMatchObject({ objeto: '/app/pos/devoluciones', causa: 'paginaOculta' });
  });

  it('ruta inválida → 400', async () => {
    expect((await pedirAviso({ ruta: 'https://otro.com' })).status).toBe(400);
  });
});

describe('GET /api/modules/no-usados (buscador global)', () => {
  it('el miembro no recibe módulos', async () => {
    const r = await noUsados(new Request('http://x/api/modules/no-usados'), undefined as never);
    expect(await r.json()).toEqual({ puedeEncender: false, plan: null, modulos: [] });
  });

  it('el administrador recibe los opcionales no activos con su estado y su ruta', async () => {
    guion.roleId = 2;
    const r = await noUsados(new Request('http://x/api/modules/no-usados'), undefined as never);
    const json = (await r.json()) as { puedeEncender: boolean; modulos: { codigo: string; estado: string; href: string }[] };
    expect(json.puedeEncender).toBe(true);
    expect(json.modulos.map((m) => m.codigo).sort()).toEqual(['crm', 'parking']);
    expect(json.modulos.find((m) => m.codigo === 'crm')).toMatchObject({ estado: 'apagado' });
    expect(json.modulos.every((m) => m.href.startsWith('/app/'))).toBe(true);
  });
});
