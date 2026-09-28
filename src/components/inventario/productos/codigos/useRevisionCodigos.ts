'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { revisarCodigos, type ProblemaCodigo } from '@/lib/services/codigosBarrasService';

/**
 * Revisión de códigos de barras antes de guardar un producto (y sus
 * variantes), con el mensaje ya traducido. `null` = se puede guardar.
 * La usan el alta, la edición completa, la pestaña Detalles y las variantes.
 */
export function useRevisionCodigos() {
  const t = useTranslations('inventarioEtiquetas.codigos.revision');

  const mensaje = useCallback(
    (p: ProblemaCodigo): string => {
      if (p.tipo === 'formato') return t('formato', { codigo: p.codigo });
      if (p.tipo === 'repetidoEnFormulario') return t('repetido', { codigo: p.codigo });
      const c = p.conflicto;
      if (c?.esVariante && c.nombrePadre) return t('duplicadoVariante', { codigo: p.codigo, nombre: c.nombrePadre, variante: c.nombre });
      return t('duplicado', { codigo: p.codigo, nombre: c?.nombre ?? '' });
    },
    [t],
  );

  /** Mensaje del primer problema, o `null` si todos los códigos sirven. */
  const revisar = useCallback(
    async (organizationId: number, codigos: readonly (string | null | undefined)[], excluirIds: number[] = []) => {
      try {
        const p = await revisarCodigos(organizationId, codigos, excluirIds);
        return p ? { titulo: t('titulo'), mensaje: mensaje(p) } : null;
      } catch {
        // Sin respuesta del servidor no se bloquea el guardado: el formato ya
        // se validó en el campo y la unicidad se vuelve a mirar al imprimir.
        return null;
      }
    },
    [mensaje, t],
  );

  return { revisar };
}
