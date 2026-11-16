/**
 * Motor de nómina de RR. HH. (ADR-003 §3).
 *
 * Vive en src/__tests__/timezone/ para que `npm run test:tz-all` lo corra con
 * TZ=UTC, America/Bogota y las demás zonas: el resultado depende solo de días
 * calendario (`date`), nunca del TZ del proceso.
 *
 * Cada caso trae su cuenta a mano en el comentario, para que el Contador la
 * verifique con calculadora (docs/contador/PREGUNTAS-CONTADOR-NOMINA-2026-11-16.md).
 * Valores 2026: SMMLV $1.750.905, auxilio $249.095, UVT $52.374.
 */
import { calcularColilla, calcularPeriodo, diferenciaColillas, type ResultadoColilla } from '@/lib/hrm/nomina/motorNomina';
import { dias360, pesoDia360, aPeso, aMultiplo, ParametroNominaFaltante, huella } from '@/lib/hrm/nomina/base';
import { porcentajeFijoProcedimiento2, depurar } from '@/lib/hrm/nomina/retencion';
import { aplicarDeducciones } from '@/lib/hrm/nomina/deducciones';
import { CATALOGO_BASE, FILAS_CATALOGO_BASE } from '@/lib/hrm/nomina/conceptos';
import { entradaBase, salarioFijo, PARAMETROS_2026, SMMLV_2026 } from './nominaFixture';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const valor = (r: ResultadoColilla, codigo: string) => r.items.filter((i) => i.codigo === codigo).reduce((s, i) => s + i.valor, 0);
const tiene = (r: ResultadoColilla, codigo: string) => r.items.some((i) => i.codigo === codigo);
const alertas = (r: ResultadoColilla) => r.alertas.map((a) => a.codigo);

describe('días en base 360 y redondeo', () => {
  test('un mes completo suma 30, también febrero; el 31 no cuenta', () => {
    expect(dias360('2026-07-01', '2026-07-31')).toBe(30);
    expect(dias360('2026-02-01', '2026-02-28')).toBe(30);
    expect(dias360('2028-02-01', '2028-02-29')).toBe(30);
    expect(dias360('2026-01-01', '2026-06-30')).toBe(180);
    expect(dias360('2026-01-01', '2026-12-31')).toBe(360);
    expect(pesoDia360('2026-07-31')).toBe(0);
    expect(dias360('2026-07-16', '2026-07-31')).toBe(15);
  });

  test('redondeo explícito: al peso (mitad arriba) y retención al múltiplo de mil', () => {
    expect(aPeso(70036.2)).toBe(70036);
    expect(aPeso(175090.5)).toBe(175091);
    expect(aPeso(-0.5)).toBe(-1);
    expect(aMultiplo(3_330_317, 1000)).toBe(3_330_000);
    expect(aMultiplo(208_500, 1000)).toBe(209_000);
  });
});

