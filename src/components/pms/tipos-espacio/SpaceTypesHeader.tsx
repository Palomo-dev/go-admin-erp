'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';

interface SpaceTypesHeaderProps {
  onRefresh: () => void;
  onNew: () => void;
  isLoading: boolean;
}

export function SpaceTypesHeader({
  onRefresh,
  onNew,
  isLoading,
}: SpaceTypesHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Catálogo de Tipos de Espacio
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Gestiona los tipos de espacios alojativos de tu organización
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            
            <Button onClick={onNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Tipo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
