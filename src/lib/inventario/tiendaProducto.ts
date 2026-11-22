/**
 * «Ver en la tienda ↗» de la ficha del producto (Figma `2726:193647` publicado y
 * `2726:194089` no publicado). Puro, sin React ni Supabase: lo prueba
 * `__tests__/tiendaProducto.test.ts`; la ruta `GET /api/inventario/productos/[id]/tienda`
 * lo arma con la organización de la sesión.
 *
 * La tienda (`goadmin-websites`, `app/productos/[id]/page.tsx`) abre un producto por su
 * **uuid** (`/productos/{uuid}`; un id numérico redirige al uuid) y solo si
 * `status = 'active'` y no es variante de un padre eliminado
 * (`lib/products/visibilidad-web.ts`, `esProductoVisibleEnWeb`). Las listas de la tienda
 * muestran los padres y la variante se elige dentro de su ficha: el enlace de una variante
 * abre la ficha del padre. No hay en `products` una marca aparte de «publicado en la web»:
 * lo que decide es el estado.
 *
 * El host es el dominio PRINCIPAL verificado (`hostPrincipalVerificado`): sin él, la
 * organización no tiene tienda y el enlace no aparece.
 */

export type MotivoNoEnTienda = 'inactivo' | 'eliminado' | 'padreInactivo' | 'padreEliminado';

export type EnlaceTienda =
  | { estado: 'sinTienda' }
  | { estado: 'publicado'; url: string }
  | { estado: 'noPublicado'; motivo: MotivoNoEnTienda };

export interface ProductoParaTienda {
  uuid: string | null;
  status: string | null;
  parent_product_id?: number | null;
  /** Padre, si es variante: su uuid y su estado. */
  padre?: { uuid: string | null; status: string | null } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function motivoPorEstado(status: string | null, eliminado: MotivoNoEnTienda, inactivo: MotivoNoEnTienda): MotivoNoEnTienda | null {
  if (status === 'deleted') return eliminado;
  // La tienda filtra `eq('status', 'active')`: cualquier otro valor (también NULL) no se ve allí.
  if (status !== 'active') return inactivo;
  return null;
}

/** URL pública del producto en la tienda: `https://{host}/productos/{uuid}`. */
export function urlProductoEnTienda(host: string, uuid: string): string {
  return `https://${host.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/productos/${encodeURIComponent(uuid)}`;
}

export function enlaceTiendaProducto(host: string | null | undefined, p: ProductoParaTienda): EnlaceTienda {
  if (!host) return { estado: 'sinTienda' };
  const propio = motivoPorEstado(p.status, 'eliminado', 'inactivo');
  if (propio) return { estado: 'noPublicado', motivo: propio };
  const esVariante = p.parent_product_id != null;
  if (esVariante) {
    // Sin la fila del padre no se sabe a qué ficha de la tienda llevar.
    if (!p.padre) return { estado: 'sinTienda' };
    const delPadre = motivoPorEstado(p.padre.status, 'padreEliminado', 'padreInactivo');
    if (delPadre) return { estado: 'noPublicado', motivo: delPadre };
  }
  const uuid = esVariante ? p.padre?.uuid : p.uuid;
  if (!uuid || !UUID.test(uuid)) return { estado: 'sinTienda' };
  return { estado: 'publicado', url: urlProductoEnTienda(host, uuid) };
}
