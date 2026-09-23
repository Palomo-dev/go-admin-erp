'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Copy, Eye, Fingerprint, Pencil, Power, PowerOff, Trash2 } from 'lucide-react';
import type { AccionFila } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService } from '@/lib/services/supplierService';
import type { ProveedorAEliminar } from './DialogoEliminarProveedor';

export const RUTA_PROVEEDORES = '/app/inventario/proveedores';

export const rutaNuevaOrdenCompra = (supplierId: number) => `/app/inventario/ordenes-compra/nuevo?supplier=${supplierId}`;

interface Opciones {
  /** Tras activar, desactivar o duplicar: recargar lo que se ve. */
  onCambio: () => void;
  /** Incluir «Ver detalle» (en el listado sí; en el propio detalle no). */
  conVer?: boolean;
  /** Incluir «Editar» (en el detalle ya hay un botón). */
  conEditar?: boolean;
}

/**
 * Acciones de un proveedor, las mismas en la fila, en la tarjeta móvil y en
 * el «⋯» del detalle: ver, editar, nueva orden de compra, duplicar, copiar el
 * ID, activar/desactivar y eliminar (con su diálogo).
 */
export function useAccionesProveedor({ onCambio, conVer = true, conEditar = true }: Opciones) {
  const router = useRouter();
  const { toast } = useToast();
  const [aEliminar, setAEliminar] = useState<ProveedorAEliminar | null>(null);
  const [duplicando, setDuplicando] = useState(false);

  const duplicar = useCallback(
    async (uuid: string) => {
      setDuplicando(true);
      toast({ title: 'Duplicando proveedor…' });
      const { data, error } = await supplierService.duplicateSupplier(uuid, getOrganizationId());
      setDuplicando(false);
      if (error || !data) {
        toast({ variant: 'destructive', title: 'No se pudo duplicar el proveedor' });
        return;
      }
      toast({ title: 'Proveedor duplicado', description: 'Completa el documento de la copia.' });
      onCambio();
      router.push(`${RUTA_PROVEEDORES}/${data.uuid}/editar`);
    },
    [onCambio, router, toast],
  );

  const cambiarEstado = useCallback(
    async (ids: readonly number[], activo: boolean) => {
      const { error } = await supplierService.setSuppliersActive(getOrganizationId(), ids, activo);
      if (error) {
        toast({ variant: 'destructive', title: activo ? 'No se pudo activar' : 'No se pudo desactivar' });
        return false;
      }
      const n = ids.length;
      toast({
        title: activo
          ? n === 1 ? 'Proveedor activado' : `${n} proveedores activados`
          : n === 1 ? 'Proveedor desactivado' : `${n} proveedores desactivados`,
        description: activo ? 'Vuelve a aparecer al comprar.' : 'Ya no aparece al comprar; su historial se conserva.',
      });
      onCambio();
      return true;
    },
    [onCambio, toast],
  );

  const copiarId = useCallback(
    async (uuid: string) => {
      try {
        await navigator.clipboard.writeText(uuid);
        toast({ title: 'ID copiado', description: uuid });
      } catch {
        toast({ variant: 'destructive', title: 'No se pudo copiar el ID' });
      }
    },
    [toast],
  );

  const accionesDe = useCallback(
    (p: ProveedorAEliminar): AccionFila[] => [
      {
        id: 'ver',
        etiqueta: 'Ver detalle',
        icono: Eye,
        onSelect: () => router.push(`${RUTA_PROVEEDORES}/${p.uuid}`),
        oculta: !conVer,
      },
      {
        id: 'editar',
        etiqueta: 'Editar',
        icono: Pencil,
        onSelect: () => router.push(`${RUTA_PROVEEDORES}/${p.uuid}/editar`),
        oculta: !conEditar,
      },
      {
        id: 'orden',
        etiqueta: 'Nueva orden de compra',
        icono: ClipboardList,
        onSelect: () => router.push(rutaNuevaOrdenCompra(p.id)),
        deshabilitada: !p.is_active,
        motivo: 'Actívalo para comprarle',
      },
      { id: 'duplicar', etiqueta: 'Duplicar', icono: Copy, onSelect: () => duplicar(p.uuid), deshabilitada: duplicando, motivo: 'Duplicando…' },
      { id: 'copiar-id', etiqueta: 'Copiar ID', icono: Fingerprint, onSelect: () => copiarId(p.uuid) },
      p.is_active
        ? { id: 'desactivar', etiqueta: 'Desactivar', icono: PowerOff, onSelect: () => cambiarEstado([p.id], false), separadorAntes: true }
        : { id: 'activar', etiqueta: 'Activar', icono: Power, onSelect: () => cambiarEstado([p.id], true), separadorAntes: true },
      { id: 'eliminar', etiqueta: 'Eliminar', icono: Trash2, destructiva: true, onSelect: () => setAEliminar(p) },
    ],
    [cambiarEstado, conEditar, conVer, copiarId, duplicar, duplicando, router],
  );

  return { accionesDe, cambiarEstado, aEliminar, setAEliminar, duplicando };
}
