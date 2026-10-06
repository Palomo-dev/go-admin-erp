'use client';

/**
 * Mensaje legible y traducido del error de una acción de reservas de mesa.
 * El servicio lanza `ReservaMesaError` con la clave de `posReservasMesas.errores`
 * (`interpretarErrorReserva`); cualquier otro error muestra el texto por defecto
 * de la acción, nunca un detalle crudo de la base.
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { ErrorReservaInterpretado } from './erroresReserva';

interface ConClave {
  error?: ErrorReservaInterpretado | null;
  message?: string;
}

export function useMensajeErrorReserva() {
  const t = useTranslations('posReservasMesas.errores');
  return useCallback(
    (error: unknown, porDefecto?: string): string => {
      const i = (error as ConClave | null)?.error;
      if (i && i.clave !== 'desconocido') return t(i.clave, i.valores ?? {});
      return porDefecto ?? t('generico');
    },
    [t],
  );
}
