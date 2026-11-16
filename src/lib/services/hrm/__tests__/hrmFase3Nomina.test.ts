/**
 * HRM fase 3 (ADR-003): nómina en el servidor.
 *
 * Las reglas de permisos, la bandera hr_payroll_enabled, el bloqueo de cierre, la
 * inmutabilidad, el pago en Tesorería y los asientos viven en la base y se probaron
 * por el MCP en transacciones que se deshacen (ADR-003 §9). El cálculo se prueba en
 * src/__tests__/timezone/motorNominaHrm.test.ts. Aquí: la organización y el actor
 * salen de la sesión, los insumos de la base pasan por el motor y se guardan con su
 * huella, un período cerrado no se recalcula, el ajuste usa las reglas originales y
 * el archivo del banco no sale con cuentas malas.
 */

const rpc = jest.fn();
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({ rpc }),
}));

const sesionRpc = jest.fn();
const CTX = { userId: '11111111-1111-4111-8111-111111111111', organizationId: 135 };
const PERIODO = '33333333-3333-4333-8333-333333333333';
const VINCULO = '22222222-2222-4222-8222-222222222222';

jest.mock('@/lib/utils/orgContext', () => {
  const real = jest.requireActual('@/lib/security/organizationBody');
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError,
    readOrgBody: real.readOrgBody,
    withOrg:
      (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
      (req: Request, rp: unknown) =>
        handler({ ...CTX, supabase: { rpc: sesionRpc } }, req, rp),
  };
});

import { PARAMETROS_2026, SMMLV_2026 } from '@/__tests__/timezone/nominaFixture';
import { CATALOGO_BASE } from '@/lib/hrm/nomina/conceptos';
import { entradaDesdeInsumos, preliquidarDesdeInsumos, ajusteDesdeInsumos, sinParametros, type InsumosNomina, type EmpleadoInsumo } from '@/lib/hrm/nomina/insumos';
import { generarArchivoBanco, campoCsv, type FilaPagoBanco } from '@/lib/hrm/nomina/archivoBanco';
import { POST as preliquidarRuta } from '@/app/api/hrm/nomina/periodos/[id]/preliquidar/route';
import { POST as cerrarRuta } from '@/app/api/hrm/nomina/periodos/[id]/cerrar/route';
import { POST as pagarRuta } from '@/app/api/hrm/nomina/periodos/[id]/pagar/route';
import { POST as novedadRuta } from '@/app/api/hrm/nomina/novedades/route';
import { POST as ajusteRuta } from '@/app/api/hrm/nomina/periodos/[id]/ajustes/route';

