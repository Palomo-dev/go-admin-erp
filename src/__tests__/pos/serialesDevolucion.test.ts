/**
 * Devolución con seriales y plazo de garantía sin fecha de fin.
 * Puro: no llama a Supabase ni nombra organizaciones.
 */
import { parametrosProcesarDevolucion } from '@/lib/pos/devoluciones/procesarDevolucion';
import {
  camposEnvioLinea,
  disposicionPorDefecto,
  serialesVendidosDeLinea,
  type SerialDeLinea,
} from '@/lib/pos/devoluciones/serialesLinea';
import { situacionGarantia } from '@/components/inventario/seriales/logica';

const ORG = 120;
const VENTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const vendido = (parcial: Partial<SerialDeLinea>): SerialDeLinea => ({
  id: 1,
  serial: 'SN-1',
  status: 'sold',
  product_id: 9,
  sale_id: VENTA,
  ...parcial,
});

describe('disposición de seriales en la devolución', () => {
  it('el defecto es volver a stock si el motivo repone, y dañado si no', () => {
    expect(disposicionPorDefecto(true)).toBe('in_stock');
    expect(disposicionPorDefecto(false)).toBe('damaged');
  });

  it('el envío arma serial_dispositions y el peso manda restock', () => {
    const serial = camposEnvioLinea({
      track_serial: true,
      selected_serial_ids: [7, 8],
      serial_dispositions: { '7': 'damaged' },
      afectaInventario: true,
      restock: false,
    });
    expect(serial).toEqual({
      serial_number_ids: [7, 8],
      serial_dispositions: { '7': 'damaged', '8': 'in_stock' },
    });

    const parametros = parametrosProcesarDevolucion(ORG, VENTA, {
      items: [{
        sale_item_id: 'linea-1',
        return_quantity: 2,
        reason: 'cambio',
        ...serial,
      }],
      refund_method: 'cash',
      reason: 'cambio',
    }, 'idem-1');
    expect(parametros.p_items[0]).toMatchObject({
      serial_ids: [7, 8],
      serial_dispositions: { '7': 'damaged', '8': 'in_stock' },
    });
    expect(parametros.p_items[0]).not.toHaveProperty('restock');

    const peso = camposEnvioLinea({
      track_serial: false,
      selected_serial_ids: [],
      serial_dispositions: {},
      afectaInventario: true,
      restock: false,
    });
    expect(peso).toEqual({ restock: false });
  });
});

describe('seriales de una línea', () => {
  const catalogo = [
    vendido({ id: 11, serial: 'DE-LA-LINEA', product_id: 9 }),
    vendido({ id: 12, serial: 'OTRO-DE-LA-VENTA', product_id: 9 }),
    vendido({ id: 13, serial: 'OTRO-PRODUCTO', product_id: 4 }),
    vendido({ id: 14, serial: 'OTRA-VENTA', product_id: 9, sale_id: 'otra' }),
  ];

  it('ganan los serial_ids de la línea', () => {
    expect(serialesVendidosDeLinea({
      serialIds: [11],
      productId: '9',
      saleId: VENTA,
      vendidos: catalogo,
    }).map((s) => s.serial)).toEqual(['DE-LA-LINEA']);
  });

  it('si la línea no guardó seriales, usa los de esa venta y ese producto', () => {
    expect(serialesVendidosDeLinea({
      serialIds: [],
      productId: 9,
      saleId: VENTA,
      vendidos: catalogo,
    }).map((s) => s.id).sort((a, b) => a - b)).toEqual([11, 12]);
  });
});

describe('garantía sin fecha de fin', () => {
  const hoy = '2026-10-23';

  it('en bodega sigue empezando al vender', () => {
    expect(situacionGarantia({
      estado: 'in_stock',
      garantia: { meses: 12, inicio: null, fin: null },
    }, hoy)).toEqual({ tipo: 'empieza_al_vender', meses: 12 });
  });

  it('vendida con meses y sin fin no queda sin garantía', () => {
    expect(situacionGarantia({
      estado: 'sold',
      garantia: { meses: 12, inicio: null, fin: null },
    }, hoy)).toEqual({ tipo: 'desde_la_venta', meses: 12 });
  });

  it('si el serial no trae meses, usa los del producto en la fila', () => {
    expect(situacionGarantia({
      estado: 'sold',
      garantia: { meses: null, inicio: null, fin: null },
      producto: { warranty_months: 6 },
    }, hoy)).toEqual({ tipo: 'desde_la_venta', meses: 6 });
  });
});
