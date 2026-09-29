'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardList, Copy, Eye, Fingerprint, Pencil, Power, PowerOff, Trash2 } from 'lucide-react';
import type { AccionFila } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService } from '@/lib/services/supplierService';
import { usePermisosCatalogo } from '@/components/inventario/categorias/usePermisosCatalogo';
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
 * ID, activar/desactivar y eliminar (con su diálogo). Lo que el usuario no
 * puede hacer según `fn_productos_permisos` no se ofrece.
 */
export function useAccionesProveedor({ onCambio, conVer = true, conEditar = true }: Opciones) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('proveedores.acciones');
  const [aEliminar, setAEliminar] = useState<ProveedorAEliminar | null>(null);
  const [duplicando, setDuplicando] = useState(false);
  const permisos = usePermisosCatalogo();

  const duplicar = useCallback(
    async (uuid: string) => {
      setDuplicando(true);
      toast({ title: t('toast.duplicando') });
      const { data, error } = await supplierService.duplicateSupplier(uuid, getOrganizationId());
      setDuplicando(false);
      if (error || !data) {
        toast({ variant: 'destructive', title: t('toast.errorDuplicar') });
        return;
      }
      toast({ title: t('toast.duplicado'), description: t('toast.duplicadoDescripcion') });
      onCambio();
      router.push(`${RUTA_PROVEEDORES}/${data.uuid}/editar`);
    },
    [onCambio, router, t, toast],
  );

  const cambiarEstado = useCallback(
    async (ids: readonly number[], activo: boolean) => {
      const { error } = await supplierService.setSuppliersActive(getOrganizationId(), ids, activo);
      if (error) {
        toast({ variant: 'destructive', title: activo ? t('toast.errorActivar') : t('toast.errorDesactivar') });
        return false;
      }
      const n = ids.length;
      toast({
        title: activo ? t('toast.activados', { count: n }) : t('toast.desactivados', { count: n }),
        description: activo ? t('toast.activadosDescripcion') : t('toast.desactivadosDescripcion'),
      });
      onCambio();
      return true;
    },
    [onCambio, t, toast],
  );

  const copiarId = useCallback(
    async (uuid: string) => {
      try {
        await navigator.clipboard.writeText(uuid);
        toast({ title: t('toast.idCopiado'), description: uuid });
      } catch {
        toast({ variant: 'destructive', title: t('toast.errorCopiarId') });
      }
    },
    [t, toast],
  );

  const accionesDe = useCallback(
    (p: ProveedorAEliminar): AccionFila[] => [
      {
        id: 'ver',
        etiqueta: t('verDetalle'),
        icono: Eye,
        onSelect: () => router.push(`${RUTA_PROVEEDORES}/${p.uuid}`),
        oculta: !conVer,
      },
      {
        id: 'editar',
        etiqueta: t('editar'),
        icono: Pencil,
        onSelect: () => router.push(`${RUTA_PROVEEDORES}/${p.uuid}/editar`),
        oculta: !conEditar || !permisos.editar,
      },
      {
        id: 'orden',
        etiqueta: t('nuevaOrden'),
        icono: ClipboardList,
        onSelect: () => router.push(rutaNuevaOrdenCompra(p.id)),
        deshabilitada: !p.is_active,
        motivo: t('activaloParaComprar'),
      },
      {
        id: 'duplicar',
        etiqueta: t('duplicar'),
        icono: Copy,
        onSelect: () => duplicar(p.uuid),
        deshabilitada: duplicando,
        motivo: t('duplicando'),
        oculta: !permisos.crear,
      },
      { id: 'copiar-id', etiqueta: t('copiarId'), icono: Fingerprint, onSelect: () => copiarId(p.uuid) },
      p.is_active
        ? {
            id: 'desactivar',
            etiqueta: t('desactivar'),
            icono: PowerOff,
            onSelect: () => cambiarEstado([p.id], false),
            separadorAntes: true,
            oculta: !permisos.editar,
          }
        : {
            id: 'activar',
            etiqueta: t('activar'),
            icono: Power,
            onSelect: () => cambiarEstado([p.id], true),
            separadorAntes: true,
            oculta: !permisos.editar,
          },
      { id: 'eliminar', etiqueta: t('eliminar'), icono: Trash2, destructiva: true, onSelect: () => setAEliminar(p), oculta: !permisos.eliminar },
    ],
    [cambiarEstado, conEditar, conVer, copiarId, duplicar, duplicando, permisos, router, t],
  );

  return { accionesDe, cambiarEstado, aEliminar, setAEliminar, duplicando, permisos };
}
