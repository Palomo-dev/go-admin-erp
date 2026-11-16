/**
 * Ronda del Contador del 2026-11-16 (docs/contador/RESPUESTAS-CONTADOR-NOMINA-2026-11-16.md):
 * lo que no cabe en los 20 casos de motorNominaHrm.test.ts.
 * - Los insumos nuevos llegan al motor (P2, P13 y P20).
 * - La tabla del fondo de solidaridad de la Ley 2381, art. 20 (P11), con su tramo del
 *   2,8 % que incluye los 20 SMMLV exactos.
 */
import { calcularColilla, type ResultadoColilla } from '@/lib/hrm/nomina/motorNomina';
import { entradaDesdeInsumos, type EmpleadoInsumo, type InsumosNomina } from '@/lib/hrm/nomina/insumos';
import { CATALOGO_BASE } from '@/lib/hrm/nomina/conceptos';
import type { ParametrosNomina } from '@/lib/hrm/nomina/base';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { entradaBase, salarioFijo, PARAMETROS_2026, SMMLV_2026 } from './nominaFixture';

const valor = (r: ResultadoColilla, codigo: string) => r.items.filter((i) => i.codigo === codigo).reduce((s, i) => s + i.valor, 0);

/** La tabla de 2027 tal como quedó en la migración hrm_f3_05_nomina_ronda_contador. */
function tablaFsp2027(): unknown {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const archivo = readdirSync(dir).find((f) => f.endsWith('_hrm_f3_05_nomina_ronda_contador.sql'));
  expect(archivo).toBeDefined();
  const sql = readFileSync(join(dir, archivo!), 'utf8');
  const m = sql.match(/value_json = '(\[\{"tarifa": 0\.015[^']+)'::jsonb/);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]);
}

describe('fondo de solidaridad desde el 1-abr-2027 (Ley 2381, art. 20; P11)', () => {
  // El SMMLV de 2027 aún no existe: estas pruebas usan el de 2026 solo para ubicar los tramos.
  const parametros: ParametrosNomina = {
    ...PARAMETROS_2026,
    fsp_tabla: [...PARAMETROS_2026.fsp_tabla, { desde: '2027-04-01', hasta: null, valor: null, valor_json: tablaFsp2027() }],
    smmlv: [{ desde: '2026-01-01', hasta: null, valor: SMMLV_2026 }],
    auxilio_transporte: [{ desde: '2026-01-01', hasta: null, valor: 249_095 }],
    uvt: [{ desde: '2026-01-01', hasta: null, valor: 52_374 }],
  };
  const abril = (salario: number) =>
    calcularColilla(
      entradaBase({
        parametros,
        periodo: { desde: '2027-04-01', hasta: '2027-04-30', tipo: 'ordinaria' },
        salario: salarioFijo(salario, '2027-04-01', '2027-04-30'),
      })
    );

  test.each([
    [4, 0.015],
    [6.99, 0.015],
    [7, 0.018],
    [11, 0.025],
    [19, 0.028],
    [20, 0.028], // «menor o igual a veinte (20) smlmv»
    [21, 0.03],
  ])('%p SMMLV → %p', (smmlv, tarifa) => {
    const r = abril(Math.round(smmlv * SMMLV_2026));
    expect(r.items.find((i) => i.codigo === 'FONDO_SOLIDARIDAD')?.tasa).toBe(tarifa);
  });

  test('por debajo de 4 SMMLV no hay aporte', () => {
    expect(valor(abril(4 * SMMLV_2026 - 1), 'FONDO_SOLIDARIDAD')).toBe(0);
  });
});

