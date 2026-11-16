/**
 * HRM fase 0 (ADR-001): servicios y route handlers.
 *
 * Las reglas de permisos, vigencias, aprobaciones y marcación viven en la base
 * y se probaron por el MCP dentro de transacciones que se deshacen (ADR-001 §13).
 * Aquí se prueba la capa de servidor: que el actor y la organización salgan de
 * la sesión y nunca del body, que el registro de accesos reciba la IP original,
 * que los errores de la base se traduzcan a HTTP y que nada sensible se decida
 * en el cliente.
 */

const rpc = jest.fn();
const createSignedUrl = jest.fn();
const createSignedUploadUrl = jest.fn();
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({
    rpc,
    storage: { from: () => ({ createSignedUrl, createSignedUploadUrl }) },
  }),
}));

const CTX = { userId: '11111111-1111-4111-8111-111111111111', organizationId: 135 };
const PERSONA = '22222222-2222-4222-8222-222222222222';
const PETICION = { ip: '203.0.113.7', userAgent: 'jest', ruta: '/api/hrm/personas/x/datos/banco' };

// withOrg real exige cookies de Next: se dobla para inyectar la sesión.
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

import {
  HrmError,
  contextoDePeticion,
  errorDeRpc,
  esFechaPlana,
  esGrupoDatos,
  rutaDocumento,
} from '../tipos';
import { guardarDatosSensibles, leerDatosSensibles } from '../datosSensiblesService.server';
import { urlDescarga, crearUrlSubida } from '../documentosService.server';
import { decidir } from '../aprobacionesService.server';
import { tramosParametro } from '../parametrosService.server';
import { registrarCambio } from '../historialService.server';

beforeEach(() => {
  rpc.mockReset();
  createSignedUrl.mockReset();
  createSignedUploadUrl.mockReset();
});

describe('tipos', () => {
  test('grupos de datos: los seis del ADR y nada más', () => {
    for (const g of ['identificacion', 'salario_pago', 'banco', 'salud', 'disciplinario', 'sst']) expect(esGrupoDatos(g)).toBe(true);
    expect(esGrupoDatos('nomina')).toBe(false);
    expect(esGrupoDatos(undefined)).toBe(false);
  });

  test('fecha plana: valida el calendario, no la zona', () => {
    expect(esFechaPlana('2026-07-15')).toBe(true);
    expect(esFechaPlana('2026-02-30')).toBe(false);
    expect(esFechaPlana('2026-7-15')).toBe(false);
    expect(esFechaPlana('2026-07-15T00:00:00Z')).toBe(false);
  });

  test('ruta del documento con la forma que exige la base', () => {
    expect(rutaDocumento(135, 'salud', PERSONA, 'abc', 'application/pdf')).toBe(`135/salud/${PERSONA}/abc.pdf`);
    expect(rutaDocumento(135, 'banco', PERSONA, 'abc', 'image/png')).toBe(`135/banco/${PERSONA}/abc.png`);
  });

  test('errores de la base a HTTP', () => {
    expect(errorDeRpc({ code: '42501', message: 'sin_permiso' })).toMatchObject({ status: 403, code: 'sin_permiso' });
    expect(errorDeRpc({ code: '42501', message: 'no_puede_aprobar_lo_propio' })).toMatchObject({ status: 403, code: 'no_puede_aprobar_lo_propio' });
    expect(errorDeRpc({ code: 'P0002', message: 'parametro_no_configurado: uvt' })).toMatchObject({ status: 404 });
    expect(errorDeRpc({ code: '22023', message: 'parametro_por_confirmar: smmlv en 2027-02-01' })).toMatchObject({
      status: 422,
      code: 'parametro_por_confirmar',
    });
    expect(errorDeRpc({ code: '23505', message: 'documento_duplicado: ya hay' })).toMatchObject({ status: 409, code: 'documento_duplicado' });
    const desconocido = errorDeRpc({ code: 'XX000', message: 'detalle interno de la base' });
    expect(desconocido.status).toBe(500);
    expect(desconocido.message).not.toContain('detalle interno');
  });

  test('contexto de la petición: primera IP de x-forwarded-for y agente', () => {
    const req = new Request('https://app.test/api/hrm/permisos?x=1', {
      headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1', 'user-agent': 'Navegador' },
    });
    expect(contextoDePeticion(req)).toEqual({ ip: '198.51.100.4', userAgent: 'Navegador', ruta: '/api/hrm/permisos' });
    const raro = new Request('https://app.test/x', { headers: { 'x-forwarded-for': '<script>' } });
    expect(contextoDePeticion(raro).ip).toBeNull();
  });
});

