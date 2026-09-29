'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorPeticionMembresias } from '@/lib/services/membresias/clienteMembresias';

/** Error de una acción → `membresias.errores.<codigo>` (o el genérico si el código no existe). */
export function useMensajeError(): (e: unknown) => string {
  const t = useTranslations('membresias.errores');
  return useCallback(
    (e: unknown) => {
      const codigo = e instanceof ErrorPeticionMembresias ? e.codigo : 'error_interno';
      return t.has(codigo) ? t(codigo) : t('error_interno');
    },
    [t],
  );
}
