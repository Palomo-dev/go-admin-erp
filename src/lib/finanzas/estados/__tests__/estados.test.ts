/**
 * Presentación de los estados financieros. El cálculo vive en la base y se
 * prueba con supabase/tests/contador/estados_financieros.sql; aquí se comprueba
 * que las filas conservan esas cifras y que nada se pinta como completo sin serlo.
 */
import { calcularIndicadores, comprasDe } from '../indicadores';
import { auxiliarPorCuenta, esLibro, ordenarDiario, tablaDeLibro } from '../libros';
import { detalleNota, estadoDeNota, faltantesCertificacion } from '../notas';
import {
  detalleResultado,
  filasDeSeccion,
  filasPatrimonio,
  filasPresupuesto,
  filasSinPresupuesto,
  flujoCompleto,
  flujoCuadra,
  patrimonioConOtros,
  patrimonioCuadra,
  resultadoIntegralDe,
  resultadoPorFuncion,
  resultadoPorNaturaleza,
  signoVariacion,
  textoRenglonFlujo,
} from '../presentacion';
import { rangoDe } from '../fechas';
import type {
  BaseIndicadores,
  ConfiguracionEstados,
  CuentaResultado,
  EstadoFlujos,
  EstadoPatrimonio,
  EstadoResultado,
  FilaPresupuesto,
  LibroInventarios,
  LineaLibro,
} from '../tipos';

function flujo(parcial: Partial<EstadoFlujos> = {}): EstadoFlujos {
  return {
    desde: '2026-01-01', hasta: '2026-12-31', utilidad: 0, filas: [], operacion: 0, inversion: 0,
    financiacion: 0, pendiente: 0, efecto_cambiario: 0, variacion: 0, efectivo_inicial: 0,
    efectivo_final: 0, diferencia: 0, restringido: { inicial: 0, final: 0 }, cuentas_efectivo: [],
    pendientes_cuentas: [], revisar_cuentas: [], sin_efectivo: [],
    avisos: { borradores: 0, fallos: 0, fallos_monto: 0 },
    politicas: { intereses_pagados: 'operacion', intereses_recibidos: 'operacion', dividendos_recibidos: 'operacion', dividendos_pagados: 'financiacion', impuestos: 'operacion' },
    politicas_confirmadas: false,
    ...parcial,
  };
}

const cuenta = (codigo: string, neto: number): CuentaResultado => ({ cuenta: codigo, codigo, nombre: `Cuenta ${codigo}`, neto });
const resultado = (cuentas: CuentaResultado[], ori = 0): EstadoResultado => ({
  desde: '2026-01-01', hasta: '2026-12-31', cuentas, ori,
  utilidad: cuentas.reduce((s, c) => s + c.neto, 0),
});

describe('flujo de efectivo', () => {
  it('une los dos años por renglón y muestra cero donde un año no tiene movimiento', () => {
    const a = flujo({ filas: [{ seccion: 'inversion', tipo: 'movimiento', grupo: '15', sentido: 'salida', nombre: 'Propiedades', valor: -1000 }] });
    const b = flujo({ filas: [{ seccion: 'inversion', tipo: 'movimiento', grupo: '16', sentido: 'salida', nombre: 'Intangibles', valor: -50 }] });
    const filas = filasDeSeccion('inversion', a, b);
    expect(filas.map((f) => [f.grupo, f.actual, f.anterior])).toEqual([['15', -1000, 0], ['16', 0, -50]]);
  });

  it('sin comparativo la columna anterior queda nula, no en cero', () => {
    const a = flujo({ filas: [{ seccion: 'operacion', tipo: 'variacion', grupo: '13', sentido: null, nombre: null, valor: 5 }] });
    expect(filasDeSeccion('operacion', a, null)[0].anterior).toBeNull();
  });

  it('ajustes antes que variaciones, como en el método indirecto', () => {
    const a = flujo({ filas: [
      { seccion: 'operacion', tipo: 'variacion', grupo: '13', sentido: null, nombre: null, valor: 1 },
      { seccion: 'operacion', tipo: 'ajuste', grupo: 'depreciacion_amortizacion', sentido: null, nombre: null, valor: 2 },
    ] });
    expect(filasDeSeccion('operacion', a, null).map((f) => f.texto)).toEqual(['ajuste.depreciacion_amortizacion', 'variacion.g13']);
  });

  it('un grupo sin rótulo propio usa el nombre del plan', () => {
    expect(textoRenglonFlujo({ seccion: 'operacion', tipo: 'variacion', grupo: '17', sentido: null })).toBeNull();
    expect(textoRenglonFlujo({ seccion: 'financiacion', tipo: 'movimiento', grupo: '21', sentido: 'salida' })).toBe('financiacion.g21.salida');
  });

  it('con importes pendientes no se presenta como completo aunque cuadre', () => {
    const f = flujo({ pendiente: -800, pendientes_cuentas: [{ cuenta: '1305', nombre: null, valor: -800 }] });
    expect(flujoCuadra(f)).toBe(true);
    expect(flujoCompleto(f)).toBe(false);
    expect(flujoCompleto(flujo({ revisar_cuentas: [{ cuenta: '4245', nombre: null, valor: 50 }] }))).toBe(false);
    expect(flujoCompleto(flujo())).toBe(true);
  });

  it('una diferencia no cuadra', () => {
    expect(flujoCuadra(flujo({ diferencia: 2 }))).toBe(false);
  });
});

