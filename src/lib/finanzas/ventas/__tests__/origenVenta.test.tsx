/**
 * @jest-environment jsdom
 *
 * El eslabón de origen del detalle de factura sigue el canal de la venta
 * (Figma 07 Finanzas › B.2 › «origen de la venta»). Antes decía siempre
 * «Venta del POS», también en facturas de pedidos web.
 */
import { screen } from '@testing-library/react';
import { CadenaDocumento } from '@/components/kit/documento/CadenaDocumento';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { eslabonVentaOrigen } from '../origenVenta';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

describe('eslabonVentaOrigen', () => {
  test('web: «Pedido web» con el número del pedido y enlace al pedido online', () => {
    expect(eslabonVentaOrigen('s-1', { canal: 'web', pedidoWebId: 'wo-1', pedidoWebNumero: 'WO-137-ABC' })).toEqual({
      tipo: 'pedido',
      claveEtiqueta: 'ventaWeb',
      numero: 'WO-137-ABC',
      claveNumero: 'ventaWeb',
      href: '/app/pos/pedidos-online/wo-1',
    });
  });

  test('web sin pedido enlazado: enlace a la venta', () => {
    const e = eslabonVentaOrigen('s-1', { canal: 'web', pedidoWebId: null, pedidoWebNumero: null });
    expect(e).toMatchObject({ tipo: 'pedido', numero: null, href: '/app/pos/ventas/s-1' });
  });

  test('venta creada desde una factura', () => {
    expect(eslabonVentaOrigen('s-1', { canal: 'invoice', pedidoWebId: null, pedidoWebNumero: null })).toMatchObject({
      tipo: 'venta',
      claveEtiqueta: null,
      claveNumero: 'ventaFactura',
    });
  });

  test('POS y canal desconocido conservan «Venta del POS»', () => {
    expect(eslabonVentaOrigen('s-1', { canal: 'pos', pedidoWebId: null, pedidoWebNumero: null }).claveNumero).toBe('ventaOrigen');
    expect(eslabonVentaOrigen('s-1', null)).toMatchObject({ tipo: 'venta', claveNumero: 'ventaOrigen', href: '/app/pos/ventas/s-1' });
  });

  test('las claves existen en los 4 idiomas', () => {
    for (const m of [es, en, fr, pt] as unknown as { facturasVenta: { detalle: Record<string, string> } }[]) {
      for (const clave of ['ventaOrigen', 'ventaWeb', 'ventaFactura']) expect(typeof m.facturasVenta.detalle[clave]).toBe('string');
    }
  });
});

describe('CadenaDocumento con rótulo propio', () => {
  test('etiquetaTipo reemplaza el nombre del tipo; sin ella, el del tipo', () => {
    renderConIdioma(
      <CadenaDocumento
        ordenar={false}
        eslabones={[
          { id: 'p', tipo: 'pedido', etiquetaTipo: 'Pedido web', numero: 'WO-137-ABC', href: '/app/pos/pedidos-online/wo-1' },
          { id: 'f', tipo: 'factura', numero: 'FACT-0113', actual: true },
        ]}
      />,
    );
    expect(screen.getByText('Pedido web')).toBeTruthy();
    expect(screen.getByText('WO-137-ABC').closest('a')?.getAttribute('href')).toBe('/app/pos/pedidos-online/wo-1');
    expect(screen.getByText('Factura')).toBeTruthy();
    expect(screen.queryByText('Venta del POS')).toBeNull();
  });
});
