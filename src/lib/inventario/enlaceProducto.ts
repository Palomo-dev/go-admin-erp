/**
 * Enlace de una línea (pedido online, venta, devolución) a la ficha del producto
 * (Figma `2724:191376`, «Detalles con marca y enlaces»). Puro, sin React ni Supabase:
 * lo prueba `__tests__/enlaceProducto.test.ts`.
 *
 * Regla:
 *  - Producto vivo → `/app/inventario/productos/{id}` (la ficha acepta el id numérico y
 *    lo cambia por el uuid sin perder la consulta).
 *  - Variante → la ficha del PADRE, en la pestaña «Variantes» (la ficha aún no marca una
 *    variante concreta).
 *  - Producto eliminado (`products.status = 'deleted'`, la baja lógica) o variante de un
 *    padre eliminado → no es enlace; la pantalla dice «Producto eliminado».
 *  - Línea sin producto (ítem libre) → texto, sin enlace ni aviso.
 */
export const RUTA_FICHA_PRODUCTO = '/app/inventario/productos';

/** Lo que la línea sabe del producto: su id y, si se leyó, su estado y el de su padre. */
export interface ProductoDeLinea {
  id: number | null | undefined;
  status?: string | null;
  parent_product_id?: number | null;
  /** Estado del padre, si es variante y se leyó. */
  padreStatus?: string | null;
  /** El id venía en la línea pero la fila ya no se encuentra. */
  noEncontrado?: boolean;
}

export type EnlaceLinea =
  | { tipo: 'enlace'; href: string }
  | { tipo: 'eliminado' }
  | { tipo: 'texto' };

export function productoLineaEliminado(p: ProductoDeLinea): boolean {
  if (p.noEncontrado) return true;
  if (p.status === 'deleted') return true;
  return p.parent_product_id != null && p.padreStatus === 'deleted';
}

export function enlaceLineaProducto(p: ProductoDeLinea | null | undefined): EnlaceLinea {
  const id = p?.id;
  if (!p || id == null || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) return { tipo: 'texto' };
  if (productoLineaEliminado(p)) return { tipo: 'eliminado' };
  const padre = p.parent_product_id;
  if (padre != null && Number.isSafeInteger(Number(padre)) && Number(padre) > 0) {
    return { tipo: 'enlace', href: `${RUTA_FICHA_PRODUCTO}/${Number(padre)}?tab=variantes` };
  }
  return { tipo: 'enlace', href: `${RUTA_FICHA_PRODUCTO}/${Number(id)}` };
}

/** Fila de `products` que leen las pantallas para enlazar sus líneas. */
export interface FilaProductoLinea {
  id: number;
  status: string | null;
  parent_product_id: number | null;
  /** Embebido `padre:products!parent_product_id(status)`. */
  padre?: { status: string | null } | { status: string | null }[] | null;
}

/** Fila de `product_images` (la principal o la primera por orden). */
export interface FilaImagenLinea {
  product_id: number;
  storage_path: string | null;
  is_primary: boolean | null;
  display_order: number | null;
}

export interface InfoProductoLinea extends ProductoDeLinea {
  id: number;
  /** Ruta en storage de la imagen principal (la del padre si la variante no tiene). */
  imagen: string | null;
}

function estadoDelPadre(p: FilaProductoLinea['padre']): string | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0]?.status ?? null) : p.status;
}

/** Imagen principal de cada producto: `is_primary`, si no la de menor `display_order`. */
export function imagenPrincipalPorProducto(imagenes: readonly FilaImagenLinea[]): Map<number, string> {
  const elegida = new Map<number, FilaImagenLinea>();
  for (const img of imagenes) {
    if (!img.storage_path) continue;
    const actual = elegida.get(img.product_id);
    const mejor =
      !actual ||
      (img.is_primary === true && actual.is_primary !== true) ||
      (img.is_primary === actual.is_primary && (img.display_order ?? 0) < (actual.display_order ?? 0));
    if (mejor) elegida.set(img.product_id, img);
  }
  return new Map([...elegida].map(([id, img]) => [id, img.storage_path as string]));
}

/**
 * Une los productos leídos y sus imágenes por id de línea. Un id pedido que no vuelve
 * (borrado físico o de otra organización) queda `noEncontrado`: no se enlaza.
 */
export function infoProductosDeLineas(
  idsPedidos: readonly number[],
  productos: readonly FilaProductoLinea[],
  imagenes: readonly FilaImagenLinea[],
): Map<number, InfoProductoLinea> {
  const porId = new Map(productos.map((p) => [Number(p.id), p]));
  const imagen = imagenPrincipalPorProducto(imagenes);
  const salida = new Map<number, InfoProductoLinea>();
  for (const id of new Set(idsPedidos.map(Number))) {
    const p = porId.get(id);
    if (!p) {
      salida.set(id, { id, noEncontrado: true, imagen: null });
      continue;
    }
    const padre = p.parent_product_id ?? null;
    salida.set(id, {
      id,
      status: p.status,
      parent_product_id: padre,
      padreStatus: estadoDelPadre(p.padre),
      imagen: imagen.get(id) ?? (padre != null ? imagen.get(padre) ?? null : null),
    });
  }
  return salida;
}
