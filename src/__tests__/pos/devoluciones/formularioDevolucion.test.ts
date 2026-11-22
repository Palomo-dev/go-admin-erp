/**
 * Estado del formulario «Crear devolución» (Figma `874:578120`): las reglas que
 * tenía `ReturnForm`, ahora puras y con un solo motivo para toda la devolución.
 */
import {
  agotada,
  alternarLinea,
  alternarSerial,
  aplicarMotivo,
  cambiarCantidad,
  cambiarDisposicion,
  cambiarReingresa,
  datosDevolucion,
  lineasIniciales,
  resumenDevolucion,
  validarFormulario,
} from '@/lib/pos/devoluciones/formularioDevolucion';
import { parametrosProcesarDevolucion } from '@/lib/pos/devoluciones/procesarDevolucion';
import type { SaleItemForReturn } from '@/components/pos/devoluciones/types';

const item = (over: Partial<SaleItemForReturn> & { id: string }): SaleItemForReturn => ({
  sale_id: 'venta-1',
  product_id: 1,
  product: { id: 1, name: 'Tenis urbanos', sku: 'TEN-040' },
  quantity: 2,
  unit_price: 89900,
  total: 179800,
  tax_amount: 28707.56,
  discount_amount: 0,
  returned_quantity: 0,
  serials: [],
  ...over,
});

const ITEMS: SaleItemForReturn[] = [
  item({ id: 'l1' }),
  item({ id: 'l2', product_id: 2, product: { id: 2, name: 'Medias deportivas', sku: 'MED-3' }, quantity: 1, total: 20000, tax_amount: 0 }),
  item({ id: 'l3', product_id: 3, product: { id: 3, name: 'Plantilla', sku: 'PLA' }, quantity: 1, total: 30000, returned_quantity: 1 }),
  item({
    id: 'l4',
    product_id: 4,
    product: { id: 4, name: 'Reloj', sku: 'REL', track_serial: true },
    quantity: 2,
    total: 400000,
    tax_amount: 63865.55,
    serials: [
      { id: 11, serial: 'SN-11', status: 'sold' },
      { id: 12, serial: 'SN-12', status: 'sold' },
    ],
  }),
  item({ id: 'l5', product_id: 5, product: { id: 5, name: 'Queso', sku: 'QUE', sale_mode: 'weight', unit_code: 'KG', qty_decimals: 3 }, quantity: 0.375, total: 9000, tax_amount: 0 }),
];

const MOTIVO_REPONE = { code: 'TALLA', name: 'Talla incorrecta', affects_inventory: true };
const MOTIVO_NO_REPONE = { code: 'DEFECTO', name: 'Producto defectuoso', affects_inventory: false };

describe('lineasIniciales', () => {
  test('la línea ya devuelta queda «Agotada» en lugar de ocultarse', () => {
    const lineas = lineasIniciales(ITEMS);
    expect(lineas).toHaveLength(5);
    expect(agotada(lineas[2])).toBe(true);
    expect(lineas[2]).toMatchObject({ vendida: 1, devuelta: 1, disponible: 0 });
    expect(alternarLinea(lineas[2], true, true)).toBe(lineas[2]);
  });
});

