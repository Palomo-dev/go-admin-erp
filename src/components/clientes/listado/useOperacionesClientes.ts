'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  cambiarEstadoClientes,
  mensajeErrorClientes,
} from '@/lib/services/clientesListadoService';

/**
 * Operaciones de un clic sobre clientes que comparten el listado y la ficha:
 * inactivar/reactivar (con «Deshacer» en el aviso) y copiar el identificador.
 * Eliminar tiene su propio diálogo (EliminarClientesDialog) porque primero
 * clasifica en el servidor qué se puede borrar.
 */
export function useOperacionesClientes(organizationId: number | null, onCambio: () => void) {
  const cambiarEstado = useCallback(
    async (ids: string[], estado: 'active' | 'inactive', nombre?: string) => {
      if (!organizationId || ids.length === 0) return;
      try {
        const n = await cambiarEstadoClientes(organizationId, ids, estado);
        onCambio();
        const quien = nombre && ids.length === 1 ? nombre : `${n} ${n === 1 ? 'cliente' : 'clientes'}`;
        const texto = estado === 'inactive' ? `${quien}: marcado inactivo` : `${quien}: reactivado`;
        toast.success(texto, {
          description:
            estado === 'inactive'
              ? 'Conserva su historia y su cartera. Lo encuentras con el filtro «Estado: Inactivos».'
              : undefined,
          action: {
            label: 'Deshacer',
            onClick: () => {
              void cambiarEstadoClientes(organizationId, ids, estado === 'inactive' ? 'active' : 'inactive')
                .then(onCambio)
                .catch((err) => toast.error(mensajeErrorClientes(err, 'No se pudo deshacer el cambio')));
            },
          },
        });
      } catch (err) {
        toast.error(mensajeErrorClientes(err, 'No se pudo cambiar el estado del cliente'));
      }
    },
    [organizationId, onCambio],
  );

  const copiarId = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Identificador copiado');
    } catch {
      toast.error('No se pudo copiar el identificador');
    }
  }, []);

  return { cambiarEstado, copiarId };
}