describe('cambios en el patrimonio', () => {
  const estado = (filas: EstadoPatrimonio['filas'], diferencia = 0): EstadoPatrimonio => ({
    desde: '2026-01-01', hasta: '2026-12-31', filas, utilidad: 0, saldo_final: 0, patrimonio_balance: 0, diferencia,
  });

  it('agrupa 31 y 32 en capital y oculta «Otros» cuando queda en cero', () => {
    const { filas, columnas } = filasPatrimonio(estado([
      { clave: 'saldo_final', valores: { '31': 10, '32': 5, '36': 1 }, total: 16 },
      { clave: 'saldo_inicial', valores: null, total: 0 },
    ]));
    expect(filas.map((f) => f.clave)).toEqual(['saldo_inicial', 'saldo_final']);
    expect(filas[1].valores.capital).toBe(15);
    expect(columnas).toEqual(['capital', 'reservas', 'ejercicio', 'acumulados']);
  });

  it('las cuentas 34, 35 y 38 aparecen en «Otros»', () => {
    const { columnas, filas } = filasPatrimonio(estado([{ clave: 'ori', valores: { '38': 7 }, total: 7 }]));
    expect(columnas).toContain('otros');
    expect(filas[0].valores.otros).toBe(7);
  });

  it('avisa los movimientos sin clasificar y una diferencia con el balance', () => {
    expect(patrimonioConOtros(estado([{ clave: 'otros', valores: { '37': 9 }, total: 9 }]))).toBe(true);
    expect(patrimonioCuadra(estado([], 5))).toBe(false);
  });
});

describe('resultado integral', () => {
  const cuentas = [
    cuenta('4135', 47420), cuenta('4210', 100), cuenta('6135', -25400), cuenta('510506', -8900),
    cuenta('511005', -3000), cuenta('512010', -1100), cuenta('513505', -1000), cuenta('516010', -1300),
    cuenta('519505', -2260), cuenta('540505', -500),
  ];

  it('por naturaleza suma lo mismo que la utilidad', () => {
    const e = resultado(cuentas);
    const filas = resultadoPorNaturaleza(e, null);
    expect(filas.find((f) => f.clave === 'honorarios')?.actual).toBe(-5100);
    expect(filas.find((f) => f.clave === 'renta')?.actual).toBe(-500);
    expect(filas.reduce((s, f) => s + f.actual, 0)).toBeCloseTo(e.utilidad, 2);
  });

  it('por función suma lo mismo que por naturaleza', () => {
    const e = resultado(cuentas);
    const naturaleza = resultadoPorNaturaleza(e, null).reduce((s, f) => s + f.actual, 0);
    const funcion = resultadoPorFuncion(e, null).reduce((s, f) => s + f.actual, 0);
    expect(funcion).toBeCloseTo(naturaleza, 2);
  });

  it('el comparativo da variación; contra cero no hay porcentaje', () => {
    const filas = resultadoPorNaturaleza(resultado([cuenta('4135', 200), cuenta('6135', -10)]), resultado([cuenta('4135', 100)]));
    expect(filas.find((f) => f.clave === 'ingresos')?.variacion).toBe(100);
    expect(filas.find((f) => f.clave === 'costo_ventas')?.variacion).toBeNull();
  });

  it('el resultado integral suma el ORI marcado', () => {
    expect(resultadoIntegralDe(resultado([cuenta('4135', 100)], 25))).toBe(125);
  });

  it('el detalle por nivel conserva el total', () => {
    const e = resultado(cuentas);
    expect(detalleResultado(e, null, '2').reduce((s, f) => s + f.actual, 0)).toBeCloseTo(e.utilidad, 2);
    expect(detalleResultado(e, null, '6').length).toBeGreaterThan(detalleResultado(e, null, '2').length);
  });
});

