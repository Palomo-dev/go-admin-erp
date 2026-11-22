/**
 * @jest-environment jsdom
 *
 * Nombre del producto en las líneas de pedido online, venta y devolución (Figma
 * `2724:191376`): enlace real (`<a href>`, así Ctrl/⌘ + clic abre otra pestaña) y, si el
 * producto está eliminado, texto con «Producto eliminado». Textos reales de messages/*.json.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { EnlaceFichaProducto } from '@/components/inventario/productos/EnlaceFichaProducto';
import { enlaceLineaProducto } from '@/lib/inventario/enlaceProducto';

describe('EnlaceFichaProducto', () => {
  test('producto vivo: un <a> a la ficha', () => {
    renderConIdioma(<EnlaceFichaProducto nombre="Zapatilla urbana" enlace={enlaceLineaProducto({ id: 42, status: 'active' })} />);
    const a = screen.getByRole('link', { name: /Zapatilla urbana/ });
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('/app/inventario/productos/42');
  });

  test('variante: el <a> va a la ficha del padre', () => {
    renderConIdioma(<EnlaceFichaProducto nombre="Talla 40" enlace={enlaceLineaProducto({ id: 101, parent_product_id: 100, padreStatus: 'active' })} />);
    expect(screen.getByRole('link', { name: /Talla 40/ }).getAttribute('href')).toBe('/app/inventario/productos/100?tab=variantes');
  });

  test('eliminado: no es enlace y dice «Producto eliminado»', () => {
    renderConIdioma(<EnlaceFichaProducto nombre="Medias" enlace={enlaceLineaProducto({ id: 9, status: 'deleted' })} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Medias')).toBeTruthy();
    expect(screen.getByText('Producto eliminado')).toBeTruthy();
  });

  test('ítem libre: texto, sin sello', () => {
    renderConIdioma(<EnlaceFichaProducto nombre="Domicilio" enlace={enlaceLineaProducto({ id: null })} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Producto eliminado')).toBeNull();
  });

  test('en inglés el sello se traduce', () => {
    renderConIdioma(<EnlaceFichaProducto nombre="Socks" enlace={{ tipo: 'eliminado' }} />, { idioma: 'en' });
    expect(screen.getByText('Deleted product')).toBeTruthy();
  });
});
