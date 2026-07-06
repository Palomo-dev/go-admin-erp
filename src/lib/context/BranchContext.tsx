'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Branch } from '@/types/branch';
import { branchService } from '@/lib/services/branchService';
import {
  getOrganizationId,
  getCurrentBranchId,
  invalidateBranchIdCache,
  BRANCH_CHANGED_EVENT,
} from '@/lib/hooks/useOrganization';

// Valor especial para representar "Todas las sucursales"
export const ALL_BRANCHES = 'all' as const;

// Selección puede ser una sucursal concreta (id) o "todas"
export type BranchSelection = number | typeof ALL_BRANCHES;

interface BranchContextValue {
  /** Listado de sucursales de la organización */
  branches: Branch[];
  /** Sucursal concreta seleccionada (para escrituras/valores por defecto) */
  selectedBranchId: number | null;
  /** true cuando el usuario elige "Todas las sucursales" */
  isAllSelected: boolean;
  /**
   * Filtro a aplicar en lecturas: null significa "no filtrar" (modo Todas).
   * Úsalo como dependencia en useEffect para refrescar al cambiar de sucursal.
   */
  branchFilter: number | null;
  /** Cambia la selección (id de sucursal o 'all') */
  setSelectedBranch: (selection: BranchSelection) => void;
  /** Indica si el listado de sucursales aún está cargando */
  isLoading: boolean;
  /** true si el usuario puede elegir "Todas las sucursales" (tiene acceso a >1) */
  canSelectAll: boolean;
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

const BRANCH_ALL_KEY = 'branchFilterAll';

export const BranchProvider = ({ children }: { children: React.ReactNode }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [canSelectAll, setCanSelectAll] = useState<boolean>(false);

  // Cargar sucursales y restaurar selección persistida
  useEffect(() => {
    const orgId = getOrganizationId();
    if (!orgId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        const { branches: data, canSelectAll: allowAll } =
          await branchService.getAccessibleBranches(orgId);
        if (cancelled) return;
        setBranches(data);
        setCanSelectAll(allowAll);

        // Restaurar modo "Todas" (solo si el usuario puede seleccionarlo)
        let allActive = false;
        try {
          allActive = allowAll && localStorage.getItem(BRANCH_ALL_KEY) === '1';
        } catch {
          allActive = false;
        }

        // Restaurar sucursal concreta (o elegir principal/primera)
        const savedId = getCurrentBranchId();
        let concrete: number | null = null;
        if (savedId && data.some((b) => b.id === savedId)) {
          concrete = savedId;
        } else if (data.length > 0) {
          const main = data.find((b) => b.is_main === true) || data[0];
          concrete = main?.id ?? null;
          if (concrete) {
            try {
              localStorage.setItem('currentBranchId', concrete.toString());
              sessionStorage.setItem('currentBranchId', concrete.toString());
            } catch {
              /* noop */
            }
            invalidateBranchIdCache();
          }
        }

        setSelectedBranchId(concrete);
        setIsAllSelected(allActive);
      } catch (error) {
        console.error('Error cargando sucursales en BranchContext:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelectedBranch = useCallback((selection: BranchSelection) => {
    try {
      if (selection === ALL_BRANCHES) {
        localStorage.setItem(BRANCH_ALL_KEY, '1');
        setIsAllSelected(true);
      } else {
        localStorage.setItem(BRANCH_ALL_KEY, '0');
        localStorage.setItem('currentBranchId', selection.toString());
        sessionStorage.setItem('currentBranchId', selection.toString());
        invalidateBranchIdCache();
        setIsAllSelected(false);
        setSelectedBranchId(selection);
      }
    } catch (error) {
      console.error('Error guardando selección de sucursal:', error);
    }

    // Notificar globalmente para que páginas/servicios reaccionen
    try {
      window.dispatchEvent(new CustomEvent(BRANCH_CHANGED_EVENT));
    } catch {
      /* noop */
    }
  }, []);

  const branchFilter = isAllSelected ? null : selectedBranchId;

  const value = useMemo<BranchContextValue>(
    () => ({
      branches,
      selectedBranchId,
      isAllSelected,
      branchFilter,
      setSelectedBranch,
      isLoading,
      canSelectAll,
    }),
    [branches, selectedBranchId, isAllSelected, branchFilter, setSelectedBranch, isLoading, canSelectAll]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};

/**
 * Hook para acceder al contexto de sucursal.
 * Debe usarse dentro de <BranchProvider>.
 */
export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error('useBranch debe usarse dentro de un BranchProvider');
  }
  return ctx;
}