describe('indicadores', () => {
  const base: BaseIndicadores = {
    desde: '2026-01-01', hasta: '2026-12-31', dias: 365, activo_corriente: 142, pasivo_corriente: 100, sin_clasificar: 0,
    activo: 200, pasivo: 100, patrimonio: 100, activo_inicial: 100, patrimonio_inicial: 60,
    cartera: 60, cartera_inicial: 40, inventario: 30, inventario_inicial: 10, proveedores: 40, proveedores_inicial: 20,
    ingresos: 1000, costo: 600, resultado_operacional: 112, resultado: 94,
  };

  it('calcula con las fórmulas de la pantalla', () => {
    const i = calcularIndicadores(base);
    expect(i.razon_corriente.valor).toBeCloseTo(1.42);
    expect(i.endeudamiento.valor).toBeCloseTo(50);
    expect(i.margen_neto.valor).toBeCloseTo(9.4);
    expect(i.rotacion_cartera.valor).toBeCloseTo(20);
    expect(i.dias_inventario.valor).toBeCloseTo((20 / 600) * 365);
    expect(i.roe.valor).toBeCloseTo((94 / 80) * 100);
    expect(i.roa.valor).toBeCloseTo((94 / 150) * 100);
  });

  it('las compras se derivan del costo y la variación del inventario', () => {
    expect(comprasDe(base)).toBe(620);
    expect(calcularIndicadores(base).dias_proveedores.valor).toBeCloseTo((30 / 620) * 365);
  });

  it('sin denominador no hay dato, no un cero', () => {
    const i = calcularIndicadores({ ...base, ingresos: 0, pasivo_corriente: 0 });
    expect(i.margen_neto.valor).toBeNull();
    expect(i.razon_corriente.valor).toBeNull();
    expect(i.ciclo_caja.valor).toBeNull();
  });
});

describe('presupuesto', () => {
  const fila = (parcial: Partial<FilaPresupuesto>): FilaPresupuesto => ({
    cuenta: '51', nombre: 'x', tipo: 'expense', presupuesto: 0, real: 0, diferencia: 0, variacion: null,
    presupuestada: true, solapada: false, ...parcial,
  });

  it('una línea dentro de otra no se cuenta dos veces y lo no presupuestado va aparte', () => {
    const filas = [fila({}), fila({ cuenta: '5105', solapada: true }), fila({ cuenta: '4135', presupuestada: false })];
    expect(filasPresupuesto(filas).map((f) => f.cuenta)).toEqual(['51']);
    expect(filasSinPresupuesto(filas).map((f) => f.cuenta)).toEqual(['4135']);
  });

  it('el porcentaje lleva signo y sin base no hay porcentaje', () => {
    expect(signoVariacion(13.4)).toBe('+13 %');
    expect(signoVariacion(-1)).toBe('−1 %');
    expect(signoVariacion(null)).toBe('—');
  });
});

