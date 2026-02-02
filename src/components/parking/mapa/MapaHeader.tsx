'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { LayoutGrid, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';

interface MapaHeaderProps {
  onRefresh: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isLoading?: boolean;
}

export function MapaHeader({
  onRefresh,
  isFullscreen,
  onToggleFullscreen,
  isLoading,
}: MapaHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <LayoutGrid className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Mapa del Parqueadero
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Vista en tiempo real de la ocupación de espacios
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="dark:border-gray-600"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleFullscreen}
          className="dark:border-gray-600"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="h-4 w-4 mr-2" />
              Salir
            </>
          ) : (
            <>
              <Maximize2 className="h-4 w-4 mr-2" />
              Pantalla completa
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default MapaHeader;
