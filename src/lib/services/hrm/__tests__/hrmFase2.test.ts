/**
 * HRM fase 2 (ADR-002): marcación, motor de horas en el servidor, turnos,
 * ausencias y novedades.
 *
 * Las reglas de permisos, el QR, las vigencias y la salud viven en la base y se
 * probaron por el MCP en transacciones que se deshacen (ADR-002 §11). Aquí se
 * prueba la capa de servidor: la organización y el actor salen de la sesión, el
 * QR y la ubicación viajan a la RPC sin hora del cliente, el motor clasifica con
 * los insumos de la base y guarda con su versión, y un intento sin permiso sobre
 * salud queda registrado.
 */

const rpc = jest.fn();
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({ rpc }),
}));

const CTX = { userId: '11111111-1111-4111-8111-111111111111', organizationId: 135 };
const VINCULO = '22222222-2222-4222-8222-222222222222';
const RELOJ = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'a'.repeat(64);
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

import { leerQr, datosDeMarcacion, MarcacionInvalida } from '@/lib/hrm/jornada/marcacion';
import { recalcularDia, domingoDeLaSemana } from '../jornadaService.server';
import { datosDeAusencia, datosDeNovedad } from '../ausenciasService.server';
import type { InsumosJornada } from '@/lib/hrm/jornada/insumos';

const qr = (org: unknown = 135, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'attendance', device_id: RELOJ, token: TOKEN, org, ...extra });

/** Insumos de un turno nocturno de domingo 28 a lunes festivo 29-jun-2026 (Bogotá). */
function insumosNoche(version = 4): InsumosJornada {
  const tramo = (valor: number, desde = '2026-06-27', hasta: string | null = null) => ({ desde, hasta, valor, estado: 'vigente' });
  return {
    employment_id: VINCULO,
    fecha: '2026-06-28',
    zona: 'America/Bogota',
    version,
    estado: 'open',
    fuente: 'marcaciones',
    eventos: [
      { tipo: 'check_in', hora: '2026-06-29T03:00:00+00:00' },
      { tipo: 'check_out', hora: '2026-06-29T11:00:00+00:00' },
    ],
    turno: null,
    ajustes: { dia_descanso: 0, exento_horas_extra: false, jornada_flexible: false, mecanismos: ['app', 'qr'] },
    contrato_horas_semana: null,
    festivos: ['2026-06-29'],
    parametros: {
      nocturno_hora_inicio: [tramo(19)],
      nocturno_hora_fin: [tramo(6)],
      recargo_nocturno: [tramo(0.35)],
      recargo_dominical_festivo: [tramo(0.8, '2026-06-27', '2026-06-30'), tramo(0.9, '2026-07-01')],
      recargo_extra_diurna: [tramo(0.25)],
      recargo_extra_nocturna: [tramo(0.75)],
      jornada_max_semanal: [tramo(44)],
      jornada_max_diaria: [tramo(8)],
      jornada_flexible_max_diaria: [tramo(9)],
      divisor_hora_mensual: [tramo(220)],
      horas_extra_max_dia: [tramo(2)],
      horas_extra_max_semana: [tramo(12)],
    },
    semana: { desde: '2026-06-22', ordinarias_previas: 0, extras_previas: 0 },
    tolerancia_tardanza: 0,
  };
}

beforeEach(() => {
  rpc.mockReset();
});

