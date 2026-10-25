import {
  CONFIG_ASIENTOS_INICIAL,
  REGLAS_ASIENTO,
  armarAsiento,
  armarCierreAnual,
  configurarRegla,
  exigirCuadre,
  type AsientoArmado,
  type ConfigAsientos,
  type LineaGenerada,
} from '@/lib/finanzas/contador';

type Esperada = [number, string, 'debito' | 'credito', number];

function espera(asiento: AsientoArmado, esperadas: Esperada[]): LineaGenerada[] {
  const cuadrado = exigirCuadre(asiento);
  expect(cuadrado.lineas.map((linea) => [linea.id, linea.cuenta, linea.lado, linea.centavos])).toEqual(esperadas);
  expect(cuadrado.debitosCentavos).toBe(cuadrado.creditosCentavos);
  return cuadrado.lineas;
}

describe('Fase 3 — 41 reglas de asientos y cuadre', () => {
  const vistos = new Set<number>();

  function ver(asiento: AsientoArmado, esperadas: Esperada[]) {
    for (const linea of espera(asiento, esperadas)) vistos.add(linea.id);
  }

  test('el catálogo tiene las 41 líneas, cada una configurable', () => {
    expect(REGLAS_ASIENTO).toHaveLength(41);
    expect(REGLAS_ASIENTO.map((regla) => regla.id)).toEqual(Array.from({ length: 41 }, (_, i) => i + 1));
    const eventos = new Set(REGLAS_ASIENTO.map((regla) => regla.evento));
    expect(eventos.size).toBe(11);
    expect(REGLAS_ASIENTO.filter((regla) => regla.evento === 'devolucion_compras')).toHaveLength(3);
    expect(REGLAS_ASIENTO.find((regla) => regla.id === 36)?.nota).toMatch(/retenciones/);
    expect(REGLAS_ASIENTO.find((regla) => regla.id === 41)?.alternativas).toEqual(['3610']);
    expect(REGLAS_ASIENTO.find((regla) => regla.id === 39)?.lado).toBe('segun_saldo');
  });

  test('venta de contado: caja, ingreso, IVA y costo', () => {
    ver(armarAsiento('venta_contado', { total: 1190, base: 1000, iva: 190, costo: 400 }), [
      [1, '1105', 'debito', 119000],
      [2, '4135', 'credito', 100000],
      [3, '24080501', 'credito', 19000],
      [4, '61350501', 'debito', 40000],
      [5, '1435', 'credito', 40000],
    ]);
    // 6140 solo existe en hoteles y restaurantes: el override se prueba con configuración de RESTAURANTE.
    const restaurante: ConfigAsientos = { ...CONFIG_ASIENTOS_INICIAL, tipoOrg: 1 };
    const cambiada = configurarRegla(restaurante, 4, '6140');
    // En comercio, 6140 (61400501 no existe) y un grupo no P1 se rechazan, no se sustituyen.
    expect(() => armarAsiento('venta_contado', { total: 1190, base: 1000, iva: 190, costo: 400 }, configurarRegla(CONFIG_ASIENTOS_INICIAL, 4, '6140'))).toThrow(/hoteles y restaurantes/);
    expect(() => armarAsiento('venta_contado', { total: 1190, base: 1000, iva: 190, costo: 400 }, configurarRegla(restaurante, 4, '5105'))).toThrow(/grupo o título/);
    const lineas = espera(armarAsiento('venta_contado', { total: 1190, base: 1000, iva: 190, costo: 400 }, cambiada), [
      [1, '1105', 'debito', 119000],
      [2, '4135', 'credito', 100000],
      [3, '24080501', 'credito', 19000],
      [4, '61400501', 'debito', 40000],
      [5, '1435', 'credito', 40000],
    ]);
    expect(lineas.find((linea) => linea.id === 4)?.cuenta).toBe('61400501');
    const descuadrada = armarAsiento('venta_contado', { total: 1, base: 1000, iva: 190, costo: 0 });
    expect(descuadrada.cuadra).toBe(false);
    expect(() => exigirCuadre(descuadrada)).toThrow(/cuadra/);
  });

  test('compra a crédito practica retenciones solo si es agente retenedor', () => {
    const agente: ConfigAsientos = { ...CONFIG_ASIENTOS_INICIAL, agenteRetenedor: true };
    ver(armarAsiento('compra_credito', { base: 1000, iva: 190, retefuente: 25, reteiva: 19, reteica: 10 }, agente), [
      [6, '1435', 'debito', 100000],
      [7, '24081001', 'debito', 19000],
      [8, '23654001', 'credito', 2500],
      [9, '2367', 'credito', 1900],
      [10, '2368', 'credito', 1000],
      [11, '22050501', 'credito', 113600],
    ]);
    espera(armarAsiento('compra_credito', { base: 1000, iva: 190, retefuente: 25, reteiva: 19, reteica: 10 }), [
      [6, '1435', 'debito', 100000],
      [7, '24081001', 'debito', 19000],
      [11, '22050501', 'credito', 119000],
    ]);
  });

  test('venta con retenciones del cliente, con autorretención y cuenta de cobro alternativa', () => {
    const base: ConfigAsientos = { ...CONFIG_ASIENTOS_INICIAL, autorretencion: true };
    const lineas = espera(armarAsiento('venta_retenciones', {
      neto: 900, retefuente: 40, reteiva: 30, reteica: 20,
    }, base), [
      [12, '1110', 'debito', 90000],
      [13, '135515', 'debito', 4000],
      [14, '135517', 'debito', 3000],
      [15, '135518', 'debito', 2000],
      [16, '1305', 'credito', 99000],
    ]);
    expect(lineas.every((linea) => linea.autorretencion)).toBe(true);
    expect(lineas.find((linea) => linea.id === 13)?.tercero).toBe('cliente_retenedor');
    for (const linea of lineas) vistos.add(linea.id);
    const enCartera = configurarRegla(base, 12, '1305');
    espera(armarAsiento('venta_retenciones', { neto: 900, retefuente: 40, reteiva: 30, reteica: 20 }, enCartera), [
      [12, '1305', 'debito', 90000],
      [13, '135515', 'debito', 4000],
      [14, '135517', 'debito', 3000],
      [15, '135518', 'debito', 2000],
      [16, '1305', 'credito', 99000],
    ]);
  });

  test('propina cobrada y propina repartida', () => {
    ver(armarAsiento('propina_cobrada', { propina: 50 }), [
      [17, '1105', 'debito', 5000],
      [18, '2815', 'credito', 5000],
    ]);
    const banco = configurarRegla(CONFIG_ASIENTOS_INICIAL, 17, '1110');
    espera(armarAsiento('propina_cobrada', { propina: 50 }, banco), [
      [17, '1110', 'debito', 5000],
      [18, '2815', 'credito', 5000],
    ]);
    expect(REGLAS_ASIENTO.find((regla) => regla.id === 18)?.nota).toMatch(/1935/);
    ver(armarAsiento('propina_repartida', { propina: 50 }), [
      [19, '2815', 'debito', 5000],
      [20, '1105', 'credito', 5000],
    ]);
  });

  test('venta por pasarela no lleva costo, y la liquidación cuadra con la comisión', () => {
    const venta = espera(armarAsiento('venta_pasarela', { total: 1190, base: 1000, iva: 190 }), [
      [21, '1305', 'debito', 119000],
      [22, '4135', 'credito', 100000],
      [23, '24080501', 'credito', 19000],
    ]);
    expect(venta.find((linea) => linea.id === 21)?.tercero).toBe('pasarela');
    expect(venta.some((linea) => linea.cuenta === '6135' || linea.cuenta === '1435')).toBe(false);
    for (const linea of venta) vistos.add(linea.id);

    const conFactura: ConfigAsientos = { ...CONFIG_ASIENTOS_INICIAL, facturanIvaComision: true };
    ver(armarAsiento('liquidacion_pasarela', {
      neto: 1000, comision: 50, ivaComision: 9.5, retencionesRed: 10,
    }, conFactura), [
      [24, '1110', 'debito', 100000],
      [25, '53051501', 'debito', 5000],
      [26, '24081001', 'debito', 950],
      [27, '1355', 'debito', 1000],
      [28, '1305', 'credito', 106950],
    ]);
    espera(armarAsiento('liquidacion_pasarela', {
      neto: 1000, comision: 50, ivaComision: 9.5, retencionesRed: 10,
    }), [
      [24, '1110', 'debito', 100000],
      [25, '53051501', 'debito', 5000],
      [27, '1355', 'debito', 1000],
      [28, '1305', 'credito', 106000],
    ]);
  });

  test('devolución en ventas y devolución en compras, sin líneas de más', () => {
    ver(armarAsiento('devolucion_ventas', { base: 1000, iva: 190, costo: 400 }), [
      [29, '4175', 'debito', 100000],
      [30, '24080501', 'debito', 19000],
      [31, '1305', 'credito', 119000],
      [32, '1435', 'debito', 40000],
      [33, '61350501', 'credito', 40000],
    ]);
    const efectivo = configurarRegla(CONFIG_ASIENTOS_INICIAL, 31, '1105');
    espera(armarAsiento('devolucion_ventas', { base: 1000, iva: 190, costo: 400 }, efectivo), [
      [29, '4175', 'debito', 100000],
      [30, '24080501', 'debito', 19000],
      [31, '1105', 'credito', 119000],
      [32, '1435', 'debito', 40000],
      [33, '61350501', 'credito', 40000],
    ]);
    const compras = espera(armarAsiento('devolucion_compras', { base: 1000, iva: 190 }), [
      [34, '22050501', 'debito', 119000],
      [35, '1435', 'credito', 100000],
      [36, '24081001', 'credito', 19000],
    ]);
    expect(compras).toHaveLength(3);
    expect(compras.some((linea) => linea.cuenta.startsWith('236'))).toBe(false);
    for (const linea of compras) vistos.add(linea.id);
  });

  test('la transferencia usa auxiliares distintos de 1110 o 1120', () => {
    const bancos: ConfigAsientos = {
      ...CONFIG_ASIENTOS_INICIAL,
      auxiliarDestino: '11100501',
      auxiliarOrigen: '11200502',
    };
    ver(armarAsiento('transferencia_bancos', { valor: 500 }, bancos), [
      [37, '11100501', 'debito', 50000],
      [38, '11200502', 'credito', 50000],
    ]);
    expect(REGLAS_ASIENTO.find((regla) => regla.id === 37)?.tercero).toBe('banco_destino');
    expect(() => armarAsiento('transferencia_bancos', { valor: 500 }, {
      ...bancos,
      auxiliarOrigen: '11100501',
    })).toThrow(/distintos/);
    expect(() => armarAsiento('transferencia_bancos', { valor: 500 }, {
      ...CONFIG_ASIENTOS_INICIAL,
      auxiliarDestino: '1105',
      auxiliarOrigen: '11100502',
    })).toThrow(/auxiliar/);
  });

  test('el cierre anual pasa por 5905 y la pérdida queda al débito de 3610', () => {
    const utilidad = armarCierreAnual([
      { cuenta: '4135', saldoDebito: -1000 },
      { cuenta: '5105', saldoDebito: 300 },
      { cuenta: '6135', saldoDebito: 100 },
      { cuenta: '74', saldoDebito: 50 },
    ]);
    exigirCuadre(utilidad);
    expect(utilidad.omitidas).toEqual(['74']);
    expect(utilidad.lineas.some((linea) => linea.cuenta === '74')).toBe(false);
    expect(utilidad.lineas.filter((linea) => linea.id === 39).map((linea) => [linea.cuenta, linea.lado, linea.centavos])).toEqual([
      ['4135', 'debito', 100000],
      ['5105', 'credito', 30000],
      ['6135', 'credito', 10000],
    ]);
    const puente = utilidad.lineas.filter((linea) => linea.cuenta === '5905');
    const debito5905 = puente.filter((linea) => linea.lado === 'debito').reduce((s, l) => s + l.centavos, 0);
    const credito5905 = puente.filter((linea) => linea.lado === 'credito').reduce((s, l) => s + l.centavos, 0);
    expect(debito5905).toBe(credito5905);
    expect(utilidad.lineas.find((linea) => linea.id === 41)).toMatchObject({ cuenta: '3605', lado: 'credito', centavos: 60000 });

    const perdida = exigirCuadre(armarCierreAnual([
      { cuenta: '4135', saldoDebito: -200 },
      { cuenta: '6135', saldoDebito: 900 },
    ]));
    expect(perdida.lineas.find((linea) => linea.id === 41)).toMatchObject({ cuenta: '3610', lado: 'debito', centavos: 70000 });
    const puentePerdida = perdida.lineas.filter((linea) => linea.cuenta === '5905');
    expect(puentePerdida.reduce((s, l) => s + (l.lado === 'debito' ? l.centavos : -l.centavos), 0)).toBe(0);
    for (const linea of utilidad.lineas) vistos.add(linea.id);
    for (const linea of perdida.lineas) vistos.add(linea.id);
    expect(() => armarCierreAnual([{ cuenta: '3605', saldoDebito: 10 }])).toThrow(/4, 5 y 6/);
  });

  test('las 41 líneas quedaron cubiertas por un asiento que cuadra', () => {
    expect(Array.from(vistos).sort((a, b) => a - b)).toEqual(Array.from({ length: 41 }, (_, i) => i + 1));
  });
});
