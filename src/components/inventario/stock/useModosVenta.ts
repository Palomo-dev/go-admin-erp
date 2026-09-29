'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import type { ProductoModoVenta } from '@/lib/pos/peso/modoVenta';
import { textoCantidadProducto, type ModosVenta } from './cantidadProducto';

/**
 * «Cómo se vende» de los productos que una página de existencias tiene a la
 * vista (Stock, Movimientos, Kardex, Lotes), para mostrar «12,400 kg» en vez
 * de «12,4 uds». Una lectura de `products` (con RLS) por página de
 * resultados; los que ya se leyeron quedan en memoria de la pestaña.
 *
 * Sin respuesta (error o aún cargando) cada producto se muestra como hoy:
 * número con hasta 3 decimales y «uds».
 */
const cache = new Map<number, ProductoModoVenta>();

/** Los modos ya leídos de esos productos. */
function desdeCache(clave: string): ModosVenta {
  const m = new Map<number, ProductoModoVenta>();
  for (const id of clave.split(',').map(Number)) {
    const modo = cache.get(id);
    if (modo) m.set(id, modo);
  }
  return m;
}

export function useModosVenta(productIds: readonly number[]): {
  modos: ModosVenta;
  /** Cantidad del producto con su unidad; por unidad, pasada por `conUnidades`. */
  cantidadDe: (productId: number | null | undefined, n: number | null | undefined, conUnidades?: (numero: string) => string) => string;
} {
  const locale = useLocale();
  const clave = productIds.join(',');
  const [modos, setModos] = useState<ModosVenta>(() => desdeCache(clave));

  useEffect(() => {
    setModos(desdeCache(clave));
    const faltan = clave
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0 && !cache.has(id));
    if (faltan.length === 0) return;
    let cancelado = false;
    supabase
      .from('products')
      .select('id, sale_mode, qty_decimals, unit_code')
      .in('id', faltan)
      .then(({ data, error }) => {
        if (error || !Array.isArray(data)) return;
        for (const fila of data as Array<ProductoModoVenta & { id: number }>) {
          cache.set(Number(fila.id), { sale_mode: fila.sale_mode, qty_decimals: fila.qty_decimals, unit_code: fila.unit_code });
        }
        if (!cancelado) setModos(desdeCache(clave));
      });
    return () => {
      cancelado = true;
    };
  }, [clave]);

  const cantidadDe = useCallback(
    (productId: number | null | undefined, n: number | null | undefined, conUnidades?: (numero: string) => string) =>
      textoCantidadProducto(n, productId != null ? modos.get(productId) : undefined, locale, conUnidades),
    [modos, locale],
  );

  return { modos, cantidadDe };
}
