/**
 * Rutas de Asistencia, Horas extra y recargos y Novedades (Figma 20.10–20.12).
 *
 * El alcance (toda la organización, el equipo del jefe o nada), la salud y las
 * aprobaciones viven en la base y se probaron por el MCP en transacciones que se
 * deshacen (migración 20261116071722). Aquí se prueba la capa de servidor: el
 * actor y la organización salen de la sesión, la sede se valida, la hora del
 * ajuste viaja como instante, decidir usa la sesión del usuario y «lista para
 * nómina» reclasifica antes de rendirse.
 */

const rpc = jest.fn();
const rpcSesion = jest.fn();
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({ rpc }),
}));

const CTX = {
  userId: '11111111-1111-4111-8111-111111111111',
  organizationId: 135,
};
const VINCULO = '22222222-2222-4222-8222-222222222222';
const INSTANCIA = '33333333-3333-4333-8333-333333333333';
const SIN_PARAMS = { params: Promise.resolve({}) };

jest.mock('@/lib/utils/orgContext', () => {
  const real = jest.requireActual('@/lib/security/organizationBody');
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError,
    readOrgBody: real.readOrgBody,
    withOrg: (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) => (req: Request, rp: unknown) =>
      handler({ ...CTX, supabase: { rpc: rpcSesion } }, req, rp),
  };
});

import { datosDeAjuste, sedeDeQuery } from '../asistenciaService.server';
import { HrmError } from '../tipos';
import { GET as getHoy } from '@/app/api/hrm/asistencia/hoy/route';
import { GET as getHoja } from '@/app/api/hrm/asistencia/hojas/[vinculo]/route';
import { GET as getTopes } from '@/app/api/hrm/asistencia/topes/route';
import { POST as postAjuste } from '@/app/api/hrm/asistencia/ajustes/route';
import { POST as postDecidir } from '@/app/api/hrm/asistencia/novedades/decidir/route';
import { POST as postLista } from '@/app/api/hrm/asistencia/lista-nomina/route';

const json = (url: string, body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  rpc.mockReset();
  rpcSesion.mockReset();
});

describe('entradas', () => {
  test('la sede es un entero positivo o nada', () => {
    expect(sedeDeQuery(null)).toBeNull();
    expect(sedeDeQuery('todas')).toBeNull();
    expect(sedeDeQuery('7')).toBe(7);
    expect(() => sedeDeQuery('7;drop')).toThrow(HrmError);
    expect(() => sedeDeQuery('-1')).toThrow(HrmError);
  });
  test('el ajuste exige hora con zona y motivo; no lleva organización', () => {
    const d = datosDeAjuste({
      vinculo_id: VINCULO,
      fecha: '2026-11-13',
      tipo: 'check_out',
      hora: '2026-11-13T13:00:00-05:00',
      motivo: 'Olvidó marcar la salida',
      organization_id: 999,
    });
    expect(d).toEqual({
      employment_id: VINCULO,
      fecha: '2026-11-13',
      tipo: 'check_out',
      hora: '2026-11-13T18:00:00.000Z',
      motivo: 'Olvidó marcar la salida',
      nota: null,
    });
    expect(() =>
      datosDeAjuste({
        vinculo_id: VINCULO,
        fecha: '2026-11-13',
        tipo: 'check_out',
        hora: '2026-11-13T13:00:00',
        motivo: 'Olvidó marcar',
      })
    ).toThrow(HrmError);
    expect(() =>
      datosDeAjuste({
        vinculo_id: VINCULO,
        fecha: '2026-11-13',
        tipo: 'entrada',
        hora: '2026-11-13T13:00:00Z',
        motivo: 'Olvidó marcar',
      })
    ).toThrow(HrmError);
    expect(() =>
      datosDeAjuste({
        vinculo_id: VINCULO,
        fecha: '2026-11-13',
        tipo: 'check_in',
        hora: '2026-11-13T13:00:00Z',
        motivo: 'no',
      })
    ).toThrow(HrmError);
  });
});

describe('lecturas', () => {
  test('hoy: el actor y la organización salen de la sesión; la sede viaja a la RPC', async () => {
    rpc.mockResolvedValue({ data: { filas: [] }, error: null });
    const r = await getHoy(new Request('http://x/api/hrm/asistencia/hoy?sede=4&organization_id=999'), SIN_PARAMS);
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_hr_asistencia_hoy', {
      p_actor: CTX.userId,
      p_org: 135,
      p_branch: 4,
    });
  });
  test('sin alcance → 403 (la base responde 42501)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'sin_permiso' },
    });
    const r = await getHoy(new Request('http://x/api/hrm/asistencia/hoy'), SIN_PARAMS);
    expect(r.status).toBe(403);
  });
  test('la hoja de una persona valida el vínculo y el rango antes de tocar la base', async () => {
    const r1 = await getHoja(new Request('http://x/api/hrm/asistencia/hojas/x?desde=2026-11-01&hasta=2026-11-15'), {
      params: Promise.resolve({ vinculo: 'x' }),
    });
    expect(r1.status).toBe(400);
    const r2 = await getHoja(new Request('http://x?desde=2026-11-15&hasta=2026-11-01'), { params: Promise.resolve({ vinculo: VINCULO }) });
    expect(r2.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  test('topes: un parámetro faltante no se inventa → 422', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'parametro_es_tabla: x' },
    });
    const r = await getTopes(new Request('http://x?desde=2026-11-01&hasta=2026-11-15'), SIN_PARAMS);
    expect(r.status).toBe(422);
  });
});

