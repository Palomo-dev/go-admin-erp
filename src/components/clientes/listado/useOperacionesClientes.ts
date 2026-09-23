'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import {
  cambiarEstadoClientes,
  mensajeErrorClientes,
} from '@/lib/services/clientesListadoService';

/**
 * Mensaje de error de una operación sobre clientes en el idioma activo. Igual
 * que `mensajeErrorClientes`, pero la falta de permiso (42501) sale traducida.
 * El texto de un 22023 lo redacta el servidor y se muestra tal cual.
 */
export function useMensajeErrorClientes(): (err: unknown, porDefecto: string) => string {
  const t = useTranslations('clientes.listado');
  return useCallback(
    (err: unknown, porDefecto: string) =>
      (err as { code?: string } | null)?.code === '42501' ? t('errores.sinPermiso') : mensajeErrorClientes(err, porDefecto),
    [t],
  );
}

/**
 * Operaciones de un clic sobre clientes que comparten el listado y la ficha:
 * inactivar/reactivar (con «Deshacer» en el aviso) y copiar el identificador.
 * Eliminar tiene su propio diálogo (EliminarClientesDialog) porque primero
 * clasifica en el servidor qué se puede borrar.
 */
export function useOperacionesClientes(organizationId: number | null, onCambio: () => void) {
  const t = useTranslations('clientes.listado');
  const entero = useFormatoEntero();
  const mensajeError = useMensajeErrorClientes();

  const cambiarEstado = useCallback(
    async (ids: string[], estado: 'active' | 'inactive', nombre?: string) => {
      if (!organizationId || ids.length === 0) return;
      try {
        const n = await cambiarEstadoClientes(organizationId, ids, estado);
        onCambio();
        const quien = nombre && ids.length === 1 ? nombre : t('nClientes', { count: n, n: entero(n) });
        const texto = estado === 'inactive' ? t('operaciones.inactivado', { quien }) : t('operaciones.reactivado', { quien });
        toast.success(texto, {
          description: estado === 'inactive' ? t('operaciones.inactivadoDescripcion') : undefined,
          action: {
            label: t('operaciones.deshacer'),
            onClick: () => {
              void cambiarEstadoClientes(organizationId, ids, estado === 'inactive' ? 'active' : 'inactive')
                .then(onCambio)
                .catch((err) => toast.error(mensajeError(err, t('operaciones.errorDeshacer'))));
            },
          },
        });
      } catch (err) {
        toast.error(mensajeError(err, t('operaciones.errorEstado')));
      }
    },
    [organizationId, onCambio, t, entero, mensajeError],
  );

  const copiarId = useCallback(
    async (id: string) => {
      try {
        await navigator.clipboard.writeText(id);
        toast.success(t('operaciones.idCopiado'));
      } catch {
        toast.error(t('operaciones.errorCopiar'));
      }
    },
    [t],
  );

  return { cambiarEstado, copiarId };
}
