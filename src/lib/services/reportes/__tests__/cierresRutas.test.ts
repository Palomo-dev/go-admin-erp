/**
 * Rutas de cierres de periodo (plan de reportes v2, decisiones 4–8).
 * - La organización sale de la sesión: una ajena en el body es 403 sin correr
 *   nada; `fn_cierre_guardar` recibe la de la sesión y el usuario de la sesión.
 * - Cada acción exige su permiso en el servidor: `reports.export` para generar,
 *   `finance.approve` para firmar, `accounting.reverse` para reabrir.
 * - La sucursal se valida contra el alcance antes de ejecutar reportes.
 * - La vista previa no guarda nada.
 * - Los errores de las RPC salen con código estable; el duplicado trae el id
 *   del cierre vigente.
 */
import type { ReportData, ReportDefinition } from '../types';

const ORG = 120;
const CIERRE = 'c1c1c1c1-1111-4111-8111-111111111111';

const guion = {
  permisos: new Set<string>(),
  errorRpc: null as null | { code: string; message: string; details?: string },
  deLaOrg: true,
  accesoTotal: false,
};
const rpcs: { cliente: 'sesion' | 'servicio'; nombre: string; args: Record<string, unknown> }[] = [];

function cliente(tipo: 'sesion' | 'servicio') {
  return {
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      rpcs.push({ cliente: tipo, nombre, args });
      if (guion.errorRpc) return { data: null, error: guion.errorRpc };
      if (nombre === 'fn_cierre_guardar') return { data: { id: CIERRE, numero: 'CIERRE-MEN-202609-001', version: 1, estado: 'emitido' }, error: null };
      if (nombre === 'fn_cierre_firmar') return { data: { id: CIERRE, estado: 'firmado', cierra_periodo: true, fiscal_period_id: null }, error: null };
      if (nombre === 'fn_cierre_reabrir') return { data: { id: CIERRE, estado: 'emitido' }, error: null };
      return { data: null, error: null };
    },
    from: (tabla: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          if (tabla === 'organizations') return { data: { timezone: 'America/Bogota' }, error: null };
          if (tabla === 'branches') return { data: { name: 'Sede norte', timezone: null }, error: null };
          return { data: guion.deLaOrg ? { id: CIERRE } : null, error: null };
        },
      };
      return q;
    },
  };
}
const sesion = cliente('sesion');

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  const { readOrgBody } = jest.requireActual('@/lib/security/organizationBody');
  return {
    OrgContextError,
    readOrgBody,
    hasOrgAdminOrPermission: jest.fn(async (_c: unknown, code: string) => guion.permisos.has(code)),
    withOrg:
      (handler: (c: unknown, r: Request, p: unknown) => Promise<Response>) =>
      async (req: Request, params: unknown) => {
        const ctx = { userId: 'u-1', organizationId: 120, roleId: 4, isSuperAdmin: false, memberId: 55, supabase: sesion };
        try {
          return await handler(ctx, req, params);
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
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => cliente('servicio') }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolverContextoMoneda: jest.fn(async () => null) }));

function def(id: string, grupo: ReportDefinition['grupo'], alcance: ReportDefinition['alcance'] = 'sucursal'): ReportDefinition {
  return { id, grupo, alcance, filtros: ['sucursal'], modulo: 'pos', titulo: id, descripcion: '', categoria: 'operativo', periodosSugeridos: ['mensual'], fetch: jest.fn() };
}
const disponibles = [def('ventas-dia', 'ventas'), def('balance', 'contabilidad', 'organizacion')];
jest.mock('@/lib/services/reportes/acceso.server', () => ({
  resolverAccesoReportes: jest.fn(async () => ({
    modulosActivos: ['pos'],
    alcance: { esAdmin: false, todas: [1, 2], permitidas: guion.accesoTotal ? [1, 2] : [1], accesoTotal: guion.accesoTotal },
    disponibles,
  })),
}));
const ejecutados: { ids: string[]; branchId: number | null | undefined }[] = [];
jest.mock('@/lib/services/reportes/reportesEngine', () => ({
  ejecutarReportesSeleccionados: jest.fn(async (ids: string[], _org: number, periodo: unknown, _c: number, branchId: number | null) => {
    ejecutados.push({ ids, branchId });
    const resultados: ReportData[] = ids.map((id) => ({
      id,
      titulo: id,
      modulo: 'pos',
      kpis: [{ titulo: 'Total', valor: 10, formato: 'numero' }],
      columnas: [],
      filas: [],
      generadoEn: '2026-09-30T12:00:00Z',
      periodo: periodo as ReportData['periodo'],
    }));
    return { resultados, errores: [] };
  }),
}));

