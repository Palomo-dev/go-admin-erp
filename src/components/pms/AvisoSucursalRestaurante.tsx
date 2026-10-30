'use client';

import React from 'react';
import { useBranch } from '@/lib/context/BranchContext';
import { esSucursalRestaurante } from '@/lib/pms/sucursalesPms';

/**
 * Aviso para Limpieza/Mantenimiento del PMS cuando la sucursal activa es un restaurante
 * (quedó elegida desde otro módulo). El selector de estas rutas ya no la ofrece.
 */
export function AvisoSucursalRestaurante() {
  const { branches, selectedBranchId, setSelectedBranch } = useBranch();
  const actual = branches.find((b) => b.id === selectedBranchId);
  if (!esSucursalRestaurante(actual)) return null;
  const hotel = branches.find((b) => !esSucursalRestaurante(b));
  return (
    <div className="mx-4 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
      «{actual?.name}» es un restaurante y no tiene habitaciones del PMS.
      {hotel?.id != null && (
        <button type="button" className="ml-2 underline font-medium" onClick={() => setSelectedBranch(hotel.id as number)}>
          Cambiar a «{hotel.name}»
        </button>
      )}
    </div>
  );
}
