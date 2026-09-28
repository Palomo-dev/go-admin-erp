'use client';

/**
 * Textos y formatos del kit en el idioma activo (namespace `kit` de
 * messages/*.json). Los componentes aceptan sus textos por props como
 * siempre; lo que no llega por props sale de aquí.
 */
import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { claveEtiquetaEstado, etiquetaEstado } from './estadoTono';
import { formatearEnteroEn, localeIntl } from './idioma';
import { etiquetaRango, type RangoFechas } from './rangoFechas';
import type { Sustantivo } from './paginacion';

export function useKitT() {
  return useTranslations('kit');
}

/** Locale de `Intl` del idioma activo (`es-CO`, `en-US`, `fr-FR`, `pt-BR`). */
export function useLocaleIntl(): string {
  return localeIntl(useLocale());
}

/** Entero con los separadores del idioma activo. */
export function useFormatoEntero(): (n: number) => string {
  const locale = useLocale();
  return useCallback((n: number) => formatearEnteroEn(n, locale), [locale]);
}

/** Etiqueta de un estado (`paid`, «Vencida 12 d») en el idioma activo. */
export function useEtiquetaEstado(): (estado: string | null | undefined) => string {
  const t = useTranslations('kit.estados');
  return useCallback(
    (estado: string | null | undefined) => {
      const c = claveEtiquetaEstado(estado);
      if (!c || !t.has(c.clave)) return etiquetaEstado(estado);
      return `${t(c.clave)}${c.sufijo}`;
    },
    [t],
  );
}

/** «1 – 22 sep 2026» / «Sep 1 – 22, 2026» según el idioma activo. */
export function useEtiquetaRango(): (rango: RangoFechas) => string {
  const locale = useLocaleIntl();
  return useCallback((rango: RangoFechas) => etiquetaRango(rango, locale), [locale]);
}

/** Sustantivo por defecto del kit («registro/registros») en el idioma activo. */
export function useSustantivoKit(clave: 'registro' | 'elemento'): Sustantivo {
  const t = useTranslations('kit.sustantivos');
  return { singular: t(`${clave}.singular`), plural: t(`${clave}.plural`) };
}