describe('insumos nuevos de la base al motor', () => {
  const ins = {
    periodo: { id: 'p', desde: '2026-07-01', hasta: '2026-07-31', tipo: 'ordinaria' },
    nomina_habilitada: false,
    parametros: PARAMETROS_2026,
    conceptos: CATALOGO_BASE,
    exoneracion_114_1: true,
    jornada: null,
    pendientes: { novedades_nomina: 0, novedades_asistencia: 0, dias_no_listos: 0 },
    empleados: [],
    excluidos: [],
  } as unknown as InsumosNomina;
  const emp = {
    vinculo_id: 'v',
    persona_id: null,
    nombre: null,
    sede_id: 1,
    ingreso: '2025-01-01',
    retiro: null,
    remoto: false,
    jornada_semanal: '24.0',
    moneda: 'COP',
    periodo_salario: 'monthly',
    salario: [{ desde: '2026-07-01', hasta: '2026-07-31', valor: 1_750_905 }],
    clase_arl: 1,
    ajustes: {
      integral: false,
      procedimiento: 1,
      porcentaje_fijo: null,
      dependientes: false,
      medicina_prepagada: 0,
      intereses_vivienda: 0,
      aportes_voluntarios: 0,
      pension_en_licencia: 'compartida',
    },
    dependientes_registrados: 0,
    novedades: [],
    comisiones: [],
    prestamos: [],
    embargos: [{ id: 'g', tipo: 'alimentos', recibido: '2026-01-01', modo: 'porcentaje', valor: 0.3, saldo: null, incluye_prestaciones: true }],
    mes_previo: null,
    anterior: null,
    ibc_anterior: '1900000',
    variables_12m: { desde: '2025-07-01', hasta: '2026-06-30', valor: 0 },
    acumulado: null,
  } as unknown as EmpleadoInsumo;

  test('jornada pactada, pensión en licencia, último IBC y embargo con prestaciones', () => {
    const e = entradaDesdeInsumos(ins, emp);
    expect(e.vinculo.jornada_semanal).toBe(24);
    expect(e.vinculo.pension_en_licencia).toBe('compartida');
    expect(e.ibc_anterior).toBe(1_900_000);
    expect(e.embargos[0].incluye_prestaciones).toBe(true);
  });

  test('sin datos, los valores por defecto: pensión en licencia «no» y sin último IBC', () => {
    const e = entradaDesdeInsumos(ins, { ...emp, ajustes: null, ibc_anterior: null, jornada_semanal: null, embargos: [] } as EmpleadoInsumo);
    expect(e.vinculo.pension_en_licencia).toBe('no');
    expect(e.ibc_anterior).toBeNull();
    expect(e.vinculo.jornada_semanal).toBeNull();
  });

  test('el último IBC es la base de la salud del empleador en la licencia (P13)', () => {
    // Último IBC 1.900.000 × 10 / 30 = 633.333,3 → 633.334 × 8,5 % = 53.833,4 → 53.833.
    const r = calcularColilla(
      entradaBase({
        exoneracion_114_1: false,
        ibc_anterior: 1_900_000,
        ausencias: [{ id: 'l', clase: 'licencia_no_remunerada', pagada: false, desde: '2026-07-01', hasta: '2026-07-10', tramos: [] }],
      })
    );
    expect(r.bases.ibc_licencia).toBe(633_334);
    expect(r.items.find((i) => i.codigo === 'SALUD_EMPLEADOR')?.detalle).toMatchObject({ licencia: 53_833 });
  });
});

