'use client';

import { useCallback } from 'react';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';

/**
 * Cantidades de inventario en el idioma activo: hasta 2 decimales (hay
 * unidades fraccionarias: kg, litros), separadores del idioma.
 */
export function useCantidad(): (n: number) => string {
  const locale = useLocaleIntl();
  return useCallback(
    (n: number) => {
      try {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
      } catch {
        return String(n);
      }
    },
    [locale],
  );
}
