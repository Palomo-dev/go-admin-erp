'use client';

/**
 * Primer eslabón de las migas de todas las páginas del módulo Ventas (Figma 24
 * Ventas, lámina «Migas y títulos», 2026-11-23): siempre «Ventas» y siempre a
 * «Todas las ventas», la página con que abre el módulo — nunca a la pantalla
 * del POS. Una sola clave (`nav.ventas`, el mismo nombre del menú) en vez de
 * las ~25 que había (`migaPos`, `migas.pos`, `pantalla.migasPos`, 'POS' a mano).
 */
import { useTranslations } from 'next-intl';

/** «Todas las ventas»: la página de inicio del módulo (`ModuloNav.inicio`). */
export const HREF_TODAS_LAS_VENTAS = '/app/pos/ventas';

export interface MigaVentas {
  etiqueta: string;
  href: string;
}

export function useMigaVentas(): MigaVentas {
  const t = useTranslations('nav');
  return { etiqueta: t('ventas'), href: HREF_TODAS_LAS_VENTAS };
}
