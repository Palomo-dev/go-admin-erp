/**
 * Enlace de las líneas (pedido online, venta, devolución) a la ficha del producto
 * (Figma `2724:191376`). Datos ficticios.
 */
import {
  enlaceLineaProducto,
  imagenPrincipalPorProducto,
  infoProductosDeLineas,
  productoLineaEliminado,
} from '@/lib/inventario/enlaceProducto';

describe('enlaceLineaProducto', () => {
  test('producto vivo: la ficha por su id', () => {
    expect(enlaceLineaProducto({ id: 42, status: 'active' })).toEqual({ tipo: 'enlace', href: '/app/inventario/productos/42' });
    // Sin estado leído (solo el id de la línea) también enlaza.
    expect(enlaceLineaProducto({ id: 42 })).toEqual({ tipo: 'enlace', href: '/app/inventario/productos/42' });
  });

  test('inactivo o descontinuado sigue siendo enlace (la ficha existe)', () => {
    expect(enlaceLineaProducto({ id: 7, status: 'inactive' }).tipo).toBe('enlace');
    expect(enlaceLineaProducto({ id: 7, status: 'discontinued' }).tipo).toBe('enlace');
  });

  test('variante: abre el padre en la pestaña Variantes', () => {
    expect(enlaceLineaProducto({ id: 101, status: 'active', parent_product_id: 100, padreStatus: 'active' })).toEqual({
      tipo: 'enlace',
      href: '/app/inventario/productos/100?tab=variantes',
    });
  });

  test('producto eliminado: no es enlace', () => {
    expect(enlaceLineaProducto({ id: 9, status: 'deleted' })).toEqual({ tipo: 'eliminado' });
  });

  test('variante de un padre eliminado: tampoco es enlace', () => {
    expect(enlaceLineaProducto({ id: 11, status: 'active', parent_product_id: 10, padreStatus: 'deleted' })).toEqual({ tipo: 'eliminado' });
    expect(productoLineaEliminado({ id: 11, status: 'active', parent_product_id: 10, padreStatus: 'deleted' })).toBe(true);
  });

  test('id que no volvió de la base: no se enlaza', () => {
    expect(enlaceLineaProducto({ id: 5, noEncontrado: true })).toEqual({ tipo: 'eliminado' });
  });

  test('línea sin producto (ítem libre) o id inválido: texto, sin «eliminado»', () => {
    expect(enlaceLineaProducto({ id: null })).toEqual({ tipo: 'texto' });
    expect(enlaceLineaProducto(null)).toEqual({ tipo: 'texto' });
    expect(enlaceLineaProducto({ id: 0 })).toEqual({ tipo: 'texto' });
  });
});

describe('infoProductosDeLineas', () => {
  const productos = [
    { id: 1, status: 'active', parent_product_id: null, padre: null },
    { id: 2, status: 'active', parent_product_id: 1, padre: { status: 'active' } },
    { id: 3, status: 'deleted', parent_product_id: null, padre: null },
    { id: 4, status: 'active', parent_product_id: 1, padre: [{ status: 'deleted' }] },
  ];
  const imagenes = [
    { product_id: 1, storage_path: 'products/1/b.jpg', is_primary: false, display_order: 2 },
    { product_id: 1, storage_path: 'products/1/a.jpg', is_primary: true, display_order: 5 },
    { product_id: 3, storage_path: 'products/3/x.jpg', is_primary: false, display_order: 1 },
    { product_id: 3, storage_path: 'products/3/y.jpg', is_primary: false, display_order: 0 },
  ];

  test('la imagen principal gana; si no hay, la de menor orden', () => {
    const m = imagenPrincipalPorProducto(imagenes);
    expect(m.get(1)).toBe('products/1/a.jpg');
    expect(m.get(3)).toBe('products/3/y.jpg');
  });

  test('la variante sin imagen usa la del padre; el padre embebido llega como objeto o arreglo', () => {
    const info = infoProductosDeLineas([1, 2, 3, 4, 99], productos, imagenes);
    expect(info.get(2)).toMatchObject({ parent_product_id: 1, padreStatus: 'active', imagen: 'products/1/a.jpg' });
    expect(enlaceLineaProducto(info.get(2))).toEqual({ tipo: 'enlace', href: '/app/inventario/productos/1?tab=variantes' });
    expect(enlaceLineaProducto(info.get(3))).toEqual({ tipo: 'eliminado' });
    expect(enlaceLineaProducto(info.get(4))).toEqual({ tipo: 'eliminado' });
    expect(info.get(99)).toEqual({ id: 99, noEncontrado: true, imagen: null });
  });
});
