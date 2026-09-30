'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorPeticionReportes } from '@/lib/services/reportes/clienteReportes';

/**
 * Texto de un error de las rutas de reportes en el idioma de la persona. El
 * código estable de la ruta (`cierre_existente`, `sin_permiso`…) decide el
 * mensaje; lo que no tiene traducción cae en el genérico.
 */
export function useMensajeError() {
  const t = useTranslations('reportes.errores');
  return useCallback(
    (e: unknown): string => {
      const codigo = e instanceof ErrorPeticionReportes ? e.codigo : null;
      if (codigo && t.has(codigo)) return t(codigo);
      if (e instanceof ErrorPeticionReportes && e.estado === 403) return t('sin_permiso');
      return t('generico');
    },
    [t],
  );
}
