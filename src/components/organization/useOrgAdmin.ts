'use client';

/**
 * Organización activa y si la persona la administra, para las pantallas de
 * Organización y Configuración › General.
 *
 * Auditoría 2026-10 (P1-2, P1-3): antes esto leía `organization_members` desde
 * el navegador, tomaba la organización de `localStorage` (y si no coincidía,
 * la PRIMERA membresía, en silencio) y decidía «¿es admin?» con
 * el id del rol (1 o 2) en el navegador. La pantalla podía mostrar una organización
 * mientras las APIs (cookie de sesión) actuaban sobre otra, y quien el servidor
 * autoriza por `admin.full_access` veía «Sin permisos».
 *
 * Ahora la organización y el permiso salen de `GET /api/me/capacidades` (la
 * misma organización que usan las rutas y el mismo criterio que
 * `withOrg({ admin: true })`). La API pública del hook no cambia.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useCapacidades } from '@/lib/navigation/useCapacidades';

interface BranchAssignment {
  branch_id: number;
  branch_name?: string;
}

interface UseOrgAdminReturn {
  orgId: number | null;
  /** @deprecated Ya no se expone el rol: los permisos se resuelven en el servidor. Siempre `null`. */
  userRole: number | null;
  isOrgAdmin: boolean;
  userBranches: BranchAssignment[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface FilaSede {
  branch_id: number;
  branches: { name: string | null } | { name: string | null }[] | null;
}

export function useOrgAdmin(): UseOrgAdminReturn {
  const { datos, cargando, error: errorCapacidades, recargar } = useCapacidades();
  const orgId = datos.organizationId;
  const [userBranches, setUserBranches] = useState<BranchAssignment[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    recargar();
  }, [recargar]);

  // Sedes asignadas a la persona en la organización de la sesión (solo para mostrar).
  useEffect(() => {
    if (!orgId) {
      setUserBranches([]);
      return;
    }
    let vivo = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: miembro } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .maybeSingle();
      if (!miembro) {
        if (vivo) setUserBranches([]);
        return;
      }
      const { data } = await supabase
        .from('member_branches')
        .select('branch_id, branches ( name )')
        .eq('organization_member_id', miembro.id);
      if (!vivo) return;
      setUserBranches(
        ((data ?? []) as FilaSede[]).map((f) => {
          const sede = Array.isArray(f.branches) ? f.branches[0] : f.branches;
          return { branch_id: f.branch_id, branch_name: sede?.name ?? undefined };
        })
      );
    })().catch((e: unknown) => console.warn('[useOrgAdmin] sedes de la persona', e instanceof Error ? e.message : e));
    return () => {
      vivo = false;
    };
  }, [orgId, refreshKey]);

  return {
    orgId,
    userRole: null,
    isOrgAdmin: datos.capacidades.gestionarOrganizacion === true || datos.esAdmin,
    userBranches,
    loading: cargando,
    error: errorCapacidades ? 'No se pudo cargar la organización' : null,
    refresh,
  };
}