const params = (id = PERIODO) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body: unknown = {}) =>
  new Request(`https://erp.test${url}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.1.2.3' }, body: JSON.stringify(body) });

function empleado(over: Partial<EmpleadoInsumo> = {}): EmpleadoInsumo {
  return {
    vinculo_id: VINCULO,
    persona_id: '44444444-4444-4444-8444-444444444444',
    nombre: 'Empleado de prueba',
    sede_id: 110,
    ingreso: '2025-01-01',
    retiro: null,
    remoto: false,
    moneda: null,
    periodo_salario: 'monthly',
    salario: [{ desde: '2026-07-01', hasta: '2026-07-31', valor: SMMLV_2026 }],
    clase_arl: 1,
    ajustes: null,
    dependientes_registrados: 0,
    novedades: [],
    comisiones: [],
    prestamos: [],
    embargos: [],
    mes_previo: { ingresos_retencion: 0, incr: 0, retencion: 0 },
    anterior: null,
    variables_12m: { desde: '2025-07-01', hasta: '2026-06-30', valor: 0 },
    acumulado: null,
    ...over,
  };
}

function insumos(over: Partial<InsumosNomina> = {}): InsumosNomina {
  return {
    periodo: { id: PERIODO, desde: '2026-07-01', hasta: '2026-07-31', tipo: 'ordinaria' },
    nomina_habilitada: false,
    parametros: PARAMETROS_2026,
    conceptos: CATALOGO_BASE,
    exoneracion_114_1: true,
    jornada: {
      horas_dia: [
        { employment_id: VINCULO, fecha: '2026-07-10', categoria: 'extra_diurna', recargo: 0.25, divisor: 220, minutos: 120 },
        { employment_id: 'otro', fecha: '2026-07-10', categoria: 'extra_diurna', recargo: 0.25, divisor: 220, minutos: 600 },
      ],
      descuentos: [],
      ausencias: [],
    },
    pendientes: { novedades_nomina: 0, novedades_asistencia: 0, dias_no_listos: 0 },
    empleados: [empleado()],
    excluidos: [],
    ...over,
  };
}

beforeEach(() => {
  rpc.mockReset();
  sesionRpc.mockReset();
});

describe('de los insumos de la base al motor', () => {
  test('cada vínculo recibe solo sus horas, y los dependientes registrados activan la deducción', () => {
    const e = entradaDesdeInsumos(insumos(), empleado({ dependientes_registrados: 2 }));
    expect(e.horas).toEqual([{ fecha: '2026-07-10', categoria: 'extra_diurna', recargo: 0.25, divisor: 220, minutos: 120 }]);
    expect(e.retencion.dependientes).toBe(true);
    expect(e.anterior).toBeNull();
  });

  test('el promedio variable del año sale de los pagos variables en base 360', () => {
    const e = entradaDesdeInsumos(insumos(), empleado({ variables_12m: { desde: '2025-07-01', hasta: '2026-06-30', valor: 1_200_000 } }));
    expect(e.promedio_variable_mensual).toBeCloseTo(100_000, 6);
  });

  test('el payload guarda la entrada sin parámetros, la retención del mes y la huella; los pendientes bloquean', () => {
    const { resultado, payload } = preliquidarDesdeInsumos(insumos({ pendientes: { novedades_nomina: 1, novedades_asistencia: 0, dias_no_listos: 3 } }));
    expect(resultado.colillas).toHaveLength(1);
    const c = payload.colillas[0] as Record<string, unknown>;
    expect(c.entrada).not.toHaveProperty('parametros');
    // Salario 1.750.905 + extra 19.897 + auxilio 249.095; salud y pensión: 4 % de 1.770.802 = 70.832 cada una.
    expect(c.retencion_mes).toEqual({ ingresos: 2_019_897, incr: 141_664, retencion: 0 });
    expect(payload.parametros_snapshot.parametros).toBe(PARAMETROS_2026);
    expect(payload.bloqueos.map((b) => b.codigo)).toEqual(['novedades_nomina_pendientes', 'dias_no_listos']);
    expect(payload.huella).toBe(preliquidarDesdeInsumos(insumos({ pendientes: { novedades_nomina: 1, novedades_asistencia: 0, dias_no_listos: 3 } })).payload.huella);
  });
});

describe('rutas de nómina', () => {
  test('preliquidar: organización y actor de la sesión; insumos → motor → guardar con su huella', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_hr_nomina_insumos') return { data: insumos(), error: null };
      if (fn === 'fn_hr_nomina_guardar') return { data: { run_id: 'r1', reutilizado: false, version: 1 }, error: null };
      return { data: null, error: { code: '42883', message: 'no existe' } };
    });
    const res = await preliquidarRuta(post(`/api/hrm/nomina/periodos/${PERIODO}/preliquidar`), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ run_id: 'r1', reutilizado: false, solo_preliquidacion: true, totales: { empleados: 1 } });
    const [fnIns, argsIns] = rpc.mock.calls[0];
    expect(fnIns).toBe('fn_hr_nomina_insumos');
    expect(argsIns).toMatchObject({ p_actor: CTX.userId, p_org: 135, p_period: PERIODO, p_ip: '10.1.2.3' });
    const [fnG, argsG] = rpc.mock.calls[1];
    expect(fnG).toBe('fn_hr_nomina_guardar');
    expect(argsG.p_org).toBe(135);
    expect(argsG.p_resultado.version_motor).toBe('hrm-nomina-3');
    expect(argsG.p_resultado.colillas[0].totales.neto).toBe(body.totales.neto);
  });

  test('un body con otra organización responde 403 sin tocar la base', async () => {
    const res = await preliquidarRuta(post(`/api/hrm/nomina/periodos/${PERIODO}/preliquidar`, { organization_id: 999 }), params());
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('un período cerrado no se recalcula: la base responde 55000 y la ruta 409', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '55000', message: 'periodo_cerrado: un período cerrado no se recalcula; usa un ajuste' } });
    const res = await preliquidarRuta(post(`/api/hrm/nomina/periodos/${PERIODO}/preliquidar`), params());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('periodo_cerrado');
  });

  test('un parámetro por confirmar (SMMLV de 2027) bloquea la colilla: se guarda la versión sin ella y con su bloqueo', async () => {
    const enero = insumos({
      periodo: { id: PERIODO, desde: '2027-01-01', hasta: '2027-01-31', tipo: 'ordinaria' },
      empleados: [empleado({ salario: [{ desde: '2027-01-01', hasta: '2027-01-31', valor: 2_000_000 }] })],
    });
    rpc.mockImplementation(async (fn: string) =>
      fn === 'fn_hr_nomina_insumos' ? { data: enero, error: null } : { data: { run_id: 'r', reutilizado: false }, error: null }
    );
    const res = await preliquidarRuta(post(`/api/hrm/nomina/periodos/${PERIODO}/preliquidar`), params());
    // El vínculo queda bloqueado (no se inventa el SMMLV) y la versión se guarda sin su colilla.
    const body = await res.json();
    expect(body.bloqueos[0]).toMatchObject({ codigo: 'parametro_no_configurado' });
    expect(rpc.mock.calls[1][1].p_resultado.colillas).toHaveLength(0);
  });

  test('cerrar con la nómina apagada: 55000 nomina_no_habilitada → 409', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '55000', message: 'nomina_no_habilitada: la nómina de esta organización solo se preliquida' } });
    const res = await cerrarRuta(post(`/api/hrm/nomina/periodos/${PERIODO}/cerrar`), params());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('nomina_no_habilitada');
    expect(rpc.mock.calls[0]).toEqual(['fn_hr_nomina_cerrar', { p_actor: CTX.userId, p_org: 135, p_period: PERIODO }]);
  });

  test('pagar: valida la cuenta y la fecha, y marca las comisiones con la sesión del usuario', async () => {
    const malo = await pagarRuta(post(`/api/hrm/nomina/periodos/${PERIODO}/pagar`, { cuenta_bancaria_id: 'x', fecha: '2026-07-31' }), params());
    expect(malo.status).toBe(400);
    rpc.mockResolvedValue({ data: { payment_id: 'p1', total: 1859928, colillas: 1, colilla_ids: ['s1'] }, error: null });
    sesionRpc.mockResolvedValue({ data: 2, error: null });
    const res = await pagarRuta(post(`/api/hrm/nomina/periodos/${PERIODO}/pagar`, { cuenta_bancaria_id: 7, fecha: '2026-07-31' }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ payment_id: 'p1', comisiones_pagadas: 2, comisiones_pendientes: [] });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_bank_account: 7, p_fecha: '2026-07-31', p_org: 135 });
    expect(sesionRpc).toHaveBeenCalledWith('fn_comisiones_pagar_por_nomina', { p_slip_id: 's1' });
  });

  test('novedad: valor positivo obligatorio; la organización no viaja en el body', async () => {
    const malo = await novedadRuta(post('/api/hrm/nomina/novedades', { periodo_id: PERIODO, vinculo_id: VINCULO, concepto: 'BONIFICACION_SALARIAL', valor: -5 }), params());
    expect(malo.status).toBe(400);
    rpc.mockResolvedValue({ data: { id: 'n1', estado: 'aprobada' }, error: null });
    const res = await novedadRuta(post('/api/hrm/nomina/novedades', { periodo_id: PERIODO, vinculo_id: VINCULO, concepto: 'BONIFICACION_SALARIAL', valor: 100000 }), params());
    expect(res.status).toBe(201);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_org: 135, p_actor: CTX.userId, p_datos: { concepto: 'BONIFICACION_SALARIAL', valor: 100000 } });
  });
});

describe('ajuste controlado de un período cerrado', () => {
  const ent = entradaDesdeInsumos(insumos(), empleado());
  const entrada = sinParametros(ent);

  test('se calcula con las reglas guardadas en el cierre, aunque las de hoy cambien', () => {
    const otroPorcentaje = { ...PARAMETROS_2026, aporte_salud_trabajador: [{ desde: '2026-01-01', hasta: null, valor: 0.05 }] };
    const payload = ajusteDesdeInsumos(
      { periodo: { id: PERIODO, desde: '2026-07-01', hasta: '2026-07-31', tipo: 'ordinaria' }, run_id: 'r1', parametros_snapshot: { parametros: PARAMETROS_2026, conceptos: CATALOGO_BASE }, colillas: [{ vinculo_id: VINCULO, entrada, nombre: null }] },
      VINCULO,
      [{ concepto: 'BONIFICACION_SALARIAL', valor: 100_000 }]
    );
    const por = Object.fromEntries((payload.colillas[0].items as Array<{ codigo: string; valor: number }>).map((i) => [i.codigo, i.valor]));
    // 4 % del snapshot, no el 5 % de «hoy» (otroPorcentaje no se usa).
    expect(por.SALUD_EMPLEADO).toBe(4_000);
    expect(otroPorcentaje.aporte_salud_trabajador[0].valor).toBe(0.05);
    expect(payload.totales.neto).toBe(100_000 - 8_000);
  });

  test('la ruta exige motivo y manda la diferencia a fn_hr_nomina_ajuste_guardar', async () => {
    const sinMotivo = await ajusteRuta(post(`/api/hrm/nomina/periodos/${PERIODO}/ajustes`, { vinculo_id: VINCULO, novedades: [{ concepto: 'BONIFICACION_SALARIAL', valor: 1 }] }), params());
    expect(sinMotivo.status).toBe(400);
    rpc.mockImplementation(async (fn: string) =>
      fn === 'fn_hr_nomina_ajuste_insumos'
        ? { data: { periodo: { id: PERIODO, desde: '2026-07-01', hasta: '2026-07-31', tipo: 'ordinaria' }, run_id: 'r1', parametros_snapshot: { parametros: PARAMETROS_2026, conceptos: CATALOGO_BASE }, colillas: [{ vinculo_id: VINCULO, entrada, nombre: null }] }, error: null }
        : { data: { run_id: 'a1', reutilizado: false }, error: null }
    );
    const res = await ajusteRuta(
      post(`/api/hrm/nomina/periodos/${PERIODO}/ajustes`, { vinculo_id: VINCULO, motivo: 'Bono olvidado', novedades: [{ concepto: 'BONIFICACION_SALARIAL', valor: 100000 }] }),
      params()
    );
    expect(res.status).toBe(201);
    const [fn, args] = rpc.mock.calls[1];
    expect(fn).toBe('fn_hr_nomina_ajuste_guardar');
    expect(args.p_motivo).toBe('Bono olvidado');
    expect(args.p_resultado.totales.neto).toBe(92_000);
  });
});

describe('archivo para el banco', () => {
  const fila = (over: Partial<FilaPagoBanco> = {}): FilaPagoBanco => ({
    colilla_id: 's1',
    vinculo_id: VINCULO,
    nombre: 'Empleado de prueba',
    tipo_documento: 'CC',
    documento: '1000000001',
    banco_codigo: '007',
    banco: 'Banco de prueba',
    tipo_cuenta: 'savings',
    cuenta: '00012345678',
    titular: 'Empleado de prueba',
    valor: 1_859_928,
    ...over,
  });

  test('CSV genérico con total y una línea por persona', () => {
    const { archivo, errores } = generarArchivoBanco('csv_generico', [fila(), fila({ vinculo_id: 'b', valor: 1_000_000 })], { periodo: 'p1', fecha_pago: '2026-07-31' });
    expect(errores).toEqual([]);
    expect(archivo!.registros).toBe(2);
    expect(archivo!.total).toBe(2_859_928);
    expect(archivo!.contenido.split('\r\n')[1]).toBe('CC,1000000001,Empleado de prueba,007,Banco de prueba,AHORROS,00012345678,1859928,NOMINA p1');
  });

  test('sin cuenta o sin documento no hay archivo: se devuelven los errores', () => {
    const { archivo, errores } = generarArchivoBanco('csv_generico', [fila({ cuenta: null }), fila({ vinculo_id: 'b', documento: null })], { periodo: 'p1', fecha_pago: null });
    expect(archivo).toBeNull();
    expect(errores.map((e) => e.codigo)).toEqual(['sin_cuenta', 'sin_documento']);
  });

  test('un nombre que empieza por = no se vuelve fórmula en la hoja de cálculo', () => {
    expect(campoCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });
});
