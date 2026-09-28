'use client';

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Mensaje } from '@/lib/inventario/importacion/tipos';
import { localeIntl } from '@/components/kit/idioma';

/** Traduce un mensaje de validación (código + parámetros) o un aviso/error del servidor. */
export function useTextoMensaje() {
  const t = useTranslations('productosImportar.mensajes');
  return useCallback(
    (m: Mensaje | { codigo: string; detalle?: string }) => {
      const params: Record<string, string | number> = 'params' in m && m.params ? m.params : 'detalle' in m && m.detalle !== undefined ? { detalle: m.detalle } : {};
      return t.has(m.codigo) ? t(m.codigo, params) : m.codigo;
    },
    [t],
  );
}

/** Importe en la moneda de la organización y el idioma activo. */
export function useFormatoMoneda(moneda: string) {
  const locale = localeIntl(useLocale());
  return useCallback(
    (valor: number | undefined | null) => {
      if (valor === undefined || valor === null || !Number.isFinite(valor)) return '—';
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(valor);
      } catch {
        return `${valor} ${moneda}`;
      }
    },
    [locale, moneda],
  );
}