import { POST as generar } from '@/app/api/reportes/cierres/route';
import { POST as firmar } from '@/app/api/reportes/cierres/[id]/firmar/route';
import { POST as reabrir } from '@/app/api/reportes/cierres/[id]/reabrir/route';
import { errorDeRpcCierre } from '../cierres/cierres.server';
import { cierreSchema } from '../contrato';

const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const periodo = { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30' };
const cuerpo = (extra: Record<string, unknown> = {}) => ({ periodo, plantilla: 'completo', sucursalId: 1, ...extra });
const URL_CIERRES = 'http://x/api/reportes/cierres';

beforeEach(() => {
  guion.permisos = new Set(['reports.export', 'finance.approve', 'accounting.reverse']);
  guion.errorRpc = null;
  guion.deLaOrg = true;
  guion.accesoTotal = false;
  rpcs.length = 0;
  ejecutados.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('contrato del cierre', () => {
  test('periodo inválido, plantilla desconocida o personalizada sin reportes → inválido', () => {
    expect(cierreSchema.safeParse(cuerpo({ periodo: { ...periodo, fechaInicio: '2026-10-01' } })).success).toBe(false);
    expect(cierreSchema.safeParse(cuerpo({ plantilla: 'otra' })).success).toBe(false);
    expect(cierreSchema.safeParse(cuerpo({ plantilla: 'personalizada' })).success).toBe(false);
    expect(cierreSchema.safeParse(cuerpo({ plantilla: 'personalizada', reportes: ['ventas-dia'] })).success).toBe(true);
  });

  test('la etiqueta del periodo se recalcula en el servidor', () => {
    const r = cierreSchema.parse(cuerpo({ periodo: { ...periodo, etiqueta: '<b>falsa</b>' } }));
    expect(r.periodo.etiqueta).not.toContain('falsa');
  });
});

describe('POST /api/reportes/cierres', () => {
  test('guarda con la organización y el usuario de la sesión, con el service role', async () => {
    const r = await generar(post(URL_CIERRES, cuerpo()), params(''));
    expect(r.status).toBe(201);
    const guardado = rpcs.find((x) => x.nombre === 'fn_cierre_guardar');
    expect(guardado?.cliente).toBe('servicio');
    expect(guardado?.args.p_organization_id).toBe(ORG);
    expect(guardado?.args.p_usuario).toBe('u-1');
    const datos = guardado?.args.p_datos as Record<string, unknown>;
    expect(datos.branch_id).toBe(1);
    expect(datos.zona_horaria).toBe('America/Bogota');
    expect(datos.reportes).toEqual(['balance', 'ventas-dia']);
  });

  test('los reportes de sucursal corren con la sucursal; los de toda la organización, sin ella', async () => {
    await generar(post(URL_CIERRES, cuerpo()), params(''));
    expect(ejecutados).toEqual(
      expect.arrayContaining([
        { ids: ['ventas-dia'], branchId: 1 },
        { ids: ['balance'], branchId: null },
      ]),
    );
  });

  test('vista previa: resume sin guardar', async () => {
    const r = await generar(post(URL_CIERRES, cuerpo({ vistaPrevia: true })), params(''));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.resultado.resumen.capitulos.map((c: { grupo: string }) => c.grupo)).toEqual(['contabilidad', 'ventas']);
    expect(rpcs).toHaveLength(0);
  });

  test('organización ajena en el body → 403 sin ejecutar reportes', async () => {
    const r = await generar(post(URL_CIERRES, cuerpo({ organization_id: 999 })), params(''));
    expect(r.status).toBe(403);
    expect(ejecutados).toHaveLength(0);
    expect(rpcs).toHaveLength(0);
  });

  test('sin reports.export → 403', async () => {
    guion.permisos.delete('reports.export');
    expect((await generar(post(URL_CIERRES, cuerpo()), params(''))).status).toBe(403);
    expect(ejecutados).toHaveLength(0);
  });

  test('sucursal fuera del alcance o consolidado sin acceso total → 403 sin ejecutar', async () => {
    expect((await generar(post(URL_CIERRES, cuerpo({ sucursalId: 2 })), params(''))).status).toBe(403);
    const consolidado = await generar(post(URL_CIERRES, cuerpo({ sucursalId: null })), params(''));
    expect(consolidado.status).toBe(403);
    expect((await consolidado.json()).codigo).toBe('BRANCH_SCOPE_REQUIRED');
    expect(ejecutados).toHaveLength(0);
  });

  test('personalizada solo con reportes disponibles', async () => {
    const r = await generar(post(URL_CIERRES, cuerpo({ plantilla: 'personalizada', reportes: ['no-existe'] })), params(''));
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe('sin_reportes');
  });

  test('duplicado → 409 con el id del cierre vigente', async () => {
    guion.errorRpc = { code: '23505', message: 'cierre_existente', details: CIERRE };
    const r = await generar(post(URL_CIERRES, cuerpo()), params(''));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'cierre_existente', existente: CIERRE });
  });

  test('periodo inválido → 400 datos_invalidos', async () => {
    const r = await generar(post(URL_CIERRES, cuerpo({ periodo: { tipo: 'mensual', fechaInicio: '2026-09', fechaFin: '2026-09-30' } })), params(''));
    expect(r.status).toBe(400);
  });
});

