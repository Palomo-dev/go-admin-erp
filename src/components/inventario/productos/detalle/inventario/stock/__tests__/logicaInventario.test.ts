import {
  agregarStockLevels,
  armarCsv,
  celdaCsv,
  claveVarianteSucursal,
  estadoVencimiento,
  idsOrdenesCompra,
  nombreArchivoKardex,
  rutaAjuste,
  rutaDocumento,
  rutaTransferencia,
  tonoOrigen,
  ORIGENES_KARDEX,
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

describe('lotes', () => {
  it('clasifica el vencimiento', () => {
    expect(estadoVencimiento(null)).toBe('sin_vencimiento');
    expect(estadoVencimiento(-1)).toBe('vencido');
    expect(estadoVencimiento(0)).toBe('por_vencer');
    expect(estadoVencimiento(30)).toBe('por_vencer');
    expect(estadoVencimiento(31)).toBe('vigente');
  });
});

describe('kardex', () => {
  it('cubre los 22 orígenes del CHECK de stock_movements', () => {
    expect(ORIGENES_KARDEX).toHaveLength(22);
    expect(new Set(ORIGENES_KARDEX).size).toBe(22);
    expect(tonoOrigen('sale')).toBe('peligro');
    expect(tonoOrigen('otro')).toBe('neutro');
  });

  it('enlaza el documento según el origen', () => {
    expect(rutaDocumento('invoice_sale', 'abc')).toBe('/app/finanzas/facturas-venta/abc');
    expect(rutaDocumento('purchase_invoice', 'u-1')).toBe('/app/inventario/facturas-compra/u-1');
    expect(rutaDocumento('adjustment', '15')).toBe('/app/inventario/ajustes/15');
    expect(rutaDocumento('transfer_in', '9')).toBe('/app/inventario/transferencias/9');
    expect(rutaDocumento('purchase_order', '4')).toBeNull();
    expect(rutaDocumento('purchase_order', '4', new Map([[4, 'uuid-4']]))).toBe('/app/inventario/ordenes-compra/uuid-4');
    expect(rutaDocumento('sale', '1')).toBeNull();
    expect(rutaDocumento('adjustment', null)).toBeNull();
  });

  it('solo pide los uuid de órdenes de compra con id numérico', () => {
    expect(
      idsOrdenesCompra([
        { origen: 'purchase_order', origen_id: '4' },
        { origen: 'purchase', origen_id: '4' },
        { origen: 'purchase', origen_id: 'x' },
        { origen: 'sale', origen_id: '5' },
      ]),
    ).toEqual([4]);
  });

  it('arma un CSV con BOM, ; y comillas cuando hace falta', () => {
    expect(celdaCsv('a;b')).toBe('"a;b"');
    expect(celdaCsv('di "x"')).toBe('"di ""x"""');
    expect(celdaCsv('l1\nl2')).toBe('l1 l2');
    expect(armarCsv([['a', 1], [null, 'b']])).toBe('﻿a;1\r\n;b');
    expect(nombreArchivoKardex('ZAP 0042/x', '2026-09-23')).toBe('kardex-ZAP-0042-x-2026-09-23.csv');
  });
});
