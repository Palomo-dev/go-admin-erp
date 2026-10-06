/// <reference types="jest" />
import { esComerAqui, esDomicilio, mesaDelPedido, tipoEntregaEfectivo } from '../pedidosWeb/tipoEntrega';

describe('tipo de entrega del pedido web', () => {
  it('solo propio y tercero son domicilio (dine_in no pide dirección)', () => {
    expect(esDomicilio('delivery_own')).toBe(true);
    expect(esDomicilio('delivery_third_party')).toBe(true);
    expect(esDomicilio('pickup')).toBe(false);
    expect(esDomicilio('dine_in')).toBe(false);
    expect(esDomicilio(undefined)).toBe(false);
  });

  it('«Comer aquí» real (E1) o el mapeo temporal del sitio (pickup con la marca)', () => {
    expect(esComerAqui({ delivery_type: 'dine_in' })).toBe(true);
    expect(esComerAqui({ delivery_type: 'pickup', internal_notes: '[Comer aquí] Mesa: 4 (Terraza)' })).toBe(true);
    expect(esComerAqui({ delivery_type: 'pickup', internal_notes: 'Mesa: 4' })).toBe(false);
    expect(tipoEntregaEfectivo({ delivery_type: 'pickup', internal_notes: '[Comer aquí] Mesa: 4' })).toBe('dine_in');
    expect(tipoEntregaEfectivo({ delivery_type: 'delivery_own' })).toBe('delivery_own');
  });

  it('la mesa sale de la enlazada o de la nota del sitio', () => {
    expect(mesaDelPedido({ delivery_type: 'dine_in', restaurant_table: { name: 'Mesa 4', zone: 'Terraza' } })).toBe('Mesa 4 (Terraza)');
    expect(mesaDelPedido({ delivery_type: 'pickup', internal_notes: '[Comer aquí] Mesa: 4 (Terraza)' })).toBe('4 (Terraza)');
    expect(mesaDelPedido({ delivery_type: 'pickup', internal_notes: 'Mesa: 4' })).toBeNull();
  });
});
