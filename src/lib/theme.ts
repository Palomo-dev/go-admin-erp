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
  const themeClass = (lightClasses: string, darkClasses: string): string => {
    return isDark ? darkClasses : lightClasses;
  };

  return { isDark, themeClass, resolvedTheme };
}
