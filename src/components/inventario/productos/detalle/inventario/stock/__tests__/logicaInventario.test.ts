import {
  agregarStockLevels,
  armarCsv,
  celdaCsv,
  claveVarianteSucursal,
  nombreArchivoKardex,
  rutaAjuste,
  rutaAjustePorConteo,
  rutaKardexCompleto,
  rutaKardexLote,
  rutaLotesProducto,
  rutaTransferencia,
} from '../logicaInventario';

describe('rutas de inventario', () => {
  it('el ajuste lleva producto, tipo y sucursal con los nombres que lee NuevoAjusteForm', () => {
    expect(rutaAjuste(7, 'entrada', 3)).toBe('/app/inventario/ajustes/nuevo?producto_id=7&type=entrada&branchId=3');
    expect(rutaAjuste(null, 'salida', null)).toBe('/app/inventario/ajustes/nuevo?type=salida');
    expect(rutaAjuste(null, null)).toBe('/app/inventario/ajustes/nuevo');
  });

  it('la transferencia preselecciona producto y origen', () => {
    expect(rutaTransferencia(7, 2)).toBe('/app/inventario/transferencias/nuevo?producto_id=7&origen=2');
  });
});

describe('agregarStockLevels', () => {
  it('suma las filas de lote por variante y sucursal y pondera el costo', () => {
    const r = agregarStockLevels([
      { product_id: 1, branch_id: 10, qty_on_hand: '10', qty_reserved: '2', min_level: '5', avg_cost: '100', updated_at: '2026-09-01T10:00:00Z' },
      { product_id: 1, branch_id: 10, qty_on_hand: 30, qty_reserved: 0, min_level: 0, avg_cost: 200, updated_at: '2026-09-05T10:00:00Z' },
      { product_id: 2, branch_id: 10, qty_on_hand: null, qty_reserved: null, min_level: null, avg_cost: null, updated_at: null },
    ]);
    const a = r.get(claveVarianteSucursal(1, 10))!;
    expect(a.qty_on_hand).toBe(40);
    expect(a.disponible).toBe(38);
    expect(a.min_level).toBe(5);
    expect(a.avg_cost).toBe(175);
    expect(a.actualizado).toBe('2026-09-05T10:00:00Z');
    expect(a).not.toHaveProperty('valor');
    expect(r.get(claveVarianteSucursal(2, 10))!.qty_on_hand).toBe(0);
  });
});

describe('rutas de B1', () => {
  it('kardex, lote, lotes del producto y ajuste por conteo', () => {
    expect(rutaKardexCompleto(7)).toBe('/app/inventario/kardex?producto=7');
    expect(rutaKardexLote(7, 12)).toBe('/app/inventario/kardex?producto=7&lote=12');
    expect(rutaLotesProducto(7)).toBe('/app/inventario/lotes?producto=7');
    expect(rutaAjustePorConteo([], 3)).toBe('/app/inventario/ajustes/nuevo?modo=conteo&branchId=3');
    expect(rutaAjustePorConteo([7], null)).toBe('/app/inventario/ajustes/nuevo?modo=conteo&producto_id=7');
    expect(rutaAjustePorConteo([7, 8], 3)).toBe('/app/inventario/ajustes/nuevo?modo=conteo&productos=7%2C8&branchId=3');
  });
});

describe('kardex', () => {

  it('arma un CSV con BOM, ; y comillas cuando hace falta', () => {
    expect(celdaCsv('a;b')).toBe('"a;b"');
    expect(celdaCsv('di "x"')).toBe('"di ""x"""');
    expect(celdaCsv('l1\nl2')).toBe('l1 l2');
    expect(armarCsv([['a', 1], [null, 'b']])).toBe('﻿a;1\r\n;b');
    expect(nombreArchivoKardex('ZAP 0042/x', '2026-09-23')).toBe('kardex-ZAP-0042-x-2026-09-23.csv');
  });
});
