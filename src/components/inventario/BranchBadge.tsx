'use client';

import React from 'react';
import { useBranch } from '@/lib/context/BranchContext';

/**
 * Badge reutilizable que muestra la sucursal activa del contexto global.
 * - null = "Todas las sucursales" (badge azul)
 * - number = nombre de la sucursal concreta (badge fucsia)
 *
 * Uso: <BranchBadge /> dentro de cualquier página de inventario.
 */
export function BranchBadge({ className = '' }: { className?: string }) {
  const { branchFilter, branches } = useBranch();

  const label = branchFilter === null
    ? 'Todas las sucursales'
    : (branches.find(b => b.id === branchFilter)?.name ?? `Sucursal #${branchFilter}`);

  const colorClass = branchFilter === null
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    : 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Sucursal:</span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${colorClass}`}>
        {label}
      </span>
    </div>
  );
}

export default BranchBadge;
