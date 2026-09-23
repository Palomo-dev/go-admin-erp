'use client';

import { useMediaQuery } from '@/hooks/useMediaQuery';

/**
 * El shell cambia a móvil por debajo de `lg` (1024 px): MobileHeader,
 * MobileTabBar y hojas inferiores. El kit usa el mismo corte.
 *
 * En el primer render (servidor e hidratación) devuelve `false`; por eso el kit
 * solo lo usa para decidir qué capa abrir al pulsar, nunca para el layout
 * visible, que va por CSS (`lg:`).
 */
export const MEDIA_ESCRITORIO = '(min-width: 1024px)';

export function useEsEscritorio(): boolean {
  return useMediaQuery(MEDIA_ESCRITORIO);
}