describe('datos sensibles por la service role con el actor de la sesión', () => {
  test('leer manda actor, organización e IP de la petición original', async () => {
    rpc.mockResolvedValue({ data: { grupo: 'banco', cuentas: [] }, error: null });
    await leerDatosSensibles(CTX, PERSONA, 'banco', PETICION);
    expect(rpc).toHaveBeenCalledWith('fn_hr_datos_sensibles_leer', {
      p_actor: CTX.userId,
      p_org: 135,
      p_person: PERSONA,
      p_grupo: 'banco',
      p_ip: '203.0.113.7',
      p_ua: 'jest',
      p_ruta: PETICION.ruta,
    });
  });

  test('sin permiso en la base → 403, y no se inventa el dato', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_permiso' } });
    await expect(leerDatosSensibles(CTX, PERSONA, 'salario_pago', PETICION)).rejects.toMatchObject({ status: 403, code: 'sin_permiso' });
  });

  test('el salario no se edita por aquí: va por el historial', async () => {
    await expect(guardarDatosSensibles(CTX, PERSONA, 'salario_pago', { x: 1 }, PETICION)).rejects.toMatchObject({ status: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('persona inválida no llega a la base', async () => {
    await expect(leerDatosSensibles(CTX, 'no-es-uuid', 'banco', PETICION)).rejects.toBeInstanceOf(HrmError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('documentos', () => {
  test('descarga: la base autoriza y registra; la URL dura 60 s', async () => {
    rpc.mockResolvedValue({ data: `135/salud/${PERSONA}/a.pdf`, error: null });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://firmada' }, error: null });
    const r = await urlDescarga(CTX, '33333333-3333-4333-8333-333333333333', PETICION);
    expect(rpc).toHaveBeenCalledWith('fn_hr_documento_autorizar_descarga', expect.objectContaining({ p_actor: CTX.userId, p_org: 135 }));
    expect(createSignedUrl).toHaveBeenCalledWith(`135/salud/${PERSONA}/a.pdf`, 60);
    expect(r).toEqual({ url: 'https://firmada', expiraEnSegundos: 60 });
  });

  test('descarga: una ruta de otra organización no se firma', async () => {
    rpc.mockResolvedValue({ data: `999/salud/${PERSONA}/a.pdf`, error: null });
    await expect(urlDescarga(CTX, '33333333-3333-4333-8333-333333333333', PETICION)).rejects.toMatchObject({ status: 404 });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  test('subida: sin permiso de edición no hay URL firmada', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(crearUrlSubida(CTX, { personaId: PERSONA, grupo: 'salud', mime: 'application/pdf', tamano: 1000 })).rejects.toMatchObject({
      status: 403,
    });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  test('subida: tipo o tamaño no permitidos se rechazan antes de la base', async () => {
    await expect(crearUrlSubida(CTX, { personaId: PERSONA, grupo: 'salud', mime: 'text/html', tamano: 10 })).rejects.toMatchObject({ status: 422 });
    await expect(
      crearUrlSubida(CTX, { personaId: PERSONA, grupo: 'salud', mime: 'application/pdf', tamano: 11 * 1024 * 1024 })
    ).rejects.toMatchObject({ status: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('aprobaciones, historial y parámetros con la sesión del usuario', () => {
  const sesion = { supabase: { rpc } as never, organizationId: 135 };

  test('una decisión distinta de aprobar/rechazar no llega a la base', async () => {
    await expect(decidir(sesion, '44444444-4444-4444-8444-444444444444', 'borrar' as never)).rejects.toMatchObject({ status: 422 });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('aprobar lo propio → 403 desde la base', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'no_puede_aprobar_lo_propio' } });
    await expect(decidir(sesion, '44444444-4444-4444-8444-444444444444', 'aprobar')).rejects.toMatchObject({
      status: 403,
      code: 'no_puede_aprobar_lo_propio',
    });
  });

  test('registrar cambio pasa la IP original para el registro del salario', async () => {
    rpc.mockResolvedValue({ data: { id: 'e', status: 'pendiente', approval_instance_id: 'i' }, error: null });
    await registrarCambio(
      sesion,
      { vinculoId: PERSONA, campo: 'salario', efectivoDesde: '2026-08-01', valor: 2500000, motivo: 'Ajuste anual' },
      PETICION
    );
    expect(rpc).toHaveBeenCalledWith('fn_hr_registrar_cambio', {
      p_employment: PERSONA,
      p_campo: 'salario',
      p_efectivo: '2026-08-01',
      p_valor: 2500000,
      p_motivo: 'Ajuste anual',
      p_contexto: { ip: '203.0.113.7', user_agent: 'jest', ruta: PETICION.ruta },
    });
  });

  test('tramos de parámetro: la organización sale de la sesión', async () => {
    rpc.mockResolvedValue({
      data: [
        { desde: '2026-07-01', hasta: '2026-07-14', valor: '44', valor_json: null, origen: 'plataforma', status: 'vigente', fuente: 'Ley 2101' },
        { desde: '2026-07-15', hasta: '2026-07-31', valor: '42', valor_json: null, origen: 'plataforma', status: 'vigente', fuente: 'Ley 2101' },
      ],
      error: null,
    });
    const t = await tramosParametro(sesion, 'jornada_max_semanal', '2026-07-01', '2026-07-31');
    expect(rpc).toHaveBeenCalledWith('fn_hr_parametro_tramos', {
      p_org: 135,
      p_code: 'jornada_max_semanal',
      p_desde: '2026-07-01',
      p_hasta: '2026-07-31',
    });
    expect(t.map((x) => x.valor)).toEqual([44, 42]);
  });
});

describe('route handlers', () => {
  test('PUT datos con otra organización en el body → 403 y no toca la base', async () => {
    const { PUT } = await import('@/app/api/hrm/personas/[id]/datos/[grupo]/route');
    const req = new Request(`https://app.test/api/hrm/personas/${PERSONA}/datos/banco`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organization_id: 999, cuentas: [] }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: PERSONA, grupo: 'banco' }) });
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('GET datos de un grupo inexistente → 400', async () => {
    const { GET } = await import('@/app/api/hrm/personas/[id]/datos/[grupo]/route');
    const res = await GET(new Request(`https://app.test/api/hrm/personas/${PERSONA}/datos/nomina`), {
      params: Promise.resolve({ id: PERSONA, grupo: 'nomina' }),
    });
    expect(res.status).toBe(400);
  });

  test('GET datos: el actor es el de la sesión y la IP la de la petición', async () => {
    rpc.mockResolvedValue({ data: { grupo: 'identificacion' }, error: null });
    const { GET } = await import('@/app/api/hrm/personas/[id]/datos/[grupo]/route');
    const res = await GET(
      new Request(`https://app.test/api/hrm/personas/${PERSONA}/datos/identificacion`, { headers: { 'x-forwarded-for': '198.51.100.9' } }),
      { params: Promise.resolve({ id: PERSONA, grupo: 'identificacion' }) }
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_hr_datos_sensibles_leer', expect.objectContaining({ p_actor: CTX.userId, p_org: 135, p_ip: '198.51.100.9' }));
  });

  test('POST aprobación con acción inválida → 422', async () => {
    const { POST } = await import('@/app/api/hrm/aprobaciones/[id]/route');
    const res = await POST(
      new Request('https://app.test/api/hrm/aprobaciones/x', { method: 'POST', body: JSON.stringify({ accion: 'forzar' }) }),
      { params: Promise.resolve({ id: '44444444-4444-4444-8444-444444444444' }) }
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});
