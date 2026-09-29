'use client';

import { useCallback } from 'react';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { esMedido, formatoCantidad, type ProductoModoVenta } from '@/lib/pos/peso/modoVenta';

/**
 * Cantidades de inventario en el idioma activo, con separadores del idioma.
 * La base guarda 3 decimales (`numeric(12,3)`): se muestran hasta 3 (antes 2,
 * y 0,735 kg salía 0,74). Con un producto por peso o medida
 * (PRODUCTOS-POR-PESO-BASCULA.md §2.4) van sus decimales fijos y su unidad:
 * «12,400 kg».
 */
export function useCantidad(producto?: ProductoModoVenta | null): (n: number) => string {
  const locale = useLocaleIntl();
  const medido = esMedido(producto);
  const saleMode = producto?.sale_mode;
  const qtyDecimals = producto?.qty_decimals;
  const unitCode = producto?.unit_code;
  return useCallback(
    (n: number) => {
      try {
        if (medido) return formatoCantidad(n, { sale_mode: saleMode, qty_decimals: qtyDecimals, unit_code: unitCode }, locale);
        return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(n);
      } catch {
        return String(n);
      }
    },
    [locale, medido, saleMode, qtyDecimals, unitCode],
  );
}
