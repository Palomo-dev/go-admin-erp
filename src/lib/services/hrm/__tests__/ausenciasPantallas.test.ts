/**
 * Rutas de las pantallas de Ausencias (Figma 20.13 y 20.14, migración hrm_f2_06).
 *
 * Quién ve qué (decisión 2) lo decide la base y se probó por el MCP; aquí se prueba
 * la capa de servidor: la organización y el actor salen de la sesión, una
 * organización ajena en el body o en la query da 403 sin tocar la base, y los datos
 * del formulario se validan antes de la RPC.
 */

const rpc = jest.fn();
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({ rpc }),
}));

const CTX = { userId: '11111111-1111-4111-8111-111111111111', organizationId: 135 };
const ID = '55555555-5555-4555-8555-555555555555';
const DOC = '66666666-6666-4666-8666-666666666666';
const SIN_PARAMS = { params: Promise.resolve({}) };

jest.mock('@/lib/utils/orgContext', () => {
  const real = jest.requireActual('@/lib/security/organizationBody');
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError,
    readOrgBody: real.readOrgBody,
    withOrg:
      (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
      (req: Request, rp: unknown) =>
        handler({ ...CTX, supabase: { rpc } }, req, rp),
  };
});

import { datosDeAusencia } from '../ausenciasService.server';

const json = (cuerpo: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: {}, error: null });
});

describe('datos del formulario', () => {
  test('permiso por horas: un solo día y la hora final después de la inicial', () => {
    expect(datosDeAusencia({ tipo: 'LRE', desde: '2026-11-19', hasta: '2026-11-19', horas: { inicio: '08:00', fin: '10:00' } }).horas).toEqual({ inicio: '08:00', fin: '10:00' });
    expect(() => datosDeAusencia({ tipo: 'LRE', desde: '2026-11-19', hasta: '2026-11-20', horas: { inicio: '08:00', fin: '10:00' } })).toThrow('horas_invalidas');
    expect(() => datosDeAusencia({ tipo: 'LRE', desde: '2026-11-19', hasta: '2026-11-19', horas: { inicio: '10:00', fin: '08:00' } })).toThrow('horas_invalidas');
    expect(() => datosDeAusencia({ tipo: 'LRE', desde: '2026-11-19', hasta: '2026-11-19', horas: { inicio: '8', fin: '10:00' } })).toThrow('horas_invalidas');
  });
  test('fecha probable de parto y «se repone»', () => {
    const d = datosDeAusencia({ tipo: 'LMA', desde: '2026-11-02', hasta: '2027-03-07', fecha_parto: '2026-11-09', se_repone: true });
    expect(d).toMatchObject({ fecha_parto: '2026-11-09', se_repone: true });
    expect(() => datosDeAusencia({ tipo: 'LMA', desde: '2026-11-02', hasta: '2027-03-07', fecha_parto: '9/11/2026' })).toThrow('fecha_invalida');
  });
});

