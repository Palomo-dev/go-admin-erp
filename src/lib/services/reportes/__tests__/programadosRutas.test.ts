/**
 * Rutas de envíos programados y destinatarios (plan de reportes v2, decisión 11).
 * - La organización sale de la sesión: una ajena en el body es 403 sin escribir.
 * - Todo exige `reports.export` en el servidor.
 * - Un no administrador solo ve y toca los suyos; los de otra persona son 404.
 * - Los correos externos quedan pendientes salvo que programe un
 *   administrador; solo un administrador los aprueba.
 * - El reporte y la sucursal se validan contra el alcance de quien programa.
 * - Los destinatarios deben ser miembros activos con correo.
 * - La prueba va solo al correo de quien la pide y con SU sesión.
 */
import { OrgContextError } from '@/lib/utils/orgContextError';
import type { ReportDefinition } from '../types';
import { fakeTablas } from './fakeTablas';

const ORG = 120;
const YO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTRO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROPIO = '11111111-1111-4111-8111-111111111111';
const AJENO = '22222222-2222-4222-8222-222222222222';

type Tablas = Record<string, Record<string, unknown>[]>;

const guion = {
  roleId: 4,
  permisos: new Set<string>(),
  tablas: {} as Tablas,
  accesoTotal: false,
};
const correos: Array<{ para: string; clave: string; prueba?: boolean }> = [];
const sesionesArchivos: string[] = [];
const eventos: Array<Record<string, unknown>> = [];
let sesion = fakeTablas({});
let servicio = fakeTablas({});

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => servicio }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolverContextoMoneda: jest.fn(async () => null) }));
jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  return {
    OrgContextError: Err,
    readOrgBody,
    hasOrgAdminOrPermission: jest.fn(async (s: { roleId: number; userId: string }, code = 'admin.full_access') => {
      if (s.roleId === 1 || s.roleId === 2) return true;
      return s.userId === YO ? guion.permisos.has(code) : code === 'reports.export';
    }),
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        const ctx = {
          userId: YO,
          userEmail: 'yo@example.com',
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

function def(id: string, alcance: ReportDefinition['alcance'], filtros: ReportDefinition['filtros']): ReportDefinition {
  return { id, grupo: 'ventas', alcance, filtros, modulo: 'pos', titulo: id, descripcion: '', categoria: 'operativo', periodosSugeridos: ['mensual'], fetch: jest.fn() };
}
const DEFS = [def('ventas-dia', 'sucursal', ['sucursal', 'franja', 'comparativo']), def('balance', 'organizacion', [])];
jest.mock('@/lib/services/reportes/reportesCatalogo', () => ({ getReporteById: (id: string) => DEFS.find((d) => d.id === id) }));
jest.mock('@/lib/services/reportes/acceso.server', () => ({
  resolverAccesoReportes: jest.fn(async () => ({
    modulosActivos: ['pos'],
    alcance: { esAdmin: false, todas: [1, 2], permitidas: guion.accesoTotal ? [1, 2] : [1], accesoTotal: guion.accesoTotal },
    disponibles: guion.accesoTotal ? DEFS : DEFS.filter((d) => d.alcance === 'sucursal'),
  })),
  exigirReporteDisponible: (acceso: { disponibles: ReportDefinition[] }, id: string) => {
    const d = DEFS.find((x) => x.id === id);
    if (!d) throw new OrgContextError('Reporte no encontrado', 404, 'NOT_FOUND');
    if (!acceso.disponibles.includes(d)) throw new OrgContextError('Toda la organización', 403, 'BRANCH_SCOPE_REQUIRED');
    return { def: d, vista: null };
  },
  sucursalDelReporte: (acceso: { alcance: { permitidas: number[]; accesoTotal: boolean } }, d: ReportDefinition, pedida: number | null) => {
    if (d.alcance === 'organizacion') return null;
    if (pedida == null ? !acceso.alcance.accesoTotal : !acceso.alcance.permitidas.includes(pedida)) {
      throw new OrgContextError('Sin acceso a la sucursal', 403, 'BRANCH_FORBIDDEN');
    }
    return pedida;
  },
}));
jest.mock('@/lib/services/reportes/historialService', () => ({
  registrarEventoReporte: jest.fn(async (_c: unknown, e: Record<string, unknown>) => {
    eventos.push(e);
  }),
}));
jest.mock('@/lib/services/reportes/programados/archivosMiembro.server', () => ({
  archivosParaMiembro: jest.fn(async (s: { userId: string; memberId?: number }) => {
    sesionesArchivos.push(`${s.userId}:${s.memberId}`);
    return { titulo: 'Ventas', adjuntos: [] };
  }),
}));
jest.mock('@/lib/services/reportes/programados/envio.server', () => ({
  idiomaDe: () => 'es',
  enviarCorreoReporte: jest.fn(async (c: { para: string; clave: string; prueba?: boolean }) => {
    correos.push({ para: c.para, clave: c.clave, prueba: c.prueba });
    return 'email-1';
  }),
}));

import { GET as listar, POST as crear } from '@/app/api/reportes/programados/route';
import { DELETE as eliminar, PATCH as actualizar } from '@/app/api/reportes/programados/[id]/route';
import { POST as probar } from '@/app/api/reportes/programados/[id]/prueba/route';
import { GET as destinatarios } from '@/app/api/reportes/destinatarios/route';

const URL_P = 'http://x/api/reportes/programados';
const pedir = (metodo: string, url: string, body?: unknown) =>
  new Request(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Ventas semanales',
  reportId: 'ventas-dia',
  frecuencia: 'weekly',
  hora: '07:00',
  dia: 1,
  periodo: 'semanal',
  sucursalId: 1,
  formato: 'pdf',
  miembros: [ANA],
  externos: [],
  ...extra,
});

function filaProgramado(id: string, userId: string, recipients: unknown[] = []) {
  return {
    id,
    organization_id: ORG,
    user_id: userId,
    name: 'Envío',
    frequency: 'daily',
    recipients,
    next_run_at: '2026-10-01T12:00:00.000Z',
    is_active: true,
    report_id: 'ventas-dia',
    filtros: { periodo: 'diario' },
    branch_id: 1,
    formato: 'pdf',
    hora: '07:00:00',
    dia: null,
    dias_semana: null,
    zona_horaria: 'America/Bogota',
    last_run_at: null,
    last_status: null,
    last_error: null,
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  guion.roleId = 4;
  guion.permisos = new Set(['reports.export']);
  guion.accesoTotal = false;
  guion.tablas = {
    scheduled_reports: [filaProgramado(PROPIO, YO), filaProgramado(AJENO, OTRO, [{ tipo: 'externo', email: 'contador@example.com', estado: 'pendiente', aprobado_por: null }])],
    organization_members: [
      { id: 55, organization_id: ORG, user_id: YO, role_id: 4, is_super_admin: false, is_active: true, job_position_id: null, roles: { name: 'Vendedor' }, job_positions: null },
      { id: 56, organization_id: ORG, user_id: ANA, role_id: 4, is_super_admin: false, is_active: true, job_position_id: null, roles: [{ name: 'Gerente' }], job_positions: { name: 'Gerente de sede' } },
      { id: 57, organization_id: ORG, user_id: OTRO, role_id: 4, is_super_admin: false, is_active: false, job_position_id: null, roles: null, job_positions: null },
    ],
    profiles: [
      { id: YO, email: 'yo@example.com', first_name: 'Yo', last_name: null, preferred_language: 'es' },
      { id: ANA, email: 'ana@example.com', first_name: 'Ana', last_name: 'Gómez', preferred_language: 'en' },
      { id: OTRO, email: null, first_name: 'Otro', last_name: null, preferred_language: null },
    ],
    organizations: [{ id: ORG, timezone: 'America/Bogota' }],
    branches: [
      { id: 1, organization_id: ORG, name: 'Sucursal Norte', is_active: true },
      { id: 2, organization_id: ORG, name: 'Sucursal Sur', is_active: true },
    ],
    member_branches: [{ organization_member_id: 56, branch_id: 1 }],
  };
  sesion = fakeTablas(guion.tablas);
  servicio = fakeTablas(guion.tablas);
  correos.length = 0;
  sesionesArchivos.length = 0;
  eventos.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

async function json(r: Response) {
  return (await r.json()) as Record<string, unknown> & { resultado: Record<string, unknown> & { destinatarios?: Array<Record<string, unknown>> } };
}

describe('POST /api/reportes/programados', () => {
  test('crea el envío con la organización y el usuario de la sesión, y lo registra', async () => {
    const r = await crear(pedir('POST', URL_P, cuerpo()), params(''));
    expect(r.status).toBe(201);
    const insert = sesion.escrituras.find((e) => e.op === 'insert');
    expect(insert?.valores).toMatchObject({ organization_id: ORG, user_id: YO, branch_id: 1, frequency: 'weekly', dia: 1, is_active: true });
    expect(insert?.valores?.recipients).toEqual([{ tipo: 'miembro', user_id: ANA, email: 'ana@example.com', nombre: 'Ana Gómez', estado: 'activo', motivo: null }]);
    expect(servicio.escrituras).toHaveLength(0);
    expect(eventos).toEqual([expect.objectContaining({ accion: 'programar', reportId: 'ventas-dia', organizationId: ORG })]);
  });

  test('organización ajena en el body → 403 sin escribir', async () => {
    const r = await crear(pedir('POST', URL_P, cuerpo({ organization_id: 999 })), params(''));
    expect(r.status).toBe(403);
    expect(sesion.escrituras).toHaveLength(0);
  });

  test('sin reports.export → 403', async () => {
    guion.permisos = new Set();
    expect((await crear(pedir('POST', URL_P, cuerpo()), params(''))).status).toBe(403);
    expect((await listar(pedir('GET', URL_P), params(''))).status).toBe(403);
    expect((await destinatarios(pedir('GET', 'http://x/api/reportes/destinatarios'), params(''))).status).toBe(403);
  });

  test('sucursal fuera del alcance o reporte de toda la organización sin acceso total → 403', async () => {
    expect((await crear(pedir('POST', URL_P, cuerpo({ sucursalId: 2 })), params(''))).status).toBe(403);
    expect((await crear(pedir('POST', URL_P, cuerpo({ reportId: 'balance', sucursalId: null })), params(''))).status).toBe(403);
    expect(sesion.escrituras).toHaveLength(0);
  });

  test('destinatario que no es miembro activo o no tiene correo → 400', async () => {
    const r = await crear(pedir('POST', URL_P, cuerpo({ miembros: [OTRO] })), params(''));
    expect(r.status).toBe(400);
    expect((await json(r)).code).toBe('destinatario_invalido');
  });

  test('sin destinatarios o frecuencia sin día válido → 400', async () => {
    expect((await crear(pedir('POST', URL_P, cuerpo({ miembros: [] })), params(''))).status).toBe(400);
    expect((await crear(pedir('POST', URL_P, cuerpo({ frecuencia: 'monthly', dia: 31 })), params(''))).status).toBe(400);
    expect((await crear(pedir('POST', URL_P, cuerpo({ frecuencia: 'custom', dia: null })), params(''))).status).toBe(400);
  });

  test('externos: pendientes si programa alguien sin rol de administrador, activos si programa un administrador', async () => {
    await crear(pedir('POST', URL_P, cuerpo({ externos: ['Contador@Example.com'] })), params(''));
    const pendiente = sesion.escrituras.find((e) => e.op === 'insert')?.valores?.recipients as Array<Record<string, unknown>>;
    expect(pendiente[1]).toEqual({ tipo: 'externo', email: 'contador@example.com', estado: 'pendiente', aprobado_por: null, motivo: null });

    guion.roleId = 2;
    await crear(pedir('POST', URL_P, cuerpo({ externos: ['contador@example.com'] })), params(''));
    const inserts = sesion.escrituras.filter((e) => e.op === 'insert');
    expect((inserts[1].valores?.recipients as Array<Record<string, unknown>>)[1]).toMatchObject({ estado: 'activo', aprobado_por: YO });
  });

  test('la franja y el comparativo solo se guardan si el reporte los admite', async () => {
    guion.accesoTotal = true;
    await crear(pedir('POST', URL_P, cuerpo({ horaInicio: '08:00', horaFin: '12:00', comparar: 'anterior' })), params(''));
    await crear(pedir('POST', URL_P, cuerpo({ reportId: 'balance', sucursalId: null, horaInicio: '08:00', horaFin: '12:00', comparar: 'anterior' })), params(''));
    const [conFranja, sinFranja] = sesion.escrituras.filter((e) => e.op === 'insert').map((e) => e.valores?.filtros);
    expect(conFranja).toMatchObject({ horaInicio: '08:00', horaFin: '12:00', comparar: 'anterior' });
    expect(sinFranja).toMatchObject({ horaInicio: null, horaFin: null, comparar: null });
  });
});

describe('GET, PATCH y DELETE /api/reportes/programados', () => {
  test('sin rol de administrador solo lista los propios, con el cliente de la sesión', async () => {
    const r = await json(await listar(pedir('GET', URL_P), params('')));
    expect((r.resultado as unknown as Array<{ id: string }>).map((p) => p.id)).toEqual([PROPIO]);
  });

  test('un administrador lista los de toda la organización', async () => {
    guion.roleId = 2;
    const r = await json(await listar(pedir('GET', URL_P), params('')));
    expect((r.resultado as unknown as Array<{ id: string }>).map((p) => p.id).sort()).toEqual([PROPIO, AJENO].sort());
  });

  test('el de otra persona → 404 para quien no es administrador, sin tocarlo', async () => {
    expect((await actualizar(pedir('PATCH', `${URL_P}/${AJENO}`, { accion: 'pausar' }), params(AJENO))).status).toBe(404);
    expect((await eliminar(pedir('DELETE', `${URL_P}/${AJENO}`), params(AJENO))).status).toBe(404);
    expect((await probar(pedir('POST', `${URL_P}/${AJENO}/prueba`), params(AJENO))).status).toBe(404);
    expect(sesion.escrituras).toHaveLength(0);
    expect(correos).toHaveLength(0);
  });

  test('id que no es uuid → 404', async () => {
    expect((await actualizar(pedir('PATCH', `${URL_P}/x`, { accion: 'pausar' }), params('x'))).status).toBe(404);
  });

  test('pausar el propio lo desactiva, filtrando por la organización', async () => {
    const r = await actualizar(pedir('PATCH', `${URL_P}/${PROPIO}`, { accion: 'pausar' }), params(PROPIO));
    expect(r.status).toBe(200);
    const upd = sesion.escrituras.find((e) => e.op === 'update');
    expect(upd?.valores).toMatchObject({ is_active: false });
    expect(upd?.filtros).toEqual(expect.arrayContaining([['id', 'eq', PROPIO], ['organization_id', 'eq', ORG]]));
  });

  test('reanudar reactiva a los miembros pausados y recalcula el próximo envío', async () => {
    guion.tablas.scheduled_reports[0].is_active = false;
    guion.tablas.scheduled_reports[0].recipients = [{ tipo: 'miembro', user_id: ANA, email: 'ana@example.com', nombre: 'Ana', estado: 'pausado', motivo: 'sin_alcance' }];
    const r = await json(await actualizar(pedir('PATCH', `${URL_P}/${PROPIO}`, { accion: 'reanudar' }), params(PROPIO)));
    expect(r.resultado.activo).toBe(true);
    expect(r.resultado.destinatarios?.[0]).toMatchObject({ estado: 'activo', motivo: null });
  });

  test('aprobar externos: 403 sin rol de administrador; un administrador los aprueba con su usuario', async () => {
    guion.tablas.scheduled_reports[0].recipients = [{ tipo: 'externo', email: 'contador@example.com', estado: 'pendiente', aprobado_por: null }];
    const negado = await actualizar(pedir('PATCH', `${URL_P}/${PROPIO}`, { accion: 'aprobar', correos: ['contador@example.com'] }), params(PROPIO));
    expect(negado.status).toBe(403);

    guion.roleId = 2;
    const r = await json(await actualizar(pedir('PATCH', `${URL_P}/${AJENO}`, { accion: 'aprobar', correos: ['contador@example.com'] }), params(AJENO)));
    expect(r.resultado.destinatarios?.[0]).toMatchObject({ estado: 'activo', aprobado_por: YO });
    expect(servicio.escrituras.find((e) => e.op === 'update')?.filtros).toEqual(expect.arrayContaining([['organization_id', 'eq', ORG]]));
  });

  test('editar vuelve a validar el alcance', async () => {
    const r = await actualizar(pedir('PATCH', `${URL_P}/${PROPIO}`, { accion: 'editar', datos: cuerpo({ sucursalId: 2 }) }), params(PROPIO));
    expect(r.status).toBe(403);
    expect(sesion.escrituras).toHaveLength(0);
  });

  test('eliminar el propio', async () => {
    expect((await eliminar(pedir('DELETE', `${URL_P}/${PROPIO}`), params(PROPIO))).status).toBe(200);
    expect(guion.tablas.scheduled_reports.map((f) => f.id)).toEqual([AJENO]);
  });
});

describe('POST /api/reportes/programados/[id]/prueba', () => {
  test('va solo al correo de quien la pide, con su sesión, y no mueve el próximo envío', async () => {
    const r = await probar(pedir('POST', `${URL_P}/${PROPIO}/prueba`), params(PROPIO));
    expect(r.status).toBe(200);
    expect(correos).toEqual([expect.objectContaining({ para: 'yo@example.com', prueba: true })]);
    expect(sesionesArchivos).toEqual([`${YO}:55`]);
    expect(sesion.escrituras.concat(servicio.escrituras)).toHaveLength(0);
  });
});

describe('GET /api/reportes/destinatarios', () => {
  test('miembros activos con su alcance de sucursal y si pueden recibir', async () => {
    const r = await json(await destinatarios(pedir('GET', 'http://x/api/reportes/destinatarios'), params('')));
    const lista = r.resultado as unknown as Array<Record<string, unknown>>;
    expect(lista.map((d) => d.userId)).toEqual([ANA, YO]);
    expect(lista[0]).toMatchObject({ nombre: 'Ana Gómez', rol: 'Gerente', cargo: 'Gerente de sede', accesoTotal: false, sucursales: [{ id: 1, nombre: 'Sucursal Norte' }], puedeRecibir: true });
    expect(lista[1]).toMatchObject({ accesoTotal: true, puedeRecibir: true });
  });
});
