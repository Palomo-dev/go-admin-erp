/**
 * Motor de nómina de RR. HH. (ADR-003 §3).
 *
 * Vive en src/__tests__/timezone/ para que `npm run test:tz-all` lo corra con
 * TZ=UTC, America/Bogota y las demás zonas: el resultado depende solo de días
 * calendario (`date`), nunca del TZ del proceso.
 *
 * Cada caso trae su cuenta a mano en el comentario, para que el Contador la
 * verifique con calculadora (docs/contador/PREGUNTAS-CONTADOR-NOMINA-2026-11-16.md).
 * Ronda 2 (2026-11-16): con las correcciones de docs/contador/RESPUESTAS-CONTADOR-NOMINA-2026-11-16.md
 * (P1, P3, P5, P6, P10, P12, P13, P14, P17, P21, P22 y P23).
 * Valores 2026: SMMLV $1.750.905, auxilio $249.095, UVT $52.374.
 */
import { calcularColilla, calcularPeriodo, diferenciaColillas, type ResultadoColilla } from '@/lib/hrm/nomina/motorNomina';
import { dias360, pesoDia360, aPeso, aMultiplo, aCentenaSuperior, ParametroNominaFaltante, huella } from '@/lib/hrm/nomina/base';
import { porcentajeFijoProcedimiento2, depurar, redondearRetencion } from '@/lib/hrm/nomina/retencion';
import { aplicarDeducciones } from '@/lib/hrm/nomina/deducciones';
import { entradaBase, salarioFijo, PARAMETROS_2026, SMMLV_2026 } from './nominaFixture';

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

  test('aportes como la PILA: al múltiplo de $100 superior (P14)', () => {
    expect(aCentenaSuperior(280_144.8)).toBe(280_200);
    expect(aCentenaSuperior(70_036.2)).toBe(70_100);
    expect(aCentenaSuperior(9_139.7)).toBe(9_200);
    expect(aCentenaSuperior(70_000)).toBe(70_000);
    expect(aCentenaSuperior(0)).toBe(0);
  });

  test('retención según el art. 868 (P17): más de $10.000 al millar, de $100 a $10.000 a la centena, hasta $100 al peso', () => {
    const r = (x: number) => redondearRetencion(PARAMETROS_2026, '2026-07-31', x);
    expect(r(3_330_382)).toBe(3_330_000);
    expect(r(208_899)).toBe(209_000);
    expect(r(10_500)).toBe(11_000);
    expect(r(10_499)).toBe(10_000);
    expect(r(10_000)).toBe(10_000);
    expect(r(9_950)).toBe(10_000);
    expect(r(4_349)).toBe(4_300);
    expect(r(150)).toBe(200);
    expect(r(100)).toBe(100);
    expect(r(87.4)).toBe(87);
  });
});

