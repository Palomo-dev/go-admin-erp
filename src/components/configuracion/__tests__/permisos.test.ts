/**
 * Permisos de Configuración, resueltos en el servidor: un módulo fuera del
 * plan no aparece, sin permiso la sección queda en solo lectura, y un ajuste
 * con permiso propio se evalúa aparte. También la ruta que lo expone.
 */
import { resolverPermisosSecciones, moduloActivo } from '../config/permisosSecciones';
import { SECCIONES_CONFIG } from '../config/configSectionsRegistry';
import { seccionesDesdeRespuesta } from '../hooks/useSeccionesPermitidas';

jest.mock('@/lib/utils/desktop', () => ({ ...jest.requireActual('@/lib/utils/desktop'), isDesktop: () => false }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const ctx = { userId: 'u-1', organizationId: 120, roleId: 3, isSuperAdmin: false, supabase: {} };
const getActiveModules = jest.fn();
const hasOrgAdminOrPermission = jest.fn();
jest.mock('@/lib/services/moduleManagementService', () => ({ moduleManagementService: { getActiveModules: (...a: unknown[]) => getActiveModules(...a) } }));
jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (h: (c: typeof ctx, r: Request) => Promise<Response>) => (req: Request) => h(ctx, req),
  hasOrgAdminOrPermission: (...a: unknown[]) => hasOrgAdminOrPermission(...a),
}));

describe('resolverPermisosSecciones', () => {
  test('módulo inactivo en el plan: sus secciones no aparecen; los base siempre', async () => {
    const r = await resolverPermisosSecciones(['crm'], async () => true);
    const ids = r.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['general.general', 'roles.general', 'sitioweb.general', 'crm.agente-voz']));
    expect(ids.some((id) => id.startsWith('chat.'))).toBe(false);
    expect(ids.some((id) => id.startsWith('facturacion.'))).toBe(false);
  });

  test('alias de módulo: «gym» activa Membresías', () => {
    expect(moduloActivo('gym', ['gym'])).toBe(true);
    expect(moduloActivo('gym', ['memberships'])).toBe(true);
    expect(moduloActivo('gym', [])).toBe(false);
  });

  test('sin el permiso: solo lectura; con un ajuste de permiso propio se evalúa aparte', async () => {
    const r = await resolverPermisosSecciones(['crm'], async (codigo) => codigo === 'crm.stages.manage');
    const voz = r.find((p) => p.id === 'crm.agente-voz')!;
    expect(voz.puedeEditar).toBe(false);
    expect(voz.ajustes).toEqual({ desinteres: true });
    expect(r.find((p) => p.id === 'crm.general')!.puedeEditar).toBe(false);
  });

  test('una consulta por código de permiso, no por sección; un error cuenta como «no»', async () => {
    const consulta = jest.fn(async (codigo: string) => {
      if (codigo === 'roles.manage') throw new Error('rpc caída');
      return true;
    });
    const r = await resolverPermisosSecciones(['crm', 'chat', 'finance', 'notifications'], consulta);
    const codigos = consulta.mock.calls.map((c) => c[0]);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(r.find((p) => p.id === 'roles.general')!.puedeEditar).toBe(false);
  });

  test('el cliente descarta ids desconocidos y lo de escritorio fuera de Desktop', () => {
    const r = seccionesDesdeRespuesta(
      [
        { id: 'crm.agente-voz', puedeEditar: true, ajustes: {} },
        { id: 'datos-offline.general', puedeEditar: true, ajustes: {} },
        { id: 'inventado.x', puedeEditar: true, ajustes: {} },
      ],
      false,
    );
    expect(r.map((s) => s.seccion.id)).toEqual(['crm.agente-voz']);
  });
});

describe('GET /api/configuracion/secciones', () => {
  beforeEach(() => {
    getActiveModules.mockReset();
    hasOrgAdminOrPermission.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  test('usa los módulos y permisos de la sesión (nunca del cliente)', async () => {
    getActiveModules.mockResolvedValue([{ code: 'crm' }, { code: 'general' }]);
    hasOrgAdminOrPermission.mockImplementation(async (_c: unknown, codigo: string) => codigo === 'admin.full_access');
    const { GET } = await import('@/app/api/configuracion/secciones/route');
    const res = await GET(new Request('https://erp.example/api/configuracion/secciones?organization_id=999'), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(getActiveModules).toHaveBeenCalledWith(120, ctx.supabase);
    const json = (await res.json()) as { secciones: { id: string; puedeEditar: boolean; ajustes: Record<string, boolean> }[] };
    const voz = json.secciones.find((s) => s.id === 'crm.agente-voz')!;
    expect(voz).toEqual({ id: 'crm.agente-voz', puedeEditar: true, ajustes: { desinteres: false } });
    expect(json.secciones.some((s) => s.id.startsWith('chat.'))).toBe(false);
    for (const llamada of hasOrgAdminOrPermission.mock.calls) expect(llamada[0]).toBe(ctx);
  });

  test('si no se pueden leer los módulos, falla cerrado (503 y ninguna sección)', async () => {
    getActiveModules.mockRejectedValue(new Error('db'));
    const { GET } = await import('@/app/api/configuracion/secciones/route');
    const res = await GET(new Request('https://erp.example/api/configuracion/secciones'), { params: Promise.resolve({}) });
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty('secciones');
  });

  test('toda sección del registro sale con un booleano de edición', async () => {
    getActiveModules.mockResolvedValue(['crm', 'chat', 'finance', 'pos', 'hrm', 'pms_hotel', 'integrations', 'parking', 'calendar', 'operations', 'memberships', 'notifications'].map((code) => ({ code })));
    hasOrgAdminOrPermission.mockResolvedValue(false);
    const { GET } = await import('@/app/api/configuracion/secciones/route');
    const json = (await (await GET(new Request('https://erp.example/x'), { params: Promise.resolve({}) })).json()) as { secciones: { id: string; puedeEditar: boolean }[] };
    expect(json.secciones.map((s) => s.id).sort()).toEqual(SECCIONES_CONFIG.map((s) => s.id).sort());
    expect(json.secciones.every((s) => s.puedeEditar === false)).toBe(true);
  });
});
