/** Columna «Pago» de Pedidos online: el nombre del método, nunca el código interno. */
import { metodoDePago } from '@/lib/pos/pedidosWeb/metodoDePago';

describe('metodoDePago', () => {
  it.each(['mp', 'mercadopago', 'mp_checkout'])('Mercado Pago (%s) se muestra con su nombre', (codigo) => {
    expect(metodoDePago({ payment_method: codigo, payment_method_detail: undefined })).toBe('Mercado Pago');
  });

  it('Botón Bancolombia con su nombre', () => {
    expect(metodoDePago({ payment_method: 'boton_bancolombia', payment_method_detail: undefined })).toBe('Botón Bancolombia');
  });

  it('pasarela y medio: «Wompi · Nequi»', () => {
    expect(metodoDePago({ payment_method: 'wompi', payment_method_detail: 'nequi' })).toBe('Wompi · Nequi');
  });
});