describe('colilla ordinaria: casos para verificar a mano', () => {
  test('salario mínimo con auxilio de transporte (julio de 2026, empleador exonerado)', () => {
    // Salario 1.750.905 + auxilio 249.095 = devengado 2.000.000.
    // IBC = 1.750.905 (el auxilio no es base). Salud 4 % = 70.036,2 → 70.036; pensión igual.
    // Neto = 2.000.000 − 140.072 = 1.859.928.
    // Empleador exonerado (114-1): sin salud propia, ICBF ni SENA.
    // Redondeo PILA (P14), por subsistema: salud 70.036,2 → 70.100, el trabajador paga 70.036 y el
    // empleador los 64 del redondeo; pensión 70.036,2 + 210.108,6 = 280.144,8 → 280.200, empleador
    // 280.200 − 70.036 = 210.164; ARL clase I 0,522 % = 9.139,7 → 9.200; caja 4 % = 70.036,2 → 70.100.
    // Provisiones: cesantías 2.000.000/12 = 166.667; intereses 166.666,67 × 12 % = 20.000;
    // prima 166.667; vacaciones 1.750.905 × 15/360 = 72.954.
    const r = calcularColilla(entradaBase());
    expect(valor(r, 'SALARIO')).toBe(1_750_905);
    expect(valor(r, 'AUXILIO_TRANSPORTE')).toBe(249_095);
    expect(r.bases.ibc).toBe(1_750_905);
    expect(valor(r, 'SALUD_EMPLEADO')).toBe(70_036);
    expect(valor(r, 'PENSION_EMPLEADO')).toBe(70_036);
    expect(r.totales).toEqual({ devengado: 2_000_000, deducciones: 140_072, neto: 1_859_928, aportes_empleador: 289_528, provisiones: 426_288, costo_empleador: 2_715_816 });
    expect(valor(r, 'SALUD_EMPLEADOR')).toBe(64);
    expect(tiene(r, 'ICBF')).toBe(false);
    expect(valor(r, 'PENSION_EMPLEADOR')).toBe(210_164);
    expect(valor(r, 'ARL')).toBe(9_200);
    expect(valor(r, 'CAJA_COMPENSACION')).toBe(70_100);
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
    // Salud 1.750.905 × 8,5 % = 148.826,9. Con P14 el subsistema completo: 70.036,2 + 148.826,9 =
    // 218.863,1 → 218.900; el empleador paga 218.900 − 70.036 = 148.864.
    // ICBF 52.527,15 → 52.600; SENA 35.018,1 → 35.100.
    const r = calcularColilla(entradaBase({ exoneracion_114_1: false }));
    expect(r.bases.exonerado_114_1).toBe(false);
    expect(valor(r, 'SALUD_EMPLEADOR')).toBe(148_864);
    expect(valor(r, 'ICBF')).toBe(52_600);
    expect(valor(r, 'SENA')).toBe(35_100);
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

  test('exoneración 114-1 se mide solo con lo salarial (P10): un bono no salarial no la quita', () => {
    // Salario 17.000.000 (< 10 SMMLV = 17.509.050) + bonificación no salarial 1.000.000.
    // Con todo lo devengado (18.000.000) no se exoneraba; con lo salarial sí.
    const r = calcularColilla(entradaBase({ salario: salarioFijo(17_000_000), novedades: [{ id: 'b', concepto: 'BONIFICACION_NO_SALARIAL', valor: 1_000_000 }] }));
    expect(r.bases.exonerado_114_1).toBe(true);
    expect(tiene(r, 'ICBF')).toBe(false);
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
    // Provisión de vacaciones sobre el salario ordinario con las comisiones (P22):
    // (2.000.000 + 1.500.000) × 15 / 360 = 145.833,3 → 145.833.
    expect(valor(r, 'PROVISION_VACACIONES')).toBe(145_833);
  });

  test('auxilio de transporte: el tope de 2 SMMLV se mide con sueldo, comisiones y recargo nocturno ordinario (P3)', () => {
    // Comisiones: 2.000.000 + 1.600.000 = 3.600.000 > 3.501.810 → ese mes no hay auxilio.
    const a = calcularColilla(entradaBase({ salario: salarioFijo(2_000_000), comisiones: [{ id: 'c', valor: 1_600_000 }] }));
    expect(tiene(a, 'AUXILIO_TRANSPORTE')).toBe(false);
    expect(alertas(a)).toContain('auxilio_transporte_supera_tope');
    // Las horas extra no cuentan: salario 3.400.000 + 20 h extra diurnas sigue con auxilio.
    const b = calcularColilla(
      entradaBase({ salario: salarioFijo(3_400_000), horas: [{ fecha: '2026-07-20', categoria: 'extra_diurna', recargo: 0.25, divisor: 210, minutos: 1200 }] })
    );
    expect(valor(b, 'AUXILIO_TRANSPORTE')).toBe(249_095);
    // El recargo nocturno ordinario sí cuenta: 20 h × 3.400.000 / 210 × 35 % = 113.333 → 3.513.333 > tope.
    const c = calcularColilla(
      entradaBase({ salario: salarioFijo(3_400_000), horas: [{ fecha: '2026-07-21', categoria: 'ord_nocturna', recargo: 0.35, divisor: 210, minutos: 1200 }] })
    );
    expect(valor(c, 'RECARGO_NOCTURNO')).toBe(113_333);
    expect(tiene(c, 'AUXILIO_TRANSPORTE')).toBe(false);
  });

  test('salario integral de 13 SMMLV: IBC del 70 %, sin auxilio, sin prima ni cesantías', () => {
    // Salario 22.761.765. IBC = 70 % = 15.933.235,5 → 15.933.236 (al peso superior).
    // Salud y pensión 4 % = 637.329; FSP: 15.933.236 / 1.750.905 = 9,1 SMMLV → 1 % = 159.332.
    // No se exonera (integral): salud empleador 8,5 % = 1.354.325,1. Con P14: 637.329,4 + 1.354.325,1 =
    // 1.991.654,5 → 1.991.700; el empleador paga 1.991.700 − 637.329 = 1.354.371. ICBF 477.997,1 → 478.000.
    // Retención (procedimiento 1): ingreso neto 22.761.765 − 1.433.990 = 21.327.775; 25 % exento
    // con tope de 790 UVT/12 = 3.447.955; base 17.879.820 = 341,38 UVT →
    // (341,38 − 150) × 28 % + 10 = 63,59 UVT × 52.374 = 3.330.317 → 3.330.000.
    const r = calcularColilla(entradaBase({ salario: salarioFijo(13 * SMMLV_2026), vinculo: { ingreso: '2025-01-01', retiro: null, integral: true, periodo_salario: 'monthly' } }));
    expect(valor(r, 'SALARIO_INTEGRAL')).toBe(22_761_765);
    expect(r.bases.ibc).toBe(15_933_236);
    expect(valor(r, 'SALUD_EMPLEADO')).toBe(637_329);
    expect(valor(r, 'FONDO_SOLIDARIDAD')).toBe(159_332);
    expect(valor(r, 'SALUD_EMPLEADOR')).toBe(1_354_371);
    expect(valor(r, 'ICBF')).toBe(478_000);
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
    // Préstamo (P21): el 50 % se mide sobre el salario neto de ley sin auxilio (2.760.000 → piso
    // 1.380.000) y la libranza no se paga con el auxilio: caben 2.760.000 − 828.000 − 1.380.000 = 552.000
    // (tope del préstamo 30 % = 828.000). Neto = 3.249.095 − 240.000 − 828.000 − 552.000 = 1.629.095:
    // el 50 % del salario neto más el auxilio completo.
    const r = calcularColilla(
      entradaBase({
        salario: salarioFijo(3_000_000),
        embargos: [{ id: 'e1', tipo: 'alimentos', recibido: '2026-03-01', modo: 'porcentaje', valor: 0.3, saldo: null }],
        prestamos: [{ cuota_id: 'q1', prestamo_id: 'p1', valor: 1_000_000, max_deduccion_pct: 30 }],
      })
    );
    expect(valor(r, 'EMBARGO_ALIMENTOS')).toBe(828_000);
    expect(valor(r, 'PRESTAMO')).toBe(552_000);
    expect(r.totales.neto).toBe(1_629_095);
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
    // ARL (P12) y parafiscales solo sobre lo de los días trabajados: 2.083.333.
    // ARL 2.083.333 × 0,522 % = 10.875,0 → 10.900; caja 83.333,3 → 83.400.
    expect(r.bases.ibc_arl).toBe(2_083_333);
    expect(valor(r, 'ARL')).toBe(10_900);
    expect(r.bases.base_parafiscales).toBe(2_083_333);
    expect(valor(r, 'CAJA_COMPENSACION')).toBe(83_400);
  });

  test('incapacidad: la empresa puede pactar pagar al 100 % los días 1 y 2 (P5)', () => {
    // Salario 2.500.000: 2 días × 83.333,33 = 166.667 a cargo del empleador; la EPS sigue en 175.091.
    const r = calcularColilla(
      entradaBase({
        salario: salarioFijo(2_500_000),
        parametros: { ...PARAMETROS_2026, incapacidad_empleador_fraccion: [{ desde: '2026-01-01', hasta: null, valor: 1 }] },
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
    expect(inc.map((i) => [i.detalle?.paga, i.valor])).toEqual([
      ['empleador', 166_667],
      ['eps', 175_091],
    ]);
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
    // Empleador exonerado: no paga salud por los días de licencia (P13). Sin pensión por defecto.
    expect(r.bases.ibc_licencia).toBe(583_635);
    expect(valor(r, 'PENSION_EMPLEADO')).toBe(46_691);
  });

  test('licencia no remunerada sin exoneración: el empleador paga su salud sobre el último IBC (P13)', () => {
    // 1.750.905 × 10 / 30 = 583.635 × 8,5 % = 49.608,98 → 49.609 por los días de licencia.
    // Subsistema de salud: 1.167.270 × 12,5 % + 49.608,98 = 195.517,73 → 195.600; el trabajador paga
    // 46.691 y el empleador 148.909 (99.218 del mes + 49.609 de la licencia + 82 del redondeo).
    const lic = [{ id: 'l1', clase: 'licencia_no_remunerada', pagada: false, desde: '2026-07-01', hasta: '2026-07-10', tramos: [] }];
    const r = calcularColilla(entradaBase({ exoneracion_114_1: false, ausencias: lic }));
    const salud = r.items.find((i) => i.codigo === 'SALUD_EMPLEADOR');
    expect(salud?.detalle).toMatchObject({ base_licencia: 583_635, licencia: 49_609, total_subsistema: 195_600 });
    expect(salud?.valor).toBe(148_909);
    // Sin pacto no se cotiza pensión por la licencia.
    expect(r.items.find((i) => i.codigo === 'PENSION_EMPLEADOR')?.detalle).not.toHaveProperty('base_licencia');
    // Con pacto y autorización del trabajador: él aporta su 4 % y el empleador su 12 % sobre el último IBC.
    const c = calcularColilla(
      entradaBase({ exoneracion_114_1: false, ausencias: lic, vinculo: { ingreso: '2025-01-01', retiro: null, integral: false, periodo_salario: 'monthly', pension_en_licencia: 'compartida' } })
    );
    // 1.167.270 × 4 % + 583.635 × 4 % = 46.690,8 + 23.345,4 = 70.036,2 → 70.036.
    expect(valor(c, 'PENSION_EMPLEADO')).toBe(70_036);
    // Pactado sin autorización: el empleador asume el 16 % de la licencia; el trabajador solo lo del mes.
    const s = calcularColilla(
      entradaBase({ exoneracion_114_1: false, ausencias: lic, vinculo: { ingreso: '2025-01-01', retiro: null, integral: false, periodo_salario: 'monthly', pension_en_licencia: 'empleador' } })
    );
    expect(valor(s, 'PENSION_EMPLEADO')).toBe(46_691);
    // 1.167.270 × 16 % + 583.635 × 16 % = 280.144,8 → 280.200 − 46.691 = 233.509.
    expect(valor(s, 'PENSION_EMPLEADOR')).toBe(233_509);
  });

  test('horas extra y recargos de la fase 2, con el divisor de cada día (220 hasta el 14-jul, 210 desde el 15)', () => {
    // Valor hora: 1.750.905 / 220 = 7.958,66 y / 210 = 8.337,64.
    // Extra diurna el 10-jul: 2 h × 7.958,66 × 1,25 = 19.896,6 → 19.897.
    // Extra nocturna el 20-jul, que es festivo (P1): 1 h × 8.337,64 × (1 + 0,75 + 0,90) = 22.094,75 → 22.095.
    // El motor de horas la clasifica como extra dominical nocturna con recargo 1,65 (ver motorHorasHrm).
    // Domingo 5-jul, 8 h ordinarias: solo el recargo, 8 × 7.958,66 × 0,90 = 57.302,4 → 57.302.
    const r = calcularColilla(
      entradaBase({
        horas: [
          { fecha: '2026-07-10', categoria: 'extra_diurna', recargo: 0.25, divisor: 220, minutos: 120 },
          { fecha: '2026-07-20', categoria: 'extra_dom_nocturna', recargo: 1.65, divisor: 210, minutos: 60 },
          { fecha: '2026-07-05', categoria: 'dom_diurna', recargo: 0.9, divisor: 220, minutos: 480 },
          { fecha: '2026-07-06', categoria: 'ord_diurna', recargo: 0, divisor: 220, minutos: 480 },
        ],
      })
    );
    expect(valor(r, 'HORA_EXTRA_DIURNA')).toBe(19_897);
    expect(valor(r, 'HORA_EXTRA_DOMINICAL_NOCTURNA')).toBe(22_095);
    expect(valor(r, 'RECARGO_DOMINICAL')).toBe(57_302);
    // La hora ordinaria diurna va con el salario: no genera ítem.
    expect(valor(r, 'SALARIO')).toBe(1_750_905);
    // Las extras y recargos son salario: 1.750.905 + 19.897 + 22.095 + 57.302 = 1.850.199.
    expect(r.bases.ibc).toBe(1_850_199);
    expect(r.columnas.overtime_day_hours).toBe(2);
  });

  test('jornada pactada menor que la legal: el divisor de la hora sale de ella (P2)', () => {
    // 24 h semanales → divisor 120. 2 h extra diurnas el 10-jul: 1.750.905 / 120 × 1,25 × 2 = 36.477,2 → 36.477.
    const r = calcularColilla(
      entradaBase({
        vinculo: { ingreso: '2025-01-01', retiro: null, integral: false, periodo_salario: 'monthly', jornada_semanal: 24 },
        horas: [{ fecha: '2026-07-10', categoria: 'extra_diurna', recargo: 0.25, divisor: 220, minutos: 120 }],
      })
    );
    expect(valor(r, 'HORA_EXTRA_DIURNA')).toBe(36_477);
    // Una jornada pactada mayor que la legal no cambia nada (el divisor legal manda).
    const s = calcularColilla(
      entradaBase({
        vinculo: { ingreso: '2025-01-01', retiro: null, integral: false, periodo_salario: 'monthly', jornada_semanal: 48 },
        horas: [{ fecha: '2026-07-10', categoria: 'extra_diurna', recargo: 0.25, divisor: 220, minutos: 120 }],
      })
    );
    expect(valor(s, 'HORA_EXTRA_DIURNA')).toBe(19_897);
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

  test('prima: si el salario cambió en cualquier momento del semestre, el promedio del semestre (P23)', () => {
    // Aumento el 1-feb (fuera de los últimos 3 meses): 1.800.000 × 30 + 2.100.000 × 150 = 2.050.000 de promedio.
    // Prima = (2.050.000 + 249.095) × 180 / 360 = 1.149.547,5 → 1.149.548 (con la regla vieja daba 1.174.548).
    const r = calcularColilla(
      entradaBase({
        periodo: { desde: '2026-01-01', hasta: '2026-06-30', tipo: 'prima' },
        salario: [
          { desde: '2026-01-01', hasta: '2026-01-31', valor: 1_800_000 },
          { desde: '2026-02-01', hasta: '2026-06-30', valor: 2_100_000 },
        ],
        acumulado: { desde: '2026-01-01', hasta: '2026-06-30', variables: 0, dias_no_remunerados: 0 },
      })
    );
    expect(valor(r, 'PRIMA_SERVICIOS')).toBe(1_149_548);
    expect(r.items.find((i) => i.codigo === 'PRIMA_SERVICIOS')?.detalle).toMatchObject({ salario_promediado: true });
  });

  test('embargo de alimentos sobre la prima solo si el oficio lo ordena (P20)', () => {
    // Prima del caso 17: 1.174.548. Oficio de alimentos del 30 % que incluye prestaciones: 352.364.
    const base = {
      periodo: { desde: '2026-01-01', hasta: '2026-06-30', tipo: 'prima' as const },
      salario: salarioFijo(2_000_000, '2026-01-01', '2026-06-30'),
      acumulado: { desde: '2026-01-01', hasta: '2026-06-30', variables: 600_000, dias_no_remunerados: 0 },
    };
    const emb = { id: 'e1', tipo: 'alimentos' as const, recibido: '2026-03-01', modo: 'porcentaje' as const, valor: 0.3, saldo: null };
    const con = calcularColilla(entradaBase({ ...base, embargos: [{ ...emb, incluye_prestaciones: true }] }));
    expect(valor(con, 'EMBARGO_ALIMENTOS')).toBe(352_364);
    const sin = calcularColilla(entradaBase({ ...base, embargos: [emb] }));
    expect(tiene(sin, 'EMBARGO_ALIMENTOS')).toBe(false);
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
    // ARL solo por los 20 días trabajados (P12): 2.000.000 × 0,522 % = 10.440 → 10.500.
    expect(r.bases.ibc_arl).toBe(2_000_000);
    expect(valor(r, 'ARL')).toBe(10_500);
  });

  test('vacaciones con aumento durante el disfrute: el salario fijo es el del día en que empiezan (P6)', () => {
    // Vacaciones del 6 al 15 de julio; el salario sube de 3.000.000 a 3.300.000 el 10-jul.
    // Vacaciones = (3.000.000 + 300.000) / 30 × 10 = 1.100.000. Salario: 5 días × 100.000 + 15 días × 110.000 = 2.150.000.
    const r = calcularColilla(
      entradaBase({
        salario: [
          { desde: '2026-07-01', hasta: '2026-07-09', valor: 3_000_000 },
          { desde: '2026-07-10', hasta: '2026-07-31', valor: 3_300_000 },
        ],
        promedio_variable_mensual: 300_000,
        ausencias: [{ id: 'v1', clase: 'vacaciones', pagada: true, desde: '2026-07-06', hasta: '2026-07-15', tramos: [{ desde: '2026-07-06', hasta: '2026-07-15', paga: 'empleador', fraccion: 1 }] }],
      })
    );
    expect(valor(r, 'VACACIONES_DISFRUTADAS')).toBe(1_100_000);
    expect(valor(r, 'SALARIO')).toBe(2_150_000);
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
    // Neto del ajuste: 100.000 − 8.000 = 92.000.
    expect(por.BONIFICACION_SALARIAL - por.SALUD_EMPLEADO - por.PENSION_EMPLEADO).toBe(92_000);
    // El ajuste recalcula también los aportes del empleador y las provisiones (respuesta del caso 20).
    // Pensión: (1.850.905 × 16 % = 296.144,8 → 296.200) − 74.036 = 222.164; antes 210.164: +12.000.
    expect(por.PENSION_EMPLEADOR).toBe(12_000);
    expect(por.PROVISION_CESANTIAS).toBe(8_333);
    expect(por.PROVISION_PRIMA).toBe(8_333);
  });

  test('el período reporta un vínculo con error como bloqueo sin tumbar a los demás', () => {
    const malo = entradaBase({ vinculo_id: 'b', salario: [] });
    const bueno = entradaBase({ vinculo_id: 'a' });
    const p = calcularPeriodo([malo, bueno]);
    expect(p.colillas.map((c) => c.vinculo_id)).toEqual(['a']);
    expect(p.bloqueos[0]).toMatchObject({ codigo: 'salario_sin_vigencia', detalle: { vinculo_id: 'b' } });
    expect(p.totales.neto).toBe(1_859_928);
  });
});
