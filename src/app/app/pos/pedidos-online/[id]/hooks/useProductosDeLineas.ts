'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import {
  infoProductosDeLineas,
  type FilaImagenLinea,
  type FilaProductoLinea,
  type InfoProductoLinea,
} from '@/lib/inventario/enlaceProducto';

/** Lo que la línea del pedido necesita de su producto: enlace a la ficha y miniatura (URL pública). */
export type ProductoDeLineaPedido = InfoProductoLinea & { imagenUrl: string | null };

/**
 * Estado, padre e imagen principal de los productos de las líneas del pedido (Figma
 * `2725:192149`: miniatura de 44 px y nombre enlazado a la ficha). Columnas verificadas
 * por MCP (2026-11-21): `products(id, status, parent_product_id, organization_id)` y
 * `product_images(product_id, storage_path, is_primary, display_order, archivo_disponible)`.
 * Si la lectura falla, el mapa queda vacío y las líneas se enlazan solo por su `product_id`
 * (nunca se marcan «eliminado» por un error).
 */
export function useProductosDeLineas(organizationId: number | null | undefined, productIds: readonly (number | null | undefined)[]) {
  // Clave estable: se vuelve a leer solo si cambian los productos del pedido.
  const clave = useMemo(
    () =>
      [...new Set(productIds.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0))]
        .sort((a, b) => a - b)
        .join(','),
    [productIds],
  );
  const [productos, setProductos] = useState<ReadonlyMap<number, ProductoDeLineaPedido>>(new Map());

  useEffect(() => {
    const ids = clave ? clave.split(',').map(Number) : [];
    if (!organizationId || ids.length === 0) {
      setProductos(new Map());
      return;
    }
    let vivo = true;
    void (async () => {
      try {
        const { data: filas, error } = await supabase
          .from('products')
          .select('id, status, parent_product_id, padre:products!parent_product_id(status)')
          .eq('organization_id', organizationId)
          .in('id', ids);
        if (error) throw error;
        const filasProductos = (filas ?? []) as unknown as FilaProductoLinea[];
        const padres = filasProductos.map((p) => p.parent_product_id).filter((id): id is number => id != null);
        const { data: imagenes } = await supabase
          .from('product_images')
          .select('product_id, storage_path, is_primary, display_order')
          .in('product_id', [...new Set([...ids, ...padres])])
          .eq('archivo_disponible', true);
        const info = infoProductosDeLineas(ids, filasProductos, (imagenes ?? []) as FilaImagenLinea[]);
        const conUrl = new Map(
          [...info].map(([id, p]) => [id, { ...p, imagenUrl: p.imagen ? getPublicUrl(p.imagen) || null : null }] as const),
        );
        if (vivo) setProductos(conUrl);
      } catch (e) {
        console.warn('[pedido web] no se pudieron leer los productos de las líneas', e);
        if (vivo) setProductos(new Map());
      }
    })();
    return () => {
      vivo = false;
    };
  }, [organizationId, clave]);

  return productos;
}