describe('cuerpo de la marcación', () => {
  test('el QR trae punto, token y organización', () => {
    expect(leerQr(qr())).toEqual({ relojId: RELOJ, token: TOKEN, org: 135 });
    expect(leerQr(qr('135')).org).toBe(135);
  });

  test('un QR que no es de marcación o está mal formado se rechaza', () => {
    expect(() => leerQr('no es json')).toThrow(MarcacionInvalida);
    expect(() => leerQr(JSON.stringify({ type: 'menu', device_id: RELOJ, token: TOKEN }))).toThrow('qr_no_es_de_marcacion');
    expect(() => leerQr(JSON.stringify({ type: 'attendance', device_id: 'x', token: TOKEN }))).toThrow('qr_invalido');
    expect(() => leerQr(JSON.stringify({ type: 'attendance', device_id: RELOJ, token: "' or 1=1" }))).toThrow('qr_invalido');
  });

  test('un QR de otra organización se rechaza antes de llegar a la base', () => {
    expect(() => datosDeMarcacion({ qr: qr(999) }, 135)).toThrow('qr_de_otra_organizacion');
  });

  test('la hora, el vínculo y la organización del cliente se descartan', () => {
    const d = datosDeMarcacion(
      { qr: qr(), event_at: '2020-01-01T00:00:00Z', hora: '2020-01-01', employment_id: VINCULO, ubicacion: { lat: 4.6, lng: -74.08, accuracy: 12 } },
      135
    );
    expect(d).toEqual({
      metodo: 'qr',
      reloj_id: RELOJ,
      token: TOKEN,
      tipo: undefined,
      ubicacion: { lat: 4.6, lng: -74.08, precision: 12 },
      dispositivo: undefined,
    });
    expect(JSON.stringify(d)).not.toMatch(/2020|employment/);
  });

  test('una ubicación imposible no viaja', () => {
    expect(datosDeMarcacion({ metodo: 'app', ubicacion: { lat: 200, lng: 0 } }, 135).ubicacion).toBeUndefined();
  });

  test('sin QR ni método app no hay marcación', () => {
    expect(() => datosDeMarcacion({}, 135)).toThrow('metodo_invalido');
  });
});

describe('POST /api/hrm/marcacion', () => {
  test('marca con el actor y la organización de la sesión, y clasifica el día', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_hr_marcar') {
        return {
          data: { evento_id: 'e1', tipo: 'check_out', hora: '2026-06-29T11:00:00Z', fecha_trabajo: '2026-06-28', employment_id: VINCULO, modo: 'presencial', ubicacion_guardada: false, reloj: 'Puerta' },
          error: null,
        };
      }
      if (fn === 'fn_hr_jornada_insumos') return { data: insumosNoche(), error: null };
      if (fn === 'fn_hr_jornada_guardar') return { data: { timesheet_id: 't1', minutos_extra: 0, novedades: [] }, error: null };
      return { data: null, error: { code: 'XX000', message: fn } };
    });
    const { POST } = await import('@/app/api/hrm/marcacion/route');
    const res = await POST(
      new Request('https://app.test/api/hrm/marcacion', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.20', 'user-agent': 'jest' },
        body: JSON.stringify({ qr: qr(), event_at: '2020-01-01T00:00:00Z' }),
      }),
      SIN_PARAMS
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_hr_marcar', {
      p_actor: CTX.userId,
      p_org: 135,
      p_datos: expect.objectContaining({ metodo: 'qr', reloj_id: RELOJ, token: TOKEN }),
      p_ip: '198.51.100.20',
      p_ua: 'jest',
    });
    const enviado = rpc.mock.calls.find((c) => c[0] === 'fn_hr_marcar')![1].p_datos;
    expect(enviado).not.toHaveProperty('event_at');
    const guardar = rpc.mock.calls.find((c) => c[0] === 'fn_hr_jornada_guardar')![1];
    expect(guardar).toMatchObject({ p_actor: CTX.userId, p_org: 135, p_employment: VINCULO, p_fecha: '2026-06-28', p_version: 4 });
    expect(guardar.p_resultado.lineas).toEqual([
      expect.objectContaining({ categoria: 'dom_nocturna', fecha_local: '2026-06-28', minutos: 120, recargo: 1.15, divisor: 220 }),
      expect.objectContaining({ categoria: 'dom_nocturna', fecha_local: '2026-06-29', minutos: 360, recargo: 1.15, divisor: 220 }),
    ]);
    const cuerpo = await res.json();
    expect(cuerpo.jornada).toMatchObject({ estado: 'clasificado', timesheet_id: 't1' });
  });

  test('un QR de otra organización → 403 y no toca la base', async () => {
    const { POST } = await import('@/app/api/hrm/marcacion/route');
    const res = await POST(new Request('https://app.test/api/hrm/marcacion', { method: 'POST', body: JSON.stringify({ qr: qr(999) }) }), SIN_PARAMS);
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('una organización ajena en el body → 403 y no toca la base', async () => {
    const { POST } = await import('@/app/api/hrm/marcacion/route');
    const res = await POST(
      new Request('https://app.test/api/hrm/marcacion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metodo: 'app', organization_id: 999 }),
      }),
      SIN_PARAMS
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('el QR que la base rechaza (token o vencimiento) responde 403 con su código', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'qr_vencido: el código ya venció' } });
    const { POST } = await import('@/app/api/hrm/marcacion/route');
    const res = await POST(new Request('https://app.test/api/hrm/marcacion', { method: 'POST', body: JSON.stringify({ qr: qr() }) }), SIN_PARAMS);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'qr_vencido' });
  });

  test('si la clasificación no se puede hacer, la marcación igual queda y el día queda pendiente', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_hr_marcar') return { data: { evento_id: 'e1', tipo: 'check_in', hora: 'x', fecha_trabajo: '2026-06-28', employment_id: VINCULO }, error: null };
      return { data: null, error: { code: '42501', message: 'sin_permiso' } };
    });
    const { POST } = await import('@/app/api/hrm/marcacion/route');
    const res = await POST(new Request('https://app.test/api/hrm/marcacion', { method: 'POST', body: JSON.stringify({ metodo: 'app' }) }), SIN_PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).jornada).toEqual({ estado: 'pendiente', motivo: 'sin_permiso' });
  });
});