describe('colilla ordinaria: casos para verificar a mano', () => {
  test('salario mínimo con auxilio de transporte (julio de 2026, empleador exonerado)', () => {
    // Salario 1.750.905 + auxilio 249.095 = devengado 2.000.000.
    // IBC = 1.750.905 (el auxilio no es base). Salud 4 % = 70.036,2 → 70.036; pensión igual.
    // Neto = 2.000.000 − 140.072 = 1.859.928.
    // Empleador exonerado (114-1): sin salud, ICBF ni SENA. Pensión 12 % = 210.108,6 → 210.109;
    // ARL clase I 0,522 % = 9.139,7 → 9.140; caja 4 % = 70.036.
    // Provisiones: cesantías 2.000.000/12 = 166.667; intereses 166.666,67 × 12 % = 20.000;
    // prima 166.667; vacaciones 1.750.905 × 15/360 = 72.954.
    const r = calcularColilla(entradaBase());
    expect(valor(r, 'SALARIO')).toBe(1_750_905);
    expect(valor(r, 'AUXILIO_TRANSPORTE')).toBe(249_095);
    expect(r.bases.ibc).toBe(1_750_905);
    expect(valor(r, 'SALUD_EMPLEADO')).toBe(70_036);
    expect(valor(r, 'PENSION_EMPLEADO')).toBe(70_036);
    expect(r.totales).toEqual({ devengado: 2_000_000, deducciones: 140_072, neto: 1_859_928, aportes_empleador: 289_285, provisiones: 426_288, costo_empleador: 2_715_573 });
    expect(tiene(r, 'SALUD_EMPLEADOR')).toBe(false);
    expect(tiene(r, 'ICBF')).toBe(false);
    expect(valor(r, 'PENSION_EMPLEADOR')).toBe(210_109);
    expect(valor(r, 'ARL')).toBe(9_140);
    expect(valor(r, 'CAJA_COMPENSACION')).toBe(70_036);
    expect(valor(r, 'PROVISION_CESANTIAS')).toBe(166_667);
    expect(valor(r, 'PROVISION_INTERESES')).toBe(20_000);
    expect(valor(r, 'PROVISION_PRIMA')).toBe(166_667);
    expect(valor(r, 'PROVISION_VACACIONES')).toBe(72_954);
    expect(tiene(r, 'RETENCION_FUENTE')).toBe(false);
    expect(r.bases.exonerado_114_1).toBe(true);
    // Las columnas de la colilla cuadran con los ítems.
    expect(r.columnas.gross_pay).toBe(2_000_000);
    expect(r.columnas.net_pay).toBe(1_859_928);
  });

  test('exoneración 114-1: sin la bandera, el empleador paga salud 8,5 %, ICBF 3 % y SENA 2 %', () => {
    // Salud 1.750.905 × 8,5 % = 148.826,9 → 148.827; ICBF 52.527; SENA 35.018.
    const r = calcularColilla(entradaBase({ exoneracion_114_1: false }));
    expect(r.bases.exonerado_114_1).toBe(false);
    expect(valor(r, 'SALUD_EMPLEADOR')).toBe(148_827);
    expect(valor(r, 'ICBF')).toBe(52_527);
    expect(valor(r, 'SENA')).toBe(35_018);
    expect(r.totales.neto).toBe(1_859_928); // al trabajador no le cambia nada
    // Sin configurar: no se exonera y se avisa.
    const s = calcularColilla(entradaBase({ exoneracion_114_1: null }));
    expect(s.bases.exonerado_114_1).toBe(false);
    expect(alertas(s)).toContain('exoneracion_114_1_sin_configurar');
  });

  test('exoneración 114-1: no aplica desde 10 SMMLV aunque la empresa tenga la bandera', () => {
    const r = calcularColilla(entradaBase({ salario: salarioFijo(10 * SMMLV_2026) }));
    expect(r.bases.exonerado_114_1).toBe(false);
    expect(tiene(r, 'SALUD_EMPLEADOR')).toBe(true);
  });

  test('salario variable con comisiones', () => {
    // Salario 2.000.000 + comisiones 1.500.000 = IBC 3.500.000 (las comisiones son salario).
    // El auxilio sigue porque el salario (2.000.000) no pasa de 2 SMMLV (3.501.810).
    // Salud y pensión 140.000 cada una. Cesantías: (2.000.000 + 1.500.000 + 249.095)/12 = 312.425.
    const r = calcularColilla(entradaBase({ salario: salarioFijo(2_000_000), comisiones: [{ id: 'c1', valor: 1_500_000 }, { id: 'c0', valor: 0 }] }));
    expect(valor(r, 'COMISIONES')).toBe(1_500_000);
    expect(valor(r, 'AUXILIO_TRANSPORTE')).toBe(249_095);
    expect(r.bases.ibc).toBe(3_500_000);
    expect(valor(r, 'SALUD_EMPLEADO')).toBe(140_000);
    expect(valor(r, 'PROVISION_CESANTIAS')).toBe(312_425);
    expect(r.totales.neto).toBe(3_469_095);
    expect(r.comision_ids).toEqual(['c0', 'c1']);
    expect(r.columnas.commissions).toBe(1_500_000);
  });

  test('salario integral de 13 SMMLV: IBC del 70 %, sin auxilio, sin prima ni cesantías', () => {
    // Salario 22.761.765. IBC = 70 % = 15.933.235,5 → 15.933.236 (al peso superior).
    // Salud y pensión 4 % = 637.329; FSP: 15.933.236 / 1.750.905 = 9,1 SMMLV → 1 % = 159.332.
    // No se exonera (integral): salud empleador 8,5 % = 1.354.325; ICBF 477.997; SENA 318.665.
    // Retención (procedimiento 1): ingreso neto 22.761.765 − 1.433.990 = 21.327.775; 25 % exento
    // con tope de 790 UVT/12 = 3.447.955; base 17.879.820 = 341,38 UVT →
    // (341,38 − 150) × 28 % + 10 = 63,59 UVT × 52.374 = 3.330.317 → 3.330.000.
    const r = calcularColilla(entradaBase({ salario: salarioFijo(13 * SMMLV_2026), vinculo: { ingreso: '2025-01-01', retiro: null, integral: true, periodo_salario: 'monthly' } }));
    expect(valor(r, 'SALARIO_INTEGRAL')).toBe(22_761_765);
    expect(r.bases.ibc).toBe(15_933_236);
    expect(valor(r, 'SALUD_EMPLEADO')).toBe(637_329);
    expect(valor(r, 'FONDO_SOLIDARIDAD')).toBe(159_332);
    expect(valor(r, 'SALUD_EMPLEADOR')).toBe(1_354_325);
    expect(valor(r, 'ICBF')).toBe(477_997);
    expect(tiene(r, 'AUXILIO_TRANSPORTE')).toBe(false);
    expect(tiene(r, 'PROVISION_PRIMA')).toBe(false);
    expect(tiene(r, 'PROVISION_CESANTIAS')).toBe(false);
    expect(valor(r, 'PROVISION_VACACIONES')).toBe(948_407);
    expect(Math.round(r.bases.retencion!.depuracion.base)).toBe(17_879_820);
    expect(valor(r, 'RETENCION_FUENTE')).toBe(3_330_000);
  });

  test('un pago no salarial que pasa el 40 %: el exceso entra al IBC', () => {
    // Salario 2.000.000 + bonificación no salarial 2.000.000 = 4.000.000 de remuneración.
    // 40 % = 1.600.000; exceso = 2.000.000 − 1.600.000 = 400.000. IBC = 2.400.000.
    // Salud 4 % = 96.000. La caja va sobre el salario (2.000.000 × 4 % = 80.000).
    const r = calcularColilla(entradaBase({ salario: salarioFijo(2_000_000), novedades: [{ id: 'n1', concepto: 'BONIFICACION_NO_SALARIAL', valor: 2_000_000 }] }));
    expect(r.bases.exceso_40).toBe(400_000);
    expect(r.bases.ibc).toBe(2_400_000);
    expect(valor(r, 'SALUD_EMPLEADO')).toBe(96_000);
    expect(valor(r, 'CAJA_COMPENSACION')).toBe(80_000);
    expect(alertas(r)).toContain('no_salarial_supera_40');
    // La bonificación no salarial no es base de prima ni cesantías: (2.000.000 + 249.095)/12 = 187.425.
    expect(valor(r, 'PROVISION_CESANTIAS')).toBe(187_425);
  });

  test('IBC con tope de 25 SMMLV y fondo de solidaridad del 2 %', () => {
    // Salario 50.000.000 → IBC 25 × 1.750.905 = 43.772.625. Salud 4 % = 1.750.905.
    // FSP: 25 SMMLV (> 20) → 2 % = 875.452,5 → 875.453.
    // Los parafiscales no tienen ese tope: caja 4 % de 50.000.000 = 2.000.000.
    const r = calcularColilla(entradaBase({ salario: salarioFijo(50_000_000) }));
    expect(r.bases.ibc).toBe(43_772_625);
    expect(valor(r, 'SALUD_EMPLEADO')).toBe(1_750_905);
    expect(valor(r, 'FONDO_SOLIDARIDAD')).toBe(875_453);
    expect(valor(r, 'CAJA_COMPENSACION')).toBe(2_000_000);
  });

  test('fondo de solidaridad: en 4 SMMLV exactos aplica el 1 %; con 17,1 SMMLV, el 1,4 %', () => {
    // 4 × 1.750.905 = 7.003.620 → FSP 1 % = 70.036.
    const a = calcularColilla(entradaBase({ salario: salarioFijo(4 * SMMLV_2026) }));
    expect(valor(a, 'FONDO_SOLIDARIDAD')).toBe(70_036);
    // Un peso menos de 4 SMMLV: no aplica.
    const b = calcularColilla(entradaBase({ salario: salarioFijo(4 * SMMLV_2026 - 1) }));
    expect(tiene(b, 'FONDO_SOLIDARIDAD')).toBe(false);
    // 30.000.000 / 1.750.905 = 17,13 SMMLV (rango 17 a 18) → 1,4 % = 420.000.
    const c = calcularColilla(entradaBase({ salario: salarioFijo(30_000_000) }));
    expect(valor(c, 'FONDO_SOLIDARIDAD')).toBe(420_000);
  });

  test('retención con procedimiento 1 y dependientes', () => {
    // Salario 10.000.000. INCR: salud 400.000 + pensión 400.000 + FSP 1 % 100.000 = 900.000.
    // Ingreso neto 9.100.000. Dependientes: 10 % de 10.000.000 = 1.000.000 (tope 32 UVT = 1.675.968).
    // 25 % exento sobre 8.100.000 = 2.025.000. Beneficios 3.025.000 ≤ 40 % (3.640.000).
    // Base 6.075.000 = 115,99 UVT → (115,99 − 95) × 19 % = 3,988 UVT × 52.374 = 208.880 → 209.000.
    const datos = { procedimiento: 1 as const, porcentaje_fijo: null, dependientes: true, medicina_prepagada: 0, intereses_vivienda: 0, aportes_voluntarios: 0 };
    const r = calcularColilla(entradaBase({ salario: salarioFijo(10_000_000), retencion: datos }));
    expect(Math.round(r.bases.retencion!.depuracion.deduccion_dependientes)).toBe(1_000_000);
    expect(Math.round(r.bases.retencion!.depuracion.base)).toBe(6_075_000);
    expect(valor(r, 'RETENCION_FUENTE')).toBe(209_000);
    // Sin dependientes la base sube: 9.100.000 − 25 % (2.275.000) = 6.825.000 = 130,31 UVT →
    // (130,31 − 95) × 19 % = 6,709 UVT = 351.380 → 351.000.
    const s = calcularColilla(entradaBase({ salario: salarioFijo(10_000_000) }));
    expect(valor(s, 'RETENCION_FUENTE')).toBe(351_000);
  });

  test('límite global del 40 %: los beneficios no pasan del 40 % del ingreso neto', () => {
    const d = depurar(PARAMETROS_2026, {
      fecha: '2026-07-31',
      ingresos: 10_000_000,
      incr: 900_000,
      datos: { procedimiento: 1, porcentaje_fijo: null, dependientes: true, medicina_prepagada: 2_000_000, intereses_vivienda: 3_000_000, aportes_voluntarios: 3_000_000 },
    });
    // 40 % de 9.100.000 = 3.640.000 (y 1.340 UVT/12 = 5.848.430): manda el 40 %.
    expect(d.limite_40).toBeCloseTo(3_640_000, 2);
    expect(d.beneficios_aplicados).toBeCloseTo(3_640_000, 2);
    expect(d.base).toBeCloseTo(5_460_000, 2);
  });

  test('retención con procedimiento 2: base del mes × porcentaje fijo; sin porcentaje, bloquea', () => {
    const datos = { procedimiento: 2 as const, porcentaje_fijo: 0.0512, dependientes: false, medicina_prepagada: 0, intereses_vivienda: 0, aportes_voluntarios: 0 };
    // Base depurada 6.825.000 × 5,12 % = 349.440 → 349.000.
    const r = calcularColilla(entradaBase({ salario: salarioFijo(10_000_000), retencion: datos }));
    expect(valor(r, 'RETENCION_FUENTE')).toBe(349_000);
    const s = calcularColilla(entradaBase({ salario: salarioFijo(10_000_000), retencion: { ...datos, porcentaje_fijo: null } }));
    expect(s.alertas).toContainEqual({ codigo: 'retencion_porcentaje_fijo_faltante', severidad: 'bloqueo' });
  });

  test('porcentaje fijo del procedimiento 2 (art. 386)', () => {
    // 12 meses de 10.000.000: ingresos 120.000.000, INCR 10.800.000 → neto 109.200.000.
    // 25 % exento = 27.300.000 (tope 790 UVT = 41.375.460). Base 81.900.000 / 13 = 6.300.000 = 120,29 UVT.
    // Impuesto (120,29 − 95) × 19 % = 4,805 UVT → 4,805 / 120,29 = 3,9946 %.
    const pct = porcentajeFijoProcedimiento2(PARAMETROS_2026, { fecha: '2026-06-30', ingresos_12m: 120_000_000, incr_12m: 10_800_000, deducciones_12m: 0, exentas_12m: 0, meses: 12 });
    expect(pct).toBeCloseTo(0.039946, 5);
  });

  test('embargo por alimentos más préstamo: prelación y límites', () => {
    // Salario 3.000.000 + auxilio 249.095. Deducciones de ley: 120.000 + 120.000 = 240.000.
    // Base de embargo = 3.000.000 − 240.000 = 2.760.000. Alimentos 30 % = 828.000.
    // Préstamo: cuota 1.000.000, tope 30 % de la base = 828.000, y el trabajador conserva el
    // 50 % de la base (1.380.000): disponible 3.009.095 − 828.000 = 2.181.095 → caben 801.095.
    // Neto = 3.249.095 − 240.000 − 828.000 − 801.095 = 1.380.000 (exactamente el 50 %).
    const r = calcularColilla(
      entradaBase({
        salario: salarioFijo(3_000_000),
        embargos: [{ id: 'e1', tipo: 'alimentos', recibido: '2026-03-01', modo: 'porcentaje', valor: 0.3, saldo: null }],
        prestamos: [{ cuota_id: 'q1', prestamo_id: 'p1', valor: 1_000_000, max_deduccion_pct: 30 }],
      })
    );
    expect(valor(r, 'EMBARGO_ALIMENTOS')).toBe(828_000);
    expect(valor(r, 'PRESTAMO')).toBe(801_095);
    expect(r.totales.neto).toBe(1_380_000);
    expect(alertas(r)).toContain('cuota_prestamo_limitada');
    // El préstamo va después del embargo, aunque llegue primero en la lista.
    const orden = r.items.filter((i) => i.tipo === 'deduction').map((i) => i.codigo);
    expect(orden.indexOf('EMBARGO_ALIMENTOS')).toBeLessThan(orden.indexOf('PRESTAMO'));
  });

  test('embargo ordinario: solo la quinta parte del excedente del mínimo, después de alimentos', () => {
    // Salario 3.000.000; excedente sobre el SMMLV = 1.249.095; 1/5 = 249.819.
    const comun = {
      devengado: 3_000_000,
      salarial: 3_000_000,
      deducciones_ley: 240_000,
      smmlv_periodo: SMMLV_2026,
      fraccion_alimentos: 0.5,
      fraccion_excedente: 0.2,
      neto_minimo_libranza: 0.5,
      prestamos: [],
      otros: [],
    };
    const d = aplicarDeducciones({
      ...comun,
      embargos: [
        { id: 'ord', tipo: 'ordinario', recibido: '2026-01-01', modo: 'fijo', valor: 900_000, saldo: 5_000_000 },
        { id: 'ali', tipo: 'alimentos', recibido: '2026-05-01', modo: 'fijo', valor: 1_200_000, saldo: null },
      ],
    });
    // Alimentos primero (1.200.000 de un cupo de 1.380.000); al ordinario le quedan 180.000 del 50 %.
    expect(d.aplicados.map((a) => [a.concepto, a.valor])).toEqual([
      ['EMBARGO_ALIMENTOS', 1_200_000],
      ['EMBARGO_ORDINARIO', 180_000],
    ]);
    // Sin alimentos, el ordinario se queda en la quinta parte del excedente.
    const s = aplicarDeducciones({ ...comun, embargos: [{ id: 'ord', tipo: 'ordinario', recibido: '2026-01-01', modo: 'fijo', valor: 900_000, saldo: 5_000_000 }] });
    expect(s.aplicados[0].valor).toBe(249_819);
  });

  test('incapacidad común por tramos: días 1 y 2 a cargo del empleador, desde el 3 de la EPS, con piso del SMMLV diario', () => {
    // Salario 2.500.000; incapacidad del 6 al 10 de julio (5 días).
    // 2/3 del salario diario = 83.333,33 × 0,6667 = 55.558 < SMMLV diario 58.363,5 → se paga el piso.
    // Empleador: 2 × 58.363,5 = 116.727. EPS (se recobra): 3 × 58.363,5 = 175.090,5 → 175.091.
    // Salario: 25 días = 2.083.333. Auxilio: 25 días trabajados = 207.579.
    // IBC = 2.083.333 + 116.727 + 175.091 = 2.375.151.
    const r = calcularColilla(
      entradaBase({
        salario: salarioFijo(2_500_000),
        ausencias: [
          {
            id: 'a1',
            clase: 'incapacidad_comun',
            pagada: true,
            desde: '2026-07-06',
            hasta: '2026-07-10',
            tramos: [
              { desde: '2026-07-06', hasta: '2026-07-07', paga: 'empleador', fraccion: 0.6667, piso: 'smmlv_diario' },
              { desde: '2026-07-08', hasta: '2026-07-10', paga: 'eps', fraccion: 0.6667, piso: 'smmlv_diario' },
            ],
          },
        ],
      })
    );
    const inc = r.items.filter((i) => i.codigo === 'INCAPACIDAD_COMUN');
    expect(inc.map((i) => [i.detalle?.paga, i.cantidad, i.valor])).toEqual([
      ['empleador', 2, 116_727],
      ['eps', 3, 175_091],
    ]);
    expect(valor(r, 'SALARIO')).toBe(2_083_333);
    expect(valor(r, 'AUXILIO_TRANSPORTE')).toBe(207_579);
    expect(r.bases.ibc).toBe(2_375_151);
  });

  test('licencia no remunerada: no se paga, no se cotiza y baja el piso del IBC', () => {
    const r = calcularColilla(
      entradaBase({
        ausencias: [{ id: 'l1', clase: 'licencia_no_remunerada', pagada: false, desde: '2026-07-01', hasta: '2026-07-10', tramos: [{ desde: '2026-07-01', hasta: '2026-07-10', paga: null, fraccion: 0 }] }],
      })
    );
    // 20 días de salario: 1.750.905 × 20/30 = 1.167.270. El IBC mínimo es 20 días de SMMLV.
    expect(valor(r, 'SALARIO')).toBe(1_167_270);
    expect(r.bases.ibc).toBe(1_167_270);
    expect(alertas(r)).toContain('licencia_no_remunerada');
  });

  test('horas extra y recargos de la fase 2, con el divisor de cada día (220 hasta el 14-jul, 210 desde el 15)', () => {
    // Valor hora: 1.750.905 / 220 = 7.958,66 y / 210 = 8.337,64.
    // Extra diurna el 10-jul: 2 h × 7.958,66 × 1,25 = 19.896,6 → 19.897.
    // Extra nocturna el 20-jul: 1 h × 8.337,64 × 1,75 = 14.590,9 → 14.591.
    // Domingo 5-jul, 8 h ordinarias: solo el recargo, 8 × 7.958,66 × 0,90 = 57.302,4 → 57.302.
    const r = calcularColilla(
      entradaBase({
        horas: [
          { fecha: '2026-07-10', categoria: 'extra_diurna', recargo: 0.25, divisor: 220, minutos: 120 },
          { fecha: '2026-07-20', categoria: 'extra_nocturna', recargo: 0.75, divisor: 210, minutos: 60 },
          { fecha: '2026-07-05', categoria: 'dom_diurna', recargo: 0.9, divisor: 220, minutos: 480 },
          { fecha: '2026-07-06', categoria: 'ord_diurna', recargo: 0, divisor: 220, minutos: 480 },
        ],
      })
    );
    expect(valor(r, 'HORA_EXTRA_DIURNA')).toBe(19_897);
    expect(valor(r, 'HORA_EXTRA_NOCTURNA')).toBe(14_591);
    expect(valor(r, 'RECARGO_DOMINICAL')).toBe(57_302);
    // La hora ordinaria diurna va con el salario: no genera ítem.
    expect(valor(r, 'SALARIO')).toBe(1_750_905);
    // Las extras y recargos son salario: el IBC sube a 1.842.695.
    expect(r.bases.ibc).toBe(1_842_695);
    expect(r.columnas.overtime_day_hours).toBe(2);
  });

  test('salario por horas: la ordinaria se paga completa y aparte su recargo', () => {
    const r = calcularColilla(
      entradaBase({
        vinculo: { ingreso: '2025-01-01', retiro: null, integral: false, periodo_salario: 'hourly' },
        salario: salarioFijo(10_000),
        horas: [
          { fecha: '2026-07-06', categoria: 'ord_diurna', recargo: 0, divisor: 220, minutos: 600 },
          { fecha: '2026-07-07', categoria: 'ord_nocturna', recargo: 0.35, divisor: 220, minutos: 120 },
        ],
      })
    );
    // 12 h × 10.000 = 120.000; recargo nocturno 2 h × 10.000 × 35 % = 7.000.
    expect(valor(r, 'SALARIO_HORAS')).toBe(120_000);
    expect(valor(r, 'RECARGO_NOCTURNO')).toBe(7_000);
    expect(tiene(r, 'SALARIO')).toBe(false);
  });

  test('un período que cruza el 1 de julio de 2026 usa el valor de cada fecha', () => {
    // Semana del lunes 29-jun (San Pedro) al domingo 5-jul. Aumento de 2.000.000 a 2.200.000 el 1-jul.
    // Salario: 2 días × 66.666,67 + 5 días × 73.333,33 = 500.000.
    // Recargo dominical: 29-jun 8 h × (2.000.000/220) × 0,80 = 58.181,8 y
    // 5-jul 8 h × (2.200.000/220) × 0,90 = 72.000 → 130.182.
    const r = calcularColilla(
      entradaBase({
        periodo: { desde: '2026-06-29', hasta: '2026-07-05', tipo: 'ordinaria' },
        salario: [
          { desde: '2026-06-29', hasta: '2026-06-30', valor: 2_000_000 },
          { desde: '2026-07-01', hasta: '2026-07-05', valor: 2_200_000 },
        ],
        horas: [
          { fecha: '2026-06-29', categoria: 'dom_diurna', recargo: 0.8, divisor: 220, minutos: 480 },
          { fecha: '2026-07-05', categoria: 'dom_diurna', recargo: 0.9, divisor: 220, minutos: 480 },
        ],
      })
    );
    expect(valor(r, 'SALARIO')).toBe(500_000);
    expect(valor(r, 'RECARGO_DOMINICAL')).toBe(130_182);
    // No cierra mes: no hay retención en este período.
    expect(r.bases.retencion).toBeNull();
  });

  test('el SMMLV de 2027 está por confirmar: el motor no inventa y la colilla se bloquea', () => {
    const e = entradaBase({ periodo: { desde: '2027-01-01', hasta: '2027-01-31', tipo: 'ordinaria' }, salario: salarioFijo(2_000_000, '2027-01-01', '2027-01-31') });
    expect(() => calcularColilla(e)).toThrow(ParametroNominaFaltante);
    const p = calcularPeriodo([e]);
    expect(p.colillas).toHaveLength(0);
    expect(p.bloqueos[0]).toMatchObject({ codigo: 'parametro_no_configurado', severidad: 'bloqueo' });
  });

  test('retención quincenal: la primera quincena no retiene; la segunda retiene lo del mes menos lo ya retenido', () => {
    const q1 = calcularColilla(entradaBase({ periodo: { desde: '2026-07-01', hasta: '2026-07-15', tipo: 'ordinaria' }, salario: salarioFijo(10_000_000) }));
    expect(tiene(q1, 'RETENCION_FUENTE')).toBe(false);
    const q2 = calcularColilla(
      entradaBase({
        periodo: { desde: '2026-07-16', hasta: '2026-07-31', tipo: 'ordinaria' },
        salario: salarioFijo(10_000_000),
        mes_previo: { ingresos_retencion: 5_000_000, incr: 450_000, retencion: 0 },
      })
    );
    // Con el mes completo (10.000.000) la retención es 351.000, igual que en la nómina mensual.
    expect(valor(q2, 'RETENCION_FUENTE')).toBe(351_000);
  });

  test('alerta de variación contra el período anterior con el umbral de la empresa', () => {
    const r = calcularColilla(entradaBase({ anterior: { devengado: 1_000_000, neto: 900_000 } }));
    expect(r.alertas.find((a) => a.codigo === 'variacion_contra_anterior')?.detalle).toMatchObject({ umbral: 0.1, neto: 1_859_928 });
    const igual = calcularColilla(entradaBase());
    expect(alertas(igual)).not.toContain('variacion_contra_anterior');
  });
});

