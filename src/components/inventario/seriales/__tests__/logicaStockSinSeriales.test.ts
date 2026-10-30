import { filtrarStockSinSeriales, sucursalesDelReporte, totalesStockSinSeriales } from '../logicaStockSinSeriales';
import type { FilaStockSinSerial } from '@/lib/services/seriales/contrato';

const f = (p: Partial<FilaStockSinSerial>): FilaStockSinSerial => ({
  product_id: 1, sku: 'SKU-1', nombre: 'Taladro', branch_id: 10, sucursal: 'Centro',
  qty_on_hand: 5, seriales: 2, seriales_disponibles: 1, sin_serial: 3, ...p,
});
const filas = [
  f({}),
  f({ product_id: 2, sku: 'CEL-9', nombre: 'Celular Ñandú', branch_id: 20, sucursal: 'Bodega', qty_on_hand: '8' as unknown as number, seriales: 0, sin_serial: 8 }),
  f({ branch_id: 20, sucursal: 'Bodega', sin_serial: 1, qty_on_hand: 1, seriales: 0 }),
];

describe('Stock sin seriales: lógica de pantalla', () => {
  it('filtra por sucursal y por texto sin tildes en nombre o SKU', () => {
    expect(filtrarStockSinSeriales(filas, 20, '')).toHaveLength(2);
    expect(filtrarStockSinSeriales(filas, null, 'nandu').map((x) => x.product_id)).toEqual([2]);
    expect(filtrarStockSinSeriales(filas, null, 'sku-1')).toHaveLength(2);
    expect(filtrarStockSinSeriales(filas, 10, 'cel')).toHaveLength(0);
  });
  it('totales con numéricos que llegan como texto', () => {
    expect(totalesStockSinSeriales(filas)).toEqual({ productos: 2, sucursales: 2, existencia: 14, seriales: 2, sinSerial: 12 });
  });
  it('sucursales únicas ordenadas', () => {
    expect(sucursalesDelReporte(filas)).toEqual([{ id: 20, nombre: 'Bodega' }, { id: 10, nombre: 'Centro' }]);
  });
});
