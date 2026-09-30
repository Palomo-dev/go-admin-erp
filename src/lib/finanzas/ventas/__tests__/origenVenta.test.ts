import { eslabonVentaOrigen } from '../origenVenta';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

describe('eslabonVentaOrigen: el rótulo de la venta sigue su canal', () => {
  test('venta web: pedido con su número y enlace al pedido online', () => {
    expect(
      eslabonVentaOrigen('s-1', { canal: 'web', pedidoWebId: 'wo-1', pedidoWebNumero: 'WO-137-ABC' }),
    ).toEqual({ clave: 'ventaWeb', numero: 'WO-137-ABC', href: '/app/pos/pedidos-online/wo-1' });
  });

  test('venta web sin pedido enlazado: «Pedido web» y enlace a la venta', () => {
    expect(eslabonVentaOrigen('s-1', { canal: 'web', pedidoWebId: null, pedidoWebNumero: null })).toEqual({
      clave: 'ventaWeb',
      numero: null,
      href: '/app/pos/ventas/s-1',
    });
  });

  test('venta creada desde una factura', () => {
    expect(eslabonVentaOrigen('s-1', { canal: 'invoice', pedidoWebId: null, pedidoWebNumero: null }).clave).toBe('ventaFactura');
  });

  test('POS y canal desconocido conservan «Venta del POS»', () => {
    expect(eslabonVentaOrigen('s-1', { canal: 'pos', pedidoWebId: null, pedidoWebNumero: null }).clave).toBe('ventaOrigen');
    expect(eslabonVentaOrigen('s-1', null).clave).toBe('ventaOrigen');
    expect(eslabonVentaOrigen('s-1', undefined).href).toBe('/app/pos/ventas/s-1');
  });

  test('las claves existen en los 4 idiomas', () => {
    for (const m of [es, en, fr, pt] as unknown as { facturasVenta: { detalle: Record<string, string> } }[]) {
      for (const clave of ['ventaOrigen', 'ventaWeb', 'ventaFactura', 'ventaWebNumero']) {
        expect(typeof m.facturasVenta.detalle[clave]).toBe('string');
      }
      expect(m.facturasVenta.detalle.ventaWebNumero).toContain('{numero}');
    }
  });
});