describe('ajuste de marca', () => {
  test('nace pendiente por la RPC con el actor de la sesión', async () => {
    rpc.mockResolvedValue({
      data: { id: 'a', estado: 'pendiente', instancia_id: INSTANCIA },
      error: null,
    });
    const r = await postAjuste(
      json('http://x/api/hrm/asistencia/ajustes', {
        vinculo_id: VINCULO,
        fecha: '2026-11-13',
        tipo: 'check_out',
        hora: '2026-11-13T18:00:00Z',
        motivo: 'Olvidó marcar la salida',
      }),
      SIN_PARAMS
    );
    expect(r.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('fn_hr_ajuste_solicitar', expect.objectContaining({ p_actor: CTX.userId, p_org: 135 }));
  });
  test('una organización ajena en el body → 403 y no toca la base', async () => {
    const r = await postAjuste(
      json('http://x/api/hrm/asistencia/ajustes', {
        organization_id: 999,
        vinculo_id: VINCULO,
        fecha: '2026-11-13',
        tipo: 'check_out',
        hora: '2026-11-13T18:00:00Z',
        motivo: 'Olvidó marcar la salida',
      }),
      SIN_PARAMS
    );
    expect(r.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('decidir novedades', () => {
  test('cada decisión va con la sesión del usuario y, al aprobar, se aplican los ajustes', async () => {
    rpcSesion.mockResolvedValue({
      data: { id: INSTANCIA, status: 'aprobada' },
      error: null,
    });
    rpc.mockResolvedValue({ data: [], error: null });
    const r = await postDecidir(
      json('http://x', {
        instancias: [INSTANCIA, INSTANCIA],
        decision: 'aprobar',
      }),
      SIN_PARAMS
    );
    expect(await r.json()).toEqual({ decididas: 1, fallidas: [] });
    expect(rpcSesion).toHaveBeenCalledWith('fn_hr_aprobacion_decidir', {
      p_instancia: INSTANCIA,
      p_decision: 'aprobar',
      p_comentario: null,
    });
    expect(rpc).toHaveBeenCalledWith('fn_hr_ajustes_aplicar', {
      p_actor: CTX.userId,
      p_org: 135,
    });
  });
  test('rechazar sin motivo → 422; lo propio queda como fallida, no como error', async () => {
    const r1 = await postDecidir(json('http://x', { instancias: [INSTANCIA], decision: 'rechazar' }), SIN_PARAMS);
    expect(r1.status).toBe(422);
    rpcSesion.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'no_puede_aprobar_lo_propio' },
    });
    const r2 = await postDecidir(
      json('http://x', {
        instancias: [INSTANCIA],
        decision: 'rechazar',
        comentario: 'No estaba autorizado',
      }),
      SIN_PARAMS
    );
    expect(await r2.json()).toEqual({
      decididas: 0,
      fallidas: [{ instancia_id: INSTANCIA, codigo: 'no_puede_aprobar_lo_propio' }],
    });
  });
});

describe('lista para nómina', () => {
  test('reclasifica los días sin clasificar y vuelve a intentar', async () => {
    const pend = {
      timesheet_id: 't',
      employment_id: VINCULO,
      fecha: '2026-11-13',
      motivo: 'sin_clasificar',
    };
    rpc.mockImplementation((nombre: string) => {
      if (nombre === 'fn_hr_ajustes_aplicar') return Promise.resolve({ data: [], error: null });
      if (nombre === 'fn_hr_jornada_lista_nomina') {
        const llamadas = rpc.mock.calls.filter((c) => c[0] === 'fn_hr_jornada_lista_nomina').length;
        return Promise.resolve({
          data: llamadas === 1 ? { listas: 3, pendientes: [pend] } : { listas: 1, pendientes: [] },
          error: null,
        });
      }
      if (nombre === 'fn_hr_jornada_insumos') return Promise.resolve({ data: { estado: 'approved' }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const r = await postLista(json('http://x', { desde: '2026-11-01', hasta: '2026-11-15' }), SIN_PARAMS);
    expect(await r.json()).toEqual({ listas: 4, pendientes: [] });
    expect(rpc.mock.calls.filter((c) => c[0] === 'fn_hr_jornada_lista_nomina')).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith('fn_hr_jornada_insumos', expect.objectContaining({ p_employment: VINCULO, p_fecha: '2026-11-13' }));
  });
  test('vínculos mal formados → 400 sin tocar la base', async () => {
    const r = await postLista(
      json('http://x', {
        desde: '2026-11-01',
        hasta: '2026-11-15',
        vinculos: ['x'],
      }),
      SIN_PARAMS
    );
    expect(r.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