describe('rutas', () => {
  test('GET ?seccion= lista con el actor y la organización de la sesión', async () => {
    const { GET } = await import('@/app/api/hrm/ausencias/route');
    const res = await GET(new Request('https://app.test/api/hrm/ausencias?seccion=vacaciones&desde=2026-12-01&hasta=2026-12-31&propias=1'), SIN_PARAMS);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_hr_ausencias_listar', {
      p_actor: CTX.userId,
      p_org: 135,
      p_seccion: 'vacaciones',
      p_desde: '2026-12-01',
      p_hasta: '2026-12-31',
      p_solo_propias: true,
    });
  });

  test('GET con una sección inventada → 400 sin tocar la base', async () => {
    const { GET } = await import('@/app/api/hrm/ausencias/route');
    const res = await GET(new Request('https://app.test/api/hrm/ausencias?seccion=salarios&desde=2026-12-01&hasta=2026-12-31'), SIN_PARAMS);
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('la base niega la lista (ni RR. HH. ni jefe) → 403', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_permiso' } });
    const { GET } = await import('@/app/api/hrm/ausencias/route');
    const res = await GET(new Request('https://app.test/api/hrm/ausencias?seccion=incapacidades&desde=2026-11-01&hasta=2026-11-30'), SIN_PARAMS);
    expect(res.status).toBe(403);
  });

  test('POST registra con fn_hr_ausencia_registrar y sin organización del cliente', async () => {
    const { POST } = await import('@/app/api/hrm/ausencias/route');
    const res = await POST(new Request('https://app.test/api/hrm/ausencias', json({ tipo: 'LRE', desde: '2026-11-19', hasta: '2026-11-19', horas: { inicio: '08:00', fin: '10:00' } })), SIN_PARAMS);
    expect(res.status).toBe(201);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('fn_hr_ausencia_registrar');
    expect(args).toMatchObject({ p_actor: CTX.userId, p_org: 135 });
    expect(args.p_datos).not.toHaveProperty('organization_id');
  });

  test('simular con organización ajena en el body → 403 sin tocar la base', async () => {
    const { POST } = await import('@/app/api/hrm/ausencias/simular/route');
    const res = await POST(new Request('https://app.test/api/hrm/ausencias/simular', json({ tipo: 'VAC', desde: '2026-12-21', hasta: '2027-01-04', organizationId: 999 })), SIN_PARAMS);
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('simular pasa los datos validados a fn_hr_ausencia_simular', async () => {
    const { POST } = await import('@/app/api/hrm/ausencias/simular/route');
    await POST(new Request('https://app.test/api/hrm/ausencias/simular', json({ tipo: 'VAC', desde: '2026-12-21', hasta: '2027-01-04' })), SIN_PARAMS);
    expect(rpc).toHaveBeenCalledWith('fn_hr_ausencia_simular', { p_actor: CTX.userId, p_org: 135, p_datos: { tipo: 'VAC', desde: '2026-12-21', hasta: '2027-01-04' } });
  });

  test('detalle: id inválido → 400; ausencia de otra organización → 404', async () => {
    const { GET } = await import('@/app/api/hrm/ausencias/[id]/route');
    expect((await GET(new Request('https://app.test/api/hrm/ausencias/x'), { params: Promise.resolve({ id: 'x' }) })).status).toBe(400);
    rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'hr: la ausencia no existe' } });
    expect((await GET(new Request(`https://app.test/api/hrm/ausencias/${ID}`), { params: Promise.resolve({ id: ID }) })).status).toBe(404);
  });

  test('interrumpir exige último día y motivo', async () => {
    const { POST } = await import('@/app/api/hrm/ausencias/[id]/interrumpir/route');
    const sinMotivo = await POST(new Request('https://app.test/x', json({ ultimo_dia: '2026-12-24' })), { params: Promise.resolve({ id: ID }) });
    expect(sinMotivo.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    await POST(new Request('https://app.test/x', json({ ultimo_dia: '2026-12-24', motivo: 'Necesidad del servicio' })), { params: Promise.resolve({ id: ID }) });
    expect(rpc).toHaveBeenCalledWith('fn_hr_ausencia_interrumpir', {
      p_actor: CTX.userId,
      p_org: 135,
      p_id: ID,
      p_ultimo_dia: '2026-12-24',
      p_motivo: 'Necesidad del servicio',
    });
  });

  test('soporte: enlaza el documento ya subido; un id inválido no llega a la base', async () => {
    const { POST } = await import('@/app/api/hrm/ausencias/[id]/soporte/route');
    expect((await POST(new Request('https://app.test/x', json({ documento_id: 'nada' })), { params: Promise.resolve({ id: ID }) })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    await POST(new Request('https://app.test/x', json({ documento_id: DOC })), { params: Promise.resolve({ id: ID }) });
    expect(rpc).toHaveBeenCalledWith('fn_hr_ausencia_soporte', { p_actor: CTX.userId, p_org: 135, p_id: ID, p_documento: DOC });
  });
});
