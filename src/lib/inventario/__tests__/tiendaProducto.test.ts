/**
 * «Ver en la tienda ↗» de la ficha del producto (Figma `2726:193647` / `2726:194089`).
 * Dominios y uuids ficticios.
 */
import { enlaceTiendaProducto, urlProductoEnTienda } from '@/lib/inventario/tiendaProducto';

const UUID = '3f2c1d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UUID_PADRE = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const HOST = 'tienda-ejemplo.test';

describe('urlProductoEnTienda', () => {
  test('https://{dominio}/productos/{uuid}, sin esquema ni barra de más', () => {
    expect(urlProductoEnTienda(HOST, UUID)).toBe(`https://${HOST}/productos/${UUID}`);
    expect(urlProductoEnTienda(`https://${HOST}/`, UUID)).toBe(`https://${HOST}/productos/${UUID}`);
  });
});

describe('enlaceTiendaProducto', () => {
  test('sin dominio principal verificado: no hay tienda y el enlace no aparece', () => {
    expect(enlaceTiendaProducto(null, { uuid: UUID, status: 'active' })).toEqual({ estado: 'sinTienda' });
    expect(enlaceTiendaProducto('', { uuid: UUID, status: 'active' })).toEqual({ estado: 'sinTienda' });
  });

  test('activo: publicado con la URL del uuid', () => {
    expect(enlaceTiendaProducto(HOST, { uuid: UUID, status: 'active', parent_product_id: null })).toEqual({
      estado: 'publicado',
      url: `https://${HOST}/productos/${UUID}`,
    });
  });

  test('inactivo, descontinuado o sin estado: deshabilitado con motivo «inactivo»', () => {
    for (const status of ['inactive', 'discontinued', null]) {
      expect(enlaceTiendaProducto(HOST, { uuid: UUID, status })).toEqual({ estado: 'noPublicado', motivo: 'inactivo' });
    }
  });

  test('eliminado: deshabilitado con motivo «eliminado»', () => {
    expect(enlaceTiendaProducto(HOST, { uuid: UUID, status: 'deleted' })).toEqual({ estado: 'noPublicado', motivo: 'eliminado' });
  });

  test('variante activa: abre la ficha del padre en la tienda', () => {
    expect(
      enlaceTiendaProducto(HOST, { uuid: UUID, status: 'active', parent_product_id: 8, padre: { uuid: UUID_PADRE, status: 'active' } }),
    ).toEqual({ estado: 'publicado', url: `https://${HOST}/productos/${UUID_PADRE}` });
  });

  test('variante con el padre inactivo o eliminado: deshabilitada con el motivo del padre', () => {
    expect(
      enlaceTiendaProducto(HOST, { uuid: UUID, status: 'active', parent_product_id: 8, padre: { uuid: UUID_PADRE, status: 'inactive' } }),
    ).toEqual({ estado: 'noPublicado', motivo: 'padreInactivo' });
    expect(
      enlaceTiendaProducto(HOST, { uuid: UUID, status: 'active', parent_product_id: 8, padre: { uuid: UUID_PADRE, status: 'deleted' } }),
    ).toEqual({ estado: 'noPublicado', motivo: 'padreEliminado' });
  });

  test('el estado propio manda sobre el del padre', () => {
    expect(
      enlaceTiendaProducto(HOST, { uuid: UUID, status: 'deleted', parent_product_id: 8, padre: { uuid: UUID_PADRE, status: 'active' } }),
    ).toEqual({ estado: 'noPublicado', motivo: 'eliminado' });
  });

  test('uuid inválido o variante sin padre leído: no se inventa una URL', () => {
    expect(enlaceTiendaProducto(HOST, { uuid: 'no-es-uuid', status: 'active' })).toEqual({ estado: 'sinTienda' });
    expect(enlaceTiendaProducto(HOST, { uuid: UUID, status: 'active', parent_product_id: 8, padre: null })).toEqual({ estado: 'sinTienda' });
  });
});