describe('prestaciones', () => {
  test('prima del primer semestre de 2026 con variable', () => {
    // Salario 2.000.000 + variable 600.000/180 días × 30 = 100.000 + auxilio 249.095 = 2.349.095.
    // Prima = 2.349.095 × 180 / 360 = 1.174.547,5 → 1.174.548.
    const r = calcularColilla(
      entradaBase({
        periodo: { desde: '2026-01-01', hasta: '2026-06-30', tipo: 'prima' },
        salario: salarioFijo(2_000_000, '2026-01-01', '2026-06-30'),
        acumulado: { desde: '2026-01-01', hasta: '2026-06-30', variables: 600_000, dias_no_remunerados: 0 },
      })
    );
    expect(valor(r, 'PRIMA_SERVICIOS')).toBe(1_174_548);
    expect(r.totales.neto).toBe(1_174_548);
    expect(tiene(r, 'SALUD_EMPLEADO')).toBe(false); // la prima no es base de aportes
  });

  test('prima con aumento en los últimos 3 meses: salario promedio del semestre (CST 253)', () => {
    // 1.800.000 de enero a abril (120 días) y 2.100.000 de mayo a junio (60 días):
    // promedio = (1.800.000 × 120 + 2.100.000 × 60) / 180 = 1.900.000. Prima = (1.900.000 + 249.095) / 2 = 1.074.547,5.
    const r = calcularColilla(
      entradaBase({
        periodo: { desde: '2026-01-01', hasta: '2026-06-30', tipo: 'prima' },
        salario: [
          { desde: '2026-01-01', hasta: '2026-04-30', valor: 1_800_000 },
          { desde: '2026-05-01', hasta: '2026-06-30', valor: 2_100_000 },
        ],
        acumulado: { desde: '2026-01-01', hasta: '2026-06-30', variables: 0, dias_no_remunerados: 0 },
      })
    );
    expect(valor(r, 'PRIMA_SERVICIOS')).toBe(1_074_548);
  });

  test('cesantías e intereses de 2026: las cesantías se consignan al fondo y los intereses se pagan', () => {
    // Base 2.000.000 + 249.095 = 2.249.095 × 360/360 = 2.249.095 al fondo.
    // Intereses = 2.249.095 × 12 % = 269.891,4 → 269.891 al trabajador. Exentos (salario < 350 UVT).
    const r = calcularColilla(
      entradaBase({
        periodo: { desde: '2026-01-01', hasta: '2026-12-31', tipo: 'cesantias' },
        salario: salarioFijo(2_000_000, '2026-01-01', '2026-12-31'),
        acumulado: { desde: '2026-01-01', hasta: '2026-12-31', variables: 0, dias_no_remunerados: 0 },
      })
    );
    const ces = r.items.find((i) => i.codigo === 'CESANTIAS_CONSIGNAR');
    expect(ces).toMatchObject({ tipo: 'info', valor: 2_249_095 });
    expect(valor(r, 'INTERESES_CESANTIAS')).toBe(269_891);
    expect(r.totales.neto).toBe(269_891);
    expect(tiene(r, 'RETENCION_FUENTE')).toBe(false);
  });

  test('ingreso a mitad de año: proporcional; integral: sin prima', () => {
    // Ingreso el 1-abr: 90 días. (2.000.000 + 249.095) × 90 / 360 = 562.273,75 → 562.274.
    const r = calcularColilla(
      entradaBase({
        periodo: { desde: '2026-01-01', hasta: '2026-06-30', tipo: 'prima' },
        vinculo: { ingreso: '2026-04-01', retiro: null, integral: false, periodo_salario: 'monthly' },
        salario: salarioFijo(2_000_000, '2026-04-01', '2026-06-30'),
        acumulado: { desde: '2026-01-01', hasta: '2026-06-30', variables: 0, dias_no_remunerados: 0 },
      })
    );
    expect(valor(r, 'PRIMA_SERVICIOS')).toBe(562_274);
    const i = calcularColilla(
      entradaBase({
        periodo: { desde: '2026-01-01', hasta: '2026-06-30', tipo: 'prima' },
        vinculo: { ingreso: '2025-01-01', retiro: null, integral: true, periodo_salario: 'monthly' },
        salario: salarioFijo(25_000_000, '2026-01-01', '2026-06-30'),
        acumulado: { desde: '2026-01-01', hasta: '2026-06-30', variables: 0, dias_no_remunerados: 0 },
      })
    );
    expect(tiene(i, 'PRIMA_SERVICIOS')).toBe(false);
  });

  test('vacaciones disfrutadas: se pagan con el salario + promedio variable y no llevan auxilio', () => {
    // 10 días calendario de vacaciones (6 al 15 de julio) con salario 3.000.000 y variable promedio 300.000:
    // (3.000.000 + 300.000) / 30 × 10 = 1.100.000. Salario por 20 días = 2.000.000. Auxilio por 20 días.
    const r = calcularColilla(
      entradaBase({
        salario: salarioFijo(3_000_000),
        promedio_variable_mensual: 300_000,
        ausencias: [{ id: 'v1', clase: 'vacaciones', pagada: true, desde: '2026-07-06', hasta: '2026-07-15', tramos: [{ desde: '2026-07-06', hasta: '2026-07-15', paga: 'empleador', fraccion: 1 }] }],
      })
    );
    expect(valor(r, 'VACACIONES_DISFRUTADAS')).toBe(1_100_000);
    expect(valor(r, 'SALARIO')).toBe(2_000_000);
    expect(valor(r, 'AUXILIO_TRANSPORTE')).toBe(166_063);
  });

  test('vacaciones compensadas por novedad: días × (salario + variable) / 30', () => {
    const r = calcularColilla(entradaBase({ salario: salarioFijo(3_000_000), novedades: [{ id: 'vc', concepto: 'VACACIONES_COMPENSADAS', cantidad: 7 }] }));
    expect(valor(r, 'VACACIONES_COMPENSADAS')).toBe(700_000);
    // No son base de salud ni pensión.
    expect(r.bases.ibc).toBe(3_000_000);
  });
});