describe('motor de horas en el servidor', () => {
  test('si llegan marcaciones durante el cálculo, vuelve a pedir los insumos y guarda con la versión nueva', async () => {
    let version = 4;
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'fn_hr_jornada_insumos') return { data: insumosNoche(version), error: null };
      if (fn === 'fn_hr_jornada_guardar') {
        if (args.p_version === 4) {
          version = 5;
          return { data: null, error: { code: '40001', message: 'jornada_cambio_durante_calculo' } };
        }
        return { data: { timesheet_id: 't1', minutos_extra: 0 }, error: null };
      }
      return { data: null, error: null };
    });
    const r = await recalcularDia(CTX, VINCULO, '2026-06-28');
    expect(r.estado).toBe('clasificado');
    expect(rpc.mock.calls.filter((c) => c[0] === 'fn_hr_jornada_guardar').map((c) => c[1].p_version)).toEqual([4, 5]);
  });

  test('un parámetro por confirmar no se calcula: 422 parametro_no_configurado y nada se guarda', async () => {
    const ins = insumosNoche();
    ins.parametros.divisor_hora_mensual = [{ desde: '2026-06-27', hasta: null, valor: 220, estado: 'por_confirmar' }];
    rpc.mockResolvedValue({ data: ins, error: null });
    await expect(recalcularDia(CTX, VINCULO, '2026-06-28')).rejects.toMatchObject({ status: 422, code: 'parametro_no_configurado' });
    expect(rpc.mock.calls.some((c) => c[0] === 'fn_hr_jornada_guardar')).toBe(false);
  });

  test('un día listo para nómina no se reclasifica', async () => {
    rpc.mockResolvedValue({ data: { ...insumosNoche(), estado: 'approved' }, error: null });
    expect(await recalcularDia(CTX, VINCULO, '2026-06-28')).toEqual({ fecha: '2026-06-28', estado: 'cerrado' });
  });

  test('el recálculo sigue hasta el domingo de la semana', () => {
    expect(domingoDeLaSemana('2026-07-15')).toBe('2026-07-19');
    expect(domingoDeLaSemana('2026-07-19')).toBe('2026-07-19');
  });
});

