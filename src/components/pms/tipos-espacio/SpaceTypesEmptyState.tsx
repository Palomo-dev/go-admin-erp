'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Package } from 'lucide-react';

interface SpaceTypesEmptyStateProps {
  hasFilters: boolean;
  onCreateNew?: () => void;
}

export function SpaceTypesEmptyState({
  hasFilters,
  onCreateNew,
}: SpaceTypesEmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="text-center py-12">
        <Package className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
          No se encontraron tipos de espacio
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          No se encontraron tipos con los filtros aplicados
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <Package className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
      <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
        No hay tipos de espacio
      </h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Comienza creando tu primer tipo de espacio
      </p>
      {onCreateNew && (
        <div className="mt-6">
          <Button onClick={onCreateNew}>Crear Tipo de Espacio</Button>
        </div>
      )}
    </div>
  );
}