describe('ronda 3 del Contador (2026-11-16)', () => {
  test('fondo de solidaridad en dos campos de la PILA (pregunta 2): caso 7, 4 SMMLV', () => {
    // 7.003.620 × 0,5 % = 35.018,1 → 35.100 de solidaridad, más 35.100 de subsistencia = 70.200.
    // Al trabajador se le descuenta 70.036; el empleador asume 164 con la pensión.
    // Pensión: 7.003.620 × 16 % = 1.120.579,2 → 1.120.600 − 280.145 = 840.455; + 164 = 840.619.
    const r = calcularColilla(entradaBase({ salario: salarioFijo(4 * SMMLV_2026) }));
    expect(valor(r, 'FONDO_SOLIDARIDAD')).toBe(70_036);
    expect(valor(r, 'PENSION_EMPLEADOR')).toBe(840_619);
    expect(r.items.find((i) => i.codigo === 'PENSION_EMPLEADOR')?.detalle).toMatchObject({ redondeo_fondo_solidaridad: 164 });
  });

  test('fondo en dos campos: caso 4 (159.400), caso 6 (875.500) y caso 8 (420.000, sin redondeo)', () => {
    const integral = calcularColilla(
      entradaBase({ salario: salarioFijo(13 * SMMLV_2026), vinculo: { ingreso: '2025-01-01', retiro: null, integral: true, periodo_salario: 'monthly' } })
    );
    // 79.666,2 → 79.700 + 79.700 = 159.400 − 159.332 = 68.
    expect(integral.items.find((i) => i.codigo === 'PENSION_EMPLEADOR')?.detalle).toMatchObject({ redondeo_fondo_solidaridad: 68 });
    // 218.863,1 → 218.900 + 656.589,4 → 656.600 = 875.500 − 875.453 = 47.
    const tope = calcularColilla(entradaBase({ salario: salarioFijo(50_000_000) }));
    expect(tope.items.find((i) => i.codigo === 'PENSION_EMPLEADOR')?.detalle).toMatchObject({ redondeo_fondo_solidaridad: 47 });
    // 150.000 + 270.000 = 420.000: sin diferencia.
    const c8 = calcularColilla(entradaBase({ salario: salarioFijo(30_000_000) }));
    expect(c8.items.find((i) => i.codigo === 'PENSION_EMPLEADOR')?.detalle).not.toHaveProperty('redondeo_fondo_solidaridad');
  });

  test.each([
    [16, 0.012],
    [17, 0.012],
    [17.5, 0.014],
    [18, 0.014],
    [19, 0.016],
    [20, 0.018],
    [20.5, 0.02],
  ])('2026: %p SMMLV exactos van al tramo de abajo → %p (pregunta 6)', (smmlv, tarifa) => {
    const r = calcularColilla(entradaBase({ salario: salarioFijo(Math.round(smmlv * SMMLV_2026)) }));
    expect(r.items.find((i) => i.codigo === 'FONDO_SOLIDARIDAD')?.tasa).toBe(tarifa);
  });

  test('20 SMMLV exactos: 1,8 %, al trabajador 630.326 y en la PILA 175.100 + 455.300 = 630.400', () => {
    const r = calcularColilla(entradaBase({ salario: salarioFijo(20 * SMMLV_2026) }));
    expect(r.bases.ibc).toBe(35_018_100);
    expect(valor(r, 'FONDO_SOLIDARIDAD')).toBe(630_326);
    expect(r.items.find((i) => i.codigo === 'PENSION_EMPLEADOR')?.detalle).toMatchObject({ redondeo_fondo_solidaridad: 74 });
  });

  const vacaciones = [{ id: 'v1', clase: 'vacaciones', pagada: true, desde: '2026-07-06', hasta: '2026-07-15', tramos: [{ desde: '2026-07-06', hasta: '2026-07-15', paga: 'empleador', fraccion: 1 }] }];

  test('IBC de las vacaciones: el último IBC reportado por sus días, no lo pagado (pregunta 4); caso 16', () => {
    // IBC de junio 3.300.000: salario de 20 días 2.000.000 + 3.300.000 × 10 / 30 = 1.100.000 → IBC 3.100.000.
    const conJunio = calcularColilla(entradaBase({ salario: salarioFijo(3_000_000), promedio_variable_mensual: 300_000, ibc_anterior: 3_300_000, ausencias: vacaciones }));
    expect(valor(conJunio, 'VACACIONES_DISFRUTADAS')).toBe(1_100_000);
    expect(conJunio.bases.ibc).toBe(3_100_000);
    // IBC de junio 3.000.000: los 10 días cotizan 1.000.000 aunque se paguen 1.100.000.
    const otro = calcularColilla(entradaBase({ salario: salarioFijo(3_000_000), promedio_variable_mensual: 300_000, ibc_anterior: 3_000_000, ausencias: vacaciones }));
    expect(otro.bases.ibc).toBe(3_000_000);
    expect(valor(otro, 'SALUD_EMPLEADO')).toBe(120_000);
    // Lo pagado sigue siendo base de parafiscales: 2.000.000 + 1.100.000.
    expect(otro.bases.base_parafiscales).toBe(3_100_000);
    expect(otro.bases.ibc_arl).toBe(2_000_000);
  });

  test('caso de P6 sin variable: con el salario del día en que empiezan, 3.000.000 / 30 × 10 = 1.000.000', () => {
    const r = calcularColilla(
      entradaBase({
        salario: [
          { desde: '2026-07-01', hasta: '2026-07-09', valor: 3_000_000 },
          { desde: '2026-07-10', hasta: '2026-07-31', valor: 3_300_000 },
        ],
        ausencias: vacaciones,
      })
    );
    expect(valor(r, 'VACACIONES_DISFRUTADAS')).toBe(1_000_000);
    expect(valor(r, 'SALARIO')).toBe(2_150_000);
  });

  test('las vacaciones no cuentan en la remuneración total de la regla del 40 % (P7)', () => {
    // Salario 3.000.000 con 10 días de vacaciones (salario 2.000.000) y bono no salarial 1.500.000.
    // Total: 2.000.000 + 1.500.000 = 3.500.000; 40 % = 1.400.000; exceso 100.000.
    // IBC = 2.000.000 + 100.000 + 1.000.000 (10 días con el último IBC, aquí el salario) = 3.100.000.
    const r = calcularColilla(
      entradaBase({ salario: salarioFijo(3_000_000), ausencias: vacaciones, novedades: [{ id: 'b', concepto: 'BONIFICACION_NO_SALARIAL', valor: 1_500_000 }] })
    );
    expect(r.bases.exceso_40).toBe(100_000);
    expect(r.bases.ibc).toBe(3_100_000);
  });

  test('la bonificación salarial habitual entra a la provisión de vacaciones (pregunta 5)', () => {
    // (1.750.905 + 100.000) × 15 / 360 = 77.121; sin el bono, 72.954: +4.167 en el ajuste del caso 20.
    const r = calcularColilla(entradaBase({ novedades: [{ id: 'b', concepto: 'BONIFICACION_SALARIAL', valor: 100_000 }] }));
    expect(valor(r, 'PROVISION_VACACIONES')).toBe(77_121);
  });
});
