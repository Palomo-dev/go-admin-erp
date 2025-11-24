'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Layers } from 'lucide-react';

interface CategoriesEmptyStateProps {
  onCreateNew: () => void;
}

export function CategoriesEmptyState({ onCreateNew }: CategoriesEmptyStateProps) {
  return (
    <Card className="p-12 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Layers className="h-8 w-8 text-gray-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No hay categorías
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Crea tu primera categoría de espacios para comenzar
          </p>
        </div>
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Crear Primera Categoría
        </Button>
      </div>
    </Card>
  );
}