describe('control: idempotencia, ajustes y catálogo', () => {
  test('la misma entrada da la misma colilla y la misma huella; un cambio cambia la huella', () => {
    const a = calcularColilla(entradaBase());
    const b = calcularColilla(entradaBase());
    expect(b).toEqual(a);
    const c = calcularColilla(entradaBase({ comisiones: [{ id: 'x', valor: 1 }] }));
    expect(c.huella_entrada).not.toBe(a.huella_entrada);
    expect(calcularPeriodo([entradaBase()]).huella).toBe(calcularPeriodo([entradaBase()]).huella);
    expect(huella({ a: 1, b: 2 })).toBe(huella({ b: 2, a: 1 }));
  });

  test('ajuste controlado: la diferencia por concepto entre la colilla cerrada y la corregida', () => {
    const original = calcularColilla(entradaBase());
    const corregida = calcularColilla(entradaBase({ novedades: [{ id: 'b', concepto: 'BONIFICACION_SALARIAL', valor: 100_000 }] }));
    const d = diferenciaColillas(original, corregida);
    const por = Object.fromEntries(d.map((i) => [i.codigo, i.valor]));
    // Bonificación 100.000 → salud y pensión +4.000 cada una.
    expect(por.BONIFICACION_SALARIAL).toBe(100_000);
    expect(por.SALUD_EMPLEADO).toBe(4_000);
    expect(por.PENSION_EMPLEADO).toBe(4_000);
    expect(por.SALARIO).toBeUndefined();
  });

  test('el período reporta un vínculo con error como bloqueo sin tumbar a los demás', () => {
    const malo = entradaBase({ vinculo_id: 'b', salario: [] });
    const bueno = entradaBase({ vinculo_id: 'a' });
    const p = calcularPeriodo([malo, bueno]);
    expect(p.colillas.map((c) => c.vinculo_id)).toEqual(['a']);
    expect(p.bloqueos[0]).toMatchObject({ codigo: 'salario_sin_vigencia', detalle: { vinculo_id: 'b' } });
    expect(p.totales.neto).toBe(1_859_928);
  });

  test('el catálogo base del motor es la semilla de la migración', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const archivo = readdirSync(dir).find((f) => f.endsWith('_hrm_f3_01_nomina_modelo.sql'));
    expect(archivo).toBeDefined();
    const sql = readFileSync(join(dir, archivo!), 'utf8');
    for (const [codigo, , tipo, salarial, ss, c40, prest, ret, paraf, deb, cred] of FILAS_CATALOGO_BASE) {
      const b = (x: boolean) => (x ? 'true' : 'false');
      const q = (x: string | null) => (x === null ? 'null' : `'${x}'`);
      const fila = `('${codigo}', `;
      const i = sql.indexOf(fila);
      expect({ codigo, encontrado: i >= 0 }).toEqual({ codigo, encontrado: true });
      const linea = sql.slice(i, sql.indexOf('\n', i));
      expect(linea).toContain(`'${tipo}', ${b(salarial)}, ${b(ss)}, ${b(c40)}, ${b(prest)}, ${b(ret)}, ${b(paraf)}, ${q(deb)}, ${q(cred)}`);
    }
    expect(Object.keys(CATALOGO_BASE)).toHaveLength(FILAS_CATALOGO_BASE.length);
  });
});