describe('ausencias y novedades', () => {
  test('la solicitud no lleva organización y el diagnóstico va aparte', () => {
    const d = datosDeAusencia({
      tipo: 'INC_EG',
      desde: '2026-08-01',
      hasta: '2026-08-03',
      organization_id: 999,
      salud: { diagnostico_codigo: 'J06.9', diagnostico: 'Infección respiratoria', entidad: 'EPS' },
    });
    expect(d).not.toHaveProperty('organization_id');
    expect(d.salud).toMatchObject({ diagnostico_codigo: 'J06.9' });
  });

  test('fechas al revés, tipo inválido o CIE-10 mal formado → 400', () => {
    expect(() => datosDeAusencia({ tipo: 'VAC', desde: '2026-08-03', hasta: '2026-08-01' })).toThrow('fechas_invalidas');
    expect(() => datosDeAusencia({ tipo: 'vac; drop', desde: '2026-08-01', hasta: '2026-08-01' })).toThrow('tipo_invalido');
    expect(() =>
      datosDeAusencia({ tipo: 'INC_EG', desde: '2026-08-01', hasta: '2026-08-01', salud: { diagnostico_codigo: 'gripa' } })
    ).toThrow('diagnostico_invalido');
  });

  test('POST /api/hrm/ausencias con organización ajena → 403', async () => {
    const { POST } = await import('@/app/api/hrm/ausencias/route');
    const res = await POST(
      new Request('https://app.test/api/hrm/ausencias', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'VAC', desde: '2026-12-21', hasta: '2027-01-12', organizationId: 999 }),
      }),
      SIN_PARAMS
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('un jefe sin permiso de salud pide el diagnóstico: 403 y el intento queda en el registro', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_hr_ausencia_detalle_salud') return { data: null, error: { code: '42501', message: 'sin_permiso' } };
      return { data: null, error: null };
    });
    const id = '55555555-5555-4555-8555-555555555555';
    const { GET } = await import('@/app/api/hrm/ausencias/[id]/salud/route');
    const res = await GET(new Request(`https://app.test/api/hrm/ausencias/${id}/salud`, { headers: { 'x-forwarded-for': '203.0.113.5' } }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith(
      'fn_hr_registrar_intento',
      expect.objectContaining({ p_actor: CTX.userId, p_org: 135, p_grupo: 'salud', p_ip: '203.0.113.5' })
    );
  });

  test('novedad: la contraparte del cambio de turno viaja como vínculo y la acción se valida', () => {
    const otro = '66666666-6666-4666-8666-666666666666';
    expect(datosDeNovedad({ accion: 'cambio_turno', asignacion_id: VINCULO, con_vinculo_id: otro })).toEqual({
      accion: 'cambio_turno',
      asignacion_id: VINCULO,
      con_employment_id: otro,
    });
    expect(() => datosDeNovedad({ accion: 'aprobar' })).toThrow('accion_invalida');
    expect(() => datosDeNovedad({ accion: 'justificar', novedad_id: 'x' })).toThrow('novedad_id_invalido');
  });
});

describe('turnos', () => {
  test('publicar solo acepta las alertas con true explícito', async () => {
    rpc.mockResolvedValue({ data: { bloqueos: [], alertas: [{ codigo: 'extra_planeada' }], publicado: false, requiere_confirmacion: true }, error: null });
    const { POST } = await import('@/app/api/hrm/turnos/publicar/route');
    const res = await POST(
      new Request('https://app.test/api/hrm/turnos/publicar', {
        method: 'POST',
        body: JSON.stringify({ desde: '2026-07-13', hasta: '2026-07-19', aceptar_alertas: 'si' }),
      }),
      SIN_PARAMS
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_hr_turnos_publicar', expect.objectContaining({ p_actor: CTX.userId, p_org: 135, p_aceptar_alertas: false }));
  });

  test('un rango al revés → 400 sin tocar la base', async () => {
    const { POST } = await import('@/app/api/hrm/turnos/validar/route');
    const res = await POST(
      new Request('https://app.test/api/hrm/turnos/validar', { method: 'POST', body: JSON.stringify({ desde: '2026-07-19', hasta: '2026-07-13' }) }),
      SIN_PARAMS
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
