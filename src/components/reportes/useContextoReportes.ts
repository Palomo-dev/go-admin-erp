'use client';

/**
 * Contexto común de las pantallas de reportes: organización, plan (grupos
 * del catálogo con lo contratado y lo bloqueado), alcance de sucursal y
 * permisos de la persona.
 *
 * - El plan sale de `useActiveModules` (organization_modules); no se cablea.
 * - El alcance, de `GET /api/me/capacidades` (`useCapacidades`). Sin acceso a
 *   todas las sucursales, el consolidado se reduce a la sucursal del
 *   encabezado y los reportes de toda la organización quedan «Sin acceso».
 * - Los permisos, de `GET /api/reportes/permisos` (servidor). Solo deciden qué
 *   botones se muestran: cada ruta los vuelve a exigir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveModules } from '@/hooks/useActiveModules';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useCapacidades } from '@/lib/navigation/useCapacidades';
import { sucursalDeReportes } from '@/lib/services/reportes/alcanceSucursal';
import { clienteReportes, type PermisosReportes } from '@/lib/services/reportes/clienteReportes';
import { getGrupos } from '@/lib/services/reportes/reportesCatalogo';
import type { FiltrosReportes } from '@/lib/services/reportes/filtrosUrl';

const SIN_PERMISOS: PermisosReportes = { exportar: false, firmar: false, reabrir: false, admin: false };
const permisosPorOrg = new Map<number, Promise<PermisosReportes>>();

function permisosDe(orgId: number): Promise<PermisosReportes> {
  let p = permisosPorOrg.get(orgId);
  if (!p) {
    p = clienteReportes.permisos().catch((e: unknown) => {
      permisosPorOrg.delete(orgId);
      console.warn('[reportes] no se leyeron los permisos', e);
      return SIN_PERMISOS;
    });
    permisosPorOrg.set(orgId, p);
  }
  return p;
}

export interface SucursalOpcion {
  id: number;
  nombre: string;
}

export function useContextoReportes() {
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const { activeModules, loading: cargandoModulos } = useActiveModules(orgId ?? undefined);
  const { datos: capacidades, cargando: cargandoCapacidades } = useCapacidades();
  const { branchFilter, selectedBranchId, branches } = useBranch();
  const [permisos, setPermisos] = useState<PermisosReportes | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let vivo = true;
    void permisosDe(orgId).then((p) => vivo && setPermisos(p));
    return () => {
      vivo = false;
    };
  }, [orgId]);

  const codigos = useMemo(() => activeModules.map((m) => m.code), [activeModules]);
  const grupos = useMemo(() => getGrupos(codigos), [codigos]);
  const accesoTotal = capacidades.sucursales.accesoTotal;
  const permitidas = capacidades.sucursales.permitidas;

  /** Sucursales que la persona puede elegir en el filtro. */
  const sucursales = useMemo<SucursalOpcion[]>(
    () =>
      branches
        .filter((b): b is typeof b & { id: number } => typeof b.id === 'number' && (accesoTotal || permitidas.includes(b.id)))
        .map((b) => ({ id: b.id, nombre: b.name ?? `#${b.id}` })),
    [branches, accesoTotal, permitidas],
  );
  const sucursalEncabezado = sucursalDeReportes(accesoTotal, branchFilter, selectedBranchId);

  /** Sucursal con la que corre un reporte: la del filtro si la persona puede verla; si no, la del encabezado. */
  const resolverSucursal = useCallback(
    (f: Pick<FiltrosReportes, 'sucursal'>): number | null => {
      if (f.sucursal === undefined) return sucursalEncabezado;
      if (accesoTotal) return f.sucursal;
      return f.sucursal !== null && permitidas.includes(f.sucursal) ? f.sucursal : sucursalEncabezado;
    },
    [accesoTotal, permitidas, sucursalEncabezado],
  );

  const nombreSucursal = useCallback((id: number | null) => (id === null ? null : (branches.find((b) => b.id === id)?.name ?? `#${id}`)), [branches]);

  return {
    orgId,
    grupos,
    codigos,
    accesoTotal,
    /** Sin acceso total y con una sola sucursal permitida: el selector queda fijo (gerente de una sede). */
    sucursalFija: !cargandoCapacidades && !accesoTotal && sucursales.length <= 1,
    sucursales,
    sucursalEncabezado,
    resolverSucursal,
    nombreSucursal,
    permisos: permisos ?? SIN_PERMISOS,
    cargando: !orgId || cargandoModulos || cargandoCapacidades,
    cargandoPermisos: permisos === null,
  };
}

export type ContextoReportes = ReturnType<typeof useContextoReportes>;
