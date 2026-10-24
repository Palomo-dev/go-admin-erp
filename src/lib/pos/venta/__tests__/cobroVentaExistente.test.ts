import { esCobroDeVentaExistente } from '@/lib/pos/venta/cobroVentaExistente';

describe('esCobroDeVentaExistente', () => {
  test('deuda (venta y factura en el carrito) y mesa (settle) no se reevalúan', () => {
    expect(esCobroDeVentaExistente(null, { sale_id: 'v1', invoice_id: 'f1' })).toBe(true);
    expect(esCobroDeVentaExistente({ sale_id: 'mesa' }, {})).toBe(true);
    expect(esCobroDeVentaExistente(undefined, {})).toBe(false);
    expect(esCobroDeVentaExistente(null, { sale_id: 'v1', invoice_id: null })).toBe(false);
    expect(esCobroDeVentaExistente({ sale_id: null }, { invoice_id: 'f1' })).toBe(false);
  });
});