describe('libros', () => {
  const linea = (id: number, cuentaLinea: string, fecha: string, debito: number, credito: number): LineaLibro => ({
    id, asiento: id, fecha, memo: null, cuenta: cuentaLinea, nombre: null, debito, credito, tercero: null,
  });

  it('el diario va por fecha y el auxiliar lleva saldo corrido por cuenta', () => {
    const lineas = [linea(2, '1105', '2026-02-01T00:00:00Z', 0, 40), linea(1, '1105', '2026-01-01T00:00:00Z', 100, 0), linea(3, '4135', '2026-01-15T00:00:00Z', 0, 100)];
    expect(ordenarDiario(lineas).map((l) => l.id)).toEqual([1, 3, 2]);
    expect(auxiliarPorCuenta(lineas).map((l) => [l.cuenta, l.saldo])).toEqual([['1105', 100], ['1105', 60], ['4135', -100]]);
  });

  it('la fecha pasa por el formateador de la organización y avisa si se truncó', () => {
    const tabla = tablaDeLibro('diario', { filas: [linea(1, '1105', '2026-01-01T02:00:00Z', 1, 0)], truncado: true }, () => '31 dic 2025');
    expect(tabla.filas[0][0]).toBe('31 dic 2025');
    expect(tabla.truncado).toBe(true);
  });

  it('solo acepta libros conocidos', () => {
    expect(esLibro('mayor')).toBe(true);
    expect(esLibro('otro')).toBe(false);
    expect(esLibro(null)).toBe(false);
  });
});

describe('notas y certificación', () => {
  const libro = (filas: LibroInventarios['filas'], activos = 0): LibroInventarios => ({
    corte: '2026-12-31', filas, activo: 0, pasivo: 0, patrimonio: 0, resultado_abierto: 0, activos_fijos: activos,
  });
  const config = (parcial: Partial<ConfiguracionEstados> = {}): ConfiguracionEstados => ({
    version: 0, notas: {}, certificacion: {}, politicasConfirmadas: false, marcas: [],
    politicas: flujo().politicas, empresa: { nombre: 'Una empresa', nit: '900000000-1' }, ...parcial,
  });

  it('la nota trae la cuenta aunque solo tenga saldo en un corte', () => {
    const detalle = detalleNota('efectivo', libro([{ codigo: '1105', nombre: 'Caja', saldo: 5 }]), libro([{ codigo: '1110', nombre: 'Bancos', saldo: 7 }]));
    expect(detalle).toEqual([
      { codigo: '1105', nombre: 'Caja', actual: 5, anterior: 0 },
      { codigo: '1110', nombre: 'Bancos', actual: 0, anterior: 7 },
    ]);
  });

  it('estados de cada nota', () => {
    const conEfectivo = libro([{ codigo: '1105', nombre: 'Caja', saldo: 5 }]);
    expect(estadoDeNota('efectivo', config(), conEfectivo)).toBe('completa');
    expect(estadoDeNota('deudores', config(), conEfectivo)).toBe('sin_datos');
    expect(estadoDeNota('ppe', config(), conEfectivo)).toBe('sin_datos');
    expect(estadoDeNota('politicas', config(), conEfectivo)).toBe('por_revisar');
    expect(estadoDeNota('politicas', config({ notas: { politicas: { texto: 'x', revisada: true } } }), conEfectivo)).toBe('completa');
  });

  it('la certificación dice lo que falta para firmar', () => {
    expect(faltantesCertificacion({}, { nombre: '', nit: '' })).toContain('contador_tarjeta');
    expect(faltantesCertificacion({}, { nombre: '', nit: '' })).toContain('empresa_nit');
    expect(faltantesCertificacion({
      representante_nombre: 'A', representante_cedula: '1', contador_nombre: 'B', contador_cedula: '2', contador_tarjeta: '3',
    }, { nombre: 'E', nit: '1' })).toEqual([]);
  });
});

describe('periodo', () => {
  it('valida días reales y en orden', () => {
    expect(rangoDe('2026-01-01', '2026-02-28')).toEqual({ desde: '2026-01-01', hasta: '2026-02-28' });
    expect(rangoDe('2026-02-30', '2026-03-01')).toBeNull();
    expect(rangoDe('2026-03-01', '2026-02-01')).toBeNull();
    expect(rangoDe(null, '2026-02-01')).toBeNull();
  });
});
