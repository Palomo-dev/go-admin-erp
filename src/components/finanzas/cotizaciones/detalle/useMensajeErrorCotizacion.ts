'use client';

/**
 * Texto de un error de las rutas de cotizaciones por su código estable
 * (`documentosVenta.cotizaciones.errores.<codigo>`, los mismos que usa el
 * servidor). Un error que no es de la ruta (red) cae en el genérico.
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorPeticionCotizacion } from '@/lib/services/cotizacionesService';

export function useMensajeErrorCotizacion(): (error: unknown) => string {
  const t = useTranslations('documentosVenta.cotizaciones');
  return useCallback(
    (error: unknown) => {
      if (error instanceof ErrorPeticionCotizacion) {
        const clave = `errores.${error.codigo}`;
        if (t.has(clave)) return t(clave as never);
        return error.message || t('errores.error_desconocido');
      }
      return t('errores.error_desconocido');
    },
    [t],
  );
}
