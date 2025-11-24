'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface EspaciosEmptyStateProps {
  hasFilters: boolean;
  onCreateNew?: () => void;
}

export function EspaciosEmptyState({ hasFilters, onCreateNew }: EspaciosEmptyStateProps) {
  return (
    <Card className="p-16 text-center">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        No hay espacios
      </h3>
      <p className="text-gray-500 dark:text-gray-400 mb-4">
        {hasFilters
          ? 'No se encontraron espacios con los filtros aplicados'
          : 'Crea tu primer espacio para comenzar'}
      </p>
      {!hasFilters && onCreateNew && (
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Crear Espacio
        </Button>
      )}
    </Card>
  );
}
