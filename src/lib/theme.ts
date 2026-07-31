'use client';

import { useTheme } from 'next-themes';

/**
 * Helper para aplicar clases de tema (light/dark) directamente desde className.
 * Evita depender de las variantes `dark:` de Tailwind.
 */
export function useThemeClasses() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  /**
   * Devuelve las clases correspondientes al tema activo.
   * En light devuelve `lightClasses`, en dark devuelve `darkClasses`.
   */
  const tc = (lightClasses: string, darkClasses: string): string => {
    return isDark ? darkClasses : lightClasses;
  };

  return { isDark, tc, resolvedTheme };
}

/**
 * Función pura (no hook) para obtener la clase de tema dado un tema resuelto.
 * Útil cuando ya se tiene `resolvedTheme` disponible.
 */
export function themeClass(theme: string | undefined, lightClasses: string, darkClasses: string): string {
  return theme === 'dark' ? darkClasses : lightClasses;
}
