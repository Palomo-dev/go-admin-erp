import { cuentaAuxiliarDeTitulo, cuentaCostoPorSector } from '../cuentaAuxiliarDeTitulo';
import { clasificarProductoRestaurante } from '../clasificacionInventarioRestaurante';

describe('cuentaAuxiliarDeTitulo (paridad con fn_cuenta_auxiliar_de_titulo)', () => {
  test('sin mapeo: auxiliar estándar de 8 dígitos', () => {
    expect(cuentaAuxiliarDeTitulo('6135')).toBe('61350501');
    expect(cuentaAuxiliarDeTitulo('4295')).toBe('42959501');
    expect(cuentaAuxiliarDeTitulo('530515')).toBe('53051501');
    expect(cuentaAuxiliarDeTitulo('613505')).toBe('61350501');
  });

  test('mapeo de la sede por la cuenta base', () => {
    expect(cuentaAuxiliarDeTitulo('6135', { mapeoSede: { '6135': '61350599' } })).toBe('61350599');
  });

  test('override 61350502 busca el mapeo por su base 6135', () => {
    expect(cuentaAuxiliarDeTitulo('61350502', { mapeoSede: { '6135': '61350577' } })).toBe('61350577');
    expect(cuentaAuxiliarDeTitulo('61350502')).toBe('61350502');
  });

  test('tarifa 5 (redondeada) elige el auxiliar 02 y solo el mapeo del 5%', () => {
    expect(cuentaAuxiliarDeTitulo('240805', { tarifa: 5 })).toBe('24080502');
    expect(cuentaAuxiliarDeTitulo('240805', { tarifa: 4.9999 })).toBe('24080502');
    expect(cuentaAuxiliarDeTitulo('240805', { tarifa: 19 })).toBe('24080501');
    expect(cuentaAuxiliarDeTitulo('240805', { tarifa: 5, mapeoSede: { '240805': '24080599' } })).toBe('24080502');
    expect(cuentaAuxiliarDeTitulo('24080501', { tarifa: 5 })).toBe('24080502');
  });

  test('2408 por lado', () => {
    expect(cuentaAuxiliarDeTitulo('2408', { lado: 'generado' })).toBe('24080501');
    expect(cuentaAuxiliarDeTitulo('2408', { lado: 'descontable' })).toBe('24081001');
    expect(cuentaAuxiliarDeTitulo('2408', { lado: 'descontable', tarifa: 5 })).toBe('24081002');
  });

  test('un mapeo a subcuenta de título o a un grupo no se devuelve', () => {
    for (const malo of ['613505', '429595', '370505', '539595', '429581', '6140', '6135']) {
      expect(cuentaAuxiliarDeTitulo('6135', { mapeoSede: { '6135': malo } })).toBe('61350501');
    }
  });

  test('overrides no P1 nunca salen como grupo: caen al auxiliar por defecto', () => {
    expect(cuentaAuxiliarDeTitulo('6140')).toBe('61400501');
    expect(cuentaAuxiliarDeTitulo('613505')).toBe('61350501');
    expect(cuentaAuxiliarDeTitulo('5105', { tipoOrg: 1 })).toBe('61400501');
    expect(cuentaAuxiliarDeTitulo('5105', {}, '53051501')).toBe('53051501');
    expect(cuentaAuxiliarDeTitulo('51050501', { mapeoSede: { '51050501': '99999999' } })).toBe('51050501');
  });

  test('paso 3: con plan, el original mientras siga de movimiento (antes de 134060)', () => {
    const plan = new Set(['6135']);
    expect(cuentaAuxiliarDeTitulo('6135', { cuentasMovimiento: plan })).toBe('6135');
    expect(cuentaAuxiliarDeTitulo('6135', { cuentasMovimiento: new Set(['61350501']) })).toBe('61350501');
  });

  test('restaurante: costo 61400501', () => {
    expect(cuentaCostoPorSector(1)).toBe('6140');
    expect(cuentaAuxiliarDeTitulo(cuentaCostoPorSector(1), { tipoOrg: 1 })).toBe('61400501');
    expect(cuentaAuxiliarDeTitulo(cuentaCostoPorSector(3))).toBe('61350501');
  });
});

describe('clasificarProductoRestaurante', () => {
  test('comercio siempre 14350101', () => {
    expect(clasificarProductoRestaurante(3, { esIngrediente: true }).cuentaInventario).toBe('14350101');
  });
  test('ingrediente = insumo 14050501 / 61400501; si se vende solo, revisión', () => {
    const r = clasificarProductoRestaurante(1, { esIngrediente: true, seVendeSolo: true });
    expect(r).toMatchObject({ clase: 'insumo', cuentaInventario: '14050501', cuentaCosto: '61400501' });
    expect(r.revisar).not.toBeNull();
  });
  test('plato: costo 61400501, mermas 61400502, inventario solo con stock y en revisión', () => {
    expect(clasificarProductoRestaurante(2, { isComposite: true })).toMatchObject({ clase: 'plato', cuentaInventario: null, cuentaMerma: '61400502', revisar: null });
    const r = clasificarProductoRestaurante(1, { productionType: 'preparation', trackStock: true });
    expect(r.cuentaInventario).toBe('14350101');
    expect(r.revisar).not.toBeNull();
  });
  test('reventa y desconocido 14350101; override del producto manda', () => {
    expect(clasificarProductoRestaurante(1, {}).clase).toBe('reventa');
    expect(clasificarProductoRestaurante(1, null).cuentaInventario).toBe('14350101');
    expect(clasificarProductoRestaurante(1, { esIngrediente: true, cuentaInventario: '14350102', cuentaCosto: '6140' }))
      .toMatchObject({ cuentaInventario: '14350102', cuentaCosto: '61400501', override: true });
  });
});
