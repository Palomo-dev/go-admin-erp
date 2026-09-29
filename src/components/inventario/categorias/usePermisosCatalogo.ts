'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Permisos del catálogo maestro (categorías, proveedores, etiquetas e
 * imágenes), resueltos en el servidor por `fn_productos_permisos`: dueño de la
 * organización, `inventory.create/edit/delete`, `product_management` o
 * `inventory_management`. Son los mismos que exigen las RPC de escritura
 * (`fn_productos_exigir_permiso`), así que la interfaz oculta lo que el
 * servidor rechazaría.
 *
 * Mientras cargan, todo es `false` (no se ofrece una acción que luego falle).
 * Cuando el bloque B0 publique `fn_inventario_permisos` con
 * `editar_catalogo`, este hook pasa a leerlo sin cambiar a quien lo usa.
 */
export interface PermisosCatalogo {
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  /** true cuando ya llegó la respuesta del servidor. */
  resueltos: boolean;
}

export const SIN_PERMISOS: PermisosCatalogo = { crear: false, editar: false, eliminar: false, resueltos: false };

export function aPermisosCatalogo(data: unknown): PermisosCatalogo {
  const p = (data ?? {}) as Record<string, unknown>;
  return { crear: p.crear === true, editar: p.editar === true, eliminar: p.eliminar === true, resueltos: true };
}

export async function leerPermisosCatalogo(organizacionId: number): Promise<PermisosCatalogo> {
  const { data, error } = await supabase.rpc('fn_productos_permisos', { p_org: organizacionId });
  if (error) return { ...SIN_PERMISOS, resueltos: true };
  return aPermisosCatalogo(data);
}

export function usePermisosCatalogo(): PermisosCatalogo {
  const [permisos, setPermisos] = useState<PermisosCatalogo>(SIN_PERMISOS);
  useEffect(() => {
    let vivo = true;
    const org = getOrganizationId();
    if (!org) return;
    void leerPermisosCatalogo(org).then((p) => {
      if (vivo) setPermisos(p);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return permisos;
}
