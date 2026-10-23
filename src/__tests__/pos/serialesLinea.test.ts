import {
  disposicionPorDefecto,
  erroresDevolucionPantalla,
  mismoId,
  serialesVendidosDeLinea,
  serialesVisiblesDeLinea,
} from '@/lib/pos/devoluciones/serialesLinea';

const VENDIDO = {
  id: 11,
  serial: 'SER-001',
  status: 'sold',
  product_id: 7,
  sale_id: 'venta-1',
};

describe('seriales de la línea', () => {
  test('el id del producto se compara como número', () => {
    expect(mismoId('7', 7)).toBe(true);
    expect(mismoId('7', 8)).toBe(false);
    expect(mismoId(null, 7)).toBe(false);
  });

  test('si la línea no guardó serial_ids, usa los vendidos de esa venta', () => {
    const deOtra = { ...VENDIDO, id: 12, serial: 'SER-002', sale_id: 'venta-2' };
    const otroProducto = { ...VENDIDO, id: 13, product_id: 8, serial: 'SER-003' };
    const yaDevuelto = { ...VENDIDO, id: 14, status: 'in_stock', serial: 'SER-004' };
    const lista = serialesVendidosDeLinea({
      serialIds: [],
      productId: '7',
      saleId: 'venta-1',
      vendidos: [VENDIDO, deOtra, otroProducto, yaDevuelto],
    });
    expect(lista.map((s) => s.serial)).toEqual(['SER-001']);
  });

  test('serial_ids de la línea gana, aunque el respaldo traiga más vendidos', () => {
    const segundo = { ...VENDIDO, id: 12, serial: 'SER-002' };
    const lista = serialesVendidosDeLinea({
      serialIds: [12],
      productId: 7,
      saleId: 'venta-1',
      vendidos: [VENDIDO, segundo],
    });
    expect(lista.map((s) => s.id)).toEqual([12]);
  });

  test('un serial ya devuelto que sigue en serial_ids no se ofrece', () => {
    const lista = serialesVendidosDeLinea({
      serialIds: [11],
      productId: 7,
      saleId: 'venta-1',
      vendidos: [{ ...VENDIDO, status: 'damaged' }],
    });
    expect(lista).toEqual([]);
  });

  test('el detalle muestra el serial de la línea aunque ya no esté vendido', () => {
    const visibles = serialesVisiblesDeLinea({
      serialIds: [11],
      productId: 7,
      saleId: 'venta-1',
      catalogo: [{ id: 11, codigo: 'SER-002', product_id: 7, sale_id: null }],
    });
    expect(visibles).toEqual([{ id: 11, codigo: 'SER-002' }]);
  });
});

describe('disposición y errores en línea', () => {
  test('vuelve a stock solo si el motivo repone', () => {
    expect(disposicionPorDefecto(true)).toBe('in_stock');
    expect(disposicionPorDefecto(false)).toBe('damaged');
  });

  test('sin seriales vendidos el error queda en la línea, no solo como aviso general', () => {
    const r = erroresDevolucionPantalla({
      motivoGeneral: 'se dañó',
      lineas: [{
        id: 'l1',
        selected: true,
        return_quantity: 0,
        reason: 'DEF',
        track_serial: true,
        serialesDisponibles: 0,
        serialesElegidos: 0,
      }],
    });
    expect(r.generales).toContain('sinSerialesEnLinea');
    expect(r.generales).not.toContain('sinItems');
    expect(r.porLinea.l1).toBe('sinSerialesEnLinea');
  });

  test('una línea sin marcar no exige serial ni motivo', () => {
    const r = erroresDevolucionPantalla({
      motivoGeneral: 'motivo',
      lineas: [{
        id: 'l1',
        selected: false,
        return_quantity: 0,
        reason: '',
        track_serial: true,
        serialesDisponibles: 1,
        serialesElegidos: 0,
      }],
    });
    expect(r.generales).toEqual(['sinItems']);
    expect(r.porLinea).toEqual({});
  });
});
