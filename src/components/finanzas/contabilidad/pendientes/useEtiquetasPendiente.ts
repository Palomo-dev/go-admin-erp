'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { datoFaltante, tipoDocumento, type FilaPendiente } from '@/lib/finanzas/pendientesContables';

/** Textos de una fila que comparten la tabla, el móvil, el detalle y el CSV. */
export function useEtiquetasPendiente() {
  const t = useTranslations('pendientesContables');

  const documento = useCallback(
    (fila: Pick<FilaPendiente, 'origen' | 'documento'>) => {
      const tipo = t(`documentos.${tipoDocumento(fila.origen)}`);
      return fila.documento ? `${tipo} ${fila.documento}` : tipo;
    },
    [t],
  );

  const dato = useCallback(
    (fila: Pick<FilaPendiente, 'motivo' | 'debito' | 'credito'>) => {
      const faltante = datoFaltante(fila);
      return faltante.tipo === 'cuenta'
        ? t('datos.cuenta', { cuenta: faltante.cuenta })
        : t(`datos.${faltante.tipo}`);
    },
    [t],
  );

  return { documento, dato };
}