describe('firmar y reabrir', () => {
  test('firmar exige finance.approve y usa el cliente de la sesión', async () => {
    guion.permisos.delete('finance.approve');
    expect((await firmar(post('http://x', {}), params(CIERRE))).status).toBe(403);
    guion.permisos.add('finance.approve');
    const r = await firmar(post('http://x', {}), params(CIERRE));
    expect(r.status).toBe(200);
    expect(rpcs).toEqual([{ cliente: 'sesion', nombre: 'fn_cierre_firmar', args: { p_cierre: CIERRE } }]);
  });

  test('cierre de otra organización → 404 sin RPC', async () => {
    guion.deLaOrg = false;
    expect((await firmar(post('http://x', {}), params(CIERRE))).status).toBe(404);
    expect((await firmar(post('http://x', {}), params('no-uuid'))).status).toBe(404);
    expect(rpcs).toHaveLength(0);
  });

  test('ya firmado → 409 con código estable', async () => {
    guion.errorRpc = { code: '55000', message: 'cierre_ya_firmado' };
    const r = await firmar(post('http://x', {}), params(CIERRE));
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('cierre_ya_firmado');
  });

  test('reabrir exige accounting.reverse y un motivo', async () => {
    expect((await reabrir(post('http://x', { motivo: 'no' }), params(CIERRE))).status).toBe(400);
    guion.permisos.delete('accounting.reverse');
    expect((await reabrir(post('http://x', { motivo: 'Ajuste de inventario' }), params(CIERRE))).status).toBe(403);
    guion.permisos.add('accounting.reverse');
    const r = await reabrir(post('http://x', { motivo: '  Ajuste de inventario  ' }), params(CIERRE));
    expect(r.status).toBe(200);
    expect(rpcs[0].args).toEqual({ p_cierre: CIERRE, p_motivo: 'Ajuste de inventario' });
  });
});

describe('errorDeRpcCierre', () => {
  test.each([
    [{ code: '23505', message: 'cierre_existente', details: CIERRE }, 409, 'cierre_existente'],
    [{ code: '55000', message: 'cierre_firmado' }, 409, 'cierre_firmado'],
    [{ code: 'P0002', message: 'cierre_no_encontrado' }, 404, 'no_encontrado'],
    [{ code: '22023', message: 'motivo_requerido' }, 400, 'motivo_requerido'],
    [{ code: '42501', message: 'BRANCH_FORBIDDEN' }, 403, 'BRANCH_FORBIDDEN'],
    [{ code: 'XX000', message: 'boom' }, 500, 'error_cierre'],
  ])('%j → %i %s', (error, estado, codigo) => {
    const e = errorDeRpcCierre(error);
    expect(e.statusCode).toBe(estado);
    expect(e.code).toBe(codigo);
  });
});
