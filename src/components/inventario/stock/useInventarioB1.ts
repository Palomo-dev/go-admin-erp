'use client';

import { useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatearCantidad } from '@/components/kit/inventario';
import { useBranch } from '@/lib/context/BranchContext';
import { detalleStockInsuficiente, type ErrorRpc } from '@/lib/inventario/nucleo/errores';
import { claveErrorB1 } from './errores';

/**
 * Texto del error de una RPC de existencias en el idioma activo: los códigos de B1
 * (`inventarioStock.errores`) y, si no, los del núcleo (`inventario.errores`), con
 * «disponible X, solicitado Y» cuando falta stock.
 */
export function useMensajeErrorInventario(): (error: unknown) => string {
  const tb = useTranslations('inventarioStock.errores');
  const tn = useTranslations('inventario.errores');
  return useCallback(
    (error: unknown) => {
      const e = (error ?? {}) as ErrorRpc;
      const c = claveErrorB1(e);
      if (c.espacio === 'b1') return tb(c.clave);
      if (c.clave === 'stock_insuficiente') {
        const d = detalleStockInsuficiente(e);
        return tn('stock_insuficiente', { disponible: d?.disponible ?? 0, solicitado: d?.solicitado ?? 0 });
      }
      return tn(c.clave);
    },
    [tb, tn],
  );
}

/**
 * Alcance de sucursales de las pantallas de existencias: la del selector del
 * encabezado o, en «Todas», las que el usuario puede ver. El servidor vuelve a
 * descartar las que no son de la organización.
 */
export function useAlcanceSucursales() {
  const { branchFilter, branches: todas, isLoading, selectedBranchId } = useBranch();
  // Sucursales del usuario con id (el tipo Branch lo deja opcional).
  const branches = useMemo(
    () => todas.filter((b): b is typeof b & { id: number } => typeof b.id === 'number').map((b) => ({ id: b.id, name: b.name })),
    [todas],
  );
  const sucursales = useMemo(() => (branchFilter ? [branchFilter] : branches.map((b) => b.id)), [branchFilter, branches]);
  return {
    sucursales,
    /** Sucursal concreta para escribir (la seleccionada o la principal). */
    sucursalActiva: branchFilter ?? selectedBranchId ?? branches[0]?.id ?? null,
    branches,
    cargando: isLoading,
    sinSucursal: !isLoading && branches.length === 0,
    todas: !branchFilter,
  };
}

/** Cantidades de stock (hasta 3 decimales, numeric(12,3)) en el idioma activo. */
export function useCantidadStock(): (n: number | null | undefined) => string {
  const locale = useLocale();
  return useCallback((n: number | null | undefined) => formatearCantidad(Number(n) || 0, locale), [locale]);
}
