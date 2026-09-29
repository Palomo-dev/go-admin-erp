'use client';

import { useEffect, useState } from 'react';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { leerPermisosInventario, SIN_PERMISOS_INVENTARIO } from './permisos';
import type { PermisosInventario } from './nucleo/tipos';

/**
 * Permisos de inventario de la sesión en la organización activa
 * (`fn_inventario_permisos`). Se vuelven a leer al cambiar de organización.
 *
 * ```tsx
 * const permisos = usePermisosInventario();
 * if (permisos.resueltos && !permisos.ver) return <EmptyState variante="forbidden" />;
 * {permisos.ajustar && <Button>Registrar salida</Button>}
 * ```
 *
 * La interfaz solo oculta: la RPC vuelve a exigir el permiso.
 */
export function usePermisosInventario(): PermisosInventario {
  const [permisos, setPermisos] = useState<PermisosInventario>(SIN_PERMISOS_INVENTARIO);

  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      const org = getOrganizationId();
      if (!org) return;
      setPermisos(SIN_PERMISOS_INVENTARIO);
      void leerPermisosInventario(org).then((p) => {
        if (vivo) setPermisos(p);
      });
    };
    cargar();
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, cargar);
    return () => {
      vivo = false;
      window.removeEventListener(ORGANIZATION_CHANGED_EVENT, cargar);
    };
  }, []);

  return permisos;
}
