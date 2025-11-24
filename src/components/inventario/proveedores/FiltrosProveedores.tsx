"use client";

import React from 'react';
import { useTheme } from 'next-themes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { FiltrosProveedores as FiltrosProveedoresType } from './types';

interface FiltrosProveedoresProps {
  filters: FiltrosProveedoresType;
  setFilters: React.Dispatch<React.SetStateAction<FiltrosProveedoresType>>;
}

/**
 * Componente para filtrar la lista de proveedores
 * 
 * Permite buscar proveedores por nombre, NIT, contacto, etc.
 */
const FiltrosProveedores: React.FC<FiltrosProveedoresProps> = ({
  filters,
  setFilters
}) => {
  const { theme } = useTheme();
  
  // Maneja cambios en la entrada de búsqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, busqueda: e.target.value }));
  };
  
  // Limpia todos los filtros
  const handleClearFilters = () => {
    setFilters({
      busqueda: '',
      estado: '',
      ordenarPor: 'name'
    });
  };
  
  return (
    <div className="p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500" />
            <Input
              type="search"
              placeholder="Buscar por nombre, NIT, contacto..."
              value={filters.busqueda}
              onChange={handleSearchChange}
              className="pl-8 sm:pl-9 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
        
        {/* Aquí se pueden agregar más filtros como estado, fecha de creación, etc */}
        
        <Button
          variant="outline"
          onClick={handleClearFilters}
          className="w-full sm:w-auto text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          disabled={!filters.busqueda && !filters.estado}
        >
          <X className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Limpiar filtros</span>
          <span className="sm:hidden">Limpiar</span>
        </Button>
      </div>
    </div>
  );
};

export default FiltrosProveedores;