describe('cantidades y montos', () => {
  test('al marcar por unidad se devuelve 1; la cantidad se limita a lo disponible', () => {
    const [l1] = lineasIniciales(ITEMS);
    const marcada = alternarLinea(l1, true, true);
    expect(marcada).toMatchObject({ seleccionada: true, cantidad: 1, reingresa: true });
    expect(cambiarCantidad(marcada, 5).cantidad).toBe(2);
    expect(cambiarCantidad(marcada, 0)).toMatchObject({ cantidad: 0, seleccionada: false });
  });

  test('el reintegro es lo cobrado prorrateado (con impuesto) y el resumen separa la base', () => {
    const lineas = lineasIniciales(ITEMS).map((l) => (l.sale_item_id === 'l1' ? alternarLinea(l, true, true) : l));
    const r = resumenDevolucion(lineas);
    expect(r.total).toBe(89900);
    expect(r.impuesto).toBe(14353.78);
    expect(r.base).toBe(75546.22);
    expect(r).toMatchObject({ lineas: 1, unidades: 1, reingresan: 1, completa: false });
  });

  test('producto por peso: se devuelve todo lo vendido y «Reingresa» arranca en no', () => {
    const l5 = lineasIniciales(ITEMS)[4];
    const marcada = alternarLinea(l5, true, true);
    expect(marcada).toMatchObject({ cantidad: 0.375, reingresa: false, decimales: 3, unidad: 'kg' });
    expect(aplicarMotivo(marcada, true).reingresa).toBe(false);
    expect(cambiarReingresa(marcada, true).reingresa).toBe(true);
  });

  test('devolver todo lo que queda marca la devolución como completa', () => {
    const lineas = lineasIniciales(ITEMS).map((l) => (agotada(l) ? l : alternarLinea(l, true, true))).map((l) => (l.sale_item_id === 'l1' ? cambiarCantidad(l, 2) : l));
    expect(resumenDevolucion(lineas).completa).toBe(true);
  });
});

describe('seriales', () => {
  test('al marcar se preseleccionan los seriales y la disposición sigue al motivo hasta tocarla', () => {
    const l4 = lineasIniciales(ITEMS)[3];
    const marcada = alternarLinea(l4, true, false);
    expect(marcada).toMatchObject({ cantidad: 2, seriales_elegidos: [11, 12], disposiciones: { '11': 'damaged', '12': 'damaged' } });
    const tocada = cambiarDisposicion(marcada, 11, 'in_stock');
    const conMotivo = aplicarMotivo(tocada, false);
    expect(conMotivo.disposiciones).toEqual({ '11': 'in_stock', '12': 'damaged' });
    const sinUno = alternarSerial(conMotivo, 12, false);
    expect(sinUno).toMatchObject({ cantidad: 1, seriales_elegidos: [11] });
  });
});

describe('validación y envío', () => {
  test('sin motivo ni líneas, la pantalla no envía', () => {
    const v = validarFormulario(lineasIniciales(ITEMS), null);
    expect(v.generales).toEqual(expect.arrayContaining(['sinItems', 'sinMotivoGeneral']));
  });

  test('el motivo único va en cada línea y su nombre es el motivo general de la RPC', () => {
    const lineas = lineasIniciales(ITEMS).map((l) => (l.sale_item_id === 'l1' || l.sale_item_id === 'l4' ? alternarLinea(l, true, false) : l));
    expect(validarFormulario(lineas, MOTIVO_NO_REPONE).generales).toEqual([]);
    const datos = datosDevolucion(lineas, MOTIVO_NO_REPONE, 'credit_note', '  cambio la otra semana ');
    expect(datos.items.map((i) => i.reason)).toEqual(['DEFECTO', 'DEFECTO']);
    expect(datos).toMatchObject({ reason: 'Producto defectuoso', notes: 'cambio la otra semana', refund_method: 'credit_note', type: 'partial' });
    expect(datos.items[1]).toMatchObject({ serial_number_ids: [11, 12], serial_dispositions: { '11': 'damaged', '12': 'damaged' } });
    expect(datos.items[0]).toMatchObject({ return_quantity: 1, restock: false });

    const p = parametrosProcesarDevolucion(120, 'venta-1', datos, 'clave-1');
    expect(p.p_refund_method).toBe('store_credit');
    expect(p.p_reason).toBe('Producto defectuoso');
    expect(p.p_items.every((i) => i.reason_code === 'DEFECTO')).toBe(true);
  });

  test('con un motivo que repone, «Reingresa» arranca en sí', () => {
    const lineas = lineasIniciales(ITEMS).map((l) => (l.sale_item_id === 'l2' ? alternarLinea(l, true, true) : l));
    expect(datosDevolucion(lineas, MOTIVO_REPONE, 'cash', '').items[0]).toMatchObject({ restock: true });
  });
});
