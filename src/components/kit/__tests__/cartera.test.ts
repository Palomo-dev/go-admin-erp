/**
 * Kit · cartera (CxC y CxP): tramos de la banda de antigüedad, validación del
 * plan de cuotas y CSV del estado de cuenta. El kit no calcula saldos ni
 * cuotas: solo ordena, valida lo escrito y exporta lo que recibe.
 */
import {
  esTramoAntiguedad,
  estadoCuentaCsv,
  normalizarTramos,
  totalesPlan,
  TRAMOS_ANTIGUEDAD,
  validarPlanCuotas,
  type EstadoCuentaVista,
} from '../documento/carteraLogica';

describe('banda de antigüedad', () => {
  test('acepta el mapa de CxP y la lista de CxC, siempre en el orden de los tramos', () => {
    const deMapa = normalizarTramos({ d31_60: 300, al_dia: 100 });
    expect(deMapa.map((f) => [f.tramo, f.saldo, f.cuentas])).toEqual([
      ['al_dia', 100, null],
      ['d1_30', 0, null],
      ['d31_60', 300, null],
      ['d61_90', 0, null],
      ['d90_mas', 0, null],
    ]);
    const deLista = normalizarTramos([{ tramo: 'd90_mas', saldo: 50, cuentas: 2 }]);
    expect(deLista.find((f) => f.tramo === 'd90_mas')).toMatchObject({ saldo: 50, cuentas: 2, porcentaje: 100 });
  });

  test('porcentajes sobre el total positivo; sin datos, todo en cero', () => {
    const f = normalizarTramos({ al_dia: 100, d1_30: 300, d61_90: -50 });
    expect(f.map((x) => x.porcentaje)).toEqual([25, 75, 0, 0, 0]);
    expect(normalizarTramos(null).every((x) => x.saldo === 0 && x.porcentaje === 0)).toBe(true);
  });

  test('tramos válidos', () => {
    expect(TRAMOS_ANTIGUEDAD).toHaveLength(5);
    expect(esTramoAntiguedad('d61_90')).toBe(true);
    expect(esTramoAntiguedad('d120')).toBe(false);
  });
});

describe('plan de cuotas: validación del formulario', () => {
  const hoy = '2026-09-24';

  test('válido sin errores', () => {
    expect(validarPlanCuotas({ numero: 3, primera: hoy, interes: 0 }, { hoy })).toEqual({});
  });

  test('cuotas entre 1 y el máximo, enteras', () => {
    expect(validarPlanCuotas({ numero: 0, primera: hoy, interes: 0 }, { hoy }).cuotas).toBe(true);
    expect(validarPlanCuotas({ numero: 61, primera: hoy, interes: 0 }, { hoy }).cuotas).toBe(true);
    expect(validarPlanCuotas({ numero: 2.5, primera: hoy, interes: 0 }, { hoy }).cuotas).toBe(true);
    expect(validarPlanCuotas({ numero: 12, primera: hoy, interes: 0 }, { hoy, maxCuotas: 12 }).cuotas).toBeUndefined();
  });

  test('la primera cuota no puede ser anterior a hoy', () => {
    expect(validarPlanCuotas({ numero: 3, primera: '2026-09-23', interes: 0 }, { hoy }).fecha).toBe(true);
    expect(validarPlanCuotas({ numero: 3, primera: '', interes: 0 }, { hoy }).fecha).toBe(true);
  });

  test('el interés solo se valida si el plan lo admite', () => {
    expect(validarPlanCuotas({ numero: 3, primera: hoy, interes: 150 }, { hoy }).interes).toBeUndefined();
    expect(validarPlanCuotas({ numero: 3, primera: hoy, interes: 150 }, { hoy, conInteres: true }).interes).toBe(true);
    expect(validarPlanCuotas({ numero: 3, primera: hoy, interes: null }, { hoy, conInteres: true }).interes).toBe(true);
  });

  test('totales del plan', () => {
    expect(
      totalesPlan([
        { numero: 1, vence: hoy, capital: 50, interes: 1, valor: 51 },
        { numero: 2, vence: '2026-10-24', capital: 50, valor: 50 },
      ]),
    ).toEqual({ capital: 100, interes: 1, valor: 101 });
  });
});

describe('estado de cuenta: CSV', () => {
  const datos: EstadoCuentaVista = {
    saldoInicial: 1000,
    saldoFinal: 1500,
    vencido: 0,
    porVencer: 1500,
    totalCargos: 700,
    totalAbonos: 200,
    movimientos: [
      { id: 'f-1', dia: '2026-09-01', tipo: 'facturaCompra', documento: 'FC-1 "A"', vence: '2026-10-01', cargo: 700, abono: 0, saldo: 1700 },
      { id: 'p-1', dia: '2026-09-10', tipo: 'pago', documento: null, cargo: 0, abono: 200, saldo: 1500 },
    ],
  };
  const textos = {
    columnas: { fecha: 'Fecha', documento: 'Documento', vence: 'Vence', cargo: 'Cargo', abono: 'Abono', saldo: 'Saldo' },
    saldoInicial: 'Saldo inicial',
    tipo: (t: string) => (t === 'pago' ? 'Pago' : t),
  };

  test('BOM, cabecera, saldo inicial y un movimiento por fila; comillas escapadas', () => {
    const csv = estadoCuentaCsv(datos, textos, (d) => d.split('-').reverse().join('/'));
    const lineas = csv.split('\n');
    expect(lineas[0].charCodeAt(0)).toBe(0xfeff);
    expect(lineas[0].slice(1)).toBe('"Fecha","Documento","Vence","Cargo","Abono","Saldo"');
    expect(lineas[1]).toBe('"Saldo inicial",,,,,"1000"');
    expect(lineas[2]).toBe('"01/09/2026","FC-1 ""A""","01/10/2026","700","0","1700"');
    expect(lineas[3]).toBe('"10/09/2026","Pago","","0","200","1500"');
  });
});
